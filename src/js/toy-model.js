/* toy-model.js: a genuinely-executed miniature transformer (d_model = 12).
 *
 * Everything you see moving through the city is computed here: the tokenizer,
 * the embeddings, the sinusoidal positions, real scaled-dot-product attention
 * over a real KV cache, LayerNorm, a GELU feed-forward, and residual adds.
 *
 * The weights are random (nothing is trained), so the *shapes* are honest but
 * the *meanings* are not. To keep the emitted text readable we blend the
 * hidden-state logits with a bigram prior built from the corpus below. That
 * blend is the one deliberate cheat, and the About panel says so.
 */
(function (global) {
  'use strict';

  var D = 12;        // model width
  var DFF = 24;      // feed-forward width
  var HEADS = 2;

  /* ---- rng --------------------------------------------------------------- */

  function hash32(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rnd) {
    var u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---- linear algebra ---------------------------------------------------- */

  function matrix(rows, cols, seed, scale) {
    var rnd = mulberry32(seed), m = new Float64Array(rows * cols);
    var s = scale != null ? scale : 1 / Math.sqrt(cols);
    for (var i = 0; i < m.length; i++) m[i] = gauss(rnd) * s;
    return { rows: rows, cols: cols, w: m };
  }

  function matvec(m, v) {
    var out = new Float64Array(m.rows);
    for (var r = 0; r < m.rows; r++) {
      var s = 0, off = r * m.cols;
      for (var c = 0; c < m.cols; c++) s += m.w[off + c] * v[c];
      out[r] = s;
    }
    return out;
  }

  function add(a, b) {
    var o = new Float64Array(a.length);
    for (var i = 0; i < a.length; i++) o[i] = a[i] + b[i];
    return o;
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) { return Math.sqrt(dot(a, a)); }

  function layerNorm(v) {
    var n = v.length, mean = 0, i;
    for (i = 0; i < n; i++) mean += v[i];
    mean /= n;
    var varr = 0;
    for (i = 0; i < n; i++) varr += (v[i] - mean) * (v[i] - mean);
    varr /= n;
    var inv = 1 / Math.sqrt(varr + 1e-5);
    var o = new Float64Array(n);
    for (i = 0; i < n; i++) o[i] = (v[i] - mean) * inv;
    return o;
  }

  function gelu(v) {
    var o = new Float64Array(v.length);
    for (var i = 0; i < v.length; i++) {
      var x = v[i];
      o[i] = 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
    }
    return o;
  }

  function softmax(scores, temp) {
    var t = temp || 1, i, max = -Infinity;
    for (i = 0; i < scores.length; i++) if (scores[i] > max) max = scores[i];
    var out = new Array(scores.length), sum = 0;
    for (i = 0; i < scores.length; i++) {
      out[i] = Math.exp((scores[i] - max) / t);
      sum += out[i];
    }
    for (i = 0; i < scores.length; i++) out[i] /= sum;
    return out;
  }

  /* ---- per-layer weights (stable, lazily built) -------------------------- */

  var layerCache = Object.create(null);

  function layerWeights(l) {
    if (layerCache[l]) return layerCache[l];
    var s = 9001 + l * 7919;
    var w = {
      wq: matrix(D, D, s + 1),
      wk: matrix(D, D, s + 2),
      wv: matrix(D, D, s + 3),
      wo: matrix(D, D, s + 4),
      w1: matrix(DFF, D, s + 5),
      w2: matrix(D, DFF, s + 6)
    };
    layerCache[l] = w;
    return w;
  }

  /* ---- tokenizer --------------------------------------------------------- */

  /* A word/sub-word splitter in the spirit of BPE: whitespace is glued to the
     front of a token, long words break into chunks, punctuation stands alone. */
  function tokenize(text) {
    var out = [];
    var re = /(\s*)([A-Za-z]+|[0-9]+|[^\sA-Za-z0-9])/g, m;
    while ((m = re.exec(text)) !== null) {
      var lead = m[1] ? ' ' : '';
      var body = m[2];
      if (/^[A-Za-z]+$/.test(body) && body.length > 6) {
        var cut = Math.ceil(body.length / 2);
        out.push(lead + body.slice(0, cut));
        out.push(body.slice(cut));
      } else {
        out.push(lead + body);
      }
      if (out.length > 40) break;
    }
    return out.length ? out : ['the'];
  }

  function display(tok) {
    return tok.replace(/^ /, '·');
  }

  /* ---- embeddings -------------------------------------------------------- */

  var embedCache = Object.create(null);

  function embed(token) {
    var key = token.toLowerCase();
    if (embedCache[key]) return embedCache[key];
    var rnd = mulberry32(hash32(key) ^ 0x5bf03635);
    var v = new Float64Array(D);
    for (var i = 0; i < D; i++) v[i] = gauss(rnd) * 0.9;
    embedCache[key] = v;
    return v;
  }

  /* Textbook sinusoidal positional encoding. */
  function positional(pos) {
    var v = new Float64Array(D);
    for (var i = 0; i < D; i += 2) {
      var w = 1 / Math.pow(10000, i / D);
      v[i] = Math.sin(pos * w);
      if (i + 1 < D) v[i + 1] = Math.cos(pos * w);
    }
    return v;
  }

  /* ---- transformer sub-layers -------------------------------------------- */

  function project_qkv(h, layer) {
    var w = layerWeights(layer);
    return { q: matvec(w.wq, h), k: matvec(w.wk, h), v: matvec(w.wv, h) };
  }

  /* Multi-head causal attention of one query against the whole cache.
     `sharpen` and `sink` are presentation knobs; see About panel. */
  function attend(q, cache, layer, opts) {
    var w = layerWeights(layer);
    var hd = D / HEADS;
    var n = cache.length;
    var scale = 1 / Math.sqrt(hd);
    var sharpen = (opts && opts.sharpen) || 1;
    var sink = (opts && opts.sink) || 0;
    var recency = (opts && opts.recency) || 0;

    var perHead = [];
    var mixed = new Float64Array(D);

    for (var head = 0; head < HEADS; head++) {
      var off = head * hd;
      var scores = new Array(n);
      for (var i = 0; i < n; i++) {
        var s = 0;
        for (var j = 0; j < hd; j++) s += q[off + j] * cache[i].k[off + j];
        s *= scale * sharpen;
        if (i === 0) s += sink;                       // attention-sink bias
        s += recency * (i / Math.max(1, n - 1));      // mild recency bias
        scores[i] = s;
      }
      var wts = softmax(scores, 1);
      perHead.push(wts);
      for (i = 0; i < n; i++) {
        var wt = wts[i];
        for (j = 0; j < hd; j++) mixed[off + j] += wt * cache[i].v[off + j];
      }
    }

    /* averaged view across heads, for the beams drawn over the city */
    var avg = new Array(n);
    for (var t = 0; t < n; t++) {
      var a = 0;
      for (var hh = 0; hh < HEADS; hh++) a += perHead[hh][t];
      avg[t] = a / HEADS;
    }

    return { out: matvec(w.wo, mixed), weights: avg, heads: perHead };
  }

  function feedForward(h, layer) {
    var w = layerWeights(layer);
    var hidden = gelu(matvec(w.w1, h));
    return { out: matvec(w.w2, hidden), hidden: hidden };
  }

  /* ---- bigram prior ------------------------------------------------------ */

  var CORPUS = [
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
    "the road bends back to the beginning and the work starts over."
  ].join(' ');

  var bigram = null;

  function buildBigram() {
    var words = CORPUS.toLowerCase().match(/[a-z']+|[.,?!]/g) || [];
    var next = Object.create(null), uni = Object.create(null), total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      uni[w] = (uni[w] || 0) + 1; total++;
      if (i + 1 < words.length) {
        var n = words[i + 1];
        if (!next[w]) next[w] = Object.create(null);
        next[w][n] = (next[w][n] || 0) + 1;
      }
    }
    bigram = { next: next, uni: uni, total: total, vocab: Object.keys(uni) };
  }

  function cleanWord(tok) {
    return tok.trim().toLowerCase();
  }

  /* ---- output head ------------------------------------------------------- */

  /* logits = (unembedding · h) blended with log p_bigram(next | last).
     The first term is real; the second is the legibility crutch. */
  function logits(h, lastToken, opts) {
    if (!bigram) buildBigram();
    var w = cleanWord(lastToken);
    var counts = bigram.next[w];
    var blend = opts && opts.blend != null ? opts.blend : 0.85;

    var cands = [];
    var hn = norm(h) || 1;
    var pool, i;

    if (counts) {
      pool = Object.keys(counts);
      var tot = 0;
      for (i = 0; i < pool.length; i++) tot += counts[pool[i]];
      /* widen the pool a little so temperature has something to chew on */
      var extras = bigram.vocab.slice(0, 0);
      for (i = 0; i < 8; i++) {
        var v = bigram.vocab[(hash32(w + i) % bigram.vocab.length)];
        if (pool.indexOf(v) < 0) extras.push(v);
      }
      for (i = 0; i < pool.length; i++) {
        cands.push({ token: pool[i], prior: Math.log((counts[pool[i]] + 0.1) / (tot + 1)) });
      }
      for (i = 0; i < extras.length; i++) {
        cands.push({ token: extras[i], prior: Math.log(0.05 / (tot + 1)) });
      }
    } else {
      pool = bigram.vocab.slice();
      for (i = 0; i < pool.length; i++) {
        cands.push({ token: pool[i], prior: Math.log((bigram.uni[pool[i]] + 0.1) / bigram.total) });
      }
    }

    for (i = 0; i < cands.length; i++) {
      var e = embed(' ' + cands[i].token);
      var align = dot(h, e) / (hn * (norm(e) || 1));   // cosine with the unembedding row
      cands[i].align = align;
      cands[i].logit = blend * cands[i].prior * 1.0 + (1 - blend) * align * 6;
    }

    cands.sort(function (a, b) { return b.logit - a.logit; });
    return cands.slice(0, 24);
  }

  /* temperature + nucleus (top-p) sampling over the candidate list */
  function sample(cands, temperature, topP, rnd) {
    var i;
    var scores = cands.map(function (c) { return c.logit; });
    var probs = softmax(scores, Math.max(0.05, temperature));

    var ranked = cands.map(function (c, idx) {
      return { token: c.token, p: probs[idx], logit: c.logit, align: c.align };
    });

    var cum = 0, keep = [];
    for (i = 0; i < ranked.length; i++) {
      keep.push(ranked[i]);
      cum += ranked[i].p;
      if (cum >= topP) break;
    }

    var mass = 0;
    for (i = 0; i < keep.length; i++) mass += keep[i].p;
    for (i = 0; i < keep.length; i++) keep[i].pKept = keep[i].p / mass;

    var r = (rnd || Math.random)(), acc = 0, chosen = keep[keep.length - 1];
    for (i = 0; i < keep.length; i++) {
      acc += keep[i].pKept;
      if (r <= acc) { chosen = keep[i]; break; }
    }

    return { all: ranked, kept: keep, chosen: chosen };
  }

  global.ToyModel = {
    D: D, DFF: DFF, HEADS: HEADS,
    tokenize: tokenize, display: display,
    embed: embed, positional: positional,
    layerNorm: layerNorm, gelu: gelu, softmax: softmax,
    add: add, dot: dot, norm: norm, matvec: matvec,
    projectQKV: project_qkv, attend: attend, feedForward: feedForward,
    logits: logits, sample: sample,
    hash32: hash32, mulberry32: mulberry32
  };
})(window);
