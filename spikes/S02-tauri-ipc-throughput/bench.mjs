import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const CARGO_TARGET_DIR = process.env.CARGO_TARGET_DIR || '/Users/abelmora/.cache/allegedly-target';
const WS_PORT = 4172;
const HTTP_PORT = 4178;
const BENCH_TAG = `allegedly-s02-${process.pid}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getProcessMetrics(pid) {
  try {
    const out = execSync(`ps -o rss=,%cpu= -p ${pid}`, { encoding: 'utf8' }).trim();
    const [rssKB, cpuPct] = out.split(/\s+/).map(Number);
    return {
      pid,
      rssMB: +((rssKB || 0) / 1024).toFixed(2),
      cpuPct: cpuPct || 0,
    };
  } catch {
    return null;
  }
}

function getTaggedBrowserTreeRssMB(tag) {
  try {
    const out = execSync(`ps -eo pid,ppid,rss,command`, { encoding: 'utf8' });
    const lines = out.trim().split('\n').slice(1);
    const childrenMap = new Map();
    const rssMap = new Map();
    const roots = [];
    for (const line of lines) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      const pid = Number(m[1]);
      const ppid = Number(m[2]);
      const rss = Number(m[3]);
      const cmd = m[4];
      rssMap.set(pid, rss);
      if (!childrenMap.has(ppid)) childrenMap.set(ppid, []);
      childrenMap.get(ppid).push(pid);
      if (cmd.includes(tag)) roots.push(pid);
    }
    let totalKB = 0;
    const seen = new Set();
    const queue = [...roots];
    while (queue.length) {
      const p = queue.shift();
      if (seen.has(p)) continue;
      seen.add(p);
      totalKB += rssMap.get(p) || 0;
      for (const c of childrenMap.get(p) || []) queue.push(c);
    }
    return {
      processCount: seen.size,
      totalRssMB: +(totalKB / 1024).toFixed(2),
    };
  } catch {
    return null;
  }
}

async function runNativeTauriBench() {
  const binPath = join(CARGO_TARGET_DIR, 'release', 's02-tauri-ipc');
  const outPath = resolve('tauri-bench-results.json');
  console.log('\n=== Running Native Tauri v2 WKWebView Benchmark ===');
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(binPath, [], {
      env: { ...process.env, S02_TAURI_OUT: outPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('s02-tauri-ipc timed out after 60s'));
    }, 60_000);

    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.stdout.on('data', (d) => process.stdout.write(d));
    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (existsSync(outPath)) {
        const data = JSON.parse(readFileSync(outPath, 'utf8'));
        resolvePromise({ exitCode: code, data });
      } else {
        reject(new Error(`s02-tauri-ipc exited (${code}) without writing results. stderr=${stderr}`));
      }
    });
  });
}

async function runLoopbackWsBench() {
  const wsBin = join(CARGO_TARGET_DIR, 'release', 's02-ws-server');
  console.log('\n=== Running Rust tokio-tungstenite Loopback WS + Brave Benchmark ===');

  const wsProc = spawn(wsBin, [String(WS_PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolveReady, rejectReady) => {
    const t = setTimeout(() => rejectReady(new Error('s02-ws-server startup timeout')), 10_000);
    wsProc.stdout.on('data', (d) => {
      const s = d.toString();
      if (s.includes('S02_WS_READY')) {
        clearTimeout(t);
        resolveReady();
      }
    });
    wsProc.stderr.on('data', (d) => process.stderr.write(d));
  });

  const html = readFileSync(resolve('web', 'ws-bench.html'), 'utf8');
  const httpServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((r) => httpServer.listen(HTTP_PORT, '127.0.0.1', r));

  // Sample Rust server CPU/RSS every 500ms while streaming
  const rustSamples = [];
  const sampleTimer = setInterval(() => {
    const m = getProcessMetrics(wsProc.pid);
    if (m) rustSamples.push(m);
  }, 500);

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: BRAVE_PATH,
      headless: true,
      args: [`--allegedly-bench-tag=${BENCH_TAG}`, '--enable-precise-memory-info'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`http://127.0.0.1:${HTTP_PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__S02_WS__?.ready));
    const result = await page.evaluate((url) => window.__S02_WS__.runSuite(url), `ws://127.0.0.1:${WS_PORT}`);
    const browserTree = getTaggedBrowserTreeRssMB(BENCH_TAG);

    clearInterval(sampleTimer);
    const peakRustRssMB = rustSamples.reduce((m, s) => Math.max(m, s.rssMB), 0);
    const peakRustCpuPct = rustSamples.reduce((m, s) => Math.max(m, s.cpuPct), 0);

    return {
      ...result,
      rustServerResource: {
        peakRssMB: +peakRustRssMB.toFixed(2),
        peakCpuPct: +peakRustCpuPct.toFixed(1),
        samples: rustSamples.length,
      },
      browserProcessTree: browserTree,
      errors,
    };
  } finally {
    clearInterval(sampleTimer);
    if (browser) await browser.close();
    httpServer.close();
    wsProc.kill('SIGTERM');
  }
}

async function main() {
  const wsResult = await runLoopbackWsBench();
  let tauriResult = null;
  let tauriError = null;
  try {
    const r = await runNativeTauriBench();
    tauriResult = r.data;
  } catch (err) {
    tauriError = String(err);
    console.error('Native Tauri bench error:', err);
  }

  const output = {
    timestamp: new Date().toISOString(),
    cargoTargetDir: CARGO_TARGET_DIR,
    platformNote: 'Measured on macOS Apple M2 host only. Linux WebKitGTK and Windows WebView2 remain UNVERIFIED.',
    loopbackWs: wsResult,
    nativeTauriWkWebView: tauriResult,
    tauriError,
  };

  writeFileSync('bench-results.json', JSON.stringify(output, null, 2));

  console.log('\n=== S02 Bulk 100k OHLCV Bars (4.8 MB SoA Binary vs JSON) ===');
  console.table([
    {
      transport: 'Loopback WS (Binary SoA)',
      bytes: wsResult.bulk100kBinary.bytes,
      medianMs: wsResult.bulk100kBinary.medianTotalMs,
      decodeMs: wsResult.bulk100kBinary.medianDecodeMs,
    },
    {
      transport: 'Loopback WS (JSON)',
      bytes: wsResult.bulk100kJson.bytes,
      medianMs: wsResult.bulk100kJson.medianTotalMs,
      decodeMs: wsResult.bulk100kJson.medianParseMs,
    },
    ...(tauriResult
      ? [
          {
            transport: 'Native Tauri Response (Binary SoA)',
            bytes: tauriResult.bulk100kBinary.bytes,
            medianMs: tauriResult.bulk100kBinary.medianTotalMs,
            decodeMs: tauriResult.bulk100kBinary.medianDecodeMs,
          },
          {
            transport: 'Native Tauri invoke (JSON)',
            bytes: 'n/a',
            medianMs: tauriResult.bulk100kJson.medianTotalMs,
            decodeMs: 'included',
          },
        ]
      : []),
  ]);

  console.log('\n=== S02 Loopback WS Streaming (Brave JS DataView + 60fps rAF) ===');
  console.table(
    wsResult.streamResults.map((s) => ({
      transport: s.transport,
      targetRate: s.targetRateMsgsSec,
      batchMs: s.batchMs,
      sustainedRate: s.sustainedMsgsSec,
      MBs: s.throughputMBs,
      decodeP95ms: s.decodeMsP95,
      rttP50ms: s.rttMsP50,
      rttP95ms: s.rttMsP95,
      rttP99ms: s.rttMsP99,
      fps: s.raf.effectiveFps,
      drop20ms: s.raf.droppedOver20ms,
      drop33ms: s.raf.droppedOver33ms,
    })),
  );

  if (tauriResult?.streamResults) {
    console.log('\n=== S02 Native Tauri v2 Channel<Response> Streaming (macOS WKWebView) ===');
    console.table(
      tauriResult.streamResults.map((s) => ({
        transport: s.transport,
        targetRate: s.targetRateMsgsSec,
        batchMs: s.batchMs,
        sustainedRate: s.sustainedMsgsSec,
        MBs: s.throughputMBs,
        delivery: s.deliveryRatio,
        decodeP95ms: s.decodeMsP95,
        ipcRttP50ms: s.ipcRttMsP50,
        ipcRttP95ms: s.ipcRttMsP95,
        ipcRttP99ms: s.ipcRttMsP99,
      })),
    );
    console.log('Native Tauri Cold Start:', tauriResult.coldStartToJsReadyMs, 'ms');
    console.log('Native Tauri Process Tree RSS:', tauriResult.nativeProcessTree?.totalRssMB, 'MB across', tauriResult.nativeProcessTree?.processCount, 'processes');
  }
  console.log('Rust WS Server Peak Resource:', wsResult.rustServerResource);
  console.log('Brave Process Tree RSS:', wsResult.browserProcessTree);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
