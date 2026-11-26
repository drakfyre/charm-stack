// Run: node test/logic.test.js
'use strict';
var Board = require('../logic.js');
var assert = require('assert');

function seeded(s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function cell(color) { return { id: Math.random(), color: color, state: 'idle', t: 0, chain: false, dir: 0 }; }
function run(b, secs) { for (var t = 0; t < secs; t += 1 / 60) { b.update(1 / 60); } }
function count(b) { var n = 0; b.grid.forEach(function (r) { r.forEach(function (c) { if (c) n++; }); }); return n; }
var passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok - ' + name); }

test('fresh boards start with no ready-made matches', function () {
  for (var s = 1; s < 200; s++) {
    var b = new Board({ rng: seeded(s) });
    assert.strictEqual(b.findMatches().length, 0, 'seed ' + s);
  }
});

test('a horizontal line of 3 clears and scores', function () {
  var b = new Board({ empty: true, rng: seeded(1) });
  b.grid[0][0] = cell(1); b.grid[0][1] = cell(1); b.grid[0][2] = cell(2); b.grid[0][3] = cell(1);
  assert.ok(b.swap(2, 0, 1));
  run(b, 2);
  assert.strictEqual(b.score, 30);
  assert.deepStrictEqual([0, 1, 2, 3].map(function (x) { return b.colorAt(x, 0); }), [-1, -1, -1, 2]);
});

test('swap rules: no empty-empty, no out of bounds, no busy cells', function () {
  var b = new Board({ empty: true });
  assert.ok(!b.swap(0, 0, 1));
  b.grid[0][5] = cell(0);
  assert.ok(!b.swap(5, 0, 1));
  assert.ok(b.swap(5, 0, -1));
  assert.ok(!b.swap(4, 0, 1), 'cell mid-swap cannot be swapped again');
});

test('a charm swapped over a gap falls', function () {
  var b = new Board({ empty: true, speed: 0 });
  b.grid[0][0] = cell(0); b.grid[1][0] = cell(1);
  b.grid[0][1] = null;
  assert.ok(b.swap(0, 1, 1));
  run(b, 1);
  assert.strictEqual(b.colorAt(1, 0), 1);
  assert.strictEqual(b.colorAt(1, 1), -1);
});

// Row 0: 4 2 1 3 1 1, swap x2<->x3 -> 4 2 3 1 1 1 clears x3..x5.
// Column 3 then drops 2,0 so the 0 lands at (3,1) next to the 0s at (1,1),(2,1): a x2 chain.
function chainBoard() {
  var b = new Board({ empty: true, speed: 0 });
  b.grid[0] = [cell(4), cell(2), cell(1), cell(3), cell(1), cell(1)];
  b.grid[1][1] = cell(0); b.grid[1][2] = cell(0);
  b.grid[1][3] = cell(2); b.grid[2][3] = cell(0);
  assert.strictEqual(b.findMatches().length, 0);
  assert.ok(b.swap(2, 0, 1));
  return b;
}

test('a chain is counted when falling charms make a new line', function () {
  var b = chainBoard();
  var maxChain = 1, ends = 0;
  for (var i = 0; i < 300; i++) {
    b.update(1 / 60);
    b.events.forEach(function (e) { if (e.type === 'match') maxChain = Math.max(maxChain, e.chain); if (e.type === 'chainEnd') ends++; });
    b.events.length = 0;
  }
  assert.strictEqual(maxChain, 2);
  assert.strictEqual(ends, 1);
  assert.strictEqual(b.chain, 1);
  assert.strictEqual(b.score, 30 + 30 + 100);
  assert.strictEqual(b.colorAt(3, 0), 2);
  assert.strictEqual(b.colorAt(1, 1), -1);
});

test('plain landings without a match are not chains', function () {
  var b = new Board({ empty: true, speed: 0 });
  b.grid[0][0] = cell(0); b.grid[1][0] = cell(1);
  b.swap(0, 1, 1); // drops a 1 next to nothing
  for (var i = 0; i < 120; i++) { b.update(1 / 60); b.events.length = 0; }
  assert.strictEqual(b.chain, 1);
  assert.strictEqual(b.score, 0);
});

test('stack rises, then a full stack ends the game after the danger timer', function () {
  var b = new Board({ rng: seeded(7), speed: 0.5 });
  var n0 = count(b), pushed = 0, over = false;
  for (var i = 0; i < 60 * 120 && !over; i++) {
    b.update(1 / 60);
    b.events.forEach(function (e) { if (e.type === 'push') pushed++; if (e.type === 'over') over = true; });
    b.events.length = 0;
  }
  assert.ok(pushed > 0);
  assert.ok(over, 'game should end when nobody plays');
  assert.ok(b.topFull());
  assert.ok(count(b) > n0);
});

test('random play never corrupts the grid', function () {
  var rng = seeded(42);
  for (var g = 0; g < 20; g++) {
    var b = new Board({ rng: seeded(g + 100) });
    for (var i = 0; i < 60 * 60 && !b.over; i++) {
      if (rng() < 0.3) b.swap(Math.floor(rng() * 6), Math.floor(rng() * Board.ROWS), rng() < 0.5 ? -1 : 1);
      b.fast = rng() < 0.05;
      b.update(1 / 60);
      b.events.length = 0;
      var ids = {};
      for (var y = 0; y < Board.ROWS; y++) for (var x = 0; x < Board.COLS; x++) {
        var c = b.grid[y][x];
        if (!c) continue;
        assert.ok(!ids[c.id], 'same cell twice in grid');
        ids[c.id] = 1;
        assert.ok(['idle', 'swap', 'hang', 'fall', 'clear'].indexOf(c.state) >= 0);
        assert.ok(!(y > 0 && c.state === 'idle' && !b.grid[y - 1][x]), 'idle charm floating after update');
      }
    }
  }
});

console.log(passed + ' tests passed');
