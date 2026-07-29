# MTG Engine (CHIP-8)

A front-end game creation environment for vanilla CHIP-8, built as part of the Make Tiny Games (MTG) suite.

## Features

- Sprite editor with save/load
- Custom scripting language that compiles to CHIP-8 opcodes
- Live debug panel with register values mapped to variable names
- Sprite preview canvas
- Packaged CHIP-8 emulator

## Running from Source

Requires Node.js and pnpm.

```bash
pnpm install
pnpm start
```

## Building

```bash
pnpm build
```

Outputs an AppImage to `dist/`.

## Scripting Language

See [CHIP8-SCRIPT-SPEC.md](CHIP8-SCRIPT-SPEC.md) for the full language reference.

## Platform Support

Currently Linux only. Windows support planned.

## License

MIT — see [LICENSE.md](LICENSE.md)