#!/usr/bin/env node
/**
 * Allegedly macOS arm64 Bundle & UV-05 / SV-01 Empirical Profiler
 *
 * Packages the release Tauri v2 desktop binary into a standalone macOS `.app`
 * inside external CARGO_TARGET_DIR (0 files inside Obsidian vault), then measures:
 *   1. Uncompressed `.app` size & gzipped tarball size (< 40 MB budget)
 *   2. Offline cold start latency across 3 runs (p95 < 2.0 s)
 *   3. SV-01 zero outbound network sockets on boot (`lsof -nP -i`)
 *   4. UV-05 full macOS OS process-tree idle RAM (< 300 MB), explicitly including
 *      launchd-parented `com.apple.WebKit.{WebContent,Networking,GPU}` XPC helpers
 *      spawned by the Allegedly WKWebView instance.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../.."));
const targetDir = process.env.CARGO_TARGET_DIR || "/Users/abelmora/.cache/allegedly-target";
const binPath = path.join(targetDir, "release", "allegedly-desktop");

if (!fs.existsSync(binPath)) {
  console.error(`FAIL: release binary not found at ${binPath}. Run cargo build --release first.`);
  process.exit(1);
}

// 1. Assemble clean macOS Allegedly.app outside vault
const bundleDir = path.join(targetDir, "bundle");
const appDir = path.join(bundleDir, "Allegedly.app");
const macosDir = path.join(appDir, "Contents", "MacOS");
const resDir = path.join(appDir, "Contents", "Resources");
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(macosDir, { recursive: true });
fs.mkdirSync(resDir, { recursive: true });

const appBin = path.join(macosDir, "Allegedly");
fs.copyFileSync(binPath, appBin);
fs.chmodSync(appBin, 0o755);

const iconSrc = path.join(repoRoot, "apps/desktop/src-tauri/icons/icon.png");
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(resDir, "icon.png"));
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>Allegedly</string>
  <key>CFBundleIdentifier</key><string>dev.allegedly.terminal</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Allegedly</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
fs.writeFileSync(path.join(appDir, "Contents", "Info.plist"), plist, "utf8");

// Measure bundle size (uncompressed .app and .tar.gz)
const tarPath = path.join(bundleDir, "Allegedly-macos-arm64.tar.gz");
fs.rmSync(tarPath, { force: true });
execFileSync("tar", ["-czf", tarPath, "-C", bundleDir, "Allegedly.app"]);

const binBytes = fs.statSync(appBin).size;
const tarBytes = fs.statSync(tarPath).size;
const duKb = Number.parseInt(
  execFileSync("du", ["-sk", appDir], { encoding: "utf8" }).trim().split(/\s+/)[0],
  10,
);
const appBytes = duKb * 1024;

function listWebKitPids() {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,rss=,comm="], { encoding: "utf8" });
    const map = new Map();
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!m) continue;
      const pid = Number(m[1]);
      const rssKb = Number(m[2]);
      const comm = m[3];
      if (comm.includes("com.apple.WebKit.")) {
        map.set(pid, { pid, rssKb, comm });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function getProcessRssKb(pid) {
  try {
    const out = execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim();
    return Number.parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

function getProcessNetSockets(pids) {
  const sockets = [];
  for (const pid of pids) {
    try {
      const out = execFileSync("lsof", ["-nP", "-i", "-a", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const lines = out.trim().split("\n").slice(1);
      for (const l of lines) {
        if (l.trim()) sockets.push({ pid, line: l.trim() });
      }
    } catch {
      // lsof exits 1 when 0 open internet sockets — that is the desired SV-01 outcome!
    }
  }
  return sockets;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSingleMeasurement(runIdx) {
  const beforeWebKit = listWebKitPids();
  const t0 = performance.now();
  const child = spawn(appBin, [], {
    stdio: "ignore",
    detached: false,
    env: { ...process.env, ALLEGEDLY_OFFLINE_BOOT: "1" },
  });

  let readyMs = null;
  let newHelpers = [];
  // Poll up to 4s until WKWebView WebContent helper attaches (proving WebView booted & rendered)
  const deadline = performance.now() + 4000;
  while (performance.now() < deadline) {
    const nowWebKit = listWebKitPids();
    newHelpers = [];
    for (const [pid, info] of nowWebKit.entries()) {
      if (!beforeWebKit.has(pid)) newHelpers.push(info);
    }
    const hasWebContent = newHelpers.some((h) => h.comm.includes("WebContent"));
    if (hasWebContent && readyMs === null) {
      readyMs = performance.now() - t0;
      break;
    }
    await sleep(40);
  }
  if (readyMs === null) {
    readyMs = performance.now() - t0;
  }

  // Let idle state settle for 1.5s, then snapshot full OS process tree RSS & network sockets
  await sleep(1500);
  const afterWebKit = listWebKitPids();
  const attachedHelpers = [];
  for (const [pid, info] of afterWebKit.entries()) {
    if (!beforeWebKit.has(pid)) attachedHelpers.push(info);
  }

  const mainRssKb = getProcessRssKb(child.pid);
  const helpersRssKb = attachedHelpers.reduce((acc, h) => acc + h.rssKb, 0);
  const totalRssKb = mainRssKb + helpersRssKb;

  const allPids = [child.pid, ...attachedHelpers.map((h) => h.pid)];
  const openSockets = getProcessNetSockets(allPids);

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  await sleep(400);
  try {
    child.kill("SIGKILL");
  } catch {
    // ignore
  }

  return {
    run: runIdx + 1,
    readyMs: Math.round(readyMs),
    mainRssMb: Number((mainRssKb / 1024).toFixed(2)),
    webkitHelperCount: attachedHelpers.length,
    webkitHelpersRssMb: Number((helpersRssKb / 1024).toFixed(2)),
    totalProcessTreeRssMb: Number((totalRssKb / 1024).toFixed(2)),
    outboundSocketCount: openSockets.length,
    outboundSockets: openSockets,
    helpers: attachedHelpers.map((h) => ({
      comm: path.basename(h.comm),
      rssMb: Number((h.rssKb / 1024).toFixed(2)),
    })),
  };
}

const runs = [];
for (let i = 0; i < 3; i++) {
  runs.push(await runSingleMeasurement(i));
  await sleep(500);
}

const readySorted = runs.map((r) => r.readyMs).sort((a, b) => a - b);
const maxRssMb = Math.max(...runs.map((r) => r.totalProcessTreeRssMb));
const totalOutboundSockets = runs.reduce((acc, r) => acc + r.outboundSocketCount, 0);

const report = {
  platform: `${process.platform}-${process.arch}`,
  bundle: {
    appPath: appDir,
    binaryMb: Number((binBytes / (1024 * 1024)).toFixed(2)),
    appBundleMb: Number((appBytes / (1024 * 1024)).toFixed(2)),
    tarGzMb: Number((tarBytes / (1024 * 1024)).toFixed(2)),
    budgetMb: 40,
    pass: appBytes / (1024 * 1024) < 40,
  },
  coldStart: {
    p95Ms: readySorted[readySorted.length - 1],
    budgetMs: 2000,
    pass: readySorted[readySorted.length - 1] < 2000,
  },
  processTreeIdleRam: {
    maxTotalMb: maxRssMb,
    budgetMb: 300,
    pass: maxRssMb > 0 && maxRssMb < 300,
  },
  sv01OfflineZeroNetwork: {
    outboundSocketsDetected: totalOutboundSockets,
    pass: totalOutboundSockets === 0,
  },
  runs,
};

console.log(JSON.stringify(report, null, 2));
if (
  !report.bundle.pass ||
  !report.coldStart.pass ||
  !report.processTreeIdleRam.pass ||
  !report.sv01OfflineZeroNetwork.pass
) {
  process.exit(1);
}
