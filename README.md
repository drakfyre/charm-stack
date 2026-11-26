# Charm Stack

A small rising-stack puzzle game for phones, made as a WebGL 2 + multitouch test.
Built to run on older iPhones (iPhone 7 Plus, iOS 15 / Safari 15) as well as anything newer.

**Play:** https://drakfyre.github.io/charm-stack/

## How to play
- Drag a charm left or right to swap it with its neighbour (keep dragging to slide it further).
- Line up 3 or more matching charms in a row or column to clear them.
- Charms that fall into a new line make a **chain** and pause the rising stack.
- Hold **▲ Raise** to bring up new charms faster. Don't let the stack reach the top!
- Several fingers can drag different charms at the same time.
- Keyboard: arrow keys move the cursor, Space/Z swaps, X raises.

On iPhone, use **Share → Add to Home Screen** to play full screen. On Android, the game goes full screen when you tap Play.

## Files
- `logic.js`: board rules (no rendering), also loadable in Node
- `game.js`: WebGL 2 renderer (one instanced draw for all charms, shapes drawn in the shader), input, sound
- `test/logic.test.js`: rule tests, run with `node test/logic.test.js`
- `tools/make_icons.py`: regenerates the app icons

Testing URLs: `?play` skips the title screen, `?seed=N` makes the board repeatable.
