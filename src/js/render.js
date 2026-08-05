/* render.js: draws the city. Everything is canvas 2D, painter's algorithm. */
(function (global) {
  'use strict';

  var Iso = global.Iso, City = global.City, Sim = global.Sim, M = global.ToyModel;
  var P = Iso.project;

  var cam = null, ctx = null, t = 0;
  var frameDt = 0, lastT = null;
  var labels = [];
  var showLabels = true;

  /* ------------------------------------------------------------------ sky */

  /* Open water. The city is an island, which is why the map has an edge. */
  function drawSky(w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4f93c2');
    g.addColorStop(1, '#3b7aa8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* --------------------------------------------------------------- ground */

  function plate(inset, z) {
    var W = City.GW, H = City.GH;
    return [
      P(-inset, -inset, z || 0), P(W + inset, -inset, z || 0),
      P(W + inset, H + inset, z || 0), P(-inset, H + inset, z || 0)
    ];
  }

  var GRASS = ['#6f9c46', '#78a44e', '#67943f', '#7fa955'];

  function drawGround() {
    var W = City.GW, H = City.GH;

    ctx.fillStyle = '#6fb6d6';                 /* shallows around the island */
    Iso.poly(ctx, plate(4.5));
    ctx.fillStyle = '#8ecbe0';
    Iso.poly(ctx, plate(2.6));
    ctx.fillStyle = '#e4d6a8';                 /* beach */
    Iso.poly(ctx, plate(1.1));

    /* Terrain laid out as tiles, the way the game does — a little colour
       variation per tile keeps a big green field from reading as flat paint. */
    ctx.fillStyle = GRASS[0];
    Iso.poly(ctx, plate(0));
    for (var x = 0; x < W; x += 2) {
      for (var y = 0; y < H; y += 2) {
        var n = Iso.hash2(x, y, 17);
        if (n < 0.45) continue;
        ctx.fillStyle = GRASS[1 + Math.floor(n * 2.99) % 3];
        Iso.poly(ctx, [P(x, y, 0), P(x + 2, y, 0), P(x + 2, y + 2, 0), P(x, y + 2, 0)]);
      }
    }

    ctx.strokeStyle = 'rgba(40,70,30,0.10)';   /* faint tile grid */
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (x = 0; x <= W; x += 2) {
      var a = P(x, 0, 0), b = P(x, H, 0);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (y = 0; y <= H; y += 2) {
      var c = P(0, y, 0), d = P(W, y, 0);
      ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(60,90,40,0.35)';
    ctx.lineWidth = 1.5;
    Iso.polyLine(ctx, plate(0), true);
  }

  function drawZones(activeId) {
    for (var i = 0; i < City.districts.length; i++) {
      var d = City.districts[i];
      var active = d.id === activeId;
      ctx.fillStyle = Iso.rgba(d.color, active ? 0.16 : 0.07);
      Iso.disc(ctx, d.x, d.y, 0.02, d.r);
      ctx.strokeStyle = Iso.rgba(d.color, active ? 0.8 : 0.34);
      ctx.lineWidth = active ? 2.2 : 1.2;
      ctx.setLineDash(active ? [] : [6, 7]);
      var p = P(d.x, d.y, 0.02);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, d.r * Iso.TW * 1.414, d.r * Iso.TH * 1.414, 0, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
      if (active) {
        var pulse = (t * 0.6) % 1;
        ctx.strokeStyle = Iso.rgba(d.color, 0.4 * (1 - pulse));
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, d.r * Iso.TW * 1.414 * (1 + pulse * 0.35), d.r * Iso.TH * 1.414 * (1 + pulse * 0.35), 0, 0, 6.2832);
        ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------------- roads */

  /* A square of carriageway centred on every waypoint, so corners are solid. */
  function joints(route, width, elevated, lift) {
    var r = width / 2;
    for (var i = 0; i < route.pts.length; i++) {
      var p = route.pts[i];
      var z = (elevated ? (p.z || 0) : 0) + lift;
      Iso.poly(ctx, [
        P(p.x - r, p.y - r, z), P(p.x + r, p.y - r, z),
        P(p.x + r, p.y + r, z), P(p.x - r, p.y + r, z)
      ]);
    }
  }

  function drawRoute(route, opts) {
    var segs = route.segs, i, s;
    var elevated = opts.elevated;

    if (elevated) {
      /* support pillars + deck shadow */
      for (i = 0; i < segs.length; i++) {
        s = segs[i];
        for (var f = 0; f <= 1; f += 0.34) {
          var x = s.a.x + (s.b.x - s.a.x) * f;
          var y = s.a.y + (s.b.y - s.a.y) * f;
          var z = s.a.z + (s.b.z - s.a.z) * f;
          if (z < 0.8) continue;
          Iso.box(ctx, { x: x - 0.16, y: y - 0.16, z: 0, w: 0.32, d: 0.32, h: z, color: '#bdb7a8' });
        }
      }
    }

    /* kerb / pavement, then the asphalt carriageway on top of it. Each segment
       is its own quad, so a turn leaves a notch on the outside of the corner
       and collinear joins show a hairline seam; a patch at every waypoint,
       filled in the same pass, closes both. */
    ctx.fillStyle = opts.base || '#c2bdad';
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, opts.width, elevated ? (s.a.z + s.b.z) / 2 : 0.01);
    }
    joints(route, opts.width, elevated, 0.01);

    ctx.fillStyle = opts.top || '#565b62';
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, opts.width - 0.7, elevated ? (s.a.z + s.b.z) / 2 + 0.02 : 0.02);
    }
    joints(route, opts.width - 0.7, elevated, 0.02);

    /* dashed centre line */
    ctx.strokeStyle = opts.line || 'rgba(248,244,225,0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([9, 11]);
    ctx.beginPath();
    for (i = 0; i < route.pts.length; i++) {
      var p = P(route.pts[i].x, route.pts[i].y, (route.pts[i].z || 0) + 0.05);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    /* flowing energy pulse along the road */
    if (opts.flow) {
      /* long streaks rather than short dots: on dark asphalt a dotted pulse
         reads as litter next to the white lane markings */
      ctx.strokeStyle = opts.flow;
      ctx.lineWidth = 3.2;
      ctx.setLineDash([8, 46]);
      ctx.lineDashOffset = -(t * 46) % 54;
      ctx.beginPath();
      for (i = 0; i < route.pts.length; i++) {
        var q = P(route.pts[i].x, route.pts[i].y, (route.pts[i].z || 0) + 0.06);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  /* The prompt arrives from off the island, so the intake road starts out over
     the water. Without a causeway and something at the end of it, that reads
     as a road that simply stops in the sea. */
  function drawApproach() {
    var y = 5, x0 = -6.4, x1 = 0.6;

    ctx.fillStyle = '#d8c8a2';                       /* embankment */
    Iso.ribbon(ctx, x0 - 0.5, y, 0.0, y, 4.0, 0.004);
    ctx.fillStyle = '#c2bdad';                       /* kerb */
    Iso.ribbon(ctx, x0, y, x1, y, 2.6, 0.012);
    ctx.fillStyle = '#565b62';                       /* asphalt */
    Iso.ribbon(ctx, x0, y, x1, y, 1.9, 0.022);

    ctx.strokeStyle = 'rgba(248,244,225,0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([9, 11]);
    ctx.beginPath();
    var a = P(x0, y, 0.06), b = P(x1, y, 0.06);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    /* city-limit gate at the far end */
    Iso.box(ctx, { x: x0 - 0.15, y: y - 1.55, z: 0, w: 0.3, d: 0.3, h: 1.8, color: '#b6b0a2' });
    Iso.box(ctx, { x: x0 - 0.15, y: y + 1.25, z: 0, w: 0.3, d: 0.3, h: 1.8, color: '#b6b0a2' });
    Iso.box(ctx, { x: x0 - 0.2, y: y - 1.55, z: 1.8, w: 0.4, d: 3.1, h: 0.34, color: '#8e9aa4' });
  }

  function drawRoads() {
    drawApproach();
    drawRoute(City.routes.intake, { width: 2.6, flow: 'rgba(120,205,255,0.85)' });
    drawRoute(City.routes.loop, { width: 2.6, flow: 'rgba(255,140,180,0.8)' });
    drawRoute(City.routes.exit, { width: 2.6, flow: 'rgba(150,235,120,0.8)' });
    drawRoute(City.routes.feedback, {
      width: 2.0, elevated: true, base: '#b0aa9a', top: '#5d626a',
      flow: 'rgba(255,150,120,0.85)'
    });
  }

  /* ------------------------------------------------------- face-space text */

  /* Text painted onto the +y face (the one facing lower-left).
     (x0, y1, z0) is the top-left of the text block; local +y runs down the
     wall, so the glyphs come out upright rather than mirrored. */
  function faceText(x0, y1, z0, lines, opts) {
    var s = Iso.TZ / Math.hypot(Iso.TW, Iso.TH);
    var o = P(x0, y1, z0);
    var k = 1 / 20, size = opts.size || 14, i;
    ctx.save();
    ctx.transform(Iso.TW * s * k, Iso.TH * s * k, 0, Iso.TZ * k, o.x, o.y);
    ctx.font = size + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = opts.align || 'left';

    /* A painted sign board behind the lettering. Bare text on a brick or
       render wall has almost no contrast at this size. */
    if (opts.panel) {
      var w = 0;
      for (i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
      var h = lines.length * size * 1.25;
      var pad = size * 0.36;
      ctx.fillStyle = opts.panel;
      ctx.fillRect(-pad, -pad * 0.7, w + pad * 2, h + pad * 1.1);
      if (opts.panelEdge) {
        ctx.strokeStyle = opts.panelEdge;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-pad, -pad * 0.7, w + pad * 2, h + pad * 1.1);
      }
    }

    ctx.fillStyle = opts.color || '#3a352e';
    for (i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, i * size * 1.25);
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------- landmarks  */

  function drawCrane(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.2, y: y - 2.4, z: 0, w: 0.4, d: 0.4, h: 3.4, color: '#9fadb8' });
    Iso.box(ctx, { x: x - 0.2, y: y + 2.0, z: 0, w: 0.4, d: 0.4, h: 3.4, color: '#9fadb8' });
    Iso.box(ctx, { x: x - 0.25, y: y - 2.4, z: 3.4, w: 0.5, d: 4.8, h: 0.35, color: '#8d9ca8' });
    /* claw bobbing over the road */
    var bob = 2.0 + Math.sin(t * 1.6) * 0.45;
    Iso.box(ctx, { x: x - 0.06, y: y - 0.06, z: bob, w: 0.12, d: 0.12, h: 3.4 - bob, color: '#8d9ca8' });
    Iso.box(ctx, { x: x - 0.3, y: y - 0.3, z: bob - 0.35, w: 0.6, d: 0.6, h: 0.35, color: '#4a7a9b' });
    /* dock lamps */
    ctx.fillStyle = Iso.rgba('#4a7a9b', 0.45 + 0.35 * Math.abs(Math.sin(t * 3)));
    Iso.disc(ctx, x, y - 2.2, 3.5, 0.14);
    Iso.disc(ctx, x, y + 2.2, 3.5, 0.14);
  }

  function drawFoundry(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 1.5, y: y - 1.2, z: 0, w: 3.0, d: 2.4, h: 1.5, color: '#c4bedb' });
    Iso.cylinder(ctx, { x: x, y: y, z: 1.5, r: 0.85, h: 1.9, color: '#b0a8cf', ring: 0.45 });
    var glow = 0.55 + 0.45 * Math.sin(t * 2.2);
    ctx.fillStyle = Iso.rgba('#6f63a8', 0.4 + 0.35 * glow);
    Iso.disc(ctx, x, y, 3.42, 0.85);
    /* pour of molten vectors */
    for (var i = 0; i < 5; i++) {
      var ph = (t * 0.9 + i * 0.2) % 1;
      ctx.fillStyle = Iso.rgba('#6f63a8', 0.55 * (1 - ph));
      Iso.disc(ctx, x + 0.9, y + 0.5, 3.4 + ph * 1.6, 0.12 + ph * 0.16);
    }
  }

  function drawBeacon(b) {
    var x = b.x, y = b.y;
    Iso.cylinder(ctx, { x: x, y: y, z: 0, r: 1.0, h: 1.4, color: '#d9c8a2' });
    Iso.cylinder(ctx, { x: x, y: y, z: 1.4, r: 0.72, h: 2.4, color: '#e2d3ae', ring: 0.5 });
    Iso.cylinder(ctx, { x: x, y: y, z: 3.8, r: 0.5, h: 0.9, color: '#c9b384' });
    var p = P(x, y, 4.9);
    var pulse = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.fillStyle = Iso.rgba('#c2913c', 0.95);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 10 * pulse, 6 * pulse, 0, 0, 6.2832);
    ctx.fill();
    /* rotating sweep */
    var ang = t * 1.1;
    ctx.save();
    for (var k = 0; k < 2; k++) {
      var a = ang + k * Math.PI;
      var far = P(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 4.6);
      var g = ctx.createLinearGradient(p.x, p.y, far.x, far.y);
      g.addColorStop(0, 'rgba(214,160,64,0.34)');
      g.addColorStop(1, 'rgba(214,160,64,0)');
      ctx.fillStyle = g;
      var a1 = P(x + Math.cos(a - 0.13) * 7, y + Math.sin(a - 0.13) * 7, 4.6);
      var a2 = P(x + Math.cos(a + 0.13) * 7, y + Math.sin(a + 0.13) * 7, 4.6);
      Iso.poly(ctx, [p, a1, far, a2]);
    }
    ctx.restore();
  }

  /* Gates and the arch straddle a road, so each pillar is a separately sorted
     piece. A single depth key cannot put the near pillar in front of a vehicle
     and the far pillar behind it at the same time, which is what made traffic
     look like it drove over the top of these structures. */
  function drawGatePost(b) {
    Iso.box(ctx, { x: b.x - 0.22, y: b.y - 0.22, z: 0, w: 0.44, d: 0.44, h: 2.6, color: '#aab4bc' });
  }

  function drawGateBeam(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.22, y: y - 1.92, z: 2.6, w: 0.44, d: 3.84, h: 0.4, color: '#95a2ac' });
    /* the normalising curtain */
    var lit = (Sim.state.stage === 'norm1' || Sim.state.stage === 'norm2' || Sim.state.stage === 'finalnorm');
    var a = lit ? 0.55 + 0.35 * Math.sin(t * 8) : 0.16;
    for (var i = 0; i < 8; i++) {
      var py = y - 1.7 + 3.4 * (i / 7);
      Iso.box(ctx, { x: x - 0.05, y: py - 0.05, z: 1.5, w: 0.1, d: 0.1, h: 1.1, color: '#5f8bab', alpha: a });
    }
  }

  function drawPlaza(b) {
    var x = b.x, y = b.y;
    ctx.fillStyle = '#d9d3c6';
    Iso.disc(ctx, x, y, 0.06, 2.5);
    ctx.strokeStyle = Iso.rgba('#b05470', 0.6);
    ctx.lineWidth = 2;
    var p = P(x, y, 0.07);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.5 * Iso.TW * 1.414, 2.5 * Iso.TH * 1.414, 0, 0, 6.2832);
    ctx.stroke();

    Iso.cylinder(ctx, { x: x, y: y, z: 0, r: 0.95, h: 0.5, color: '#cdbcc2' });
    /* the attention obelisk */
    Iso.box(ctx, { x: x - 0.34, y: y - 0.34, z: 0.5, w: 0.68, d: 0.68, h: 3.2, color: '#b05470' });
    var act = Sim.state.attnActive;
    ctx.fillStyle = Iso.rgba('#8e3350', 0.35 + 0.6 * Math.max(act, 0.25 + 0.25 * Math.sin(t * 2.5)));
    Iso.disc(ctx, x, y, 3.75, 0.5);
    /* orbiting head markers */
    for (var i = 0; i < M.HEADS; i++) {
      var a = t * 1.3 + i * (6.2832 / M.HEADS);
      ctx.fillStyle = Iso.rgba(i ? '#c2913c' : '#4a7a9b', 0.9);
      Iso.disc(ctx, x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, 3.2 + Math.sin(a) * 0.2, 0.16);
    }
  }

  function drawBridge(b) {
    var x = b.x, y = b.y;
    var N = 9, span = 4.4;
    for (var i = 0; i < N; i++) {
      var f = i / (N - 1);
      var yy = y - span / 2 + span * f;
      var zz = Math.sin(f * Math.PI) * 1.9 + 0.15;
      Iso.box(ctx, { x: x - 0.5, y: yy - 0.26, z: zz, w: 1.0, d: 0.52, h: 0.22, color: '#b6c3cb' });
    }
    /* glowing underside: the residual stream never stops */
    ctx.strokeStyle = Iso.rgba('#3f8a86', 0.7 + 0.2 * Math.sin(t * 3));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (i = 0; i <= 20; i++) {
      var g = i / 20;
      var p = P(x, y - span / 2 + span * g, Math.sin(g * Math.PI) * 1.9 + 0.1);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    Iso.box(ctx, { x: x - 0.32, y: y - span / 2 - 0.4, z: 0, w: 0.64, d: 0.5, h: 0.7, color: '#a8b5bf' });
    Iso.box(ctx, { x: x - 0.32, y: y + span / 2 - 0.1, z: 0, w: 0.64, d: 0.5, h: 0.7, color: '#a8b5bf' });
  }

  function drawMill(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 2.6, y: y + 1.0, z: 0, w: 5.2, d: 2.2, h: 1.7, color: '#dcc6a0', windows: { cols: 6, rows: 2, seed: 41 } });
    var active = Sim.state.stage === 'ffn' ? 1 : 0;
    for (var i = 0; i < 3; i++) {
      var cx = x - 1.6 + i * 1.6;
      var hh = 2.2 + i * 0.35;
      Iso.cylinder(ctx, { x: cx, y: y + 2.0, z: 1.7, r: 0.3, h: hh, color: '#c8ab7e', ring: 0.3 });
      /* smoke */
      for (var s = 0; s < 4; s++) {
        var ph = ((t * 0.45 + s * 0.25 + i * 0.11) % 1);
        ctx.fillStyle = Iso.rgba('#9a9184', (0.3 + active * 0.3) * (1 - ph));
        Iso.disc(ctx, cx, y + 2.0, 1.7 + hh + ph * 3.0, 0.22 + ph * 0.5);
      }
    }
    /* the widen → squeeze machine */
    Iso.box(ctx, { x: x - 1.2, y: y - 1.5, z: 0, w: 2.4, d: 1.6, h: 0.9, color: '#cbb287' });
    var bars = 8;
    for (i = 0; i < bars; i++) {
      var f = i / (bars - 1);
      var hgt = 0.35 + Math.sin(f * Math.PI) * (0.9 + active * 0.5 * Math.abs(Math.sin(t * 6)));
      Iso.box(ctx, { x: x - 1.1 + f * 2.1, y: y - 1.3, z: 0.9, w: 0.2, d: 1.2, h: hgt, color: i % 2 ? '#c07a3c' : '#d99e5f' });
    }
  }

  function drawArchPillar(b) {
    Iso.box(ctx, { x: b.x - 0.25, y: b.y - 0.25, z: 0, w: 0.5, d: 0.5, h: 3.4, color: '#c49484' });
  }

  function drawArchBeam(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 1.9, y: y - 0.3, z: 3.4, w: 3.8, d: 0.6, h: 0.75, color: '#b5745e' });
    var s = Sim.state;
    /* No lettering on the lintel: it is only 0.75 units tall, so a legible sign
       overflows it and collides with the progress capsules below. The floating
       plate above the arch already reads "block n of N". */
    for (var i = 0; i < s.layers; i++) {
      var done = i < s.layer;
      Iso.box(ctx, {
        x: x - 1.75 + (i * 3.5 / s.layers), y: y - 0.32, z: 3.2, w: 3.0 / s.layers, d: 0.12, h: 0.14,
        color: done ? '#a85a44' : '#ded5cb'
      });
    }
  }

  function drawStadium(b) {
    var x = b.x, y = b.y;
    /* stands, north and south of the tower row */
    Iso.box(ctx, { x: x - 7.4, y: y + 1.4, z: 0, w: 14.8, d: 0.9, h: 0.85, color: '#c6cdba' });
    Iso.box(ctx, { x: x - 7.4, y: y + 5.1, z: 0, w: 14.8, d: 0.9, h: 1.1, color: '#c6cdba' });
    ctx.fillStyle = 'rgba(150,176,138,0.5)';
    Iso.poly(ctx, [P(x - 7.4, y + 2.3), P(x + 7.4, y + 2.3), P(x + 7.4, y + 5.1), P(x - 7.4, y + 5.1)]);
    /* floodlight masts */
    [[-7.7, 1.6], [7.7, 1.6], [-7.7, 5.6], [7.7, 5.6]].forEach(function (o) {
      Iso.box(ctx, { x: x + o[0], y: y + o[1], z: 0, w: 0.22, d: 0.22, h: 3.2, color: '#a7b09a' });
      ctx.fillStyle = Iso.rgba('#5f8a52', 0.85);
      Iso.disc(ctx, x + o[0] + 0.11, y + o[1] + 0.11, 3.35, 0.2);
    });
  }

  function drawSampler(b) {
    var x = b.x, y = b.y;
    var s = Sim.state;
    /* drum */
    Iso.cylinder(ctx, { x: x, y: y + 2.6, z: 0, r: 2.0, h: 1.0, color: '#cbbdd1', ring: 0.4 });
    var spin = s.stage === 'sample' ? t * 9 : t * 0.6;
    var p = P(x, y + 2.6, 1.02);
    ctx.save();
    for (var i = 0; i < 12; i++) {
      var a = spin + i * 0.5236;
      ctx.fillStyle = Iso.rgba('#8b5f96', i % 2 ? 0.55 : 0.22);
      var q1 = P(x + Math.cos(a) * 1.9, y + 2.6 + Math.sin(a) * 1.9, 1.02);
      var q2 = P(x + Math.cos(a + 0.5) * 1.9, y + 2.6 + Math.sin(a + 0.5) * 1.9, 1.02);
      Iso.poly(ctx, [p, q1, q2]);
    }
    ctx.restore();
    /* needle */
    var na = -spin * 0.4;
    ctx.strokeStyle = '#5c3a63';
    ctx.lineWidth = 2.5;
    var np = P(x + Math.cos(na) * 1.7, y + 2.6 + Math.sin(na) * 1.7, 1.1);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(np.x, np.y); ctx.stroke();

    /* temperature column */
    var tx = x - 3.4, ty = y + 2.4;
    Iso.cylinder(ctx, { x: tx, y: ty, z: 0, r: 0.34, h: 4.0, color: '#c6c1b4' });
    var frac = Math.min(1, s.temperature / 1.6);
    var col = Iso.mix('#4a7a9b', '#b8503a', frac);
    Iso.cylinder(ctx, { x: tx, y: ty, z: 0.1, r: 0.24, h: 0.2 + 3.7 * frac, color: col });
    /* a label plate rather than wall text, since the readout has no wall to sit on */
    if (showLabels) {
      labels.push({
        x: tx, y: ty, z: 4.2, lift: 8,
        text: 'T ' + s.temperature.toFixed(2), sub: 'top-p ' + s.topP.toFixed(2),
        color: col, size: 11.5, mono: true
      });
    }
  }

  function drawJumbotron(b) {
    var x = b.x, y = b.y;
    var sy = y + 3.2;
    Iso.box(ctx, { x: x - 2.9, y: sy - 0.2, z: 0, w: 0.4, d: 0.4, h: 1.6, color: '#a9b3bc' });
    Iso.box(ctx, { x: x + 2.5, y: sy - 0.2, z: 0, w: 0.4, d: 0.4, h: 1.6, color: '#a9b3bc' });
    Iso.box(ctx, { x: x - 3.1, y: sy - 0.3, z: 1.6, w: 6.2, d: 0.55, h: 2.9, color: '#8e9aa4' });
    /* screen face */
    ctx.fillStyle = '#f4f1e6';
    Iso.poly(ctx, [P(x - 3.0, sy + 0.25, 4.35), P(x + 3.0, sy + 0.25, 4.35), P(x + 3.0, sy + 0.25, 1.75), P(x - 3.0, sy + 0.25, 1.75)]);

    var s = Sim.state;
    var text = (s.tokens.filter(function (k) { return k.kind === 'prompt'; }).map(function (k) { return k.text; }).join('') + s.outputText).trim();
    var lines = wrap(text, 30).slice(-3);
    faceText(x - 2.85, sy + 0.26, 4.05, lines, { size: 11, color: '#3f5c39' });
    if (s.emitFlash > 0) {
      ctx.fillStyle = Iso.rgba('#5f8a52', 0.3 * s.emitFlash);
      Iso.poly(ctx, [P(x - 3.0, sy + 0.24, 4.35), P(x + 3.0, sy + 0.24, 4.35), P(x + 3.0, sy + 0.24, 1.75), P(x - 3.0, sy + 0.24, 1.75)]);
    }
  }

  function wrap(text, n) {
    var words = text.split(/\s+/), out = [], line = '';
    for (var i = 0; i < words.length; i++) {
      if ((line + ' ' + words[i]).trim().length > n) { out.push(line.trim()); line = words[i]; }
      else line += ' ' + words[i];
    }
    if (line.trim()) out.push(line.trim());
    return out.length ? out : [''];
  }

  var KIND = {
    crane: drawCrane, foundry: drawFoundry, beacon: drawBeacon,
    gatePost: drawGatePost, gateBeam: drawGateBeam,
    plaza: drawPlaza, bridge: drawBridge, mill: drawMill,
    archPillar: drawArchPillar, archBeam: drawArchBeam,
    stadium: drawStadium, sampler: drawSampler, jumbotron: drawJumbotron
  };

  /* Plant, stairwell and aerial clutter on a flat roof. Reads as a skyline
     rather than a row of blank slabs. */
  function drawRooftop(o) {
    var seed = (o.x * 31 + o.y * 17) | 0;
    var top = o.z + o.h;
    Iso.box(ctx, {
      x: o.x + o.w * 0.18, y: o.y + o.d * 0.22, z: top,
      w: o.w * 0.3, d: o.d * 0.3, h: 0.16, color: '#9aa0a6', edgeWidth: 0.8
    });
    if (Iso.hash2(seed, 3, 5) > 0.45) {
      Iso.box(ctx, {
        x: o.x + o.w * 0.55, y: o.y + o.d * 0.5, z: top,
        w: o.w * 0.3, d: o.d * 0.32, h: 0.28, color: '#8d7f6d', edgeWidth: 0.8
      });
    }
    if (Iso.hash2(seed, 7, 11) > 0.6) {
      Iso.box(ctx, {
        x: o.x + o.w * 0.48, y: o.y + o.d * 0.12, z: top,
        w: 0.06, d: 0.06, h: 0.85, color: '#6d7278', edge: false
      });
    }
  }

  /* -------------------------------------------------------------- traffic */

  /* Background cars circulating on the road network. Purely scenery: the data
     convoy is much larger, carries the vector on its flatbed and is labelled. */
  var CAR_COLOURS = ['#e8e4d8', '#c0453a', '#3f6fa8', '#e0b23c', '#4e5a63', '#8a9aa5', '#5f8a52'];
  var traffic = null;

  function buildTraffic() {
    traffic = [];
    ['intake', 'loop', 'exit'].forEach(function (name, r) {
      var route = City.routes[name];
      var n = Math.max(5, Math.round(route.total / 12));
      for (var i = 0; i < n; i++) {
        var want = 2.4 + Iso.hash2(r, i, 9) * 2.8;
        traffic.push({
          route: route,
          d: (i / n) * route.total,          /* position, now advanced per frame */
          v: want,                           /* current speed */
          want: want,                        /* speed with a clear road ahead */
          gap: Infinity,
          dir: Iso.hash2(r, i, 13) > 0.5 ? 1 : -1,
          colour: CAR_COLOURS[Math.floor(Iso.hash2(r, i, 21) * CAR_COLOURS.length)]
        });
      }
    });
  }

  /* Car following. Positions used to be a pure function of the clock, so a fast
     car simply drove through a slow one. Each car now looks at the gap to the
     one in front, in its own lane, and lifts off or stops.
     Only same route and same direction counts as the same lane, which also
     means two cars can never sit waiting for each other. */
  var STOP_GAP = 0.85;      /* bumper to bumper */
  var SLOW_GAP = 2.8;       /* start easing off here */

  function updateTraffic(dt) {
    var i, j, a, b;

    for (i = 0; i < traffic.length; i++) {
      a = traffic[i];
      var total = a.route.total;
      var nearest = Infinity;
      for (j = 0; j < traffic.length; j++) {
        if (j === i) continue;
        b = traffic[j];
        if (b.route !== a.route || b.dir !== a.dir) continue;
        /* distance to b measured forwards along a's direction of travel */
        var ahead = (((b.d - a.d) * a.dir % total) + total) % total;
        if (ahead > 0 && ahead < nearest) nearest = ahead;
      }
      a.gap = nearest;
    }

    for (i = 0; i < traffic.length; i++) {
      var c = traffic[i];
      var target = c.want;
      if (c.gap < STOP_GAP) target = 0;
      else if (c.gap < SLOW_GAP) target = c.want * (c.gap - STOP_GAP) / (SLOW_GAP - STOP_GAP);

      /* brake harder than you accelerate, the way traffic actually behaves */
      var rate = target < c.v ? 9 : 2.2;
      c.v += (target - c.v) * Math.min(1, rate * dt);

      var t2 = c.route.total;
      c.d = (((c.d + c.v * c.dir * dt) % t2) + t2) % t2;
    }
  }

  /* The route is a polyline with hard corners, so sampling it directly makes a
     car snap to a new heading and jump across to the far lane the instant it
     passes a waypoint. Averaging a sample either side rounds the turn and
     gives a heading that swings round instead of switching. */
  function sampleRoute(route, d, look) {
    var total = route.total;
    var wrap = function (v) { return ((v % total) + total) % total; };
    var a = route.at(wrap(d - look)), m = route.at(d), b = route.at(wrap(d + look));
    var hx = b.x - a.x, hy = b.y - a.y;
    var len = Math.hypot(hx, hy) || 1;
    return {
      x: (a.x + 2 * m.x + b.x) / 4,
      y: (a.y + 2 * m.y + b.y) / 4,
      z: (a.z + 2 * m.z + b.z) / 4,
      hx: hx / len, hy: hy / len
    };
  }

  function trafficAt(c) {
    var p = sampleRoute(c.route, c.d, 0.8);
    /* keep to one side of the centre line, the side depending on which way the
       car is going, so oncoming traffic does not share a lane */
    var side = 0.55 * c.dir;
    return {
      x: p.x - p.hy * side,
      y: p.y + p.hx * side,
      z: p.z,
      hx: p.hx * c.dir,          /* nose points the way it is actually going */
      hy: p.hy * c.dir,
      car: c
    };
  }

  function drawTrafficCar(v) {
    ctx.fillStyle = 'rgba(40,60,25,0.18)';
    Iso.disc(ctx, v.x, v.y, v.z + 0.02, 0.3);
    Iso.orientedBox(ctx, {
      x: v.x, y: v.y, z: v.z + 0.04, len: 0.54, wid: 0.32, h: 0.16,
      hx: v.hx, hy: v.hy, color: v.car.colour
    });
    Iso.orientedBox(ctx, {
      x: v.x - v.hx * 0.04, y: v.y - v.hy * 0.04, z: v.z + 0.2,
      len: 0.26, wid: 0.24, h: 0.11,
      hx: v.hx, hy: v.hy, color: '#8fa3b2'
    });

    /* brake lights, so a queue reads as a queue rather than a parked row */
    if (v.car.v < v.car.want * 0.55) {
      ctx.fillStyle = 'rgba(214,54,38,0.95)';
      Iso.disc(ctx, v.x - v.hx * 0.3, v.y - v.hy * 0.3, v.z + 0.14, 0.075);
    }
  }

  /* ----------------------------------------------------------- small props */

  /* Daytime street furniture: a thin pale post, no lit halo. Kept deliberately
     quiet, because at this density anything darker reads as a field of bollards. */
  function drawLamp(p) {
    Iso.box(ctx, {
      x: p.x - 0.035, y: p.y - 0.035, z: p.z, w: 0.07, d: 0.07, h: 1.0,
      color: '#c4c9cc', edge: 'rgba(88,78,64,0.16)'
    });
    ctx.fillStyle = 'rgba(150,146,134,0.75)';
    Iso.disc(ctx, p.x, p.y, p.z + 1.02, 0.07);
  }

  function drawTree(p) {
    var s = p.s;
    Iso.box(ctx, { x: p.x - 0.06, y: p.y - 0.06, z: 0, w: 0.12, d: 0.12, h: 0.35 * s, color: '#9a7f5e' });
    ctx.fillStyle = '#7d9c6a';
    Iso.disc(ctx, p.x, p.y, 0.35 * s + 0.2, 0.34 * s);
    ctx.fillStyle = '#96b380';
    Iso.disc(ctx, p.x, p.y, 0.35 * s + 0.42, 0.24 * s);
  }

  /* ------------------------------------------------------------ KV silos  */

  function drawSilo(i) {
    var s = Sim.state;
    var pos = City.siloPos(i);
    var isRecent = i >= s.cacheSize - 1;
    var wrapCount = Math.floor(i / City.SILO_MAX);
    var h = 1.5 + (wrapCount ? 0.35 : 0);
    var base = wrapCount ? '#c8c8b4' : '#cfcbb9';
    Iso.cylinder(ctx, { x: pos.x, y: pos.y, z: 0, r: 0.6, h: h, color: base, ring: 0.55 });
    var glow = isRecent && s.siloPop > 0 ? s.siloPop : 0;
    ctx.fillStyle = Iso.rgba('#6d9068', 0.6 + 0.35 * glow);
    Iso.disc(ctx, pos.x, pos.y, h + 0.02, 0.6);
    if (glow > 0) {
      ctx.fillStyle = Iso.rgba('#6d9068', 0.3 * glow);
      Iso.disc(ctx, pos.x, pos.y, 0.03, 1.1 + glow);
    }
    /* K / V bands */
    Iso.cylinder(ctx, { x: pos.x, y: pos.y, z: h, r: 0.34, h: 0.28, color: '#6d9068' });
  }

  /* --------------------------------------------------- attention beams    */

  function drawBeams() {
    var s = Sim.state;
    if (!s.attn) return;
    /* attnActive decays in about two seconds, but the Attention Plaza reading
       stop lasts ~26s, so hold the beams up for the whole stop, then let them
       fade as the convoy pulls away. */
    if (s.stage !== 'attn' && s.attnActive <= 0) return;
    var plaza = P(24, 11, 4.0);
    var maxW = 0;
    for (var i = 0; i < s.attn.length; i++) maxW = Math.max(maxW, s.attn[i]);
    if (!maxW) return;

    ctx.save();
    ctx.lineCap = 'round';
    /* hold the beams at full strength for the whole stop, then fade */
    var fade = s.stage === 'attn' ? 1 : Math.min(1, s.attnActive * 1.6);
    /* rank the weights so we can name the strongest few */
    var order = s.attn.map(function (v, ix) { return { w: v, i: ix }; })
      .sort(function (a, b) { return b.w - a.w; });

    for (i = 0; i < s.attn.length; i++) {
      var w = s.attn[i] / maxW;
      if (w < 0.045) continue;
      var pos = City.siloPos(i);
      var end = P(pos.x, pos.y, 1.9);
      var midx = (plaza.x + end.x) / 2;
      var midy = (plaza.y + end.y) / 2 - 60 - 70 * w;

      /* divide by the camera scale so beam weight reads the same at any zoom */
      var lw = (0.9 + w * 5.5) / cam.scale;

      /* a pale halo first, so a beam stays legible crossing a pale roof;
         scaled with the beam so weak ones don't become white smears */
      ctx.strokeStyle = 'rgba(255,253,247,' + (0.6 * fade) + ')';
      ctx.lineWidth = lw * 1.5 + 1.2 / cam.scale;
      ctx.beginPath();
      ctx.moveTo(plaza.x, plaza.y);
      ctx.quadraticCurveTo(midx, midy, end.x, end.y);
      ctx.stroke();

      var g = ctx.createLinearGradient(plaza.x, plaza.y, end.x, end.y);
      g.addColorStop(0, 'rgba(163,60,96,' + (0.92 * w * fade) + ')');
      g.addColorStop(1, 'rgba(78,124,74,' + (0.72 * w * fade) + ')');
      ctx.strokeStyle = g;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(plaza.x, plaza.y);
      ctx.quadraticCurveTo(midx, midy, end.x, end.y);
      ctx.stroke();

      /* travelling packet */
      var tt = ((t * 0.8 + i * 0.13) % 1);
      var bx = qbez(plaza.x, midx, end.x, tt), by = qbez(plaza.y, midy, end.y, tt);
      ctx.fillStyle = 'rgba(120,40,72,' + (0.9 * w * fade) + ')';
      ctx.beginPath();
      ctx.arc(bx, by, (1.6 + w * 2.8) / cam.scale, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();

    /* name the tokens winning the most attention */
    if (showLabels && s.stage === 'attn') {
      for (i = 0; i < Math.min(3, order.length); i++) {
        var o = order[i];
        if (o.w < 0.04) break;
        var sp = City.siloPos(o.i);
        var tok = s.tokens[o.i];
        labels.push({
          x: sp.x, y: sp.y, z: 2.0 + i * 0.7, lift: 7,
          text: tok ? M.display(tok.text) : '?',
          sub: (o.w * 100).toFixed(0) + '%',
          color: '#41633a', size: 11.5, small: true, mono: true
        });
      }
    }
  }

  function qbez(a, b, c, u) {
    var m = 1 - u;
    return m * m * a + 2 * m * u * b + u * u * c;
  }

  /* --------------------------------------------------- vocabulary towers  */

  function drawTowers() {
    var s = Sim.state;
    if (!s.candidates) return;
    var list = s.candidates.slice(0, 8);
    var max = 0;
    for (var i = 0; i < list.length; i++) max = Math.max(max, list[i].p || 0);
    if (!max) max = 1;

    var keptSet = {};
    if (s.kept) s.kept.forEach(function (k) { keptSet[k.token] = true; });

    for (i = 0; i < list.length; i++) {
      var c = list[i];
      var pos = City.towerPos(i);
      var hh = 0.35 + (c.p / max) * 4.6;
      var inNucleus = !s.kept || keptSet[c.token];
      var isChosen = s.chosen && s.chosen.token === c.token;
      var col = isChosen ? '#6f9a5e' : (inNucleus ? '#a8c095' : '#c8c5ba');
      var grow = Math.min(1, (s.stage === 'logits' ? s.stageT * 2.2 : 1));
      Iso.box(ctx, {
        x: pos.x - 0.55, y: pos.y - 0.55, z: 0, w: 1.1, d: 1.1, h: hh * grow,
        color: col,
        windows: { cols: 2, rows: Math.max(1, Math.round(hh * 1.5)), seed: i * 13 + 3, color: inNucleus ? '#4d6b45' : '#8a8778' }
      });
      if (isChosen) {
        ctx.fillStyle = Iso.rgba('#4f7a42', 0.5 + 0.3 * Math.abs(Math.sin(t * 7)));
        Iso.disc(ctx, pos.x, pos.y, hh * grow + 0.05, 0.75);
        ctx.fillStyle = Iso.rgba('#5f8a52', 0.16);
        Iso.disc(ctx, pos.x, pos.y, 0.04, 1.5);
      }
      if (showLabels) {
        /* zig-zag the plates: short towers sit close together and their
           labels would otherwise pile up on each other */
        labels.push({
          x: pos.x, y: pos.y, z: hh * grow + 0.15 + (i % 2) * 0.9, lift: 7,
          text: c.token, sub: ((c.p || 0) * 100).toFixed(1) + '%',
          color: isChosen ? '#41633a' : (inNucleus ? '#5d7a52' : '#918d80'),
          size: isChosen ? 12.5 : 11, small: true
        });
      }
    }
    /* the top-p cut line */
    if (s.kept && s.kept.length < list.length) {
      var cut = City.towerPos(s.kept.length - 0.5);
      ctx.strokeStyle = 'rgba(168,72,56,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      var a = P(cut.x, cut.y - 1.4, 0.1), bpt = P(cut.x, cut.y + 1.4, 5.4);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bpt.x, bpt.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ------------------------------------------------------------- convoy   */

  /* Diverging scale through a neutral paper tone: cool indigo for negative,
     warm terracotta for positive. Reads on a pale ground without glowing. */
  /* Returns hex, not rgb(): these colours are handed to Iso solids, which run
     them through shade(), and shade() only parses hex. */
  function vecColor(v) {
    var x = Math.max(-2.5, Math.min(2.5, v)) / 2.5;
    var m = [232, 226, 212];
    var end = x >= 0 ? [176, 74, 45] : [50, 88, 138];
    var k = Math.abs(x), out = '#';
    for (var i = 0; i < 3; i++) {
      var c = Math.round(m[i] + (end[i] - m[i]) * k);
      out += (c < 16 ? '0' : '') + c.toString(16);
    }
    return out;
  }

  function drawCar(c) {
    var s = Sim.state;
    var x = c.x, y = c.y, z = c.z;
    var lead = c.lead;

    /* shadow */
    ctx.fillStyle = 'rgba(104,92,74,0.24)';
    Iso.disc(ctx, x, y, z + 0.02, 0.55);

    /* heading, so the truck turns through a corner instead of crabbing */
    var hx = c.dx || 1, hy = c.dy || 0;

    Iso.orientedBox(ctx, {
      x: x, y: y, z: z + 0.05, len: 1.1, wid: 0.84, h: 0.26,
      hx: hx, hy: hy, color: lead ? '#6e8398' : '#93a0ab'
    });

    /* the vector itself, riding on the flatbed */
    var v = lead ? s.h : null;
    var n = M.D;
    var barLen = (1.0 / n) * 0.82;
    for (var i = 0; i < n; i++) {
      var val = v ? v[i] : Math.sin(t * 2 + i + c.idx) * 0.8;
      var hgt = 0.12 + Math.min(1.0, Math.abs(val) * 0.34);
      var u = -0.5 + (i + 0.5) / n;          /* along the truck, not along +x */
      Iso.orientedBox(ctx, {
        x: x + hx * u, y: y + hy * u, z: z + 0.31,
        len: barLen, wid: 0.6, h: hgt,
        hx: hx, hy: hy, color: vecColor(val),
        edge: false            /* packed shoulder to shoulder; outlines just muddy them */
      });
    }

    if (lead) {
      ctx.fillStyle = Iso.rgba('#37607d', 0.6 + 0.3 * Math.sin(t * 6));
      Iso.disc(ctx, x, y, z + 0.85, 0.16);
      ctx.fillStyle = 'rgba(74,122,155,0.10)';
      Iso.disc(ctx, x, y, z + 0.03, 1.5);
    }

    /* No name plate over the truck. The convoy bunches up on the road, so one
       plate per token piled into an unreadable cascade; the Context list in
       the panel already shows the tokens and highlights the current one. */
  }

  /* -------------------------------------------------------------- labels  */

  function drawLabels() {
    /* Screen space, but still dpr-scaled: ax/ay below are CSS pixels (cam.ox
       and cam.scale both come from getBoundingClientRect/innerWidth). An
       identity transform would read them as *device* pixels, so on a 2x phone
       every plate landed at half its true position and drifted against the
       city as the camera moved. */
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.textBaseline = 'middle';
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var p = P(L.x, L.y, L.z);
      /* the anchor: the point on the model this plate names */
      var ax = p.x * cam.scale + cam.ox;
      var ay = p.y * cam.scale + cam.oy;

      /* Plates stay legible rather than shrinking with the city, so they are
         always somewhat oversized when zoomed out. */
      var size = (L.size || 12) * Math.min(1.15, Math.max(0.92, cam.scale));
      ctx.font = (L.bold ? '600 ' : '') + size + 'px ' + (L.mono
        ? 'ui-monospace, Menlo, Consolas, monospace'
        : L.serif
          ? '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif'
          : 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');
      ctx.textAlign = 'center';

      var wpx = ctx.measureText(L.text).width;
      var subw = L.sub ? ctx.measureText(L.sub).width * 0.85 : 0;
      var boxW = Math.max(wpx, subw) + 16;
      var boxH = L.sub ? size * 2.4 : size * 1.75;

      /* Because of that, a plate centred on its anchor swallows the landmark
         underneath it at low zoom. Sit it on its *bottom edge* instead, a
         constant gap above the anchor, which reads identically at every zoom. */
      var lift = L.lift || 0;
      var sx = ax;
      var sy = lift ? ay - lift - boxH / 2 : ay;

      /* a leader down to the anchor, so the plate is visibly attached */
      if (lift) {
        ctx.strokeStyle = L.color ? hexA(L.color, 0.65) : 'rgba(110,98,80,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ax, sy + boxH / 2);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.fillStyle = L.color ? hexA(L.color, 0.9) : 'rgba(110,98,80,0.7)';
        ctx.beginPath();
        ctx.arc(ax, ay, 2.4, 0, 6.2832);
        ctx.fill();
      }

      /* a drop shadow lifts the plate off pale roofs and grass */
      ctx.fillStyle = 'rgba(96,84,66,0.26)';
      roundRect(sx - boxW / 2 + 1, sy - boxH / 2 + 2.5, boxW, boxH, 5);
      ctx.fill();

      /* Washed with the district's own colour rather than plain white, so a
         plate reads as belonging to the building it points at. */
      ctx.fillStyle = L.tint ? Iso.mix('#fffdf7', L.tint, 0.14) : '#fffdf7';
      roundRect(sx - boxW / 2, sy - boxH / 2, boxW, boxH, 5);
      ctx.fill();
      ctx.strokeStyle = L.tint ? hexA(L.tint, 0.9)
        : (L.color ? hexA(L.color, 0.75) : 'rgba(110,98,80,0.5)');
      ctx.lineWidth = L.tint ? 1.7 : 1.2;
      roundRect(sx - boxW / 2, sy - boxH / 2, boxW, boxH, 5);
      ctx.stroke();

      ctx.fillStyle = L.color || '#3a352e';
      ctx.fillText(L.text, sx, sy + (L.sub ? -size * 0.42 : 0));
      if (L.sub) {
        ctx.font = (size * 0.85) + 'px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillStyle = 'rgba(88,80,68,0.72)';
        ctx.fillText(L.sub, sx, sy + size * 0.62);
      }
    }
  }

  function hexA(hex, a) {
    if (hex[0] !== '#') return 'rgba(120,108,90,' + a + ')';
    return Iso.rgba(hex, a);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------------------------------------------------------- draw  */

  function key(o) { return o.x + o.y + ((o.w || 0) + (o.d || 0)) * 0.5; }

  function draw(canvas, camera, time, activeDistrict, hoverDistrict) {
    ctx = canvas.getContext('2d');
    cam = camera;
    t = time;
    /* Traffic is stepped rather than evaluated from the clock, so it needs a
       delta. Clamped so a backgrounded tab does not teleport the whole fleet. */
    frameDt = lastT === null ? 0 : Math.max(0, Math.min(0.05, time - lastT));
    lastT = time;
    labels.length = 0;

    var w = canvas.width / cam.dpr, h = canvas.height / cam.dpr;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    drawSky(w, h);

    ctx.setTransform(cam.scale * cam.dpr, 0, 0, cam.scale * cam.dpr, cam.ox * cam.dpr, cam.oy * cam.dpr);

    drawGround();
    drawZones(activeDistrict);
    drawRoads();

    /* ---- one sorted pass over everything with a footprint ---- */
    var items = [];
    var i;

    for (i = 0; i < City.buildings.length; i++) {
      var b = City.buildings[i];
      if (b.kind && KIND[b.kind]) items.push({ k: b.x + b.y, f: KIND[b.kind], a: b });
      else items.push({ k: key(b), f: Iso.box, a: b, box: true });
    }
    for (i = 0; i < City.props.length; i++) {
      var pr = City.props[i];
      items.push({ k: pr.x + pr.y, f: pr.kind === 'tree' ? drawTree : drawLamp, a: pr });
    }
    var s = Sim.state;
    for (i = 0; i < s.cacheSize; i++) {
      var sp = City.siloPos(i);
      items.push({ k: sp.x + sp.y, f: drawSilo, a: i, raw: true });
    }
    if (!traffic) buildTraffic();
    updateTraffic(frameDt);
    for (i = 0; i < traffic.length; i++) {
      var v = trafficAt(traffic[i]);
      items.push({ k: v.x + v.y, f: drawTrafficCar, a: v });
    }
    var carsPos = Sim.carPositions();
    for (i = 0; i < carsPos.length; i++) {
      items.push({ k: carsPos[i].x + carsPos[i].y + 0.2, f: drawCar, a: carsPos[i] });
    }

    items.sort(function (p, q) { return p.k - q.k; });
    for (i = 0; i < items.length; i++) {
      if (items[i].box) {
        var o = items[i].a;
        Iso.box(ctx, o);   /* daytime: windows are static glass, not blinking */
        if (o.roof) {
          Iso.gableRoof(ctx, {
            x: o.x - 0.08, y: o.y - 0.08, z: o.z + o.h,
            w: o.w + 0.16, d: o.d + 0.16, h: o.roofH || 0.45, color: o.roof
          });
        } else if (o.rooftop) {
          drawRooftop(o);
        }
        /* signage painted on the wall, so it can never collide with the
           floating district plates */
        if (o.tag) {
          faceText(o.x + o.w * 0.36, o.y + o.d + 0.01, o.z + o.h - 0.22, [o.tag], {
            size: 17, color: '#8e3350',
            panel: '#fff6f9', panelEdge: 'rgba(142,51,80,0.65)'
          });
        }
      } else if (items[i].raw) {
        items[i].f(items[i].a);
      } else {
        items[i].f(items[i].a);
      }
    }

    drawTowers();
    drawBeams();
    drawEmitBurst();

    /* District name plates. Zoomed far out (which is where a phone starts),
       every plate at once is an unreadable pile, so show only the live one. */
    if (showLabels) {
      var declutter = cam.scale < 0.36;
      for (i = 0; i < City.districts.length; i++) {
        var d = City.districts[i];
        if (d.id === 'norm' || d.id === 'res') continue;
        var isActive = d.id === activeDistrict || d.id === hoverDistrict;
        if (declutter && !isActive) continue;
        /* the two districts that carry live numbers always show them */
        var sub = isActive ? d.tag : null;
        if (d.id === 'layer') sub = 'block ' + Math.min(s.layer + 1, s.layers) + ' of ' + s.layers;
        else if (d.id === 'cache' && s.cacheSize) sub = s.cacheSize + ' token' + (s.cacheSize === 1 ? '' : 's') + ' stored';
        var anchor = plateAnchor(d);
        labels.push({
          x: anchor.x, y: anchor.y, z: anchor.z, lift: isActive ? 18 : 13,
          text: d.name, sub: sub,
          color: isActive ? d.color : '#3d3831',
          tint: d.color,
          size: isActive ? 16.5 : 14, bold: isActive, serif: true
        });
      }
    }

    drawLabels();
  }

  /* Where a district's name plate hangs. A district's *centre* is often not
     where its landmark stands: the beacon sits at y 2.6 while its zone is
     centred on y 5, the jumbotron and the sampler drum both sit south of the
     road, so anchoring on the centre leaves the plate floating off to one
     side. These anchor each plate over its actual landmark, just above the
     roofline; drawLabels() then lifts it a fixed number of screen pixels so
     the gap looks the same at every zoom. */
  var PLATE = {
    tokenize:  [6.0,  5.0,  4.2],
    embed:     [17.5, 5.0,  4.2],
    position:  [28.0, 2.6,  5.6],
    attn:      [24.0, 11.0, 4.8],
    cache:     [24.0, 14.4, 2.8],   /* just north of the silo row, not on it */
    ffn:       [23.0, 21.0, 4.0],
    layer:     [39.0, 16.0, 4.8],
    finalnorm: [36.0, 27.0, 3.6],
    logits:    [26.6, 29.0, 3.0],
    sample:    [15.0, 29.6, 1.9],
    emit:      [6.0,  30.2, 5.0],
    feedback:  [2.5,  16.0, 3.8]
  };

  function plateAnchor(d) {
    var p = PLATE[d.id];
    return p ? { x: p[0], y: p[1], z: p[2] } : { x: d.x, y: d.y, z: 3.6 };
  }

  function drawEmitBurst() {
    var s = Sim.state;
    if (s.emitFlash <= 0 || !s.lastEmitted) return;
    var f = 1 - s.emitFlash;
    var p = P(6, 27, 1 + f * 3.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(95,138,82,' + (0.32 * s.emitFlash) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8 + f * 60, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    ctx.font = '700 ' + (22) + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(58,92,48,' + s.emitFlash + ')';
    ctx.fillText(s.lastEmitted, p.x, p.y);
  }

  global.Renderer = {
    draw: draw,
    setLabels: function (v) { showLabels = v; },
    getLabels: function () { return showLabels; }
  };
})(window);
