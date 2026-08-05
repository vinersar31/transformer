/* sim.ts: the state machine that drives one token through the city. */
import {
  ToyModel as M,
  KVCacheEntry,
  Candidate,
  RankedCandidate,
} from "./toy-model";
import { City, Station, Route } from "./city";
import { Point3D } from "./iso";

const BASE_SPEED = 6; // grid units / second at 1x

export interface TokenItem {
  text: string;
  kind: "prompt" | "gen";
}

export interface SimState {
  running: boolean;
  paused: boolean;
  finished: boolean;
  mode: "prefill" | "decode";
  stage: string | null;
  stageT: number;
  layer: number;
  layers: number;
  temperature: number;
  topP: number;
  speed: number;
  maxNew: number;
  stepMode: boolean;

  tokens: TokenItem[];
  focusIdx: number;
  cacheSize: number;
  outputText: string;

  h: Float64Array | null;
  hLabel: string;
  attn: number[] | null;
  attnHeads: number[][] | null;
  attnActive: number;
  candidates: Candidate[] | null;
  kept: RankedCandidate[] | null;
  chosen: RankedCandidate | null;
  lastEmitted: string | null;
  emitFlash: number;
  siloPop: number;
  fastForward: boolean;
  tourDone: boolean;
  reading: boolean;
  dwellLeft: number;
  dwellTotal: number;
  tripCount: number;
}

export interface Convoy {
  routeName: string;
  dist: number;
  dwell: number;
  stationIdx: number;
  cars: number[];
}

export interface CarPosition extends Point3D {
  idx: number;
  dx: number;
  dy: number;
  lead: boolean;
}

const tour = { seen: Object.create(null) as Record<string, boolean>, done: false };

export const state: SimState = {
  running: false,
  paused: true,
  finished: false,
  mode: "prefill",
  stage: null,
  stageT: 0,
  layer: 0,
  layers: 6,
  temperature: 0.8,
  topP: 0.9,
  speed: 1,
  maxNew: 8,
  stepMode: false,

  tokens: [],
  focusIdx: 0,
  cacheSize: 0,
  outputText: "",

  h: null,
  hLabel: "residual stream",
  attn: null,
  attnHeads: null,
  attnActive: 0,
  candidates: null,
  kept: null,
  chosen: null,
  lastEmitted: null,
  emitFlash: 0,
  siloPop: 0,
  fastForward: false,
  tourDone: false,
  reading: false,
  dwellLeft: 0,
  dwellTotal: 0,
  tripCount: 0,
};

export const convoy: Convoy = {
  routeName: "intake",
  dist: 0,
  dwell: 0,
  stationIdx: 0,
  cars: [],
};

let kv: Record<number, KVCacheEntry[]> = [];
let vecs: Record<number, Float64Array> = {};
let normed: Record<number, Float64Array> = {};
let sub: { attn?: Record<number, Float64Array>; ffn?: Record<number, Float64Array> } = {};

type Listener = (name: string, payload?: unknown) => void;
const listeners: Listener[] = [];

function emit(name: string, payload?: unknown) {
  for (let i = 0; i < listeners.length; i++) listeners[i](name, payload);
}

export function setPrompt(text: string) {
  const toks = M.tokenize(text);
  state.tokens = toks.map((t) => ({ text: t, kind: "prompt" }));
  reset();
  state.running = true;
  state.paused = false;
  emit("reset");
}

export function reset() {
  kv = [];
  vecs = {};
  normed = {};
  sub = {};
  state.tokens = state.tokens.filter((t) => t.kind === "prompt");
  state.mode = "prefill";
  state.layer = 0;
  state.cacheSize = 0;
  state.outputText = "";
  state.finished = false;
  state.stage = null;
  state.h = null;
  state.attn = null;
  state.candidates = null;
  state.chosen = null;
  state.lastEmitted = null;
  state.tripCount = 0;
  state.fastForward = false;
  state.tourDone = tour.done;
  state.reading = false;
  state.dwellLeft = 0;
  state.dwellTotal = 0;
  state.focusIdx = Math.max(0, state.tokens.length - 1);
  convoy.routeName = "intake";
  convoy.dist = 0;
  convoy.dwell = 0;
  convoy.stationIdx = 0;
  convoy.cars = state.tokens.map((_, i) => i);
}

function beginDecodeTrip(tokenIdx: number) {
  state.mode = "decode";
  state.layer = 0;
  vecs = {};
  normed = {};
  sub = {};
  convoy.routeName = "intake";
  convoy.dist = City.routes.intake.cum[1] - 0.01;
  convoy.stationIdx = 0;
  convoy.dwell = 0;
  convoy.cars = [tokenIdx];
  state.focusIdx = tokenIdx;
  const st = City.stations.intake;
  while (
    convoy.stationIdx < st.length &&
    st[convoy.stationIdx].dist < convoy.dist
  )
    convoy.stationIdx++;
}

function cars(): number[] {
  return convoy.cars;
}
function focus(): number {
  return convoy.cars[convoy.cars.length - 1];
}

const OPS: Record<string, () => void> = {
  tokenize: () => {
    state.hLabel = "token IDs";
  },

  embed: () => {
    cars().forEach((i) => {
      vecs[i] = M.embed(state.tokens[i].text);
    });
    state.hLabel = "embedding";
    state.h = vecs[focus()];
  },

  position: () => {
    cars().forEach((i) => {
      vecs[i] = M.add(vecs[i], M.positional(i));
    });
    state.hLabel = "embedding + position";
    state.h = vecs[focus()];
  },

  norm1: () => {
    cars().forEach((i) => {
      normed[i] = M.layerNorm(vecs[i]);
    });
    state.hLabel = "normalised (pre-attention)";
    state.h = normed[focus()];
  },

  attn: () => {
    const L = state.layer;
    if (!kv[L]) kv[L] = [];
    const opts = { sharpen: 2.2, sink: 0.9, recency: 1.1 };
    const list = cars();
    sub.attn = {};
    for (let n = 0; n < list.length; n++) {
      const i = list[n];
      const qkv = M.projectQKV(normed[i], L);
      kv[L][i] = { k: qkv.k, v: qkv.v };
      const upto = kv[L].slice(0, i + 1);
      const r = M.attend(qkv.q, upto, L, opts);
      sub.attn[i] = r.out;
      if (i === focus()) {
        state.attn = r.weights;
        state.attnHeads = r.heads;
      }
    }
    state.cacheSize = kv[0] ? kv[0].length : 0;
    state.attnActive = 1;
    state.siloPop = 1;
    state.hLabel = "attention output";
    state.h = sub.attn[focus()];
  },

  res1: () => {
    cars().forEach((i) => {
      vecs[i] = M.add(vecs[i], sub.attn![i]);
    });
    state.hLabel = "residual stream";
    state.h = vecs[focus()];
  },

  norm2: () => {
    cars().forEach((i) => {
      normed[i] = M.layerNorm(vecs[i]);
    });
    state.hLabel = "normalised (pre-FFN)";
    state.h = normed[focus()];
  },

  ffn: () => {
    sub.ffn = {};
    cars().forEach((i) => {
      sub.ffn![i] = M.feedForward(normed[i], state.layer).out;
    });
    state.hLabel = "feed-forward output";
    state.h = sub.ffn[focus()];
  },

  res2: () => {
    cars().forEach((i) => {
      vecs[i] = M.add(vecs[i], sub.ffn![i]);
    });
    state.hLabel = "residual stream";
    state.h = vecs[focus()];
  },

  layer: () => {
    state.layer++;
    state.fastForward = state.layer >= 1 && state.layers > 3;
    if (state.layer >= state.layers) {
      convoy.routeName = "exit";
      convoy.dist = 0;
      convoy.stationIdx = 0;
      convoy.dwell = 0.35;
      state.fastForward = false;
    }
  },

  finalnorm: () => {
    const f = focus();
    vecs[f] = M.layerNorm(vecs[f]);
    state.h = vecs[f];
    state.hLabel = "final hidden state";
  },

  logits: () => {
    const cands = M.logits(vecs[focus()], state.tokens[focus()].text);
    const probs = M.softmax(
      cands.map((c) => c.logit),
      1
    );
    cands.forEach((c, i) => {
      (c as RankedCandidate).p = probs[i];
    });
    state.candidates = cands;
    state.kept = null;
    state.chosen = null;
  },

  sample: () => {
    const r = M.sample(
      state.candidates!,
      state.temperature,
      state.topP,
      Math.random
    );
    state.kept = r.kept;
    state.candidates = r.all;
    state.chosen = r.chosen;
  },

  emit: () => {
    if (!state.chosen) return;
    let text = " " + state.chosen.token;
    if (/^[.,?!]$/.test(state.chosen.token)) text = state.chosen.token;
    state.tokens.push({ text, kind: "gen" });
    state.outputText += text;
    state.lastEmitted = state.chosen.token;
    state.emitFlash = 1;
    state.tripCount++;
    tour.done = true;
    state.tourDone = true;
  },

  feedback: () => {},
};

function routeOf(name: string): Route {
  return (City.routes as Record<string, Route>)[name];
}

function travelBoost() {
  return (state.fastForward ? 3.2 : 1) * (state.tourDone ? 3.0 : 1);
}
function dwellBoost() {
  return (state.fastForward ? 3.2 : 1) * (state.tourDone ? 1.4 : 1);
}

function fire(st: Station) {
  state.stage = st.id;
  state.stageT = 0;
  const op = OPS[st.id];
  if (op) op();
  emit("stage", st.id);
}

function advanceRoute() {
  if (convoy.routeName === "intake") {
    convoy.routeName = "loop";
    convoy.dist = 0;
    convoy.stationIdx = 0;
    state.layer = 0;
  } else if (convoy.routeName === "loop") {
    convoy.dist = 0;
    convoy.stationIdx = 0;
  } else if (convoy.routeName === "exit") {
    convoy.routeName = "feedback";
    convoy.dist = 0;
    convoy.stationIdx = 0;
  } else if (convoy.routeName === "feedback") {
    if (state.tripCount >= state.maxNew) {
      state.finished = true;
      state.paused = true;
      state.stage = "done";
      emit("stage", "done");
      return;
    }
    beginDecodeTrip(state.tokens.length - 1);
  }
}

export function update(dt: number) {
  state.stageT += dt;
  state.attnActive = Math.max(0, state.attnActive - dt * 0.55);
  state.emitFlash = Math.max(0, state.emitFlash - dt * 1.2);
  state.siloPop = Math.max(0, state.siloPop - dt * 1.1);

  if (!state.running || state.paused || state.finished) return;

  const sdt = dt * state.speed * travelBoost();

  if (convoy.dwell > 0) {
    convoy.dwell -= dt * state.speed;
    state.dwellLeft = Math.max(0, convoy.dwell);
    if (convoy.dwell <= 0) {
      state.reading = false;
      state.dwellTotal = 0;
    }
    return;
  }

  const route = routeOf(convoy.routeName);
  convoy.dist += BASE_SPEED * sdt;

  const sts = City.stations[convoy.routeName];
  if (convoy.stationIdx < sts.length) {
    const st = sts[convoy.stationIdx];
    if (convoy.dist >= st.dist) {
      convoy.dist = st.dist;
      convoy.stationIdx++;
      const topic = City.stageToDistrict[st.id] || st.id;
      const firstTime = !tour.seen[topic];
      fire(st);
      tour.seen[topic] = true;
      convoy.dwell = firstTime ? st.read || 12 : st.dwell / dwellBoost();
      state.reading = firstTime;
      state.dwellTotal = convoy.dwell;
      state.dwellLeft = convoy.dwell;
      if (state.stepMode) {
        state.paused = true;
        state.stepMode = false;
      }
      return;
    }
  }

  if (convoy.dist >= route.total) advanceRoute();
}

function smoothAt(route: Route, d: number, look: number) {
  const a = route.at(Math.max(0, d - look));
  const m = route.at(d);
  const b = route.at(Math.min(route.total, d + look));
  const hx = b.x - a.x,
    hy = b.y - a.y;
  const len = Math.hypot(hx, hy) || 1;
  return {
    x: (a.x + 2 * m.x + b.x) / 4,
    y: (a.y + 2 * m.y + b.y) / 4,
    z: ((a.z || 0) + 2 * (m.z || 0) + (b.z || 0)) / 4,
    dx: hx / len,
    dy: hy / len,
  };
}

export function carPositions(): CarPosition[] {
  const route = routeOf(convoy.routeName);
  const out: CarPosition[] = [];
  const n = convoy.cars.length;
  const spacing = n > 8 ? 0.85 : 1.25;
  for (let i = 0; i < n; i++) {
    const back = (n - 1 - i) * spacing;
    const d = Math.max(0, convoy.dist - back);
    const p = smoothAt(route, d, 0.8);
    out.push({
      idx: convoy.cars[i],
      x: p.x,
      y: p.y,
      z: p.z,
      dx: p.dx,
      dy: p.dy,
      lead: i === n - 1,
    });
  }
  return out;
}

export function leadPosition() {
  return smoothAt(routeOf(convoy.routeName), convoy.dist, 0.8);
}

export const Sim = {
  state,
  convoy,
  setPrompt,
  reset: () => {
    reset();
    emit("reset");
  },
  replayTour: () => {
    tour.seen = Object.create(null);
    tour.done = false;
  },
  update,
  carPositions,
  leadPosition,
  on: (fn: Listener) => {
    listeners.push(fn);
  },
  play: () => {
    if (!state.finished) {
      state.paused = false;
      state.running = true;
    }
  },
  pause: () => {
    state.paused = true;
  },
  toggle: function () {
    if (state.paused) this.play();
    else this.pause();
  },
  step: () => {
    if (state.finished) return;
    state.running = true;
    state.stepMode = true;
    state.paused = false;
    if (convoy.dwell > 0) convoy.dwell = 0;
  },
};
