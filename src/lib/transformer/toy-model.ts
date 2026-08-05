/* toy-model.ts: a genuinely-executed miniature transformer (d_model = 12). */

export const D = 12; // model width
export const DFF = 24; // feed-forward width
export const HEADS = 2;

export interface Matrix {
  rows: number;
  cols: number;
  w: Float64Array;
}

export interface LayerWeights {
  wq: Matrix;
  wk: Matrix;
  wv: Matrix;
  wo: Matrix;
  w1: Matrix;
  w2: Matrix;
}

export interface KVCacheEntry {
  k: Float64Array;
  v: Float64Array;
}

export interface Candidate {
  token: string;
  prior: number;
  align?: number;
  logit: number;
}

export interface RankedCandidate extends Candidate {
  p: number;
  pKept?: number;
}

export interface SampleResult {
  all: RankedCandidate[];
  kept: RankedCandidate[];
  chosen: RankedCandidate;
}

export interface AttendOptions {
  sharpen?: number;
  sink?: number;
  recency?: number;
}

export interface LogitsOptions {
  blend?: number;
}

/* ---- rng --------------------------------------------------------------- */

export function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rnd: () => number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---- linear algebra ---------------------------------------------------- */

export function matrix(
  rows: number,
  cols: number,
  seed: number,
  scale?: number
): Matrix {
  const rnd = mulberry32(seed),
    m = new Float64Array(rows * cols);
  const s = scale != null ? scale : 1 / Math.sqrt(cols);
  for (let i = 0; i < m.length; i++) m[i] = gauss(rnd) * s;
  return { rows, cols, w: m };
}

export function matvec(m: Matrix, v: Float64Array): Float64Array {
  const out = new Float64Array(m.rows);
  for (let r = 0; r < m.rows; r++) {
    let s = 0,
      off = r * m.cols;
    for (let c = 0; c < m.cols; c++) s += m.w[off + c] * v[c];
    out[r] = s;
  }
  return out;
}

export function add(a: Float64Array, b: Float64Array): Float64Array {
  const o = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] + b[i];
  return o;
}

export function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: Float64Array): number {
  return Math.sqrt(dot(a, a));
}

export function layerNorm(v: Float64Array): Float64Array {
  const n = v.length;
  let mean = 0,
    i: number;
  for (i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let varr = 0;
  for (i = 0; i < n; i++) varr += (v[i] - mean) * (v[i] - mean);
  varr /= n;
  const inv = 1 / Math.sqrt(varr + 1e-5);
  const o = new Float64Array(n);
  for (i = 0; i < n; i++) o[i] = (v[i] - mean) * inv;
  return o;
}

export function gelu(v: Float64Array): Float64Array {
  const o = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    o[i] = 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
  }
  return o;
}

export function softmax(
  scores: number[] | Float64Array,
  temp?: number
): number[] {
  const t = temp || 1;
  let max = -Infinity;
  for (let i = 0; i < scores.length; i++)
    if (scores[i] > max) max = scores[i];
  const out = new Array(scores.length);
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    out[i] = Math.exp((scores[i] - max) / t);
    sum += out[i];
  }
  for (let i = 0; i < scores.length; i++) out[i] /= sum;
  return out;
}

/* ---- per-layer weights -------------------------------------------------- */

const layerCache: Record<number, LayerWeights> = Object.create(null);

export function layerWeights(l: number): LayerWeights {
  if (layerCache[l]) return layerCache[l];
  const s = 9001 + l * 7919;
  const w: LayerWeights = {
    wq: matrix(D, D, s + 1),
    wk: matrix(D, D, s + 2),
    wv: matrix(D, D, s + 3),
    wo: matrix(D, D, s + 4),
    w1: matrix(DFF, D, s + 5),
    w2: matrix(D, DFF, s + 6),
  };
  layerCache[l] = w;
  return w;
}

/* ---- tokenizer --------------------------------------------------------- */

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /(\s*)([A-Za-z]+|[0-9]+|[^\sA-Za-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lead = m[1] ? " " : "";
    const body = m[2];
    if (/^[A-Za-z]+$/.test(body) && body.length > 6) {
      const cut = Math.ceil(body.length / 2);
      out.push(lead + body.slice(0, cut));
      out.push(body.slice(cut));
    } else {
      out.push(lead + body);
    }
    if (out.length > 40) break;
  }
  return out.length ? out : ["the"];
}

export function display(tok: string): string {
  return tok.replace(/^ /, "·");
}

/* ---- embeddings -------------------------------------------------------- */

const embedCache: Record<string, Float64Array> = Object.create(null);

export function embed(token: string): Float64Array {
  const key = token.toLowerCase();
  if (embedCache[key]) return embedCache[key];
  const rnd = mulberry32(hash32(key) ^ 0x5bf03635);
  const v = new Float64Array(D);
  for (let i = 0; i < D; i++) v[i] = gauss(rnd) * 0.9;
  embedCache[key] = v;
  return v;
}

export function positional(pos: number): Float64Array {
  const v = new Float64Array(D);
  for (let i = 0; i < D; i += 2) {
    const w = 1 / Math.pow(10000, i / D);
    v[i] = Math.sin(pos * w);
    if (i + 1 < D) v[i + 1] = Math.cos(pos * w);
  }
  return v;
}

/* ---- transformer sub-layers -------------------------------------------- */

export function projectQKV(
  h: Float64Array,
  layer: number
): { q: Float64Array; k: Float64Array; v: Float64Array } {
  const w = layerWeights(layer);
  return { q: matvec(w.wq, h), k: matvec(w.wk, h), v: matvec(w.wv, h) };
}

export function attend(
  q: Float64Array,
  cache: KVCacheEntry[],
  layer: number,
  opts?: AttendOptions
): { out: Float64Array; weights: number[]; heads: number[][] } {
  const w = layerWeights(layer);
  const hd = D / HEADS;
  const n = cache.length;
  const scale = 1 / Math.sqrt(hd);
  const sharpen = (opts && opts.sharpen) || 1;
  const sink = (opts && opts.sink) || 0;
  const recency = (opts && opts.recency) || 0;

  const perHead: number[][] = [];
  const mixed = new Float64Array(D);

  for (let head = 0; head < HEADS; head++) {
    const off = head * hd;
    const scores = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < hd; j++) s += q[off + j] * cache[i].k[off + j];
      s *= scale * sharpen;
      if (i === 0) s += sink;
      s += recency * (i / Math.max(1, n - 1));
      scores[i] = s;
    }
    const wts = softmax(scores, 1);
    perHead.push(wts);
    for (let i = 0; i < n; i++) {
      const wt = wts[i];
      for (let j = 0; j < hd; j++) mixed[off + j] += wt * cache[i].v[off + j];
    }
  }

  const avg = new Array<number>(n);
  for (let t = 0; t < n; t++) {
    let a = 0;
    for (let hh = 0; hh < HEADS; hh++) a += perHead[hh][t];
    avg[t] = a / HEADS;
  }

  return { out: matvec(w.wo, mixed), weights: avg, heads: perHead };
}

export function feedForward(
  h: Float64Array,
  layer: number
): { out: Float64Array; hidden: Float64Array } {
  const w = layerWeights(layer);
  const hidden = gelu(matvec(w.w1, h));
  return { out: matvec(w.w2, hidden), hidden };
}

/* ---- bigram prior ------------------------------------------------------ */

export const CORPUS = [
  "the city never sleeps and the streets keep moving.",
  "the city of tokens is built from small pieces of text.",
  "every token travels through the same district again and again.",
  "a model reads the past and guesses the next word.",
  "the next word is only ever a guess with a number attached.",
  "attention lets a token look back at everything it has seen.",
  "the cache remembers every token that came before.",
  "a layer takes a vector and returns a better vector.",
  "the answer arrives one token at a time.",
  "meaning lives in the direction of a vector, not in the letters.",
  "the model has no memory beyond the window it can see.",
  "each block mixes information across the sentence and then thinks alone.",
  "a warm model wanders and a cold model repeats itself.",
  "the same weights run again for every single word.",
  "language is a long road and the model walks it step by step.",
  "we build a city so that a hidden state has somewhere to go.",
  "the traffic in the city is nothing but numbers moving between buildings.",
  "a prompt enters the docks and leaves as a stream of text.",
  "small models say small things but they say them quickly.",
  "the machine does not know the answer, it knows what usually comes next.",
  "and then the lights came on across the whole grid.",
  "people ask a question and wait for the words to appear.",
  "a good guess today is a better guess tomorrow.",
  "the road bends back to the beginning and the work starts over.",
].join(" ");

interface BigramModel {
  next: Record<string, Record<string, number>>;
  uni: Record<string, number>;
  total: number;
  vocab: string[];
}

let bigram: BigramModel | null = null;

function buildBigram() {
  const words = CORPUS.toLowerCase().match(/[a-z']+|[.,?!]/g) || [];
  const next: Record<string, Record<string, number>> = Object.create(null);
  const uni: Record<string, number> = Object.create(null);
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    uni[w] = (uni[w] || 0) + 1;
    total++;
    if (i + 1 < words.length) {
      const n = words[i + 1];
      if (!next[w]) next[w] = Object.create(null);
      next[w][n] = (next[w][n] || 0) + 1;
    }
  }
  bigram = { next, uni, total, vocab: Object.keys(uni) };
}

function cleanWord(tok: string): string {
  return tok.trim().toLowerCase();
}

/* ---- output head ------------------------------------------------------- */

export function logits(
  h: Float64Array,
  lastToken: string,
  opts?: LogitsOptions
): Candidate[] {
  if (!bigram) buildBigram();
  const b = bigram!;
  const w = cleanWord(lastToken);
  const counts = b.next[w];
  const blend = opts && opts.blend != null ? opts.blend : 0.85;

  const cands: Candidate[] = [];
  const hn = norm(h) || 1;
  let pool: string[], i: number;

  if (counts) {
    pool = Object.keys(counts);
    let tot = 0;
    for (i = 0; i < pool.length; i++) tot += counts[pool[i]];
    const extras: string[] = [];
    for (i = 0; i < 8; i++) {
      const v = b.vocab[hash32(w + i) % b.vocab.length];
      if (pool.indexOf(v) < 0) extras.push(v);
    }
    for (i = 0; i < pool.length; i++) {
      cands.push({
        token: pool[i],
        prior: Math.log((counts[pool[i]] + 0.1) / (tot + 1)),
        logit: 0,
      });
    }
    for (i = 0; i < extras.length; i++) {
      cands.push({
        token: extras[i],
        prior: Math.log(0.05 / (tot + 1)),
        logit: 0,
      });
    }
  } else {
    pool = b.vocab.slice();
    for (i = 0; i < pool.length; i++) {
      cands.push({
        token: pool[i],
        prior: Math.log((b.uni[pool[i]] + 0.1) / b.total),
        logit: 0,
      });
    }
  }

  for (i = 0; i < cands.length; i++) {
    const e = embed(" " + cands[i].token);
    const align = dot(h, e) / (hn * (norm(e) || 1));
    cands[i].align = align;
    cands[i].logit = blend * cands[i].prior * 1.0 + (1 - blend) * align * 6;
  }

  cands.sort((a, b) => b.logit - a.logit);
  return cands.slice(0, 24);
}

export function sample(
  cands: Candidate[],
  temperature: number,
  topP: number,
  rnd?: () => number
): SampleResult {
  const scores = cands.map((c) => c.logit);
  const probs = softmax(scores, Math.max(0.05, temperature));

  const ranked: RankedCandidate[] = cands.map((c, idx) => ({
    token: c.token,
    prior: c.prior,
    p: probs[idx],
    logit: c.logit,
    align: c.align,
  }));

  let cum = 0;
  const keep: RankedCandidate[] = [];
  for (let i = 0; i < ranked.length; i++) {
    keep.push(ranked[i]);
    cum += ranked[i].p;
    if (cum >= topP) break;
  }

  let mass = 0;
  for (let i = 0; i < keep.length; i++) mass += keep[i].p;
  for (let i = 0; i < keep.length; i++) keep[i].pKept = keep[i].p / mass;

  const r = (rnd || Math.random)();
  let acc = 0;
  let chosen = keep[keep.length - 1];
  for (let i = 0; i < keep.length; i++) {
    acc += keep[i].pKept!;
    if (r <= acc) {
      chosen = keep[i];
      break;
    }
  }

  return { all: ranked, kept: keep, chosen };
}

export const ToyModel = {
  D,
  DFF,
  HEADS,
  tokenize,
  display,
  embed,
  positional,
  layerNorm,
  gelu,
  softmax,
  add,
  dot,
  norm,
  matvec,
  projectQKV,
  attend,
  feedForward,
  logits,
  sample,
  hash32,
  mulberry32,
};
