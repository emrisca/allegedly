import { useEffect, useRef, useState } from "react";

const SEGMENTS = [
  [475, 245, 549, 245], [461, 269, 415, 369], [563, 269, 609, 369],
  [387, 399, 341, 498], [475, 504, 549, 504], [637, 399, 683, 498],
  [312, 528, 267, 628], [401, 634, 623, 634], [712, 528, 757, 628],
  [238, 658, 193, 758], [253, 763, 327, 763], [387, 658, 341, 758],
  [637, 658, 683, 758], [697, 763, 771, 763], [786, 658, 831, 758],
].map(([x1, y1, x2, y2]) => [(x1 - 512) / 340, (y1 - 504) / 340, (x2 - 512) / 340, (y2 - 504) / 340]);

function distanceToSegment(x: number, y: number, segment: number[]) {
  const [x1, y1, x2, y2] = segment;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

export function FlipdotLaunchIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let start = 0;
    let previous = 0;
    let dots: { x: number; y: number; diagonal: number; logo: boolean; halo: boolean; angle: number; velocity: number; speed: number }[] = [];
    let width = 0;
    let height = 0;
    let ratio = 1;
    const pitch = 15;
    const radius = pitch * 0.375;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const cols = Math.floor((width - 20) / pitch);
      const rows = Math.floor((height - 20) / pitch);
      const ox = (width - cols * pitch) / 2 + pitch / 2;
      const oy = (height - rows * pitch) / 2 + pitch / 2;
      const half = Math.max(72, Math.min(Math.min(width, height) * 0.25, 165));
      const stroke = Math.max(0.088, pitch * 0.72 / half);
      dots = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = ox + col * pitch;
          const y = oy + row * pitch;
          const nx = (x - width * 0.5) / half;
          const ny = (y - height * 0.43) / half;
          const distance = Math.min(...SEGMENTS.map((segment) => distanceToSegment(nx, ny, segment)));
          dots.push({ x, y, diagonal: x / width * 0.72 + y / height * 0.28, logo: distance <= stroke, halo: distance <= stroke + pitch * 1.4 / half, angle: 0, velocity: 0, speed: 0.84 + ((col * 37 + row * 67) % 100) / 100 * 0.34 });
        }
      }
    };
    resize();
    window.addEventListener("resize", resize);
    const draw = (now: number) => {
      if (!start) start = now;
      const elapsed = (now - start) / 1000;
      const dt = previous ? Math.min(0.05, (now - previous) / 1000) : 0.016;
      previous = now;
      const light = document.documentElement.dataset.theme === "light";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = light ? "#f1f3f6" : "#07080a";
      ctx.fillRect(0, 0, width, height);
      const wave = elapsed * 0.6 - 0.15;
      for (const dot of dots) {
        const active = (dot.logo && dot.diagonal <= wave + 0.08) || Math.abs(dot.diagonal - wave) < 0.08 || (Math.abs(dot.diagonal - (wave - 0.28)) < 0.04 && !dot.halo);
        const goal = active ? Math.PI : 0;
        dot.velocity = (dot.velocity + (goal - dot.angle) * 235 * dot.speed * dt) * Math.exp(-21 * dt);
        dot.angle = Math.max(0, Math.min(Math.PI, dot.angle + dot.velocity * dt));
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius * 1.09, 0, Math.PI * 2);
        ctx.fillStyle = light ? "#dce0e8" : "#11141a";
        ctx.fill();
        ctx.strokeStyle = light ? "#c9ced9" : "#262b35";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius * 0.91, 0, Math.PI * 2);
        ctx.fillStyle = light ? "#e8ebf1" : "#1a1e26";
        ctx.fill();
        if (dot.angle >= 0.04) {
          const cos = Math.abs(Math.cos(dot.angle));
          ctx.fillStyle = cos < 0.19 ? (light ? "#6e7788" : "#6d7483") : dot.angle >= Math.PI / 2 ? (light ? "#111318" : "#f6f7f9") : (light ? "#c9ced9" : "#262b35");
          ctx.beginPath();
          ctx.ellipse(dot.x, dot.y, radius, Math.max(0.95, radius * cos), -18 * Math.PI / 180, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (elapsed < 3.5) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const fade = window.setTimeout(() => setExiting(true), 3000);
    const finish = window.setTimeout(() => setVisible(false), 3500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fade);
      clearTimeout(finish);
      window.removeEventListener("resize", resize);
    };
  }, [visible]);

  if (!visible) return null;
  return <div aria-hidden="true" className={`fixed inset-0 z-[1000] transition-opacity duration-500 ${exiting ? "pointer-events-none opacity-0" : "opacity-100"}`}><canvas ref={canvasRef} className="block h-full w-full" /></div>;
}
