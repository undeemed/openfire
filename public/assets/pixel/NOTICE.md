# Pixel asset attribution

Character and floor sprites in this directory are derived from the
[pixel-agents](https://github.com/pablodelucca/pixel-agents) project by
@pablodelucca, MIT licensed.

Characters in `characters/char_*.png` are themselves derived from
[JIK-A-4 — Metro City Free Topdown Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

Sprite sheet layout (per `char_*.png`, 112×96):
- 16×32 frames, 7 columns × 3 rows
- Row 0: down direction · Row 1: up · Row 2: right (left = horizontal flip)
- Frame indices per direction:
  - 0/2: walk poses · 1: idle (also walk middle)
  - 3/4: typing animation
  - 5/6: reading animation
