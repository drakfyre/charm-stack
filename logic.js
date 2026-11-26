// Charm Stack: board logic (no rendering). Works in browsers and in Node (for tests).
// Grid is grid[y][x], y = 0 is the bottom row. Written in plain ES5-ish JS for old Safari.
(function (root) {
  'use strict';
  var COLS = 6, ROWS = 12;
  var T = { swap: 0.08, hang: 0.12, fall: 0.04, flash: 0.6, popEach: 0.06, danger: 3.0 };
  var nextId = 0;

  function newCell(color) {
    return { id: ++nextId, color: color, state: 'idle', t: 0, chain: false, dir: 0 };
  }

  function Board(opts) {
    opts = opts || {};
    this.rng = opts.rng || Math.random;
    this.cols = COLS; this.rows = ROWS;
    this.ncolors = opts.ncolors || 5;
    this.grid = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) row.push(null);
      this.grid.push(row);
    }
    this.rise = 0;            // 0..1 of a row
    this.speed = opts.speed || 0.09; // rows per second
    this.fast = false;
    this.chain = 1;
    this.score = 0;
    this.time = 0;
    this.over = false;
    this.danger = 0;          // seconds the stack has been touching the top
    this.stop = 0;            // "stop time" after big combos/chains
    this.events = [];
    if (!opts.empty) this.fill(opts.height || 6);
    this.next = this.makeRow();
  }
  var P = Board.prototype;

  P.get = function (x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
    return this.grid[y][x];
  };

  P.colorAt = function (x, y) { var c = this.get(x, y); return c ? c.color : -1; };

  // Pick a color that doesn't create a ready-made line with the cells left of / below it.
  P.pickColor = function (bad) {
    for (var tries = 0; tries < 30; tries++) {
      var c = Math.floor(this.rng() * this.ncolors);
      if (bad.indexOf(c) < 0) return c;
    }
    return Math.floor(this.rng() * this.ncolors);
  };

  P.fill = function (h) {
    for (var x = 0; x < COLS; x++) {
      var hx = Math.max(1, Math.min(ROWS - 4, h - 2 + Math.floor(this.rng() * 3)));
      for (var y = 0; y < hx; y++) {
        var bad = [];
        var l1 = this.colorAt(x - 1, y), l2 = this.colorAt(x - 2, y);
        if (l1 >= 0 && l1 === l2) bad.push(l1);
        var d1 = this.colorAt(x, y - 1), d2 = this.colorAt(x, y - 2);
        if (d1 >= 0 && d1 === d2) bad.push(d1);
        this.grid[y][x] = newCell(this.pickColor(bad));
      }
    }
  };

  P.makeRow = function () {
    var row = [];
    for (var x = 0; x < COLS; x++) {
      var bad = [];
      if (x >= 2 && row[x - 1].color === row[x - 2].color) bad.push(row[x - 1].color);
      var a = this.colorAt(x, 0), b = this.colorAt(x, 1);
      if (a >= 0 && a === b) bad.push(a);
      row.push(newCell(this.pickColor(bad)));
    }
    return row;
  };

  P.topFull = function () {
    var top = this.grid[ROWS - 1];
    for (var x = 0; x < COLS; x++) if (top[x]) return true;
    return false;
  };

  P.pushRow = function () {
    for (var y = ROWS - 1; y > 0; y--) this.grid[y] = this.grid[y - 1];
    this.grid[0] = this.next;
    this.next = this.makeRow();
    this.events.push({ type: 'push' });
  };

  function blocksSwap(c) { return c && c.state !== 'idle'; }

  P.canSwap = function (x, y, dir) {
    if (this.over) return false;
    var x2 = x + dir;
    if (y < 0 || y >= ROWS || x < 0 || x >= COLS || x2 < 0 || x2 >= COLS) return false;
    var a = this.grid[y][x], b = this.grid[y][x2];
    if (!a && !b) return false;
    if (blocksSwap(a) || blocksSwap(b)) return false;
    // Don't slide into a gap that something is about to fall into.
    var aboveA = this.get(x, y + 1), aboveB = this.get(x2, y + 1);
    if (!a && aboveA && (aboveA.state === 'hang' || aboveA.state === 'fall')) return false;
    if (!b && aboveB && (aboveB.state === 'hang' || aboveB.state === 'fall')) return false;
    return true;
  };

  P.swap = function (x, y, dir) {
    if (!this.canSwap(x, y, dir)) return false;
    var x2 = x + dir;
    var a = this.grid[y][x], b = this.grid[y][x2];
    this.grid[y][x] = b; this.grid[y][x2] = a;
    if (a) { a.state = 'swap'; a.t = T.swap; a.dir = dir; a.chain = false; }
    if (b) { b.state = 'swap'; b.t = T.swap; b.dir = -dir; b.chain = false; }
    this.events.push({ type: 'swap' });
    return true;
  };

  P.findMatches = function () {
    var g = this.grid, marked = [], seen = {};
    function ok(c) { return c && c.state === 'idle'; }
    function mark(x, y) {
      var k = y * COLS + x;
      if (!seen[k]) { seen[k] = true; marked.push({ x: x, y: y, c: g[y][x] }); }
    }
    var x, y, run, c, i;
    for (y = 0; y < ROWS; y++) {
      x = 0;
      while (x < COLS) {
        c = g[y][x];
        if (!ok(c)) { x++; continue; }
        run = 1;
        while (x + run < COLS && ok(g[y][x + run]) && g[y][x + run].color === c.color) run++;
        if (run >= 3) for (i = 0; i < run; i++) mark(x + i, y);
        x += run;
      }
    }
    for (x = 0; x < COLS; x++) {
      y = 0;
      while (y < ROWS) {
        c = g[y][x];
        if (!ok(c)) { y++; continue; }
        run = 1;
        while (y + run < ROWS && ok(g[y + run][x]) && g[y + run][x].color === c.color) run++;
        if (run >= 3) for (i = 0; i < run; i++) mark(x, y + i);
        y += run;
      }
    }
    // Pop order: top-left first, like reading.
    marked.sort(function (p, q) { return (q.y - p.y) || (p.x - q.x); });
    return marked;
  };

  P.update = function (dt) {
    if (this.over) return;
    this.time += dt;
    var g = this.grid, x, y, c, below;

    // 1. Timers: swaps finish, hangs start falling, clears pop.
    var removed = [];
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      c = g[y][x];
      if (!c) continue;
      if (c.state === 'swap') { c.t -= dt; if (c.t <= 0) { c.state = 'idle'; c.dir = 0; } }
      else if (c.state === 'hang') { c.t -= dt; if (c.t <= 0) { c.state = 'fall'; c.t = 0; } }
      else if (c.state === 'clear') {
        c.t -= dt;
        if (c.t <= 0) { g[y][x] = null; removed.push({ x: x, y: y, color: c.color }); }
      }
    }
    for (var r = 0; r < removed.length; r++) {
      this.events.push({ type: 'pop', x: removed[r].x, y: removed[r].y, color: removed[r].color });
      // Everything resting above a popped charm is part of a possible chain.
      for (y = removed[r].y + 1; y < ROWS; y++) {
        c = g[y][removed[r].x];
        if (!c || c.state === 'clear') break;
        if (c.state === 'idle') { c.state = 'hang'; c.t = T.hang; }
        c.chain = true;
      }
    }

    // 2. Falling, bottom-up so a cell only moves once per step.
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      c = g[y][x];
      if (!c || c.state !== 'fall') continue;
      c.t -= dt;
      if (c.t > 0) continue;
      below = y > 0 ? g[y - 1][x] : null;
      if (y > 0 && !below) { g[y - 1][x] = c; g[y][x] = null; c.t += T.fall; }
      else if (below && (below.state === 'fall' || below.state === 'hang')) { c.t = 0; }
      else { c.state = 'idle'; c.t = 0; this.events.push({ type: 'land' }); }
    }

    // 3. Unsupported idle charms start hanging / join the fall of the one below.
    for (y = 1; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      c = g[y][x];
      if (!c || c.state !== 'idle') continue;
      below = g[y - 1][x];
      if (!below) { c.state = 'hang'; c.t = T.hang; }
      else if (below.state === 'hang') { c.state = 'hang'; c.t = below.t; }
      else if (below.state === 'fall') { c.state = 'fall'; c.t = below.t; }
    }

    // 4. Matches.
    var m = this.findMatches();
    if (m.length) {
      var chained = false, i;
      for (i = 0; i < m.length; i++) if (m[i].c.chain) chained = true;
      if (chained) this.chain++;
      for (i = 0; i < m.length; i++) {
        m[i].c.state = 'clear';
        m[i].c.t = T.flash + T.popEach * (i + 1);
        m[i].c.chain = false;
      }
      var n = m.length, gained = n * 10;
      if (n >= 4) gained += (n - 3) * 30;
      if (chained) gained += 50 * this.chain * (this.chain - 1);
      this.score += gained;
      var st = 0;
      if (n >= 4) st += 0.8 + 0.1 * n;
      if (chained) st += 1.0 + 0.5 * this.chain;
      this.stop = Math.max(this.stop, st);
      var sx = 0, sy = 0;
      for (i = 0; i < n; i++) { sx += m[i].x; sy += m[i].y; }
      this.events.push({ type: 'match', count: n, chain: chained ? this.chain : 1,
        x: sx / n, y: sy / n, gained: gained, color: m[0].c.color });
    }
    // Charms that landed without matching lose their chain flag.
    var active = false;
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      c = g[y][x];
      if (!c) continue;
      if (c.state === 'idle') c.chain = false;
      if (c.chain || c.state === 'clear') active = true;
    }
    if (!active && this.chain > 1) { this.events.push({ type: 'chainEnd', chain: this.chain }); this.chain = 1; }

    // 5. Rising.
    var clearing = false;
    for (y = 0; y < ROWS && !clearing; y++) for (x = 0; x < COLS; x++) {
      c = g[y][x]; if (c && c.state === 'clear') { clearing = true; break; }
    }
    if (this.topFull()) {
      if (!clearing && this.stop <= 0) {
        this.danger += dt;
        if (this.danger >= T.danger) { this.over = true; this.events.push({ type: 'over' }); }
      }
      if (this.stop > 0 && !clearing) this.stop -= dt;
      this.rise = Math.min(this.rise, 0.999);
      return;
    }
    this.danger = 0;
    if (clearing) return;
    if (this.stop > 0 && !this.fast) { this.stop -= dt; return; }
    this.stop = 0;
    this.rise += dt * (this.fast ? 8 : this.speed);
    if (this.rise >= 1) {
      this.rise -= 1;
      if (this.fast) this.rise = 0;
      this.pushRow();
      if (this.fast) this.score += 1;
    }
    this.speed = Math.min(0.7, this.speed + dt * 0.0015);
  };

  Board.T = T;
  Board.COLS = COLS;
  Board.ROWS = ROWS;
  if (typeof module !== 'undefined' && module.exports) module.exports = Board;
  else root.CharmBoard = Board;
})(this);
