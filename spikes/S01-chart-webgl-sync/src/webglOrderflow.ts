import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { LEVELS_PER_BAR, TICK_SIZE, type GeneratedDataset } from './dataGen';

export interface WebGLHardwareInfo {
  vendor: string;
  renderer: string;
  unmaskedVendor: string;
  unmaskedRenderer: string;
  version: string;
  maxTextureSize: number;
}

export interface RenderStats {
  quadCount: number;
  glyphCount: number;
  visibleFootprintBars: number;
  drawCpuMs: number;
  fiducialGlPhysX: number | null;
  fiducialGlPhysY: number | null;
}

const MAX_QUADS = 24_000;
const QUAD_FLOATS = 8; // x, y, w, h, r, g, b, a
const MAX_GLYPHS = 64_000;
const GLYPH_FLOATS = 12; // x, y, w, h, u0, v0, u1, v1, r, g, b, a

const GLYPH_CHARS = '0123456789-+KM. ';

const QUAD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_rect;   // x, y, w, h in physical px (top-left origin)
layout(location = 2) in vec4 a_color;
uniform vec2 u_resolution;
out vec4 v_color;
void main() {
  vec2 px = a_rect.xy + a_corner * a_rect.zw;
  vec2 ndc = vec2(
    (px.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (px.y / u_resolution.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = a_color;
}
`;

const QUAD_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

const GLYPH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_rect;
layout(location = 2) in vec4 a_uv;
layout(location = 3) in vec4 a_color;
uniform vec2 u_resolution;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 px = a_rect.xy + a_corner * a_rect.zw;
  vec2 ndc = vec2(
    (px.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (px.y / u_resolution.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_corner);
  v_color = a_color;
}
`;

const GLYPH_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_atlas;
in vec2 v_uv;
in vec4 v_color;
out vec4 outColor;
void main() {
  float alpha = texture(u_atlas, v_uv).a;
  if (alpha < 0.08) discard;
  outColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('Failed to create shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export class WebGLOrderflowOverlay {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private quadProg: WebGLProgram;
  private quadVao: WebGLVertexArrayObject;
  private quadInstanceBuf: WebGLBuffer;
  private quadResLoc: WebGLUniformLocation;

  private glyphProg: WebGLProgram;
  private glyphVao: WebGLVertexArrayObject;
  private glyphInstanceBuf: WebGLBuffer;
  private glyphResLoc: WebGLUniformLocation;
  private glyphAtlasLoc: WebGLUniformLocation;
  private atlasTex: WebGLTexture;
  private atlasDpr = 0;
  private glyphCellW = 8;
  private glyphCellH = 12;
  private glyphUvMap = new Map<number, [number, number, number, number]>();

  // Pre-allocated zero-GC scratch buffers
  private quadData = new Float32Array(MAX_QUADS * QUAD_FLOATS);
  private glyphData = new Float32Array(MAX_GLYPHS * GLYPH_FLOATS);
  private vpBuckets = new Int32Array(512); // price-tick volume profile accumulator

  public readonly hwInfo: WebGLHardwareInfo;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true, // enables exact readPixels calibration verification
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL2 context unavailable');
    }
    this.gl = gl;

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.hwInfo = {
      vendor: String(gl.getParameter(gl.VENDOR)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      unmaskedVendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : 'UNAVAILABLE',
      unmaskedRenderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'UNAVAILABLE',
      version: String(gl.getParameter(gl.VERSION)),
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    };

    const unitQuad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const cornerBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, unitQuad, gl.STATIC_DRAW);

    // Quad instanced pipeline
    this.quadProg = createProgram(gl, QUAD_VS, QUAD_FS);
    this.quadResLoc = gl.getUniformLocation(this.quadProg, 'u_resolution')!;
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.quadInstanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadInstanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.quadData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, QUAD_FLOATS * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, QUAD_FLOATS * 4, 16);
    gl.vertexAttribDivisor(2, 1);

    // Glyph instanced pipeline
    this.glyphProg = createProgram(gl, GLYPH_VS, GLYPH_FS);
    this.glyphResLoc = gl.getUniformLocation(this.glyphProg, 'u_resolution')!;
    this.glyphAtlasLoc = gl.getUniformLocation(this.glyphProg, 'u_atlas')!;
    this.glyphVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.glyphVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.glyphInstanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphInstanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.glyphData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, GLYPH_FLOATS * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, GLYPH_FLOATS * 4, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, GLYPH_FLOATS * 4, 32);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    this.atlasTex = gl.createTexture()!;
    this.bakeGlyphAtlas(window.devicePixelRatio || 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  public bakeGlyphAtlas(dpr: number): void {
    const quantizedDpr = Math.max(1, Math.min(3, Math.round(dpr * 2) / 2));
    if (quantizedDpr === this.atlasDpr) return;
    this.atlasDpr = quantizedDpr;

    const fontPx = Math.round(10 * quantizedDpr);
    const cellW = Math.ceil(fontPx * 0.68);
    const cellH = Math.ceil(fontPx * 1.25);
    this.glyphCellW = cellW;
    this.glyphCellH = cellH;

    const cols = GLYPH_CHARS.length;
    const texW = cols * cellW;
    const texH = cellH;

    const off = document.createElement('canvas');
    off.width = texW;
    off.height = texH;
    const ctx = off.getContext('2d')!;
    ctx.clearRect(0, 0, texW, texH);
    ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    this.glyphUvMap.clear();
    for (let i = 0; i < cols; i++) {
      const ch = GLYPH_CHARS[i];
      ctx.fillText(ch, i * cellW + cellW * 0.5, cellH * 0.55);
      this.glyphUvMap.set(ch.charCodeAt(0), [
        (i * cellW) / texW,
        0,
        ((i + 1) * cellW) / texW,
        1,
      ]);
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  public syncBackingStore(
    cssWidth: number,
    cssHeight: number,
    bitmapWidth: number,
    bitmapHeight: number,
  ): void {
    const bw = Math.max(1, Math.round(bitmapWidth));
    const bh = Math.max(1, Math.round(bitmapHeight));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    const targetCssW = `${cssWidth}px`;
    const targetCssH = `${cssHeight}px`;
    if (this.canvas.style.width !== targetCssW) this.canvas.style.width = targetCssW;
    if (this.canvas.style.height !== targetCssH) this.canvas.style.height = targetCssH;
  }

  public render(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    dataset: GeneratedDataset,
    hPixelRatio: number,
    vPixelRatio: number,
    calibrationAnchor?: { barIndex: number; price: number } | null,
  ): RenderStats {
    const t0 = performance.now();
    this.bakeGlyphAtlas(hPixelRatio);

    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const timeScale = chart.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();
    if (!logicalRange) {
      return {
        quadCount: 0,
        glyphCount: 0,
        visibleFootprintBars: 0,
        drawCpuMs: performance.now() - t0,
        fiducialGlPhysX: null,
        fiducialGlPhysY: null,
      };
    }

    const fromIdx = Math.max(0, Math.floor(logicalRange.from));
    const toIdx = Math.min(dataset.barCount - 1, Math.ceil(logicalRange.to));
    const visibleCount = Math.max(1, toIdx - fromIdx + 1);

    const qd = this.quadData;
    const gd = this.glyphData;
    let qCount = 0;
    let gCount = 0;

    const pushQuad = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      g: number,
      b: number,
      a: number,
    ) => {
      if (qCount >= MAX_QUADS) return;
      const off = qCount * QUAD_FLOATS;
      qd[off] = x;
      qd[off + 1] = y;
      qd[off + 2] = w;
      qd[off + 3] = h;
      qd[off + 4] = r;
      qd[off + 5] = g;
      qd[off + 6] = b;
      qd[off + 7] = a;
      qCount++;
    };

    const pushNumber = (
      val: number,
      x: number,
      y: number,
      r: number,
      g: number,
      b: number,
      a: number,
      scale = 1,
    ) => {
      // Fast integer-to-glyph emitter without regex/Intl overhead
      const str = val >= 0 ? `+${val}` : `${val}`;
      const cw = this.glyphCellW * scale;
      const ch = this.glyphCellH * scale;
      let cx = x;
      for (let i = 0; i < str.length; i++) {
        if (gCount >= MAX_GLYPHS) break;
        const uv = this.glyphUvMap.get(str.charCodeAt(i));
        if (!uv) continue;
        const off = gCount * GLYPH_FLOATS;
        gd[off] = cx;
        gd[off + 1] = y;
        gd[off + 2] = cw;
        gd[off + 3] = ch;
        gd[off + 4] = uv[0];
        gd[off + 5] = uv[1];
        gd[off + 6] = uv[2];
        gd[off + 7] = uv[3];
        gd[off + 8] = r;
        gd[off + 9] = g;
        gd[off + 10] = b;
        gd[off + 11] = a;
        gCount++;
        cx += cw * 0.9;
      }
    };

    // Determine bar spacing in physical pixels
    const x0 = timeScale.logicalToCoordinate(fromIdx as any);
    const x1 = timeScale.logicalToCoordinate((fromIdx + 1) as any);
    const barPitchPhys =
      x0 !== null && x1 !== null ? Math.max(1, (x1 - x0) * hPixelRatio) : Math.max(1, width / visibleCount);
    const cellW = Math.max(1, barPitchPhys * 0.86);

    // Volume Profile accumulator across visible price ticks
    let minTick = 1e9;
    let maxTick = -1e9;
    const fpLoopEnd = toIdx;
    const fpLoopStart = Math.max(fromIdx, toIdx - 499); // Render up to 500 visible footprint bars (10,000 cells)

    for (let i = fpLoopStart; i <= fpLoopEnd; i++) {
      if (dataset.lowTicks[i] < minTick) minTick = dataset.lowTicks[i];
      if (dataset.highTicks[i] > maxTick) maxTick = dataset.highTicks[i];
    }

    const tickSpan = Math.max(1, Math.min(511, maxTick - minTick + 1));
    this.vpBuckets.fill(0, 0, tickSpan);

    let renderedFpBars = 0;
    const drawCellDigits = barPitchPhys >= 24 * hPixelRatio;
    const deltaTextStride = barPitchPhys >= 18 * hPixelRatio ? 1 : Math.max(1, Math.ceil((22 * hPixelRatio) / barPitchPhys));

    for (let i = fpLoopStart; i <= fpLoopEnd; i++) {
      const cxCss = timeScale.logicalToCoordinate(i as any);
      if (cxCss === null) continue;
      const cxPhys = cxCss * hPixelRatio;

      const lowTick = dataset.lowTicks[i];
      const highTick = dataset.highTicks[i];
      const yTopCss = series.priceToCoordinate(highTick * TICK_SIZE);
      const yBotCss = series.priceToCoordinate(lowTick * TICK_SIZE);
      if (yTopCss === null || yBotCss === null) continue;

      const yTopPhys = yTopCss * vPixelRatio;
      const yBotPhys = yBotCss * vPixelRatio;
      const barHPhys = Math.max(LEVELS_PER_BAR, yBotPhys - yTopPhys);
      const levelH = barHPhys / LEVELS_PER_BAR;

      // Map bar index into pre-generated footprint buffer (wrap if scrolled far left into history)
      const fpIdx =
        i >= dataset.fpStartIndex
          ? i - dataset.fpStartIndex
          : ((i % dataset.fpBarCount) + dataset.fpBarCount) % dataset.fpBarCount;
      const base = fpIdx * LEVELS_PER_BAR;

      const leftX = cxPhys - cellW * 0.5;
      renderedFpBars++;

      // Emit 20 footprint cells per bar
      for (let lv = 0; lv < LEVELS_PER_BAR; lv++) {
        const bid = dataset.fpBidVols[base + lv];
        const ask = dataset.fpAskVols[base + lv];
        const total = bid + ask;
        const lvDelta = ask - bid;
        const cy = yBotPhys - (lv + 1) * levelH;

        // Accumulate into visible Volume Profile bucket
        const priceTick = lowTick + Math.round((lv / LEVELS_PER_BAR) * (highTick - lowTick));
        const bucket = priceTick - minTick;
        if (bucket >= 0 && bucket < tickSpan) {
          this.vpBuckets[bucket] += total;
        }

        // Color intensity by delta & diagonal imbalance highlight
        const intensity = Math.min(0.75, 0.14 + Math.abs(lvDelta) / 220);
        const isImbalance = (ask > bid * 3 && ask > 60) || (bid > ask * 3 && bid > 60);
        if (lvDelta >= 0) {
          pushQuad(
            leftX,
            cy,
            cellW,
            Math.max(1, levelH - 0.5),
            isImbalance ? 0.12 : 0.08,
            isImbalance ? 0.88 : 0.68,
            isImbalance ? 0.52 : 0.36,
            isImbalance ? 0.72 : intensity,
          );
        } else {
          pushQuad(
            leftX,
            cy,
            cellW,
            Math.max(1, levelH - 0.5),
            isImbalance ? 0.96 : 0.84,
            isImbalance ? 0.24 : 0.20,
            isImbalance ? 0.30 : 0.24,
            isImbalance ? 0.72 : intensity,
          );
        }

        if (drawCellDigits && lv % 2 === 0) {
          pushNumber(lvDelta, leftX + 2, cy + 1, 0.94, 0.96, 0.98, 0.9, 0.78);
        }
      }

      // Dynamic delta bar + delta text at bottom of pane
      const barDelta = dataset.deltas[i];
      const deltaBarH = Math.min(28 * vPixelRatio, Math.max(2 * vPixelRatio, (Math.abs(barDelta) / 900) * 26 * vPixelRatio));
      const deltaY = height - deltaBarH - 14 * vPixelRatio;
      if (barDelta >= 0) {
        pushQuad(leftX, deltaY, cellW, deltaBarH, 0.13, 0.77, 0.37, 0.65);
      } else {
        pushQuad(leftX, deltaY, cellW, deltaBarH, 0.94, 0.27, 0.27, 0.65);
      }

      if ((i - fpLoopStart) % deltaTextStride === 0) {
        pushNumber(
          barDelta,
          leftX,
          height - 13 * vPixelRatio,
          barDelta >= 0 ? 0.52 : 0.98,
          barDelta >= 0 ? 0.95 : 0.56,
          barDelta >= 0 ? 0.66 : 0.56,
          0.95,
          0.85,
        );
      }
    }

    // Visible-Range Volume Profile histogram on right edge of main pane
    let maxBucketVol = 1;
    let pocBucket = 0;
    for (let b = 0; b < tickSpan; b++) {
      if (this.vpBuckets[b] > maxBucketVol) {
        maxBucketVol = this.vpBuckets[b];
        pocBucket = b;
      }
    }
    const maxVpWidth = width * 0.14;
    for (let b = 0; b < tickSpan; b++) {
      const vol = this.vpBuckets[b];
      if (vol <= 0) continue;
      const yCss = series.priceToCoordinate((minTick + b) * TICK_SIZE);
      if (yCss === null) continue;
      const yPhys = yCss * vPixelRatio;
      const w = (vol / maxBucketVol) * maxVpWidth;
      const isPoc = b === pocBucket;
      pushQuad(
        width - w,
        yPhys - 1.5 * vPixelRatio,
        w,
        Math.max(2, 3 * vPixelRatio),
        isPoc ? 0.98 : 0.32,
        isPoc ? 0.75 : 0.56,
        isPoc ? 0.15 : 0.96,
        isPoc ? 0.85 : 0.38,
      );
    }

    // Calibration fiducial marker (10×10 physical px magenta square) at exact anchor (barIndex, price)
    let fiducialGlPhysX: number | null = null;
    let fiducialGlPhysY: number | null = null;
    if (calibrationAnchor) {
      const axCss = timeScale.logicalToCoordinate(calibrationAnchor.barIndex as any);
      const ayCss = series.priceToCoordinate(calibrationAnchor.price);
      if (axCss !== null && ayCss !== null) {
        fiducialGlPhysX = Math.round(axCss * hPixelRatio);
        fiducialGlPhysY = Math.round(ayCss * vPixelRatio);
        // Solid magenta (#ff00ff) 10x10 physical px square centered on (fiducialGlPhysX, fiducialGlPhysY)
        pushQuad(fiducialGlPhysX - 5, fiducialGlPhysY - 5, 10, 10, 1.0, 0.0, 1.0, 1.0);
      }
    }

    // Draw instanced quads (1 draw call)
    if (qCount > 0) {
      gl.useProgram(this.quadProg);
      gl.uniform2f(this.quadResLoc, width, height);
      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadInstanceBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, qd.subarray(0, qCount * QUAD_FLOATS));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, qCount);
    }

    // Draw instanced glyphs (1 draw call)
    if (gCount > 0) {
      gl.useProgram(this.glyphProg);
      gl.uniform2f(this.glyphResLoc, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.uniform1i(this.glyphAtlasLoc, 0);
      gl.bindVertexArray(this.glyphVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphInstanceBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, gd.subarray(0, gCount * GLYPH_FLOATS));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, gCount);
    }

    gl.bindVertexArray(null);

    return {
      quadCount: qCount,
      glyphCount: gCount,
      visibleFootprintBars: renderedFpBars,
      drawCpuMs: performance.now() - t0,
      fiducialGlPhysX,
      fiducialGlPhysY,
    };
  }

  public readFiducialCentroid(expectedX: number, expectedY: number, radius = 24): { x: number; y: number; pixels: number } | null {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const x0 = Math.max(0, Math.floor(expectedX - radius));
    const y0 = Math.max(0, Math.floor(expectedY - radius));
    const x1 = Math.min(width - 1, Math.ceil(expectedX + radius));
    const y1 = Math.min(height - 1, Math.ceil(expectedY + radius));
    const rw = x1 - x0 + 1;
    const rh = y1 - y0 + 1;
    if (rw <= 0 || rh <= 0) return null;

    // WebGL readPixels has bottom-left origin
    const glY = height - (y0 + rh);
    const buf = new Uint8Array(rw * rh * 4);
    gl.readPixels(x0, glY, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let row = 0; row < rh; row++) {
      // row 0 in buf is bottom-most (y = y0 + rh - 1)
      const screenY = y0 + (rh - 1 - row);
      for (let col = 0; col < rw; col++) {
        const idx = (row * rw + col) * 4;
        const r = buf[idx];
        const g = buf[idx + 1];
        const b = buf[idx + 2];
        const a = buf[idx + 3];
        if (r > 240 && g < 20 && b > 240 && a > 240) {
          sumX += x0 + col + 0.5;
          sumY += screenY + 0.5;
          count++;
        }
      }
    }
    if (count === 0) return null;
    return { x: sumX / count, y: sumY / count, pixels: count };
  }

  public destroy(): void {
    const gl = this.gl;
    gl.deleteProgram(this.quadProg);
    gl.deleteProgram(this.glyphProg);
    gl.deleteBuffer(this.quadInstanceBuf);
    gl.deleteBuffer(this.glyphInstanceBuf);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteVertexArray(this.glyphVao);
    gl.deleteTexture(this.atlasTex);
  }
}
