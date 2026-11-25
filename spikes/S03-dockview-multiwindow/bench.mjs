import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright-core';

const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const PORT = 4173;
const WS_PORT = 4174;
const URL = `http://127.0.0.1:${PORT}/`;
const BENCH_TAG = `allegedly-s03-${process.pid}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function auditDockviewLicense() {
  const pkgJson = readFileSync('package.json', 'utf8');
  const lockfile = existsSync('pnpm-lock.yaml') ? readFileSync('pnpm-lock.yaml', 'utf8') : '';
  const hasEnterprisePkg = pkgJson.includes('dockview-enterprise');
  const hasEnterpriseLock = lockfile.includes('dockview-enterprise');

  let enterpriseDirs = [];
  const pnpmDir = join('node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    enterpriseDirs = readdirSync(pnpmDir).filter((d) => d.includes('dockview-enterprise'));
  }

  // Read installed dockview package.json license field
  const dvPkg = JSON.parse(readFileSync(join('node_modules', 'dockview', 'package.json'), 'utf8'));
  const dvReactPkg = JSON.parse(readFileSync(join('node_modules', 'dockview-react', 'package.json'), 'utf8'));
  const dvCorePath = join('node_modules', 'dockview', 'node_modules', 'dockview-core', 'package.json');
  const dvCorePkg = existsSync(dvCorePath)
    ? JSON.parse(readFileSync(dvCorePath, 'utf8'))
    : null;

  return {
    dockviewVersion: dvPkg.version,
    dockviewLicense: dvPkg.license,
    dockviewReactVersion: dvReactPkg.version,
    dockviewReactLicense: dvReactPkg.license,
    dockviewCoreVersion: dvCorePkg?.version ?? 'transitive',
    dockviewCoreLicense: dvCorePkg?.license ?? 'MIT (via pnpm store)',
    hasEnterpriseInPackageJson: hasEnterprisePkg,
    hasEnterpriseInLockfile: hasEnterpriseLock,
    enterpriseDirsFound: enterpriseDirs,
    cleanMitOnly: !hasEnterprisePkg && !hasEnterpriseLock && enterpriseDirs.length === 0 && dvPkg.license === 'MIT' && dvReactPkg.license === 'MIT',
  };
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
  const licenseAudit = auditDockviewLicense();
  console.log('=== S03 License Audit ===');
  console.log(JSON.stringify(licenseAudit, null, 2));
  if (!licenseAudit.cleanMitOnly) {
    throw new Error('LICENSE AUDIT FAILED: dockview-enterprise detected or non-MIT license');
  }

  // Local WebSocket state-hub (simulating Rust backend multi-window state relay)
  const wss = new WebSocketServer({ host: '127.0.0.1', port: WS_PORT });
  const clients = new Set();
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (data) => {
      const text = data.toString();
      for (const c of clients) {
        if (c !== ws && c.readyState === 1) c.send(text);
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

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
        '--disable-popup-blocking',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__S03__?.ready));
    await sleep(250);

    const initialLayout = await page.evaluate(() => window.__S03__.getLayoutSnapshot());
    console.log('\n=== S03 Initial 9-Panel Workspace ===');
    console.log(JSON.stringify(initialLayout, null, 2));

    // 1. Serialize / Restore round-trip (10 cycles)
    const roundTrip = await page.evaluate(() => window.__S03__.benchmarkSerializeRestore(10));
    console.log('\n=== S03 Layout JSON Serialize/Restore (10x) ===');
    console.log(JSON.stringify(roundTrip, null, 2));

    // 2. Native Dockview Pop-Out Window check (`addPopoutGroup`)
    const popupPromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    const popoutResult = await page.evaluate(() => window.__S03__.tryDockviewPopout());
    const popoutPage = await popupPromise;
    const popoutInfo = {
      ...popoutResult,
      playwrightCapturedPopup: Boolean(popoutPage),
      popupUrl: popoutPage ? popoutPage.url() : null,
    };
    if (popoutPage) await popoutPage.close();
    console.log('\n=== S03 Dockview Native Pop-Out Check ===');
    console.log(JSON.stringify(popoutInfo, null, 2));

    // 3. Cross-Window State Sync (Main Window <-> Second Peer Window) via BroadcastChannel AND State Hub WS
    const peerPage = await context.newPage();
    await peerPage.goto(`${URL}?mode=peer&peerId=popout-es`, { waitUntil: 'networkidle' });
    await peerPage.waitForFunction(() => Boolean(window.__S03_PEER_READY__));
    await sleep(200);

    const bcSync = await page.evaluate(() => window.__S03__.benchmarkCrossWindowSync('broadcast', 200));
    const wsSync = await page.evaluate(() => window.__S03__.benchmarkCrossWindowSync('ws-hub', 200));
    await peerPage.close();
    console.log('\n=== S03 Cross-Window Sync (200 round-trips) ===');
    console.table([bcSync, wsSync]);

    // 4. Memory Leak Check: 20 Open/Close Heavy Panel Cycles with forced GC
    const sampleHeap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(60);
      await cdp.send('HeapProfiler.collectGarbage');
      const m = await cdp.send('Performance.getMetrics');
      const get = (name) => m.metrics.find((x) => x.name === name)?.value ?? 0;
      return {
        jsHeapMB: +(get('JSHeapUsedSize') / (1024 * 1024)).toFixed(3),
        domNodes: Math.round(get('Nodes')),
        jsListeners: Math.round(get('JSEventListeners')),
      };
    };

    // Warmup 2 cycles so JIT/pools stabilize
    for (let w = 0; w < 2; w++) {
      await page.evaluate((id) => window.__S03__.openHeavyPanel(id), `warmup-${w}`);
      await sleep(80);
      await page.evaluate((id) => window.__S03__.closePanel(id), `warmup-${w}`);
      await sleep(80);
    }

    const baseline = await sampleHeap();
    const cycleSamples = [];
    for (let c = 1; c <= 20; c++) {
      const id = `heavy-cycle-${c}`;
      await page.evaluate((pid) => window.__S03__.openHeavyPanel(pid), id);
      await sleep(70);
      await page.evaluate((pid) => window.__S03__.closePanel(pid), id);
      await sleep(50);
      if (c % 5 === 0 || c === 1) {
        const snap = await sampleHeap();
        const stats = await page.evaluate(() => window.__S03__.getLifecycleStats());
        cycleSamples.push({ cycle: c, ...snap, ...stats });
      }
    }
    const finalHeap = await sampleHeap();
    const finalStats = await page.evaluate(() => window.__S03__.getLifecycleStats());
    const rssInfo = getTaggedBrowserTreeRssMB(BENCH_TAG);

    const leakSummary = {
      baseline,
      final: finalHeap,
      heapDeltaMB: +(finalHeap.jsHeapMB - baseline.jsHeapMB).toFixed(3),
      domNodesDelta: finalHeap.domNodes - baseline.domNodes,
      listenersDelta: finalHeap.jsListeners - baseline.jsListeners,
      finalLifecycleStats: finalStats,
      cycleSamples,
      browserProcessTree: rssInfo,
    };

    console.log('\n=== S03 20-Cycle Open/Close Memory Leak Audit ===');
    console.table(cycleSamples);
    console.log('Leak summary:', {
      heapDeltaMB: leakSummary.heapDeltaMB,
      domNodesDelta: leakSummary.domNodesDelta,
      listenersDelta: leakSummary.listenersDelta,
      activeHeavyPanels: finalStats.activeHeavyPanels,
      activeChannels: finalStats.activeChannels,
      rss: rssInfo,
    });

    const output = {
      timestamp: new Date().toISOString(),
      licenseAudit,
      initialLayout,
      roundTrip,
      popoutInfo,
      crossWindowSync: [bcSync, wsSync],
      leakSummary,
      errors,
    };
    writeFileSync('bench-results.json', JSON.stringify(output, null, 2));
    console.log('Errors:', errors.length);

    await browser.close();
  } finally {
    server.kill('SIGTERM');
    wss.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
