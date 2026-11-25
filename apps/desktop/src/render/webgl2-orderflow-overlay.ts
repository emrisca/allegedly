import {
  BIT_BUY_IMBAL,
  BIT_POC,
  BIT_SELL_IMBAL,
  type FootprintCell,
  type TpoRow128,
  type VolumeProfileBin,
  type VolumeProfileSummary,
} from "@allegedly/ipc-client";

export interface OverlayVisibility {
  footprint: boolean;
  vrvp: boolean;
  tpo: boolean;
}

export interface OverlayRenderData {
  activeBarTimeSec: number;
  tickSizeFloat: number;
  footprintCells: readonly FootprintCell[];
  vpSummary: VolumeProfileSummary | null;
  vpBins: readonly VolumeProfileBin[];
  tpoRows: readonly TpoRow128[];
  visibility: OverlayVisibility;
}

export interface CoordinateBridge {
  timeToX: (timeSec: number) => number | null;
  priceToY: (price: number) => number | null;
}

const VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_unit;
layout(location = 1) in vec4 a_rect;  // x, y, w, h in CSS pixels
layout(location = 2) in vec4 a_color; // r, g, b, a
uniform vec2 u_viewport;
out vec4 v_color;
void main() {
  vec2 px = a_rect.xy + a_unit * a_rect.zw;
  vec2 ndc = (px / u_viewport) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  v_color = a_color;
}
`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

const MAX_QUADS = 2048;
const FLOATS_PER_QUAD = 8; // rect(4) + color(4)

/**
 * WebGL2 instanced-quad overlay synchronized to Lightweight Charts v5.3.0 (ADR-0004 / S01).
 * Keeps React completely out of the 60 fps render path; falls back gracefully to Canvas2D
 * if WebGL2 is unavailable (e.g. headless jsdom test runners).
 */
export class WebGl2OrderflowOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ctx2d: CanvasRenderingContext2D | null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private instanceBuf: WebGLBuffer | null = null;
  private uViewport: WebGLUniformLocation | null = null;
  private readonly instanceData = new Float32Array(MAX_QUADS * FLOATS_PER_QUAD);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: true,
      });
    } catch {
      gl = null;
    }
    this.gl = gl;
    this.ctx2d = gl ? null : canvas.getContext("2d");
    if (this.gl) {
      this.initGl(this.gl);
    }
  }

  public isWebGl2(): boolean {
    return this.gl !== null && this.program !== null;
  }

  private initGl(gl: WebGL2RenderingContext): void {
    const compile = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return;
    }

    const vao = gl.createVertexArray();
    const quadBuf = gl.createBuffer();
    const instanceBuf = gl.createBuffer();
    if (!vao || !quadBuf || !instanceBuf) return;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_QUAD * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.program = prog;
    this.vao = vao;
    this.instanceBuf = instanceBuf;
    this.uViewport = gl.getUniformLocation(prog, "u_viewport");
  }

  public render(
    width: number,
    height: number,
    data: OverlayRenderData,
    bridge: CoordinateBridge,
  ): number {
    if (width <= 0 || height <= 0) return 0;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.floor(width * dpr);
    const pxH = Math.floor(height * dpr);
    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    let quadCount = 0;
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
      if (quadCount >= MAX_QUADS || w <= 0 || h <= 0) return;
      const o = quadCount * FLOATS_PER_QUAD;
      this.instanceData[o] = x;
      this.instanceData[o + 1] = y;
      this.instanceData[o + 2] = w;
      this.instanceData[o + 3] = h;
      this.instanceData[o + 4] = r;
      this.instanceData[o + 5] = g;
      this.instanceData[o + 6] = b;
      this.instanceData[o + 7] = a;
      quadCount++;
    };

    const rowHeight = 9;

    // 1. Volume Profile (VRVP) horizontal histogram anchored to right chart edge
    if (data.visibility.vrvp && data.vpBins.length > 0) {
      let maxTotal = 1n;
      for (const b of data.vpBins) {
        const t = b.bidVolE9 + b.askVolE9;
        if (t > maxTotal) maxTotal = t;
      }
      const maxBarW = Math.min(120, width * 0.16);
      const rightEdge = width - 64; // stay clear of LWC right price axis
      for (const bin of data.vpBins) {
        const y = bridge.priceToY(Number(bin.priceTick) * data.tickSizeFloat);
        if (y === null) continue;
        const tot = bin.bidVolE9 + bin.askVolE9;
        const totalW = Number((tot * BigInt(Math.floor(maxBarW))) / maxTotal);
        const askW = tot > 0n ? Number((bin.askVolE9 * BigInt(Math.floor(totalW))) / tot) : 0;
        const bidW = Math.max(0, totalW - askW);
        pushQuad(rightEdge - totalW, y - rowHeight / 2, bidW, rowHeight - 1, 0.96, 0.25, 0.37, 0.26);
        pushQuad(rightEdge - askW, y - rowHeight / 2, askW, rowHeight - 1, 0.06, 0.72, 0.51, 0.32);
      }
      if (data.vpSummary) {
        const pocY = bridge.priceToY(Number(data.vpSummary.pocPrice) * data.tickSizeFloat);
        if (pocY !== null) pushQuad(0, pocY - 0.75, rightEdge, 1.5, 0.96, 0.62, 0.04, 0.75);
        const vahY = bridge.priceToY(Number(data.vpSummary.vahPrice) * data.tickSizeFloat);
        if (vahY !== null) pushQuad(0, vahY - 0.5, rightEdge, 1, 0.22, 0.74, 0.97, 0.45);
        const valY = bridge.priceToY(Number(data.vpSummary.valPrice) * data.tickSizeFloat);
        if (valY !== null) pushQuad(0, valY - 0.5, rightEdge, 1, 0.22, 0.74, 0.97, 0.45);
      }
    }

    // 2. TPO u128 profile brackets anchored on left margin
    if (data.visibility.tpo && data.tpoRows.length > 0) {
      for (const row of data.tpoRows) {
        const y = bridge.priceToY(Number(row.priceTick) * data.tickSizeFloat);
        if (y === null) continue;
        let bits = row.periodMask;
        let pop = 0;
        while (bits > 0n) {
          bits &= bits - 1n;
          pop++;
        }
        const w = Math.min(96, pop * 6);
        pushQuad(8, y - 3.5, w, 7, 0.65, 0.55, 0.98, 0.38);
      }
    }

    // 3. Active Footprint bid/ask cells + imbalance/POC markers aligned to active bar X
    if (data.visibility.footprint && data.footprintCells.length > 0) {
      const barX = bridge.timeToX(data.activeBarTimeSec);
      if (barX !== null) {
        let maxSide = 1n;
        for (const c of data.footprintCells) {
          if (c.bidVolE9 > maxSide) maxSide = c.bidVolE9;
          if (c.askVolE9 > maxSide) maxSide = c.askVolE9;
        }
        const halfW = 34;
        for (const cell of data.footprintCells) {
          const y = bridge.priceToY(Number(cell.priceTick) * data.tickSizeFloat);
          if (y === null) continue;
          const bidW = Number((cell.bidVolE9 * BigInt(halfW)) / maxSide);
          const askW = Number((cell.askVolE9 * BigInt(halfW)) / maxSide);
          const isSellImb = (cell.imbalanceFlags & BIT_SELL_IMBAL) !== 0;
          const isBuyImb = (cell.imbalanceFlags & BIT_BUY_IMBAL) !== 0;
          const isPoc = (cell.imbalanceFlags & BIT_POC) !== 0;

          pushQuad(
            barX - bidW - 2,
            y - 4,
            bidW,
            8,
            0.96,
            0.25,
            0.37,
            isSellImb ? 0.85 : 0.42,
          );
          pushQuad(
            barX + 2,
            y - 4,
            askW,
            8,
            0.06,
            0.72,
            0.51,
            isBuyImb ? 0.85 : 0.42,
          );
          if (isPoc) {
            pushQuad(barX - halfW - 3, y - 4.5, halfW * 2 + 6, 1.5, 0.98, 0.75, 0.14, 0.95);
          }
        }
      }
    }

    if (this.gl && this.program && this.vao && this.instanceBuf) {
      const gl = this.gl;
      gl.viewport(0, 0, pxW, pxH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (quadCount > 0) {
        gl.useProgram(this.program);
        gl.uniform2f(this.uViewport, width, height);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          this.instanceData.subarray(0, quadCount * FLOATS_PER_QUAD),
        );
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, quadCount);
        gl.bindVertexArray(null);
      }
    } else if (this.ctx2d) {
      const ctx = this.ctx2d;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < quadCount; i++) {
        const o = i * FLOATS_PER_QUAD;
        ctx.fillStyle = `rgba(${Math.round(this.instanceData[o + 4] * 255)}, ${Math.round(this.instanceData[o + 5] * 255)}, ${Math.round(this.instanceData[o + 6] * 255)}, ${this.instanceData[o + 7]})`;
        ctx.fillRect(
          this.instanceData[o],
          this.instanceData[o + 1],
          this.instanceData[o + 2],
          this.instanceData[o + 3],
        );
      }
      ctx.restore();
    }

    return quadCount;
  }

  public dispose(): void {
    if (this.gl) {
      if (this.instanceBuf) this.gl.deleteBuffer(this.instanceBuf);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.program = null;
    this.vao = null;
    this.instanceBuf = null;
  }
}
