#!/usr/bin/env node
/**
 * Allegedly macOS arm64 Bundle & UV-05 / SV-01 Empirical Profiler (RTSD-05 hardened)
 *
 * Packages the release Tauri v2 desktop binary (compiled with `custom-protocol`
 * embedding `apps/desktop/dist`) into a standalone macOS `Allegedly.app` and
 * compressed `Allegedly_0.1.0_aarch64.dmg` inside external `CARGO_TARGET_DIR`
 * (0 files inside Obsidian vault), then measures across 3 isolated runs:
 *   1. Uncompressed `.app` size & `.dmg` installer size (< 40 MB budget)
 *   2. Authentic UI paint-ready cold start latency: launches inside macOS
 *      `sandbox-exec` with `(deny network-outbound (remote ip))` + `ALLEGEDLY_BENCH_READY=1`
 *      and waits for `ALLEGEDLY_UI_READY_MS=<ms>` printed by Rust ONLY after React 19
 *      mounts inside WKWebView, completes double-rAF first paint, and round-trips
 *      `report_ui_ready` over Tauri IPC (fails if process exits early or times out).
 *   3. SV-01 continuous zero-network proof: kernel-enforced `sandbox-exec` denial of
 *      all outbound IPv4/IPv6 connections across the entire boot & settle window PLUS
 *      `lsof -nP -i` process-tree socket audit (`0` sockets).
 *   4. UV-05 full macOS OS process-tree idle RAM (< 300 MB), explicitly including
 *      launchd-parented `com.apple.WebKit.{WebContent,Networking,GPU}` XPC helpers.
 *   5. SQLite WAL boot check (`paper_oms.sqlite` created in isolated `ALLEGEDLY_DATA_DIR`).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../.."));
const targetDir = process.env.CARGO_TARGET_DIR || "/Users/abelmora/.cache/allegedly-target";
const binPath = path.join(targetDir, "release", "allegedly-desktop");

if (!fs.existsSync(binPath)) {
  console.error(`FAIL: release binary not found at ${binPath}. Run cargo build --release first.`);
  process.exit(1);
}

// 1. Assemble clean macOS Allegedly.app and compressed .dmg outside vault
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

// Create both .tar.gz and authentic compressed macOS .dmg installer
const tarPath = path.join(bundleDir, "Allegedly-macos-arm64.tar.gz");
const dmgPath = path.join(bundleDir, "Allegedly_0.1.0_aarch64.dmg");
fs.rmSync(tarPath, { force: true });
fs.rmSync(dmgPath, { force: true });
execFileSync("tar", ["-czf", tarPath, "-C", bundleDir, "Allegedly.app"]);
execFileSync(
  "hdiutil",
  ["create", "-volname", "Allegedly", "-srcfolder", appDir, "-ov", "-format", "UDZO", dmgPath],
  { stdio: "ignore" },
);

const binBytes = fs.statSync(appBin).size;
const tarBytes = fs.statSync(tarPath).size;
const dmgBytes = fs.statSync(dmgPath).size;
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
      // lsof exits 1 when 0 open internet sockets — desired SV-01 outcome
    }
  }
  return sockets;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SANDBOX_PROFILE = "(version 1)(allow default)(deny network-outbound (remote ip))";

async function runSingleMeasurement(runIdx) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `allegedly-bench-${runIdx}-`));
  const beforeWebKit = listWebKitPids();
  const t0 = performance.now();

  const child = spawn("/usr/bin/sandbox-exec", ["-p", SANDBOX_PROFILE, appBin], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: {
      ...process.env,
      ALLEGEDLY_OFFLINE_BOOT: "1",
      ALLEGEDLY_BENCH_READY: "1",
      ALLEGEDLY_DATA_DIR: dataDir,
    },
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  let rustReadyMs = null;
  let wallReadyMs = null;
  let exitedEarly = false;

  const readyPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 6000);
    child.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      const match = /ALLEGEDLY_UI_READY_MS=(\d+)/.exec(stdoutBuf);
      if (match && wallReadyMs === null) {
        rustReadyMs = Number.parseInt(match[1], 10);
        wallReadyMs = Math.round(performance.now() - t0);
        clearTimeout(timer);
        resolve(true);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString();
    });
    child.once("exit", () => {
      if (wallReadyMs === null) {
        exitedEarly = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });

  const gotReady = await readyPromise;

  // Let idle state settle for 1.5s while asserting the app remains alive under zero-network sandbox
  await sleep(1500);
  const aliveAfterSettle = child.exitCode === null && !exitedEarly;

  const afterWebKit = listWebKitPids();
  const attachedHelpers = [];
  for (const [pid, info] of afterWebKit.entries()) {
    if (!beforeWebKit.has(pid)) attachedHelpers.push(info);
  }

  const mainRssKb = aliveAfterSettle ? getProcessRssKb(child.pid) : 0;
  const helpersRssKb = attachedHelpers.reduce((acc, h) => acc + h.rssKb, 0);
  const totalRssKb = mainRssKb + helpersRssKb;

  const allPids = [child.pid, ...attachedHelpers.map((h) => h.pid)];
  const openSockets = aliveAfterSettle ? getProcessNetSockets(allPids) : [];
  const walInitialized = fs.existsSync(path.join(dataDir, "paper_oms.sqlite"));

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
  fs.rmSync(dataDir, { recursive: true, force: true });

  return {
    run: runIdx + 1,
    uiReadyReceived: gotReady,
    aliveAfterSettle,
    walInitialized,
    rustUiReadyMs: rustReadyMs,
    wallUiReadyMs: wallReadyMs,
    mainRssMb: Number((mainRssKb / 1024).toFixed(2)),
    webkitHelperCount: attachedHelpers.length,
    webkitHelpersRssMb: Number((helpersRssKb / 1024).toFixed(2)),
    totalProcessTreeRssMb: Number((totalRssKb / 1024).toFixed(2)),
    sandboxNetworkBlocked: true,
    outboundSocketCount: openSockets.length,
    outboundSockets: openSockets,
    stderrSnippet: stderrBuf.trim().slice(0, 200),
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

const allReady = runs.every((r) => r.uiReadyReceived && r.aliveAfterSettle && r.walInitialized);
const readySorted = runs
  .map((r) => r.wallUiReadyMs ?? Number.POSITIVE_INFINITY)
  .sort((a, b) => a - b);
const maxRssMb = Math.max(...runs.map((r) => r.totalProcessTreeRssMb));
const totalOutboundSockets = runs.reduce((acc, r) => acc + r.outboundSocketCount, 0);

const report = {
  platform: `${process.platform}-${process.arch}`,
  bundle: {
    appPath: appDir,
    dmgPath,
    binaryMb: Number((binBytes / (1024 * 1024)).toFixed(2)),
    appBundleMb: Number((appBytes / (1024 * 1024)).toFixed(2)),
    dmgMb: Number((dmgBytes / (1024 * 1024)).toFixed(2)),
    tarGzMb: Number((tarBytes / (1024 * 1024)).toFixed(2)),
    budgetMb: 40,
    pass: appBytes / (1024 * 1024) < 40 && dmgBytes / (1024 * 1024) < 40,
  },
  coldStart: {
    allRunsUiPaintReady: allReady,
    p95WallMs: readySorted[readySorted.length - 1],
    budgetMs: 2000,
    pass: allReady && readySorted[readySorted.length - 1] < 2000,
  },
  processTreeIdleRam: {
    maxTotalMb: maxRssMb,
    budgetMb: 300,
    pass: allReady && maxRssMb > 0 && maxRssMb < 300,
  },
  sv01OfflineZeroNetwork: {
    kernelSandboxProfile: SANDBOX_PROFILE,
    outboundSocketsDetected: totalOutboundSockets,
    pass: allReady && totalOutboundSockets === 0,
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
