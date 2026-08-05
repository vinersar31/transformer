/* city.js: routes, districts, buildings and props for the static world. */
(function (global) {
  'use strict';

  var Iso = global.Iso;

  /* ---- routes ------------------------------------------------------------ */

  function makeRoute(raw) {
    var pts = raw.map(function (p) { return { x: p[0], y: p[1], z: p[2] || 0 }; });
    var segs = [], total = 0, cum = [0];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
      segs.push({ a: a, b: b, len: len, cum: total });
      total += len;
      cum.push(total);
    }
    return {
      pts: pts, segs: segs, total: total, cum: cum,
      at: function (d) {
        if (d <= 0) {
          var s0 = segs[0];
          return { x: s0.a.x, y: s0.a.y, z: s0.a.z, dx: (s0.b.x - s0.a.x) / s0.len, dy: (s0.b.y - s0.a.y) / s0.len };
        }
        if (d >= total) {
          var sn = segs[segs.length - 1];
          return { x: sn.b.x, y: sn.b.y, z: sn.b.z, dx: (sn.b.x - sn.a.x) / sn.len, dy: (sn.b.y - sn.a.y) / sn.len };
        }
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          if (d <= s.cum + s.len) {
            var t = (d - s.cum) / s.len;
            return {
              x: s.a.x + (s.b.x - s.a.x) * t,
              y: s.a.y + (s.b.y - s.a.y) * t,
              z: s.a.z + (s.b.z - s.a.z) * t,
              dx: (s.b.x - s.a.x) / s.len,
              dy: (s.b.y - s.a.y) / s.len
            };
          }
        }
      }
    };
  }

  /* Waypoints. Indices marked below are used as station anchors. */
  var INTAKE = makeRoute([
    [-3, 5],        // 0 spawn, just off the plate. The prompt arrives from
                    //   outside the city, but the default view starts close on
                    //   the convoy, so a long run-in would open on empty ground
    [6, 5],         // 1 tokenizer docks
    [17, 5],        // 2 embedding foundry
    [28, 5],        // 3 positional beacon
    [38, 5],        // 4 corner
    [38, 11]        // 5 loop entry
  ]);

  var LOOP = makeRoute([
    [38, 11],       // 0 entry
    [34, 11],       // 1 pre-norm gate I
    [24, 11],       // 2 attention plaza
    [14, 11],       // 3 residual bridge I
    [9, 11],        // 4
    [7, 13],        // 5
    [7, 19],        // 6
    [9, 21],        // 7
    [14, 21],       // 8 pre-norm gate II
    [23, 21],       // 9 feed-forward mill
    [32, 21],       // 10 residual bridge II
    [37, 21],       // 11
    [39, 19],       // 12
    [39, 16],       // 13 layer counter arch
    [39, 13],       // 14
    [38, 11]        // 15 back to entry
  ]);

  var EXIT = makeRoute([
    [39, 16],       // 0 off the arch
    [43, 19],
    [43, 25],
    [41, 27],
    [36, 27],       // 4 final norm
    [27, 27],       // 5 vocabulary stadium
    [15, 27],       // 6 sampler
    [6, 27]         // 7 output plaza
  ]);

  var FEEDBACK = makeRoute([
    [6, 27, 0],
    [2.5, 27, 0.5],
    [2.5, 24, 3],
    [2.5, 10, 3],
    [2.5, 7, 1.4],
    [4.2, 5, 0.3],
    [6, 5, 0]
  ]);

  /* `dwell` is how long the convoy waits once you have already read this
     district's explanation. The much longer first-visit stop is derived from
     the length of that explanation; see readSeconds() below. */
  function station(route, idx, id, dwell) {
    return { dist: route.cum[idx], id: id, dwell: dwell == null ? 0.8 : dwell };
  }

  var STATIONS = {
    intake: [
      station(INTAKE, 1, 'tokenize', 1.6),
      station(INTAKE, 2, 'embed', 1.4),
      station(INTAKE, 3, 'position', 1.2)
    ],
    loop: [
      station(LOOP, 1, 'norm1', 0.6),
      station(LOOP, 2, 'attn', 2.6),
      station(LOOP, 3, 'res1', 0.5),
      station(LOOP, 8, 'norm2', 0.5),
      station(LOOP, 9, 'ffn', 1.6),
      station(LOOP, 10, 'res2', 0.5),
      station(LOOP, 13, 'layer', 0.7)
    ],
    exit: [
      station(EXIT, 4, 'finalnorm', 1.0),
      station(EXIT, 5, 'logits', 2.6),
      station(EXIT, 6, 'sample', 2.8),
      station(EXIT, 7, 'emit', 2.0)
    ],
    feedback: [
      station(FEEDBACK, 3, 'feedback', 1.2)
    ]
  };

  /* ---- palette ----------------------------------------------------------- */

  /* A printed-diagram palette: muted, low-chroma hues that stay legible on a
     pale ground and read as ink rather than light. */
  var C = {
    steel:  '#4a7a9b',
    violet: '#6f63a8',
    ochre:  '#c2913c',
    stone:  '#7d8b96',
    rose:   '#b05470',
    sage:   '#6d9068',
    teal:   '#3f8a86',
    orange: '#c07a3c',
    brick:  '#a85a44',
    moss:   '#5f8a52',
    plum:   '#8b5f96',
    ink:    '#4a4540',
    paper:  '#e5e1d5',
    road:   '#c9c4b6',
    roadTop:'#d8d3c6'
  };

  /* ---- districts (clickable, narrated) ----------------------------------- */

  var DISTRICTS = [
    {
      id: 'tokenize', name: 'Tokenizer Docks', x: 6, y: 5, r: 4.2, color: C.steel,
      tag: 'Text → tokens',
      short: 'Your prompt is cut into tokens before the model sees anything.',
      body: 'A language model never sees letters or words. It sees IDs from a fixed vocabulary, typically 50k–200k pieces. Frequent words are a single token; rarer ones shatter into fragments, and a leading space is part of the token (shown here as ·). Here your prompt arrives by road and leaves the docks as numbered crates.'
    },
    {
      id: 'embed', name: 'Embedding Foundry', x: 17, y: 5, r: 4.2, color: C.violet,
      tag: 'Tokens → vectors',
      short: 'Each token ID becomes a vector: a point in meaning-space.',
      body: 'The token ID indexes one row of a huge embedding table. That row is the vector. Nothing about spelling survives the foundry; from here on the model manipulates only numbers. This city uses 12 numbers per token so you can watch them; GPT-class models use 4,000–16,000.'
    },
    {
      id: 'position', name: 'Positional Beacon', x: 28, y: 5, r: 4.2, color: C.ochre,
      tag: 'Where am I?',
      short: 'Order is stamped onto the vector, because attention has no sense of sequence.',
      body: 'Attention is permutation-blind: without a position signal, "dog bites man" and "man bites dog" are literally the same input. The beacon adds a sinusoidal position code (real models often rotate the vector instead, using RoPE). Different frequencies let the model read both "next to" and "far from".'
    },
    {
      id: 'norm', name: 'Pre-Norm Gate', x: 34, y: 11, r: 3.2, color: C.stone,
      tag: 'LayerNorm',
      short: 'Re-centre and rescale the vector before every sub-layer.',
      body: 'LayerNorm subtracts the mean and divides by the standard deviation across the vector, then applies a learned gain. It keeps activations in a range the next block can handle and stops them exploding across dozens of layers. Modern transformers normalise *before* each sub-layer, not after, hence the name "pre-norm".'
    },
    {
      id: 'attn', name: 'Attention Plaza', x: 24, y: 11, r: 5, color: C.rose,
      tag: 'Tokens look at tokens',
      short: 'The current token queries every earlier token and blends what it finds.',
      body: 'Three substations project the vector into a Query, a Key and a Value. The query is scored against the key of every token in the cache; a softmax turns those scores into weights that sum to 1; the output is that weighted blend of values. The beams arcing over the warehouse are the real weights being computed for this token, right now. Two heads run in parallel here; real models run 32 or more, each looking for something different.'
    },
    {
      id: 'cache', name: 'KV Cache Warehouse', x: 24, y: 16, r: 5, color: C.sage,
      tag: 'Memory of the past',
      short: 'Keys and values for every token so far, stored so they are never recomputed.',
      body: 'One silo per token. Without it, generating word 500 would mean re-processing all 499 previous tokens through every layer. With it, each new token only computes its own key and value and reads the rest. This is also why long contexts get expensive: the warehouse grows linearly with tokens and layers, and it lives in GPU memory.'
    },
    {
      id: 'res', name: 'Residual Bridge', x: 14, y: 11, r: 3.2, color: C.teal,
      tag: 'The bypass lane',
      short: 'Sub-layers add to the vector instead of replacing it.',
      body: 'Every sub-layer output is *added* back onto its own input. That leaves an uninterrupted road, the residual stream, running from the docks all the way to the output. Each block writes a correction onto that stream rather than rebuilding it, which is what makes 100-layer networks trainable at all.'
    },
    {
      id: 'ffn', name: 'Feed-Forward Mill', x: 23, y: 21, r: 4.6, color: C.orange,
      tag: 'Think alone',
      short: 'Widen, apply a non-linearity, narrow again, with no mixing between tokens.',
      body: 'Two matrices with a GELU in between: 12 → 24 → 12 here, typically 4× in real models. Unlike attention, this stage never looks at other tokens; each one is processed in isolation. Roughly two thirds of a transformer\'s parameters live in these mills, and a lot of what a model "knows" is stored here.'
    },
    {
      id: 'layer', name: 'Layer Counter Arch', x: 39, y: 16, r: 3, color: C.brick,
      tag: '×N blocks',
      short: 'The whole ring repeats, with different weights every time.',
      body: 'This is not a loop in code: it is a stack of distinct blocks, each with its own weights. Small models stack 12; large ones stack 80 or more. Broadly, early layers resolve local and syntactic structure while later ones carry more abstract, task-level features, and the residual stream carries everything forward between them.'
    },
    {
      id: 'finalnorm', name: 'Final Norm', x: 36, y: 27, r: 3, color: C.stone,
      tag: 'Last tidy-up',
      short: 'One more normalisation before the vector is turned into scores.',
      body: 'After the last block the residual stream gets a final LayerNorm so the output head sees a well-scaled vector. Small stage, but skipping it wrecks the distribution.'
    },
    {
      id: 'logits', name: 'Vocabulary Stadium', x: 27, y: 27, r: 5, color: C.moss,
      tag: 'One score per token',
      short: 'The vector is compared against every token in the vocabulary.',
      body: 'The final vector is multiplied by the unembedding matrix, producing one raw score, a logit, for every token in the vocabulary. Softmax turns the whole row into a probability distribution. Each tower here is a candidate and its height is that candidate\'s probability. Note what the model produces: not an answer, a distribution.'
    },
    {
      id: 'sample', name: 'The Sampler', x: 15, y: 27, r: 4.4, color: C.plum,
      tag: 'Temperature & top-p',
      short: 'Reshape the distribution, then roll the dice.',
      body: 'Temperature divides the logits before softmax: below 1 sharpens the peak toward the safest token, above 1 flattens it and lets long shots through. Top-p (nucleus) keeps only the shortest list of candidates whose probabilities already sum to p and discards the tail. Then one token is drawn at random from what survives, which is why the same prompt can give different answers.'
    },
    {
      id: 'emit', name: 'Output Plaza', x: 6, y: 27, r: 4, color: C.steel,
      tag: 'One token out',
      short: 'The chosen token is appended to the text and shown on the board.',
      body: 'A single token leaves the city, often just a fragment of a word. Everything you have watched, the entire city, ran once to produce this one piece. Streaming output is exactly this: tokens arriving one at a time.'
    },
    {
      id: 'feedback', name: 'Feedback Highway', x: 2.5, y: 16, r: 3.5, color: C.brick,
      tag: 'Autoregression',
      short: 'The new token drives back to the docks and the whole city runs again.',
      body: 'The output is appended to the input and the model runs from scratch for the next token. That is what "autoregressive" means. It is why generation is strictly sequential, why speed is quoted in tokens per second, and why a model cannot revise a token once it has left the plaza.'
    }
  ];

  /* The pre-norm gate and the residual bridge each appear twice per block, so
     clone their pick/zone targets onto the second location. */
  [['norm', 14, 21], ['res', 32, 21]].forEach(function (c) {
    var src = DISTRICTS.filter(function (d) { return d.id === c[0]; })[0];
    var clone = Object.create(src);
    clone.x = c[1]; clone.y = c[2];
    DISTRICTS.push(clone);
  });

  var DISTRICT_BY_ID = {};
  DISTRICTS.forEach(function (d) { DISTRICT_BY_ID[d.id] = d; });

  /* stage ids that map onto a shared district */
  var STAGE_TO_DISTRICT = {
    norm1: 'norm', norm2: 'norm', res1: 'res', res2: 'res'
  };

  /* How long to hold the convoy the first time you reach a district, so the
     panel copy can actually be read. ~230 words per minute, plus a beat to
     take in the city before starting and a beat after finishing. */
  function readSeconds(stageId) {
    var d = DISTRICT_BY_ID[STAGE_TO_DISTRICT[stageId] || stageId];
    if (!d) return 9;
    var words = (d.short + ' ' + d.body).split(/\s+/).length;
    return Math.min(26, Math.max(9, words / 3.8 + 3.5));
  }

  Object.keys(STATIONS).forEach(function (route) {
    STATIONS[route].forEach(function (st) { st.read = readSeconds(st.id); });
  });

  /* ---- geometry helpers -------------------------------------------------- */

  var ALL_ROUTES = [INTAKE, LOOP, EXIT, FEEDBACK];

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToRoutes(x, y) {
    var best = 1e9;
    for (var r = 0; r < ALL_ROUTES.length; r++) {
      var segs = ALL_ROUTES[r].segs;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        var d = distToSegment(x, y, s.a.x, s.a.y, s.b.x, s.b.y);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function distToDistricts(x, y) {
    var best = 1e9;
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      var v = Math.hypot(x - d.x, y - d.y) - d.r;
      if (v < best) best = v;
    }
    return best;
  }

  /* ---- landmark buildings ------------------------------------------------ */

  var buildings = [];

  function put(o) { buildings.push(o); return o; }

  function landmark(cx, cy, opts) {
    put({
      x: cx - opts.w / 2, y: cy - opts.d / 2, z: opts.z || 0,
      w: opts.w, d: opts.d, h: opts.h,
      color: opts.color, kind: opts.kind || 'box',
      windows: opts.windows !== false ? { cols: opts.cols || 3, rows: opts.rows || Math.max(2, Math.round(opts.h * 1.3)), seed: (cx * 31 + cy * 17) | 0, color: opts.lit || '#ffe1a3' } : null,
      accent: opts.accent, tag: opts.tag, glow: opts.glow
    });
  }

  function buildLandmarks() {
    /* Tokenizer Docks */
    landmark(4.2, 3.0, { w: 3.4, d: 2.2, h: 2.6, color: '#b9c9d4', cols: 4, lit: C.steel });
    landmark(8.0, 3.2, { w: 2.2, d: 2.0, h: 4.2, color: '#aabecd', cols: 2, lit: C.steel });
    landmark(4.6, 7.6, { w: 4.6, d: 2.4, h: 1.6, color: '#c3d0d9', cols: 5, lit: C.steel });
    landmark(8.6, 7.4, { w: 2.0, d: 2.0, h: 2.2, color: '#b9c9d4', cols: 2, lit: C.steel });
    /* gantry crane over the road */
    put({ kind: 'crane', x: 6, y: 5, color: C.steel });

    /* Embedding Foundry */
    landmark(15.4, 2.8, { w: 3.0, d: 2.6, h: 3.4, color: '#c4bedb', cols: 3, lit: C.violet });
    landmark(19.2, 3.0, { w: 2.4, d: 2.4, h: 2.2, color: '#b6afd0', cols: 2, lit: C.violet });
    landmark(16.0, 7.6, { w: 3.6, d: 2.2, h: 2.0, color: '#cec9e0', cols: 4, lit: C.violet });
    put({ kind: 'foundry', x: 19.4, y: 7.2, color: C.violet });

    /* Positional Beacon */
    put({ kind: 'beacon', x: 28, y: 2.6, color: C.ochre });
    landmark(25.0, 7.6, { w: 2.6, d: 2.2, h: 1.8, color: '#ddc79a', cols: 3, lit: C.ochre });
    landmark(30.6, 7.4, { w: 2.4, d: 2.2, h: 2.6, color: '#ddc79a', cols: 3, lit: C.ochre });
    landmark(31.6, 2.8, { w: 2.2, d: 2.2, h: 3.0, color: '#d3bb8b', cols: 2, lit: C.ochre });

    /* Pre-norm gates (two, same design) */
    /* Structures the road runs through are registered one piece at a time, so
       each pillar sorts on its own depth. A single key for the whole gate puts
       the near pillar behind a vehicle that should be passing under it. */
    function straddleGate(gx, gy) {
      put({ kind: 'gatePost', x: gx, y: gy - 1.7, color: C.stone });
      put({ kind: 'gateBeam', x: gx, y: gy, color: C.stone });
      put({ kind: 'gatePost', x: gx, y: gy + 1.7, color: C.stone });
    }

    straddleGate(34, 11);
    straddleGate(14, 21);

    /* Attention Plaza: Q / K / V substations around a roundabout */
    put({ kind: 'plaza', x: 24, y: 11, color: C.rose });
    landmark(21.4, 8.4, { w: 1.8, d: 1.8, h: 3.2, color: '#d6aebb', cols: 2, lit: C.rose, tag: 'Q' });
    landmark(24.0, 8.0, { w: 1.8, d: 1.8, h: 3.9, color: '#d6aebb', cols: 2, lit: C.rose, tag: 'K' });
    landmark(26.6, 8.4, { w: 1.8, d: 1.8, h: 3.2, color: '#d6aebb', cols: 2, lit: C.rose, tag: 'V' });

    /* Residual bridges */
    put({ kind: 'bridge', x: 14, y: 11, color: C.teal });
    put({ kind: 'bridge', x: 32, y: 21, color: C.teal });

    /* Feed-forward mill */
    put({ kind: 'mill', x: 23, y: 21, color: C.orange });
    landmark(19.6, 23.6, { w: 2.4, d: 2.0, h: 2.4, color: '#dcc6a0', cols: 3, lit: C.ochre });
    landmark(26.6, 23.6, { w: 2.6, d: 2.0, h: 2.0, color: '#dcc6a0', cols: 3, lit: C.ochre });

    /* Layer counter arch */
    put({ kind: 'archPillar', x: 37.35, y: 16, color: C.brick });
    put({ kind: 'archBeam',   x: 39.00, y: 16, color: C.brick });
    put({ kind: 'archPillar', x: 40.65, y: 16, color: C.brick });

    /* Final norm */
    straddleGate(36, 27);

    /* Vocabulary stadium */
    put({ kind: 'stadium', x: 27, y: 27, color: C.moss });

    /* Sampler */
    put({ kind: 'sampler', x: 15, y: 27, color: C.plum });

    /* Output plaza jumbotron */
    put({ kind: 'jumbotron', x: 6, y: 27, color: C.steel });
  }

  /* ---- filler city ------------------------------------------------------- */

  var FILLER_BLOCKS = [
    { x0: 12, y0: 7.6, x1: 33, y1: 9.2, density: 0.5, hMin: 0.8, hMax: 2.2 },
    { x0: 41, y0: 3, x1: 45, y1: 12, density: 0.55, hMin: 1.0, hMax: 4.5 },
    { x0: 6, y0: 23.2, x1: 38, y1: 25.6, density: 0.5, hMin: 0.9, hMax: 2.6 },
    { x0: 10, y0: 12.6, x1: 37, y1: 14.4, density: 0.35, hMin: 0.6, hMax: 1.6 },
    { x0: 10, y0: 17.8, x1: 37, y1: 19.6, density: 0.35, hMin: 0.6, hMax: 1.6 },
    { x0: 32, y0: 29.4, x1: 44, y1: 33, density: 0.5, hMin: 0.8, hMax: 3.0 },
    { x0: 8, y0: 30.0, x1: 20, y1: 33, density: 0.42, hMin: 0.8, hMax: 2.4 },
    { x0: 0.5, y0: 8, x1: 5.0, y1: 24, density: 0.3, hMin: 0.6, hMax: 1.8 },
    { x0: 0.5, y0: 0.5, x1: 10, y1: 2.0, density: 0.4, hMin: 0.8, hMax: 2.6 }
  ];

  /* Facades and roof tiles in the register the game uses: cream render, brick,
     stucco and painted board, with terracotta or slate on top. */
  var FILLER_COLORS = [
    '#e3d8bd', '#d3bb98', '#c08a72', '#b0c2d2', '#cdd3bb', '#e0cfae', '#a9b8a2', '#d8c3b0'
  ];
  var ROOF_COLORS = ['#a05340', '#6d737b', '#8c4636', '#57616d', '#7d6350', '#94503f'];

  function buildFiller() {
    for (var b = 0; b < FILLER_BLOCKS.length; b++) {
      var blk = FILLER_BLOCKS[b];
      for (var x = blk.x0; x < blk.x1 - 1; x += 1.9) {
        for (var y = blk.y0; y < blk.y1 - 1; y += 1.9) {
          var n = Iso.hash2(x * 10, y * 10, b + 5);
          if (n > blk.density) continue;
          var jx = x + Iso.hash2(x * 3, y * 7, 1) * 0.35;
          var jy = y + Iso.hash2(x * 5, y * 11, 2) * 0.35;
          if (distToRoutes(jx + 0.6, jy + 0.6) < 2.1) continue;
          if (distToDistricts(jx + 0.6, jy + 0.6) < 0.6) continue;
          var h = blk.hMin + Iso.hash2(x * 13, y * 3, 4) * (blk.hMax - blk.hMin);
          var w = 0.9 + Iso.hash2(x, y, 8) * 0.5;
          var d = 0.9 + Iso.hash2(x, y, 9) * 0.5;
          /* Low blocks get a pitched roof; anything tall enough to read as a
             tower gets a flat roof with plant on it. */
          var pitched = h < 2.0;
          buildings.push({
            x: jx, y: jy, z: 0, w: w, d: d, h: h, filler: true,
            color: FILLER_COLORS[Math.floor(Iso.hash2(x, y, 12) * FILLER_COLORS.length)],
            roof: pitched ? ROOF_COLORS[Math.floor(Iso.hash2(x, y, 31) * ROOF_COLORS.length)] : null,
            roofH: 0.34 + Iso.hash2(x, y, 33) * 0.3,
            rooftop: !pitched,
            windows: { cols: 2, rows: Math.max(1, Math.round(h * 1.6)), seed: (jx * 71 + jy * 37) | 0 }
          });
        }
      }
    }
  }

  /* ---- props ------------------------------------------------------------- */

  var props = [];

  function buildProps() {
    /* street lamps along the main routes */
    ALL_ROUTES.forEach(function (route, ri) {
      var step = 5.4;
      for (var d = step; d < route.total; d += step) {
        var p = route.at(d);
        if (p.x < 0 || p.x > 46) continue;
        var nx = -p.dy, ny = p.dx;
        props.push({ kind: 'lamp', x: p.x + nx * 1.35, y: p.y + ny * 1.35, z: p.z, side: 1, route: ri });
        props.push({ kind: 'lamp', x: p.x - nx * 1.35, y: p.y - ny * 1.35, z: p.z, side: -1, route: ri });
      }
    });

    /* trees in the leftover interior of the ring */
    for (var x = 9; x < 38; x += 1.5) {
      for (var y = 12.4; y < 20; y += 1.5) {
        if (Math.abs(y - 16) < 1.6) continue;            // silo row
        if (distToRoutes(x, y) < 2.0) continue;
        var n = Iso.hash2(x * 9, y * 9, 21);
        if (n > 0.22) continue;
        props.push({ kind: 'tree', x: x, y: y, z: 0, s: 0.75 + n });
      }
    }
    /* a few parks elsewhere */
    for (x = 20; x < 34; x += 1.4) {
      for (y = 29.6; y < 33; y += 1.4) {
        if (Iso.hash2(x * 4, y * 4, 33) > 0.3) continue;
        props.push({ kind: 'tree', x: x, y: y, z: 0, s: 0.8 });
      }
    }
  }

  /* ---- dynamic anchors --------------------------------------------------- */

  /* The cache row sits inside the layer ring and wraps onto further rows as
     the context grows; 3 rows × 18 silos covers the longest prompt we tokenize. */
  var SILO_X0 = 10.8, SILO_STEP = 1.55, SILO_MAX = 18, SILO_Y = 15.2, SILO_ROW = 1.75;

  function siloPos(i) {
    var row = Math.floor(i / SILO_MAX);
    return { x: SILO_X0 + (i % SILO_MAX) * SILO_STEP, y: SILO_Y + row * SILO_ROW };
  }

  var TOWER_X0 = 20.4, TOWER_STEP = 1.95, TOWER_Y = 30.6;

  function towerPos(i) {
    return { x: TOWER_X0 + i * TOWER_STEP, y: TOWER_Y };
  }

  /* ---- build ------------------------------------------------------------- */

  var built = false;
  function build() {
    if (built) return;
    built = true;
    buildLandmarks();
    buildFiller();
    buildProps();
    buildings.sort(function (a, b) {
      return (a.x + a.y + (a.w || 0) * 0.5 + (a.d || 0) * 0.5) - (b.x + b.y + (b.w || 0) * 0.5 + (b.d || 0) * 0.5);
    });
  }

  global.City = {
    GW: 46, GH: 34,
    routes: { intake: INTAKE, loop: LOOP, exit: EXIT, feedback: FEEDBACK },
    stations: STATIONS,
    districts: DISTRICTS,
    districtById: DISTRICT_BY_ID,
    stageToDistrict: STAGE_TO_DISTRICT,
    buildings: buildings,
    props: props,
    palette: C,
    siloPos: siloPos, SILO_MAX: SILO_MAX,
    towerPos: towerPos,
    distToRoutes: distToRoutes,
    build: build
  };
})(window);
