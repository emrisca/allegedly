import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const PORT = 4175;
const URL = `http://127.0.0.1:${PORT}/`;
const BENCH_TAG = `allegedly-s04-${process.pid}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`Preview server did not start at ${url}`);
}

async function getPerfMap(cdp) {
  const res = await cdp.send('Performance.getMetrics');
  const map = {};
  for (const m of res.metrics) map[m.name] = m.value;
  return map;
}

async function run() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(URL);
    const browser = await chromium.launch({
      executablePath: BRAVE_PATH,
      headless: true,
      args: [
        `--allegedly-bench-tag=${BENCH_TAG}`,
        '--enable-precise-memory-info',
        '--force-device-scale-factor=2',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__S04__?.ready));
    await sleep(250);

    const matrix = [
      // 30Hz / 500 deltas/sec (baseline R02 target)
      { strategy: 'react-state', updateHz: 30, deltasPerSec: 500, durationMs: 5000 },
      { strategy: 'imperative-dom-contained', updateHz: 30, deltasPerSec: 500, durationMs: 5000 },
      { strategy: 'canvas2d', updateHz: 30, deltasPerSec: 500, durationMs: 5000 },
      // 60Hz / 2,000 deltas/sec (2x target stress test)
      { strategy: 'react-state', updateHz: 60, deltasPerSec: 2000, durationMs: 5000 },
      { strategy: 'imperative-dom-contained', updateHz: 60, deltasPerSec: 2000, durationMs: 5000 },
      { strategy: 'canvas2d', updateHz: 60, deltasPerSec: 2000, durationMs: 5000 },
    ];

    const results = [];
    for (const cfg of matrix) {
      await page.evaluate((s) => window.__S04__.setStrategy(s), cfg.strategy);
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(100);
      const before = await getPerfMap(cdp);
      const r = await page.evaluate((c) => window.__S04__.runBenchmark(c), cfg);
      const after = await getPerfMap(cdp);

      const layoutMs = +(((after.LayoutDuration || 0) - (before.LayoutDuration || 0)) * 1000).toFixed(2);
      const recalcStyleMs = +(((after.RecalcStyleDuration || 0) - (before.RecalcStyleDuration || 0)) * 1000).toFixed(2);
      const scriptMs = +(((after.ScriptDuration || 0) - (before.ScriptDuration || 0)) * 1000).toFixed(2);
      const layoutCount = Math.round((after.LayoutCount || 0) - (before.LayoutCount || 0));
      const recalcStyleCount = Math.round((after.RecalcStyleCount || 0) - (before.RecalcStyleCount || 0));
      const heapDeltaMB = +(((after.JSHeapUsedSize || 0) - (before.JSHeapUsedSize || 0)) / (1024 * 1024)).toFixed(2);

      results.push({
        ...r,
        cdp: {
          layoutMs,
          recalcStyleMs,
          scriptMs,
          layoutCount,
          recalcStyleCount,
          heapDeltaMB,
          jsHeapUsedMB: +((after.JSHeapUsedSize || 0) / (1024 * 1024)).toFixed(2),
          domNodes: Math.round(after.Nodes || 0),
        },
      });
    }

    const rssInfo = getTaggedBrowserTreeRssMB(BENCH_TAG);
    const output = {
      timestamp: new Date().toISOString(),
      results,
      browserProcessTree: rssInfo,
      errors,
    };

    writeFileSync('bench-results.json', JSON.stringify(output, null, 2));
    console.log('\n=== S04 DOM Ladder + Time & Sales Results ===');
    console.table(
      results.map((r) => ({
        strategy: r.strategy,
        hz: r.updateHz,
        deltasS: r.deltasPerSec,
        fps: +r.effectiveFps.toFixed(1),
        p50ms: +r.frameMsP50.toFixed(2),
        p95ms: +r.frameMsP95.toFixed(2),
        p99ms: +r.frameMsP99.toFixed(2),
        maxMs: +r.frameMsMax.toFixed(2),
        layoutMs: r.cdp.layoutMs,
        styleMs: r.cdp.recalcStyleMs,
        scriptMs: r.cdp.scriptMs,
        stalls20: r.stallsOver20ms,
        commits: r.reactCommits,
      })),
    );
    console.log('RSS:', rssInfo, 'Errors:', errors.length);

    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
