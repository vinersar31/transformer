/* sim.js: the state machine that drives one token through the city.
 *
 * A "trip" is one full forward pass. During prefill the convoy carries every
 * prompt token at once; during decode it carries a single token and reads the
 * rest from the KV cache, exactly like the real thing.
 */
(function (global) {
  'use strict';

  var M = global.ToyModel;
  var City = global.City;

  var BASE_SPEED = 6;        // grid units / second at 1x

  /* Which districts the viewer has already had explained to them. This
     deliberately survives a reset, because nobody wants to re-read the tour. */
  var tour = { seen: Object.create(null), done: false };

  var state = {
    running: false,
    paused: true,
    finished: false,
    mode: 'prefill',              // prefill | decode
    stage: null,
    stageT: 0,
    layer: 0,
    layers: 6,
    temperature: 0.8,
    topP: 0.9,
    speed: 1,
    maxNew: 8,
    stepMode: false,

    tokens: [],                   // [{text, kind:'prompt'|'gen'}]
    focusIdx: 0,
    cacheSize: 0,
    outputText: '',

    h: null,                      // residual vector of the focus token
    hLabel: 'residual stream',
    attn: null,                   // weights over cache for the focus token
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
    tripCount: 0
  };

  var convoy = {
    routeName: 'intake',
    dist: 0,
    dwell: 0,
    stationIdx: 0,
    cars: []                      // token indices riding along
  };

  /* live model memory */
  var kv = [];                    // kv[layer][tokenIdx] = {k, v}
  var vecs = {};                  // tokenIdx -> residual vector (this trip)
  var normed = {};
  var sub = {};                   // sub-layer outputs this stage

  var listeners = [];
  function emit(name, payload) {
    for (var i = 0; i < listeners.length; i++) listeners[i](name, payload);
  }

  /* ---- lifecycle --------------------------------------------------------- */

  function setPrompt(text) {
    var toks = M.tokenize(text);
    state.tokens = toks.map(function (t) { return { text: t, kind: 'prompt' }; });
    reset();
    state.running = true;
    state.paused = false;
    emit('reset');
  }

  function reset() {
    kv = [];
    vecs = {};
    normed = {};
    sub = {};
    state.tokens = state.tokens.filter(function (t) { return t.kind === 'prompt'; });
    state.mode = 'prefill';
    state.layer = 0;
    state.cacheSize = 0;
    state.outputText = '';
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
    convoy.routeName = 'intake';
    convoy.dist = 0;
    convoy.dwell = 0;
    convoy.stationIdx = 0;
    convoy.cars = state.tokens.map(function (_, i) { return i; });
  }

  function beginDecodeTrip(tokenIdx) {
    state.mode = 'decode';
    state.layer = 0;
    vecs = {};
    normed = {};
    sub = {};
    convoy.routeName = 'intake';
    /* the new token joins at the docks; it never left the pipeline */
    convoy.dist = City.routes.intake.cum[1] - 0.01;
    convoy.stationIdx = 0;
    convoy.dwell = 0;
    convoy.cars = [tokenIdx];
    state.focusIdx = tokenIdx;
    /* skip stations already behind us */
    var st = City.stations.intake;
    while (convoy.stationIdx < st.length && st[convoy.stationIdx].dist < convoy.dist) convoy.stationIdx++;
  }

  /* ---- per-station math -------------------------------------------------- */

  function cars() { return convoy.cars; }
  function focus() { return convoy.cars[convoy.cars.length - 1]; }

  var OPS = {
    tokenize: function () {
      state.hLabel = 'token IDs';
    },

    embed: function () {
      cars().forEach(function (i) { vecs[i] = M.embed(state.tokens[i].text); });
      state.hLabel = 'embedding';
      state.h = vecs[focus()];
    },

    position: function () {
      cars().forEach(function (i) { vecs[i] = M.add(vecs[i], M.positional(i)); });
      state.hLabel = 'embedding + position';
      state.h = vecs[focus()];
    },

    norm1: function () {
      cars().forEach(function (i) { normed[i] = M.layerNorm(vecs[i]); });
      state.hLabel = 'normalised (pre-attention)';
      state.h = normed[focus()];
    },

    attn: function () {
      var L = state.layer;
      if (!kv[L]) kv[L] = [];
      var opts = { sharpen: 2.2, sink: 0.9, recency: 1.1 };
      var list = cars();
      sub.attn = {};
      for (var n = 0; n < list.length; n++) {
        var i = list[n];
        var qkv = M.projectQKV(normed[i], L);
        kv[L][i] = { k: qkv.k, v: qkv.v };
        var upto = kv[L].slice(0, i + 1);          // causal mask: only the past
        var r = M.attend(qkv.q, upto, L, opts);
        sub.attn[i] = r.out;
        if (i === focus()) {
          state.attn = r.weights;
          state.attnHeads = r.heads;
        }
      }
      state.cacheSize = kv[0] ? kv[0].length : 0;
      state.attnActive = 1;
      state.siloPop = 1;
      state.hLabel = 'attention output';
      state.h = sub.attn[focus()];
    },

    res1: function () {
      cars().forEach(function (i) { vecs[i] = M.add(vecs[i], sub.attn[i]); });
      state.hLabel = 'residual stream';
      state.h = vecs[focus()];
    },

    norm2: function () {
      cars().forEach(function (i) { normed[i] = M.layerNorm(vecs[i]); });
      state.hLabel = 'normalised (pre-FFN)';
      state.h = normed[focus()];
    },

    ffn: function () {
      sub.ffn = {};
      cars().forEach(function (i) { sub.ffn[i] = M.feedForward(normed[i], state.layer).out; });
      state.hLabel = 'feed-forward output';
      state.h = sub.ffn[focus()];
    },

    res2: function () {
      cars().forEach(function (i) { vecs[i] = M.add(vecs[i], sub.ffn[i]); });
      state.hLabel = 'residual stream';
      state.h = vecs[focus()];
    },

    layer: function () {
      state.layer++;
      /* the first block is walked at full detail; the rest are the same road
         with different weights, so we run them at speed */
      state.fastForward = state.layer >= 1 && state.layers > 3;
      if (state.layer >= state.layers) {
        convoy.routeName = 'exit';
        convoy.dist = 0;
        convoy.stationIdx = 0;
        convoy.dwell = 0.35;
        state.fastForward = false;
      }
    },

    finalnorm: function () {
      var f = focus();
      vecs[f] = M.layerNorm(vecs[f]);
      state.h = vecs[f];
      state.hLabel = 'final hidden state';
    },

    logits: function () {
      var cands = M.logits(vecs[focus()], state.tokens[focus()].text);
      /* the raw distribution, before the sampler reshapes it */
      var probs = M.softmax(cands.map(function (c) { return c.logit; }), 1);
      cands.forEach(function (c, i) { c.p = probs[i]; });
      state.candidates = cands;
      state.kept = null;
      state.chosen = null;
    },

    sample: function () {
      var r = M.sample(state.candidates, state.temperature, state.topP, Math.random);
      state.kept = r.kept;
      state.candidates = r.all;
      state.chosen = r.chosen;
    },

    emit: function () {
      var text = ' ' + state.chosen.token;
      if (/^[.,?!]$/.test(state.chosen.token)) text = state.chosen.token;
      state.tokens.push({ text: text, kind: 'gen' });
      state.outputText += text;
      state.lastEmitted = state.chosen.token;
      state.emitFlash = 1;
      state.tripCount++;
      /* one complete pass visits every district, so the tour is over */
      tour.done = true;
      state.tourDone = true;
    },

    feedback: function () { /* purely scenic */ }
  };

  /* ---- update ------------------------------------------------------------ */

  function routeOf(name) { return City.routes[name]; }

  /* Once every district has been explained there is nothing left to read, so
     the remaining tokens run at a watchable pace instead of a readable one. */
  function travelBoost() {
    return (state.fastForward ? 3.2 : 1) * (state.tourDone ? 3.0 : 1);
  }
  function dwellBoost() {
    /* stops stay generous even after the tour, because the numbers on them change */
    return (state.fastForward ? 3.2 : 1) * (state.tourDone ? 1.4 : 1);
  }

  function fire(st) {
    state.stage = st.id;
    state.stageT = 0;
    var op = OPS[st.id];
    if (op) op();
    emit('stage', st.id);
  }

  function advanceRoute() {
    if (convoy.routeName === 'intake') {
      convoy.routeName = 'loop';
      convoy.dist = 0;
      convoy.stationIdx = 0;
      state.layer = 0;
    } else if (convoy.routeName === 'loop') {
      convoy.dist = 0;
      convoy.stationIdx = 0;
    } else if (convoy.routeName === 'exit') {
      convoy.routeName = 'feedback';
      convoy.dist = 0;
      convoy.stationIdx = 0;
    } else if (convoy.routeName === 'feedback') {
      if (state.tripCount >= state.maxNew) {
        state.finished = true;
        state.paused = true;
        state.stage = 'done';
        emit('stage', 'done');
        return;
      }
      beginDecodeTrip(state.tokens.length - 1);
    }
  }

  function update(dt) {
    state.stageT += dt;
    state.attnActive = Math.max(0, state.attnActive - dt * 0.55);
    state.emitFlash = Math.max(0, state.emitFlash - dt * 1.2);
    state.siloPop = Math.max(0, state.siloPop - dt * 1.1);

    if (!state.running || state.paused || state.finished) return;

    var sdt = dt * state.speed * travelBoost();

    if (convoy.dwell > 0) {
      /* A stop is measured in reading seconds, so only the speed slider
         scales it; the travel boosts must not cut a first read short. */
      convoy.dwell -= dt * state.speed;
      state.dwellLeft = Math.max(0, convoy.dwell);
      if (convoy.dwell <= 0) { state.reading = false; state.dwellTotal = 0; }
      return;
    }

    var route = routeOf(convoy.routeName);
    convoy.dist += BASE_SPEED * sdt;

    var sts = City.stations[convoy.routeName];
    if (convoy.stationIdx < sts.length) {
      var st = sts[convoy.stationIdx];
      if (convoy.dist >= st.dist) {
        convoy.dist = st.dist;
        convoy.stationIdx++;
        /* Keyed by district, not stage: norm2 and res2 show exactly the same
           copy as norm1 and res1, so they must not charge a second read. */
        var topic = City.stageToDistrict[st.id] || st.id;
        var firstTime = !tour.seen[topic];
        fire(st);
        tour.seen[topic] = true;
        /* Long stop while there is something new to read; a brief one after. */
        convoy.dwell = firstTime ? (st.read || 12) : st.dwell / dwellBoost();
        state.reading = firstTime;
        state.dwellTotal = convoy.dwell;
        state.dwellLeft = convoy.dwell;
        if (state.stepMode) { state.paused = true; state.stepMode = false; }
        return;
      }
    }

    if (convoy.dist >= route.total) advanceRoute();
  }

  /* ---- queries used by the renderer -------------------------------------- */

  /* The routes are polylines with hard corners, so reading one directly makes a
     vehicle snap to a new heading the instant it crosses a waypoint. Averaging
     a sample either side rounds the turn and swings the heading through it. */
  function smoothAt(route, d, look) {
    var a = route.at(Math.max(0, d - look));
    var m = route.at(d);
    var b = route.at(Math.min(route.total, d + look));
    var hx = b.x - a.x, hy = b.y - a.y;
    var len = Math.hypot(hx, hy) || 1;
    return {
      x: (a.x + 2 * m.x + b.x) / 4,
      y: (a.y + 2 * m.y + b.y) / 4,
      z: (a.z + 2 * m.z + b.z) / 4,
      dx: hx / len, dy: hy / len
    };
  }

  function carPositions() {
    var route = routeOf(convoy.routeName);
    var out = [];
    var n = convoy.cars.length;
    var spacing = n > 8 ? 0.85 : 1.25;
    for (var i = 0; i < n; i++) {
      var back = (n - 1 - i) * spacing;
      var d = Math.max(0, convoy.dist - back);
      var p = smoothAt(route, d, 0.8);
      out.push({ idx: convoy.cars[i], x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, lead: i === n - 1 });
    }
    return out;
  }

  function leadPosition() {
    return smoothAt(routeOf(convoy.routeName), convoy.dist, 0.8);
  }

  global.Sim = {
    state: state,
    convoy: convoy,
    setPrompt: setPrompt,
    reset: function () { reset(); emit('reset'); },
    /* forget which districts have been explained, so the slow tour replays */
    replayTour: function () { tour.seen = Object.create(null); tour.done = false; },
    update: update,
    carPositions: carPositions,
    leadPosition: leadPosition,
    on: function (fn) { listeners.push(fn); },
    play: function () { if (!state.finished) { state.paused = false; state.running = true; } },
    pause: function () { state.paused = true; },
    toggle: function () { if (state.paused) this.play(); else this.pause(); },
    step: function () {
      if (state.finished) return;
      state.running = true;
      state.stepMode = true;
      state.paused = false;
      if (convoy.dwell > 0) convoy.dwell = 0;
    }
  };
})(window);
