// Charm Stack: WebGL2 renderer + multitouch input. Plain ES5-style JS so Safari 15 (iPhone 7) is happy.
(function () {
  'use strict';
  var Board = window.CharmBoard;
  var T = Board.T, COLS = Board.COLS, ROWS = Board.ROWS;

  var canvas = document.getElementById('c');
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  var $ = function (id) { return document.getElementById(id); };
  if (!gl) { $('start').classList.add('hidden'); $('nogl').classList.remove('hidden'); return; }

  // ---------- Shaders ----------
  var VS = [
    '#version 300 es',
    'layout(location=0) in vec2 a_quad;',
    'layout(location=1) in vec4 a_rect;',   // x, y, w, h in CSS pixels (y down)
    'layout(location=2) in vec4 a_col;',    // rgb, alpha
    'layout(location=3) in vec4 a_par;',    // shape, flash, kind, highlight
    'uniform vec2 u_res;',
    'out vec2 v_uv; out vec2 v_size; out vec4 v_col; out vec4 v_par;',
    'void main(){',
    '  vec2 p = a_rect.xy + a_quad * a_rect.zw;',
    '  v_uv = a_quad * 2.0 - 1.0; v_size = a_rect.zw; v_col = a_col; v_par = a_par;',
    '  vec2 ndc = p / u_res * 2.0 - 1.0;',
    '  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 v_uv; in vec2 v_size; in vec4 v_col; in vec4 v_par;',
    'uniform float u_time;',
    'out vec4 o;',
    'float dot2(vec2 v){ return dot(v, v); }',
    'float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'float sdHeart(vec2 p){ p.x = abs(p.x);',
    '  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;',
    '  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y); }',
    'float sdStar5(vec2 p, float r, float rf){',
    '  const vec2 k1 = vec2(0.809016994375, -0.587785252292); const vec2 k2 = vec2(-0.809016994375, -0.587785252292);',
    '  p.x = abs(p.x); p -= 2.0 * max(dot(k1, p), 0.0) * k1; p -= 2.0 * max(dot(k2, p), 0.0) * k2;',
    '  p.x = abs(p.x); p.y -= r; vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);',
    '  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r); return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y); }',
    'float sdTri(vec2 p, float r){ const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k;',
    '  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;',
    '  p.x -= clamp(p.x, -2.0 * r, 0.0); return -length(p) * sign(p.y); }',
    'float shape(float s, vec2 uv){',      // uv: -1..1, y up
    '  if (s < 0.5) return sdHeart(uv / 0.62 + vec2(0.0, 0.52)) * 0.62;',
    '  if (s < 1.5) return sdStar5(uv + vec2(0.0, 0.06), 0.66, 0.45);',
    '  if (s < 2.5) { vec2 q = abs(uv) * vec2(1.0, 0.78); return (q.x + q.y - 0.56) * 0.75; }',
    '  if (s < 3.5) return length(uv) - 0.5;',
    '  return sdTri(uv + vec2(0.0, 0.1), 0.6); }',
    'void main(){',
    '  float kind = v_par.z; vec2 uv = v_uv;',
    '  if (kind < 0.5) {',                                    // charm tile
    '    float d = sdBox(uv, vec2(0.94), 0.3); float aa = fwidth(d);',
    '    float a = 1.0 - smoothstep(-aa, aa, d);',
    '    vec3 base = v_col.rgb;',
    '    vec3 col = base * (1.08 - 0.28 * (uv.y * 0.5 + 0.5));',
    '    col = mix(col, base * 0.55, smoothstep(-0.16, 0.0, d));',          // darker rim
    '    vec2 su = vec2(uv.x, -uv.y);',
    '    float s = shape(v_par.x, su); float sa = fwidth(s);',
    '    col = mix(col, base * 0.35, (1.0 - smoothstep(0.0, 0.1, s)) * 0.7);', // symbol outline
    '    col = mix(col, mix(vec3(1.0), base, 0.12), 1.0 - smoothstep(-sa, sa, s));',
    '    col += 0.22 * smoothstep(0.55, 0.0, length(uv - vec2(-0.45, -0.55)));', // gloss
    '    if (v_par.y > 0.0) col = mix(col, vec3(1.0), (0.55 + 0.45 * sin(u_time * 30.0)) * v_par.y);',
    '    if (v_par.w > 0.0) col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.1, abs(d + 0.05))) * v_par.w);',
    '    o = vec4(col, a * v_col.a);',
    '  } else if (kind < 1.5) {',                             // particle
    '    float r = length(uv); float a = pow(max(1.0 - r, 0.0), 1.5);',
    '    o = vec4(v_col.rgb + 0.3 * a, a * v_col.a);',
    '  } else if (kind < 2.5) {',                             // rounded panel, radius in px = v_par.x
    '    vec2 p = uv * v_size * 0.5; float d = sdBox(p, v_size * 0.5 - 1.0, v_par.x);',
    '    float a = 1.0 - smoothstep(-1.0, 1.0, d);',
    '    float border = 1.0 - smoothstep(0.0, 1.5, abs(d + 2.0) - 1.5);',
    '    o = vec4(mix(v_col.rgb, vec3(1.0, 0.62, 0.82) * (1.0 + v_par.w), border * 0.8), max(a * v_col.a, border));',
    '  } else if (kind < 3.5) {',                             // square ring (keyboard cursor)
    '    vec2 p = uv * v_size * 0.5; float d = abs(sdBox(p, v_size * 0.5 - 4.0, 8.0)) - 2.5;',
    '    o = vec4(v_col.rgb, (1.0 - smoothstep(-1.0, 1.0, d)) * v_col.a);',
    '  } else if (kind < 4.5) {',                             // background
    '    float t = u_time * 0.15; vec2 q = uv * vec2(v_size.x / v_size.y, 1.0);',
    '    vec3 col = mix(vec3(0.22, 0.08, 0.32), vec3(0.06, 0.03, 0.14), uv.y * 0.5 + 0.5);',
    '    for (int i = 0; i < 4; i++) { float fi = float(i);',
    '      vec2 c = vec2(sin(t * (1.0 + fi * 0.3) + fi * 2.1), cos(t * (0.8 + fi * 0.2) + fi * 1.3)) * 0.8;',
    '      col += vec3(0.5, 0.15, 0.4) * 0.12 * smoothstep(0.9, 0.0, length(q - c)); }',
    '    o = vec4(col, 1.0);',
    '  } else {',                                             // circle ring (touch marker)
    '    vec2 p = uv * v_size * 0.5; float d = abs(length(p) - v_size.x * 0.5 + 5.0) - 3.0;',
    '    o = vec4(v_col.rgb, (1.0 - smoothstep(-1.0, 1.0, d)) * v_col.a);',
    '  }',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  var uRes = gl.getUniformLocation(prog, 'u_res'), uTime = gl.getUniformLocation(prog, 'u_time');

  var MAX = 2048, FLOATS = 12;
  var data = new Float32Array(MAX * FLOATS), n = 0;
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  var ib = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ib);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  for (var a = 1; a <= 3; a++) {
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 4, gl.FLOAT, false, FLOATS * 4, (a - 1) * 16);
    gl.vertexAttribDivisor(a, 1);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function quad(x, y, w, h, r, g, b, al, p0, p1, kind, p3) {
    if (n >= MAX) return;
    var i = n * FLOATS;
    data[i] = x; data[i + 1] = y; data[i + 2] = w; data[i + 3] = h;
    data[i + 4] = r; data[i + 5] = g; data[i + 6] = b; data[i + 7] = al;
    data[i + 8] = p0; data[i + 9] = p1; data[i + 10] = kind; data[i + 11] = p3;
    n++;
  }
  function flush() {
    if (!n) return;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * FLOATS));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    n = 0;
  }

  // heart, star, diamond, circle, triangle
  var COLORS = [[1.0, 0.37, 0.64], [1.0, 0.76, 0.2], [0.25, 0.72, 1.0], [0.36, 0.82, 0.42], [0.66, 0.45, 1.0]];

  // ---------- Layout ----------
  var W = 0, H = 0, dpr = 1, cell = 40, boardX = 0, boardTop = 0, boardBottom = 0;
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    var top = $('hud').getBoundingClientRect().bottom + 6;
    var bottom = H - $('raise').getBoundingClientRect().top + 10;
    cell = Math.floor(Math.min((W - 24) / COLS, (H - top - bottom) / ROWS));
    boardX = Math.round((W - cell * COLS) / 2);
    boardTop = Math.round(top + ((H - top - bottom) - cell * ROWS) / 2);
    boardBottom = boardTop + cell * ROWS;
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 300); });

  // ---------- Game state ----------
  var board = null, state = 'title', best = 0, particles = [], time = 0;
  var cursor = { x: 2, y: 3 }, keyRaise = false;
  try { best = parseInt(localStorage.getItem('charmstack.best') || '0', 10) || 0; } catch (e) {}
  $('best').textContent = best;

  // ?seed=N gives the same board every time (for testing).
  var seedMatch = /[?&]seed=(\d+)/.exec(location.search);
  function makeRng() {
    if (!seedMatch) return Math.random;
    var st = parseInt(seedMatch[1], 10) >>> 0;
    return function () { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  }
  function newGame() {
    board = new Board({ rng: makeRng() });
    particles = [];
    cursor = { x: 2, y: 3 };
    state = 'play';
    $('over').classList.add('hidden');
    showPaused(false);
  }

  // ---------- Pause (the board stays visible on purpose: peeking is allowed!) ----------
  var pauseBtn = $('pause');
  function showPaused(on) {
    pauseBtn.classList.toggle('paused', on);
    pauseBtn.innerHTML = on ? '&#9654;' : '&#10074;&#10074;';
    pauseBtn.setAttribute('aria-label', on ? 'Resume' : 'Pause');
    $('pausedTag').classList.toggle('hidden', !on);
  }
  function setPaused(on) {
    if (on && state === 'play') { state = 'paused'; for (var id in pointers) pointers[id].cell = null; }
    else if (!on && state === 'paused') { state = 'play'; }
    else return;
    showPaused(state === 'paused');
  }
  pauseBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); });
  pauseBtn.addEventListener('pointerup', function (e) {
    e.preventDefault(); initAudio();
    setPaused(state === 'play');
  });
  // Switching apps or locking the phone pauses automatically.
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPaused(true); });

  // ---------- Audio (starts on first tap, required by iOS) ----------
  var ac = null;
  function initAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      var buf = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource();
      src.buffer = buf; src.connect(ac.destination); src.start(0);
    } catch (e) { ac = null; }
  }
  function beep(freq, dur, type, vol, delay) {
    if (!ac) return;
    var t = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------- Fullscreen ----------
  function goFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      try {
        var p = req.call(el, { navigationUI: 'hide' });
        if (p && p.then) p.then(lockPortrait, function () {});
      } catch (e) {}
    }
  }
  function lockPortrait() {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () {}); } catch (e) {}
  }
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (isIOS && !standalone) $('ioshint').style.display = 'block';

  function startPressed(e) {
    e.preventDefault();
    initAudio();
    goFullscreen();
    $('start').classList.add('hidden');
    newGame();
    setTimeout(layout, 250);
  }
  $('play').addEventListener('pointerup', startPressed);
  $('again').addEventListener('pointerup', startPressed);

  // ---------- Multitouch input ----------
  // Each finger (pointerId) grabs its own charm and drags it sideways, so several fingers can work at once.
  var pointers = {};
  function activeCount() { var k = 0; for (var id in pointers) k++; return k; }

  function cellAt(px, py) {
    var rise = board ? board.rise : 0;
    var gx = Math.floor((px - boardX) / cell);
    var gy = Math.floor((boardBottom - rise * cell - py) / cell);
    return { x: gx, y: gy };
  }
  function findCell(c) {
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (board.grid[y][x] === c) return { x: x, y: y };
    return null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    initAudio();
    var p = { x: e.clientX, y: e.clientY, cell: null, tx: 0 };
    pointers[e.pointerId] = p;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (state !== 'play') return;
    var g = cellAt(e.clientX, e.clientY);
    var c = board.get(g.x, g.y);
    if (c && c.state !== 'clear') { p.cell = c; p.tx = g.x; }
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    p.tx = Math.max(0, Math.min(COLS - 1, Math.floor((e.clientX - boardX) / cell)));
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Drag-through swapping: each frame, move each grabbed charm one step toward its finger.
  function stepDrags() {
    for (var id in pointers) {
      var p = pointers[id];
      if (!p.cell) continue;
      var at = findCell(p.cell);
      if (!at || p.cell.state === 'clear') { p.cell = null; continue; }
      if (p.tx !== at.x) {
        var dir = p.tx > at.x ? 1 : -1;
        if (board.swap(at.x, at.y, dir)) beep(660, 0.05, 'triangle', 0.06);
      }
    }
  }

  // Raise button: hold to speed the stack up (each finger counted separately).
  var raisePointers = {};
  var raiseBtn = $('raise');
  function raiseHeld() { for (var k in raisePointers) return true; return false; }
  raiseBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault(); initAudio();
    raisePointers[e.pointerId] = 1; raiseBtn.classList.add('held');
    try { raiseBtn.setPointerCapture(e.pointerId); } catch (err) {}
  });
  function raiseUp(e) { delete raisePointers[e.pointerId]; if (!raiseHeld()) raiseBtn.classList.remove('held'); }
  raiseBtn.addEventListener('pointerup', raiseUp);
  raiseBtn.addEventListener('pointercancel', raiseUp);

  // Block iOS page zoom / scroll gestures.
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Keyboard: arrows move a 2-wide cursor, space/Z swaps, X raises.
  window.addEventListener('keydown', function (e) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (state === 'play' || state === 'paused') { setPaused(state === 'play'); e.preventDefault(); }
      return;
    }
    if (state === 'paused') return;
    if (state !== 'play') { if (e.key === 'Enter' || e.key === ' ') startPressed(e); return; }
    var k = e.key;
    if (k === 'ArrowLeft') cursor.x = Math.max(0, cursor.x - 1);
    else if (k === 'ArrowRight') cursor.x = Math.min(COLS - 2, cursor.x + 1);
    else if (k === 'ArrowUp') cursor.y = Math.min(ROWS - 1, cursor.y + 1);
    else if (k === 'ArrowDown') cursor.y = Math.max(0, cursor.y - 1);
    else if (k === ' ' || k === 'z' || k === 'Z') { if (board.swap(cursor.x, cursor.y, 1)) beep(660, 0.05, 'triangle', 0.06); }
    else if (k === 'x' || k === 'X') keyRaise = true;
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { if (e.key === 'x' || e.key === 'X') keyRaise = false; });

  // ---------- Effects ----------
  function popup(text, x, y) {
    var d = document.createElement('div');
    d.className = 'pop'; d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1200);
  }
  function cellCenter(x, y) {
    return { x: boardX + (x + 0.5) * cell, y: boardBottom - (y + 0.5) * cell - board.rise * cell };
  }
  function handleEvents() {
    var ev = board.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'match') {
        var semis = [0, 4, 7, 12, 16, 19, 24];
        beep(523.25 * Math.pow(2, semis[Math.min(e.chain - 1, 6)] / 12), 0.25, 'sine', 0.14);
        var c = cellCenter(e.x, e.y);
        if (e.chain > 1) popup('Chain ×' + e.chain + '!', c.x, c.y);
        else if (e.count > 3) popup(e.count + ' Combo!', c.x, c.y);
      } else if (e.type === 'pop') {
        var p = cellCenter(e.x, e.y), col = COLORS[e.color];
        for (var k = 0; k < 10; k++) {
          var ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180;
          particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80,
            life: 0.5 + Math.random() * 0.4, age: 0, size: cell * (0.15 + Math.random() * 0.2), col: col });
        }
        beep(880 + Math.random() * 300, 0.07, 'square', 0.03);
      } else if (e.type === 'push') {
        if (cursor.y < ROWS - 1) cursor.y++;
      } else if (e.type === 'over') {
        state = 'over';
        if (board.score > best) {
          best = board.score;
          try { localStorage.setItem('charmstack.best', String(best)); } catch (err) {}
        }
        $('final').textContent = 'Score: ' + board.score + '   ·   Best: ' + best;
        setTimeout(function () { $('over').classList.remove('hidden'); }, 700);
        beep(392, 0.3, 'triangle', 0.12); beep(330, 0.3, 'triangle', 0.12, 0.25); beep(262, 0.5, 'triangle', 0.12, 0.5);
      }
    }
    ev.length = 0;
  }

  // ---------- Drawing ----------
  function drawTile(c, gx, gy, alphaMul, dim, hl) {
    var vx = gx, vy = gy;
    if (c.state === 'swap') vx -= c.dir * (c.t / T.swap);
    else if (c.state === 'fall') vy += Math.max(0, Math.min(1, c.t / T.fall));
    var px = boardX + vx * cell, py = boardBottom - (vy + 1) * cell - board.rise * cell;
    if (board.danger > 0 && gy >= ROWS - 3) px += Math.sin(time * 50 + gx) * 2;
    var col = COLORS[c.color], flash = 0, al = alphaMul, grow = hl ? 3 : 0;
    if (c.state === 'clear') {
      flash = 1;
      if (c.t < 0.08) al *= c.t / 0.08;
    }
    quad(px + 1 - grow, py + 1 - grow, cell - 2 + grow * 2, cell - 2 + grow * 2,
      col[0] * dim, col[1] * dim, col[2] * dim, al, c.color, flash, 0, hl ? 1 : 0);
  }

  function render() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uTime, time);
    gl.clearColor(0.1, 0.04, 0.18, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var danger = board ? Math.min(1, board.danger / T.danger) : 0;
    quad(0, 0, W, H, 0, 0, 0, 1, 0, 0, 4, 0);
    var pulse = danger > 0 ? 0.5 + 0.5 * Math.sin(time * 12) : 0;
    quad(boardX - 8, boardTop - 8, cell * COLS + 16, cell * ROWS + 16,
      0.05 + 0.4 * danger * pulse, 0.02, 0.09, 0.75, 12, 0, 2, danger * pulse);
    flush();

    if (board) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.floor(boardX * dpr), Math.floor((H - boardBottom) * dpr),
        Math.ceil(cell * COLS * dpr), Math.ceil(cell * ROWS * dpr));
      var held = {};
      for (var id in pointers) if (pointers[id].cell) held[pointers[id].cell.id] = true;
      for (var x = 0; x < COLS; x++) drawTile(board.next[x], x, -1, 1, 0.45, false);
      for (var y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
        var c = board.grid[y][x];
        if (c) drawTile(c, x, y, 1, 1, !!held[c.id]);
      }
      // keyboard cursor
      if (state === 'play' && usedKeyboard) {
        var cy = boardBottom - (cursor.y + 1) * cell - board.rise * cell;
        quad(boardX + cursor.x * cell - 2, cy - 2, cell * 2 + 4, cell + 4, 1, 1, 1, 0.95, 0, 0, 3, 0);
      }
      flush();
      gl.disable(gl.SCISSOR_TEST);
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i], k = 1 - p.age / p.life;
      quad(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2, p.col[0], p.col[1], p.col[2], k, 0, 0, 1, 0);
    }
    // a ring under every finger: shows multitouch is working
    for (id in pointers) {
      var q = pointers[id], r = 34;
      quad(q.x - r, q.y - r, r * 2, r * 2, 1, 0.85, 0.95, 0.55, 0, 0, 5, 0);
    }
    flush();
  }

  var usedKeyboard = false;
  window.addEventListener('keydown', function () { usedKeyboard = true; });
  canvas.addEventListener('pointerdown', function () { usedKeyboard = false; });

  // Only touch the DOM when a number actually changes (cheap on old phones).
  var shown = {};
  function setText(id, v) { if (shown[id] !== v) { shown[id] = v; $(id).textContent = v; } }

  // ---------- Main loop ----------
  var last = 0;
  function frame(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now; time += dt;
    if (board && state === 'play') {
      stepDrags();
      board.fast = raiseHeld() || keyRaise;
      board.update(dt);
      handleEvents();
      setText('score', board.score);
      setText('lvl', 1 + Math.floor((board.speed - 0.09) / 0.05));
      if (board.score > best) setText('best', board.score);
    }
    setText('touches', activeCount());
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
    render();
    requestAnimationFrame(frame);
  }

  layout();
  board = new Board(); // a board behind the title screen
  if (/[?&]play\b/.test(location.search)) { $('start').classList.add('hidden'); newGame(); }
  requestAnimationFrame(frame);
})();
