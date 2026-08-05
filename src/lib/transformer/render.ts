/* render.ts: draws the city on canvas 2D. */
import { Iso, P, Point2D, Point3D } from "./iso";
import { City, District, Building, Prop } from "./city";
import { Sim, carPositions, leadPosition, CarPosition } from "./sim";
import { ToyModel as M, RankedCandidate } from "./toy-model";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  follow: boolean;
  targetX?: number;
  targetY?: number;
}

export interface LabelInfo {
  text: string;
  sub: string;
  color: string;
  sx: number;
  sy: number;
  id: string;
}

let t = 0;
let labels: LabelInfo[] = [];

export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#4f93c2");
  g.addColorStop(1, "#3b7aa8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function plate(inset: number, z?: number): Point2D[] {
  const W = City.GW,
    H = City.GH;
  return [
    Iso.project(-inset, -inset, z || 0),
    Iso.project(W + inset, -inset, z || 0),
    Iso.project(W + inset, H + inset, z || 0),
    Iso.project(-inset, H + inset, z || 0),
  ];
}

const GRASS = ["#6f9c46", "#78a44e", "#67943f", "#7fa955"];

function drawGround(ctx: CanvasRenderingContext2D) {
  const W = City.GW,
    H = City.GH;

  ctx.fillStyle = "#6fb6d6";
  Iso.poly(ctx, plate(4.5));
  ctx.fillStyle = "#8ecbe0";
  Iso.poly(ctx, plate(2.6));
  ctx.fillStyle = "#e4d6a8";
  Iso.poly(ctx, plate(1.1));

  ctx.fillStyle = GRASS[0];
  Iso.poly(ctx, plate(0));
  for (let x = 0; x < W; x += 2) {
    for (let y = 0; y < H; y += 2) {
      const n = Iso.hash2(x, y, 17);
      if (n < 0.45) continue;
      ctx.fillStyle = GRASS[1 + (Math.floor(n * 2.99) % 3)];
      Iso.poly(ctx, [
        Iso.project(x, y, 0),
        Iso.project(x + 2, y, 0),
        Iso.project(x + 2, y + 2, 0),
        Iso.project(x, y + 2, 0),
      ]);
    }
  }

  ctx.strokeStyle = "rgba(40,70,30,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const a = Iso.project(x, 0, 0),
      b = Iso.project(x, H, 0);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = 0; y <= H; y += 2) {
    const c = Iso.project(0, y, 0),
      d = Iso.project(W, y, 0);
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(60,90,40,0.35)";
  ctx.lineWidth = 1.5;
  Iso.polyLine(ctx, plate(0), true);
}

function drawZones(ctx: CanvasRenderingContext2D, activeId: string | null) {
  for (let i = 0; i < City.districts.length; i++) {
    const d = City.districts[i];
    const active = d.id === activeId;
    ctx.fillStyle = Iso.rgba(d.color, active ? 0.16 : 0.07);
    Iso.disc(ctx, d.x, d.y, 0.02, d.r);
    ctx.strokeStyle = Iso.rgba(d.color, active ? 0.8 : 0.34);
    ctx.lineWidth = active ? 2.2 : 1.2;
    ctx.setLineDash(active ? [] : [6, 7]);
    const p = Iso.project(d.x, d.y, 0.02);
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      d.r * Iso.TW * 1.414,
      d.r * Iso.TH * 1.414,
      0,
      0,
      6.2832
    );
    ctx.stroke();
    ctx.setLineDash([]);
    if (active) {
      const pulse = (t * 0.6) % 1;
      ctx.strokeStyle = Iso.rgba(d.color, 0.4 * (1 - pulse));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(
        p.x,
        p.y,
        d.r * Iso.TW * 1.414 * (1 + pulse * 0.35),
        d.r * Iso.TH * 1.414 * (1 + pulse * 0.35),
        0,
        0,
        6.2832
      );
      ctx.stroke();
    }
  }
}

function drawRoads(ctx: CanvasRenderingContext2D) {
  const routes = City.routes;
  ctx.fillStyle = City.palette.road;
  const drawRoute = (r: typeof City.routes.intake, w: number, z: number = 0) => {
    for (let i = 0; i < r.segs.length; i++) {
      const s = r.segs[i];
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, w, z);
    }
  };

  drawRoute(routes.intake, 1.4);
  drawRoute(routes.loop, 1.4);
  drawRoute(routes.exit, 1.4);
  drawRoute(routes.feedback, 1.0, 0);

  ctx.fillStyle = City.palette.roadTop;
  drawRoute(routes.intake, 1.0);
  drawRoute(routes.loop, 1.0);
  drawRoute(routes.exit, 1.0);
}

function drawTruck(
  ctx: CanvasRenderingContext2D,
  car: CarPosition,
  tokText: string,
  hVec: Float64Array | null,
  isFocus: boolean
) {
  const p = Iso.project(car.x, car.y, car.z || 0);

  Iso.orientedBox(ctx, {
    x: car.x,
    y: car.y,
    z: car.z || 0,
    hx: car.dx,
    hy: car.dy,
    len: 1.1,
    wid: 0.65,
    h: 0.45,
    color: isFocus ? "#e86e40" : "#3b7aa8",
  });

  if (hVec && isFocus) {
    drawVectorBarsOnTruck(ctx, car, hVec);
  }

  if (tokText) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(M.display(tokText), p.x, p.y - 12);
  }
}

function drawVectorBarsOnTruck(
  ctx: CanvasRenderingContext2D,
  car: CarPosition,
  v: Float64Array
) {
  const p = Iso.project(car.x, car.y, (car.z || 0) + 0.5);
  const n = Math.min(12, v.length);
  const bw = 3;
  const totalW = n * bw;
  let startX = p.x - totalW / 2;

  for (let i = 0; i < n; i++) {
    const val = v[i];
    const h = Math.min(16, Math.max(2, Math.abs(val) * 8));
    ctx.fillStyle = val < 0 ? "#4a7a9b" : "#e86e40";
    ctx.fillRect(startX + i * bw, p.y - h, bw - 1, h);
  }
}

function drawKVCacheSilos(ctx: CanvasRenderingContext2D) {
  const count = Sim.state.cacheSize;
  for (let i = 0; i < count; i++) {
    const pos = City.siloPos(i);
    Iso.cylinder(ctx, {
      x: pos.x,
      y: pos.y,
      z: 0,
      r: 0.45,
      h: 0.9,
      color: City.palette.sage,
    });
  }
}

function drawAttentionBeams(ctx: CanvasRenderingContext2D) {
  if (!Sim.state.attn || Sim.state.attnActive <= 0) return;
  const lead = leadPosition();
  const leadP = Iso.project(lead.x, lead.y, 0.5);
  const weights = Sim.state.attn;

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w < 0.03) continue;
    const pos = City.siloPos(i);
    const siloP = Iso.project(pos.x, pos.y, 0.9);

    ctx.strokeStyle = Iso.rgba(City.palette.rose, w * Sim.state.attnActive);
    ctx.lineWidth = Math.max(1, w * 4.5);
    ctx.beginPath();
    ctx.moveTo(leadP.x, leadP.y);
    const ctrlX = (leadP.x + siloP.x) / 2;
    const ctrlY = Math.min(leadP.y, siloP.y) - 40 * w;
    ctx.quadraticCurveTo(ctrlX, ctrlY, siloP.x, siloP.y);
    ctx.stroke();
  }
}

function drawStadiumTowers(ctx: CanvasRenderingContext2D) {
  if (!Sim.state.candidates) return;
  const cands = Sim.state.candidates.slice(0, 10);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i] as RankedCandidate;
    const pos = City.towerPos(i);
    const h = Math.max(0.3, (c.p || 0.05) * 6);
    Iso.box(ctx, {
      x: pos.x - 0.4,
      y: pos.y - 0.4,
      z: 0,
      w: 0.8,
      d: 0.8,
      h: h,
      color: City.palette.moss,
    });

    const p = Iso.project(pos.x, pos.y, h + 0.2);
    ctx.fillStyle = "#2c2924";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(c.token, p.x, p.y);
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera,
  showLabels: boolean,
  dt: number
) {
  t += dt;
  labels = [];

  ctx.clearRect(0, 0, width, height);
  drawSky(ctx, width, height);

  ctx.save();
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  drawGround(ctx);
  drawZones(ctx, Sim.state.stage);
  drawRoads(ctx);

  City.build();

  for (let i = 0; i < City.buildings.length; i++) {
    const b = City.buildings[i] as Building;
    if (b.kind === "box" || b.filler) {
      Iso.box(ctx, {
        x: b.x,
        y: b.y,
        z: b.z || 0,
        w: b.w || 1,
        d: b.d || 1,
        h: b.h || 1,
        color: b.color || "#c9c4b6",
        windows: b.windows || undefined,
      });
    } else if (b.kind === "crane") {
      Iso.box(ctx, {
        x: b.x - 1.5,
        y: b.y - 0.3,
        z: 0,
        w: 3,
        d: 0.6,
        h: 2.2,
        color: b.color || City.palette.steel,
      });
    } else if (b.kind === "beacon") {
      Iso.cylinder(ctx, {
        x: b.x,
        y: b.y,
        z: 0,
        r: 1.2,
        h: 5.5,
        color: b.color || City.palette.ochre,
        ring: 0.8,
      });
    } else if (b.kind === "stadium") {
      Iso.cylinder(ctx, {
        x: b.x,
        y: b.y,
        z: 0,
        r: 3.5,
        h: 1.2,
        color: b.color || City.palette.moss,
      });
    } else if (b.kind === "sampler") {
      Iso.cylinder(ctx, {
        x: b.x,
        y: b.y,
        z: 0,
        r: 2.2,
        h: 2.8,
        color: b.color || City.palette.plum,
      });
    }
  }

  drawKVCacheSilos(ctx);
  drawAttentionBeams(ctx);
  drawStadiumTowers(ctx);

  const cars = carPositions();
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const tok = Sim.state.tokens[car.idx];
    drawTruck(
      ctx,
      car,
      tok ? tok.text : "",
      Sim.state.h,
      car.idx === Sim.state.focusIdx
    );
  }

  if (showLabels) {
    for (let i = 0; i < City.districts.length; i++) {
      const d = City.districts[i];
      const p = Iso.project(d.x, d.y, 1.2);
      const sx = width / 2 + camera.x + p.x * camera.zoom;
      const sy = height / 2 + camera.y + p.y * camera.zoom;
      labels.push({
        text: d.name,
        sub: d.tag,
        color: d.color,
        sx,
        sy,
        id: d.id,
      });
    }
  }

  ctx.restore();
  return labels;
}
