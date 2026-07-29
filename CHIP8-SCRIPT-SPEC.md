# CHIP-8 Script Language Specification

A high-level scripting language that compiles to CHIP-8 opcodes. Designed to be approachable while teaching real hardware concepts.

---

## Basics

- Statements end with a semicolon `;`
- Blocks use curly braces `{ }`
- Comments use `#`
- Case sensitive

```
# This is a comment
let x = 10;  # inline comment
```

---

## Variables

Variables are automatically assigned to registers (V0-VE). VF is reserved for hardware flags and should not be used as a general variable.

### Auto assignment
The compiler picks the next available register:
```
let x = 10;
let y = 20;
let score = 0;
```

### Manual assignment
Use `->` to specify which register to use:
```
let x = 10 -> V0;
let y = 20 -> V1;
```

### Direct register access
Use `*` to read or write a register directly:
```
let x = *V0 + 5;   # read V0 and add 5
let *VF = 0;        # write 0 directly to VF
```

### Register limits
- 15 registers available (V0-VE)
- VF is the hardware flag register — collision and carry results land here
- VD and VE are used internally as temp registers by the compiler
- You have roughly 12 registers for general use

---

## Math

```
let x = x + 5;    # addition
let x = x - 2;    # subtraction
let x = x & 0x0F; # AND (useful for masking)
let x = x | 0xF0; # OR
let x = x ^ 0xFF; # XOR (toggles bits)
```

All values are unsigned bytes (0-255). Overflow wraps around.

---

## Random Numbers

```
let x = random & 0xFF;   # random 0-255
let x = random & 0x3F;   # random 0-63 (screen width)
let x = random & 0x1F;   # random 0-31 (screen height)
```

The mask limits the range. `random & 0x0F` gives 0-15, etc.

---

## Comparisons

```
if x == 10 { }    # equal
if x != 10 { }    # not equal
if x > 10  { }    # greater than
if x < 10  { }    # less than
```

With else:
```
if x == 0 {
    let x = 10;
} else {
    let x = x - 1;
}
```

---

## Loops

Infinite loop — use this for your main game loop:
```
loop {
    # game logic here
}
```

There is no built-in break. Use subroutines and timer waits to control flow.

---

## Subroutines

Define reusable blocks of code:
```
define moveUp {
    let y = y - 2;
}

define moveDown {
    let y = y + 2;
}
```

Call them:
```
call moveUp;
call moveDown;
```

**Note:** Registers are global. Set up any values the subroutine needs before calling it. Define subroutines before the main loop.

---

## Drawing

### Draw a sprite
```
draw (spriteName) at x, y;
```

Draws the named sprite with its natural height at position (x, y).

### Draw with custom height
```
draw (spriteName) at x, y down 3;
```

Draws only 3 rows of the sprite.

### Clear the screen
```
clear screen;
```

### How drawing works
CHIP-8 uses XOR drawing — drawing a sprite twice in the same position erases it. This is how sprites are moved:

```
draw (man) at x, y;    # draw at current position
let x = x + 2;         # update position
draw (man) at x, y;    # draw at new position (previous auto-erased next frame)
```

### Screen dimensions
- Width: 64 pixels (0-63)
- Height: 32 pixels (0-31)
- Sprites wrap around screen edges

---

## Collision Detection

After any draw, VF is set to 1 if any pixels were toggled off (collision), or 0 if not.

**Important:** Save VF immediately after the draw — subsequent operations will overwrite it.

### Correct collision pattern
```
draw (man) at x, y;    # draw — VF set by collision
let hit = *VF;          # save VF before anything overwrites it
let *VF = 0;            # clear VF so erase draw doesn't affect hit
draw (man) at x, y;    # erase at same position

if hit == 1 {
    # collision happened!
}
```

### What causes false collisions
- Erasing a sprite (XOR off) sets VF=1 because pixels are going from on to off
- Always clear VF before the erase draw and save it beforehand

---

## Input

Check if a key is currently held:
```
if key(w) pressed {
    let y = y - 2;
}

if key(s) released {
    # key was just released
}
```

### Key mapping
The CHIP-8 keypad maps to your keyboard like this:

```
CHIP-8    Keyboard
1 2 3 C   1 2 3 4
4 5 6 D   Q W E R
7 8 9 E   A S D F
A 0 B F   Z X C V
```

So `key(w)` checks CHIP-8 key 5, which is the W key on your keyboard.

---

## Timers

### Delay timer
Counts down from a value to 0 at 60Hz. Use it to control game speed:
```
timer.delay = 10;    # set delay timer to 10 frames
wait timer.delay;    # stall until timer reaches 0
```

### Sound timer
Beeps while nonzero:
```
timer.sound = 30;    # beep for 30 frames (half a second)
```

Example, showing short, intermittent beeps:
`
timer.sound = 10;   # beep for ~10 frames

loop {
    timer.sound = 10;
    timer.delay = 10;
    wait timer.delay;
    timer.delay = 30;
    wait timer.delay;
}`

---

## Memory (Store/Load)

Registers are fast but limited. Store values to RAM when you need more space:
```
store score to savedScore;     # write register to RAM
load savedScore into score;    # read RAM back into register
```

Named addresses are allocated automatically by the compiler and tracked in `output.map`.

---

## The Map File

After compiling, `output.map` shows where everything lives:

```json
{
  "registers": {
    "x": "V0",
    "y": "V1",
    "score": "V2"
  },
  "memory": {
    "savedScore": "0x400"
  },
  "sprites": {
    "man": "0x202"
  },
  "labels": {
    "moveUp": "0x21A"
  }
}
```

Use this for debugging — cross-reference with the live register display in the engine.

---

## Full Example

A simple game where a character moves around the screen and teleports on collision:

```
# Starting position
let x = random & 0x3F;
let y = random & 0x1F;

# Draw a static obstacle
let ox = 30;
let oy = 15;
draw (obstacle) at ox, oy;

# Subroutines
define moveLeft  { let x = x - 2; }
define moveRight { let x = x + 2; }
define moveUp    { let y = y - 2; }
define moveDown  { let y = y + 2; }

# Main game loop
loop {
    draw (man) at x, y;
    let hit = *VF;
    let *VF = 0;
    draw (man) at x, y;

    if hit == 1 {
        let x = random & 0x3F;
        let y = random & 0x1F;
    }

    if key(a) pressed { call moveLeft;  }
    if key(d) pressed { call moveRight; }
    if key(w) pressed { call moveUp;    }
    if key(s) pressed { call moveDown;  }

    timer.delay = 4;
    wait timer.delay;
}
```

---

## Gotchas

- **VF gets clobbered constantly** — save it immediately after any draw
- **Registers are global** — subroutines share all registers with the caller
- **Values are bytes** — 0-255 only, overflow wraps silently
- **XOR drawing** — drawing a sprite twice erases it
- **VD and VE are compiler temps** — don't use them as variables
- **Define before use** — subroutines must be defined before the main loop
- **Screen is 64x32** — coordinates outside this range wrap around
