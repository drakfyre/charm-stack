# Charm Stack

A small rising-stack puzzle game for phones, made as a WebGL 2 + multitouch test.
It's set underwater: fish swim behind the board and dart away when you clear charms near them.
Built to run on older iPhones (iPhone 7 Plus, iOS 15 / Safari 15) as well as anything newer.

**Play:** https://drakfyre.github.io/charm-stack/

## How to play
- Drag a charm left or right to swap it with its neighbour (keep dragging to slide it further).
- Line up 3 or more matching charms in a row or column to clear them.
- Charms that fall into a new line make a **chain** and pause the rising stack.
- **Swipe up** (a big swipe, anywhere) to bring up a new row of charms; keep sliding up for more. Don't let the stack reach the top!
- Several fingers can drag different charms at the same time.
- **❚❚ Pause** (top left, or P / Esc) freezes the game but keeps the board visible, so you can plan your next move. Switching apps pauses automatically.
- Keyboard: arrow keys move the cursor, Space/Z swaps, X raises, P pauses.

On iPhone, use **Share → Add to Home Screen** to play full screen. On Android, the game goes full screen when you tap Play.

## Files
- `logic.js`: board rules (no rendering), also loadable in Node
- `game.js`: WebGL 2 renderer (one instanced draw for all charms, shapes drawn in the shader), input, sound
- `test/logic.test.js`: rule tests, run with `node test/logic.test.js`
- `tools/make_icons.py`: regenerates the app icons

Testing URLs: `?play` skips the title screen, `?seed=N` makes the board repeatable.
