import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const PORT = 4171;
const URL = `http://127.0.0.1:${PORT}/`;
const BENCH_TAG = `allegedly-s01-${process.pid}`;

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
        '--use-gl=angle',
        '--use-angle=metal',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-precise-memory-info',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__S01__?.ready));
    await sleep(400);

    const info2x = await page.evaluate(() => window.__S01__.getInfo());
    const idleRaf = await page.evaluate(() => window.__S01__.measureIdleRaf(90));
    console.log('=== S01 Hardware & Initial Load (2x DPR) ===');
    console.log(JSON.stringify({ ...info2x, idleRaf }, null, 2));

    // 1. Pixel Alignment Drift: Mode A (range-raf) vs Mode B (primitive-hook)
    const alignmentResults = [];
    for (const mode of ['range-raf', 'primitive-hook']) {
      await page.evaluate((m) => window.__S01__.setSyncMode(m), mode);
      for (const scenario of ['rest', 'rapid-pan', 'rapid-zoom', 'resize']) {
        const res = await page.evaluate((sc) => window.__S01__.measureAlignment(sc), scenario);
        alignmentResults.push(res);
      }
    }

    // 2. DPR Change Alignment Check (2x -> 1x via CDP Emulation)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(250);
    await page.evaluate(() => window.__S01__.setSyncMode('primitive-hook'));
    const dpr1xAlign = await page.evaluate(() => window.__S01__.measureAlignment('rapid-pan'));
    alignmentResults.push({ ...dpr1xAlign, scenario: 'dpr-change-to-1x-pan' });

    // Restore 2x DPR for main performance stress benchmarks
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(250);

    // 3. Sustained Pan/Zoom + Live Tick Streaming Benchmarks (500 visible footprint bars = 10,000 cells)
    const perfResults = [];
    for (const cfg of [
      { mode: 'primitive-hook', visibleBars: 500, tickHz: 0, durationMs: 4000 },
      { mode: 'lwc-only', visibleBars: 500, tickHz: 30, durationMs: 4000 },
      { mode: 'primitive-hook', visibleBars: 500, tickHz: 30, durationMs: 4000 },
      { mode: 'range-raf', visibleBars: 500, tickHz: 30, durationMs: 3000 },
    ]) {
      const r = await page.evaluate((c) => window.__S01__.runPerfBenchmark(c), cfg);
      perfResults.push(r);
    }

    // 4. Mitigation Proof: Rust-backed 5,000-bar sliding viewport window + 30Hz/60Hz live ticks + 500 visible footprint bars
    const load5kMs = await page.evaluate(() => window.__S01__.loadWindowedDataset(5000));
    await sleep(250);
    for (const cfg of [
      { mode: 'primitive-hook', visibleBars: 500, tickHz: 30, durationMs: 5000 },
      { mode: 'primitive-hook', visibleBars: 500, tickHz: 60, durationMs: 5000 },
    ]) {
      const r = await page.evaluate((c) => window.__S01__.runPerfBenchmark(c), cfg);
      perfResults.push({ ...r, windowLoadMs: load5kMs });
    }

    const cdpMetrics = await cdp.send('Performance.getMetrics');
    const heapUsedObj = cdpMetrics.metrics.find((m) => m.name === 'JSHeapUsedSize');
    const heapTotalObj = cdpMetrics.metrics.find((m) => m.name === 'JSHeapTotalSize');
    const rssInfo = getTaggedBrowserTreeRssMB(BENCH_TAG);

    const output = {
      timestamp: new Date().toISOString(),
      browser: 'Brave Browser (Chromium headless, ANGLE Metal)',
      info2x,
      idleRaf,
      alignmentResults,
      perfResults,
      memory: {
        jsHeapUsedMB: heapUsedObj ? +(heapUsedObj.value / (1024 * 1024)).toFixed(2) : null,
        jsHeapTotalMB: heapTotalObj ? +(heapTotalObj.value / (1024 * 1024)).toFixed(2) : null,
        browserProcessTree: rssInfo,
      },
      errors,
    };

    writeFileSync('bench-results.json', JSON.stringify(output, null, 2));
    console.log('\n=== S01 Alignment Results ===');
    console.table(
      alignmentResults.map((a) => ({
        mode: a.syncMode,
        scenario: a.scenario,
        dpr: a.dpr,
        coordCssP95: +a.coordDriftCssP95.toFixed(3),
        coordCssMax: +a.coordDriftCssMax.toFixed(3),
        pixCssP95: a.pixelDriftCssP95 !== null ? +a.pixelDriftCssP95.toFixed(3) : null,
        pixCssMax: a.pixelDriftCssMax !== null ? +a.pixelDriftCssMax.toFixed(3) : null,
        lagFrames: a.laggingFrames,
      })),
    );
    console.log('\n=== S01 Performance Results ===');
    console.table(
      perfResults.map((p) => ({
        mode: p.syncMode,
        bars: p.avgVisibleFootprintBars,
        quads: p.avgQuads,
        glyphs: p.avgGlyphs,
        tickHz: p.tickHz,
        fps: +p.effectiveFps.toFixed(1),
        p50ms: +p.frameMsP50.toFixed(2),
        p95ms: +p.frameMsP95.toFixed(2),
        p99ms: +p.frameMsP99.toFixed(2),
        maxMs: +p.frameMsMax.toFixed(2),
        jsP95ms: +p.jsWorkMsP95.toFixed(2),
        glP95ms: +p.glDrawCpuMsP95.toFixed(2),
        stalls33: p.stallsOver33ms,
        driftCssMax: +p.driftCssMax.toFixed(3),
      })),
    );
    console.log('Memory:', output.memory);
    console.log('Errors:', errors.length);

    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
