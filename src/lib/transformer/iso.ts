/* iso.ts: isometric projection + primitive drawing helpers.
   Grid space: x grows toward the lower-right, y toward the lower-left, z up. */

export const TW = 30; // half tile width  (px per grid unit on screen-x)
export const TH = 15; // half tile height (px per grid unit on screen-y)
export const TZ = 20; // px per grid unit of height

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

export interface BoxOptions extends Point3D {
  w: number;
  d: number;
  h: number;
  color: string;
  windows?: {
    cols?: number;
    rows?: number;
    seed?: number;
    color?: string;
    dark?: string;
    blink?: number;
  };
  alpha?: number;
  edge?: string | false;
  edgeWidth?: number;
  topShade?: number;
}

export interface OrientedBoxOptions extends Point3D {
  hx: number;
  hy: number;
  len: number;
  wid: number;
  h: number;
  color: string;
  edge?: string | false;
}

export interface CylinderOptions extends Point3D {
  r: number;
  h: number;
  color: string;
  ring?: number;
  topShade?: number;
  edge?: string | false;
}

export function project(x: number, y: number, z: number = 0): Point2D {
  return { x: (x - y) * TW, y: (x + y) * TH - z * TZ };
}

export const P = project;

/* Inverse projection onto the z = 0 ground plane. */
export function unproject(sx: number, sy: number): Point2D {
  const a = sx / TW;
  const b = sy / TH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/* ---- colour helpers ---------------------------------------------------- */

const shadeCache: Record<string, string> = Object.create(null);

export function parseHex(hex: string): [number, number, number] {
  if (hex.charCodeAt(0) !== 35) {
    const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(hex);
    if (m) return [+m[1], +m[2], +m[3]];
  }
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (isNaN(n)) return [255, 0, 255]; /* loud magenta, not silent black */
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, f: number): string {
  f = Math.round(f * 64) / 64;
  const key = hex + "|" + f;
  const hit = shadeCache[key];
  if (hit) return hit;
  const c = parseHex(hex);
  const out =
    "rgb(" +
    Math.min(255, Math.round(c[0] * f)) +
    "," +
    Math.min(255, Math.round(c[1] * f)) +
    "," +
    Math.min(255, Math.round(c[2] * f)) +
    ")";
  shadeCache[key] = out;
  return out;
}

export function rgba(hex: string, a: number): string {
  const c = parseHex(hex);
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
}

export function mix(hexA: string, hexB: string, t: number): string {
  const a = parseHex(hexA),
    b = parseHex(hexB);
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const v = Math.max(0, Math.min(255, Math.round(a[i] + (b[i] - a[i]) * t)));
    out += (v < 16 ? "0" : "") + v.toString(16);
  }
  return out;
}

/* ---- deterministic noise ----------------------------------------------- */

export function hash2(x: number, y: number, s: number): number {
  let h =
    (Math.imul(x | 0, 374761393) ^
      Math.imul(y | 0, 668265263) ^
      Math.imul(s | 0, 2246822519)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ---- primitives -------------------------------------------------------- */

export function poly(ctx: CanvasRenderingContext2D, pts: Point2D[]) {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

export function polyLine(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  close?: boolean
) {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

const TOP = 1.0,
  RIGHT = 0.89,
  LEFT = 0.76;
const DEFAULT_EDGE = "rgba(88,78,64,0.30)";

export function box(ctx: CanvasRenderingContext2D, o: BoxOptions) {
  const x = o.x,
    y = o.y,
    z = o.z || 0,
    w = o.w,
    d = o.d,
    h = o.h;
  const c = o.color,
    t = z + h;
  if (o.alpha != null) {
    ctx.save();
    ctx.globalAlpha *= o.alpha;
  }

  const A = project(x, y, t),
    B = project(x + w, y, t),
    C = project(x + w, y + d, t),
    D = project(x, y + d, t);
  const Bb = project(x + w, y, z),
    Cb = project(x + w, y + d, z),
    Db = project(x, y + d, z);

  ctx.fillStyle = shade(c, RIGHT);
  poly(ctx, [B, C, Cb, Bb]);
  ctx.fillStyle = shade(c, LEFT);
  poly(ctx, [D, C, Cb, Db]);

  if (o.windows) drawWindows(ctx, o);

  ctx.fillStyle = shade(c, o.topShade != null ? o.topShade : TOP);
  poly(ctx, [A, B, C, D]);

  const edge = o.edge === false ? null : o.edge || DEFAULT_EDGE;
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = o.edgeWidth || 1;
    ctx.lineJoin = "round";
    polyLine(ctx, [A, B, C, D], true);
    polyLine(ctx, [B, Bb], false);
    polyLine(ctx, [C, Cb], false);
    polyLine(ctx, [D, Db], false);
  }
  if (o.alpha != null) ctx.restore();
}

function drawWindows(ctx: CanvasRenderingContext2D, o: BoxOptions) {
  const win = o.windows!;
  const cols = win.cols || 3,
    rows = win.rows || Math.max(1, Math.round(o.h * 1.6));
  const x = o.x,
    y = o.y,
    z = o.z || 0,
    w = o.w,
    d = o.d,
    h = o.h;
  const seed = win.seed || 1;
  const lit = win.color || "#5d7182";
  const dark = win.dark || "#93a6b2";
  const blink = win.blink || 0;

  const X1 = x + w,
    Y1 = y + d;
  let r: number, c: number, on: boolean;
  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols; c++) {
      let n = hash2(r * 31 + c, seed, 7);
      on = n > 0.52;
      ctx.fillStyle = on
        ? rgba(lit, 0.42 + 0.3 * Math.abs(Math.sin(blink + n * 9)))
        : rgba(dark, 0.5);
      const z0 = z + h * ((r + 0.28) / rows),
        z1 = z + h * ((r + 0.72) / rows);
      const v0 = y + d * ((c + 0.26) / cols),
        v1 = y + d * ((c + 0.74) / cols);
      poly(ctx, [
        project(X1, v0, z1),
        project(X1, v1, z1),
        project(X1, v1, z0),
        project(X1, v0, z0),
      ]);

      n = hash2(r * 17 + c, seed + 3, 11);
      on = n > 0.55;
      ctx.fillStyle = on
        ? rgba(lit, 0.34 + 0.24 * Math.abs(Math.sin(blink + n * 9)))
        : rgba(dark, 0.42);
      const u0 = x + w * ((c + 0.26) / cols),
        u1 = x + w * ((c + 0.74) / cols);
      poly(ctx, [
        project(u0, Y1, z1),
        project(u1, Y1, z1),
        project(u1, Y1, z0),
        project(u0, Y1, z0),
      ]);
    }
  }
}

export function prism(
  ctx: CanvasRenderingContext2D,
  base: Point2D[],
  z: number,
  h: number,
  color: string,
  edge?: string | false
) {
  const top: Point2D[] = [],
    bot: Point2D[] = [],
    n = base.length;
  for (let i = 0; i < n; i++) {
    top.push(project(base[i].x, base[i].y, z + h));
    bot.push(project(base[i].x, base[i].y, z));
  }

  interface Face {
    depth: number;
    shade: number;
    quad: Point2D[];
  }
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = base[j].x - base[i].x,
      ey = base[j].y - base[i].y;
    const el = Math.hypot(ex, ey) || 1;
    const nx = -ey / el,
      ny = ex / el;
    if (nx + ny <= 0) continue;
    faces.push({
      depth: base[i].x + base[i].y + base[j].x + base[j].y,
      shade: 0.8 + 0.09 * nx - 0.06 * ny,
      quad: [top[i], top[j], bot[j], bot[i]],
    });
  }
  faces.sort((a, b) => a.depth - b.depth);
  for (let i = 0; i < faces.length; i++) {
    ctx.fillStyle = shade(color, faces[i].shade);
    poly(ctx, faces[i].quad);
  }

  ctx.fillStyle = shade(color, 1.0);
  poly(ctx, top);

  const e = edge === false ? null : edge || DEFAULT_EDGE;
  if (e) {
    ctx.strokeStyle = e;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    polyLine(ctx, top, true);
  }
}

export function orientedBox(
  ctx: CanvasRenderingContext2D,
  o: OrientedBoxOptions
) {
  const m = Math.hypot(o.hx, o.hy) || 1;
  const hx = o.hx / m,
    hy = o.hy / m;
  const px = -hy,
    py = hx;
  const L = o.len / 2,
    W = o.wid / 2;
  prism(
    ctx,
    [
      { x: o.x + hx * L + px * W, y: o.y + hy * L + py * W },
      { x: o.x + hx * L - px * W, y: o.y + hy * L - py * W },
      { x: o.x - hx * L - px * W, y: o.y - hy * L - py * W },
      { x: o.x - hx * L + px * W, y: o.y - hy * L + py * W },
    ],
    o.z || 0,
    o.h,
    o.color,
    o.edge
  );
}

export function gableRoof(ctx: CanvasRenderingContext2D, o: BoxOptions) {
  const x = o.x,
    y = o.y,
    z = o.z || 0,
    w = o.w,
    d = o.d,
    h = o.h,
    c = o.color;
  const my = y + d / 2,
    tz = z + h;
  const A = project(x, y, z),
    B = project(x + w, y, z);
  const C = project(x + w, y + d, z),
    D = project(x, y + d, z);
  const R1 = project(x, my, tz),
    R2 = project(x + w, my, tz);

  ctx.fillStyle = shade(c, 1.04);
  poly(ctx, [A, B, R2, R1]);
  ctx.fillStyle = shade(c, 0.88);
  poly(ctx, [B, R2, C]);
  ctx.fillStyle = shade(c, 0.78);
  poly(ctx, [D, C, R2, R1]);

  const edge = o.edge === false ? null : o.edge || DEFAULT_EDGE;
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    polyLine(ctx, [A, B, R2, R1], true);
    polyLine(ctx, [D, C, R2, R1], true);
    polyLine(ctx, [B, R2, C], true);
  }
}

export function cylinder(ctx: CanvasRenderingContext2D, o: CylinderOptions) {
  const r = o.r,
    z = o.z || 0,
    h = o.h,
    c = o.color;
  const a = r * TW * 1.41421,
    b = r * TH * 1.41421;
  const top = project(o.x, o.y, z + h);
  const bot = project(o.x, o.y, z);

  ctx.fillStyle = shade(c, 0.74);
  ctx.beginPath();
  ctx.ellipse(bot.x, bot.y, a, b, 0, 0, Math.PI);
  ctx.lineTo(top.x - a, top.y);
  ctx.lineTo(bot.x - a, bot.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(c, 0.87);
  ctx.fillRect(top.x - a, top.y, a * 2, bot.y - top.y);

  if (o.ring) {
    ctx.fillStyle = shade(c, 0.95);
    const ry = top.y + (bot.y - top.y) * o.ring;
    ctx.fillRect(top.x - a, ry, a * 2, Math.max(2, b * 0.35));
  }

  ctx.fillStyle = shade(c, o.topShade != null ? o.topShade : 1.05);
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, a, b, 0, 0, Math.PI * 2);
  ctx.fill();

  const cedge = o.edge === false ? null : o.edge || DEFAULT_EDGE;
  if (cedge) {
    ctx.strokeStyle = cedge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(top.x - a, top.y);
    ctx.lineTo(bot.x - a, bot.y);
    ctx.moveTo(top.x + a, top.y);
    ctx.lineTo(bot.x + a, bot.y);
    ctx.stroke();
  }
}

export function ribbon(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  z?: number
) {
  const dx = bx - ax,
    dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = ((-dy / len) * width) / 2,
    ny = ((dx / len) * width) / 2;
  poly(ctx, [
    project(ax + nx, ay + ny, z || 0),
    project(bx + nx, by + ny, z || 0),
    project(bx - nx, by - ny, z || 0),
    project(ax - nx, ay - ny, z || 0),
  ]);
}

export function disc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  z: number,
  r: number
) {
  const p = project(x, y, z || 0);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * TW * 1.41421, r * TH * 1.41421, 0, 0, Math.PI * 2);
  ctx.fill();
}

export const Iso = {
  TW,
  TH,
  TZ,
  project,
  unproject,
  shade,
  rgba,
  mix,
  parseHex,
  hash2,
  poly,
  polyLine,
  box,
  prism,
  orientedBox,
  gableRoof,
  cylinder,
  ribbon,
  disc,
};
