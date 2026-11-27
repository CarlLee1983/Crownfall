# Repository Guidelines

## Project structure

Crownfall is a browser tower defense game. Put gameplay rules in `src/core/`, the deterministic TypeScript simulation. Measure game time in ticks and keep the core independent of browser APIs, Three.js, and the renderer. For changes that cross this boundary, read [ADR 0001](docs/adr/0001-headless-core-three-render.md).

Edit the map in `src/content/level.ts` and enemy stats or wave definitions in `src/content/content.ts`. Three.js code for terrain, enemies, and the camera lives in `src/render/`. The browser entry point is `src/main.ts`. Use the project’s [glossary](GLOSSARY.md) when naming gameplay concepts.

## Development commands

- `bun install --frozen-lockfile` installs the locked dependencies. CI uses Bun 1.4.4.
- `bun run dev` starts the Vite development server.
- `bun run lint` checks formatting and lint rules. Use `bun run format` to apply Biome fixes.
- `bun run typecheck` checks the headless core separately before checking the whole project.
- `bun run test` runs Vitest once.
- `bun run build` creates the production bundle. Use `bun run preview` to serve it locally.

## Coding style

Follow Biome’s two-space indentation, single quotes, and 100-column line width. Use lowercase module names such as `pathing.ts`, camelCase functions such as `parseLevel`, and PascalCase types such as `GameState`.

## Testing guidelines

Place tests beside the module as `<module>.test.ts`. For simulation changes, follow `src/core/game.test.ts`: advance a known state by a fixed number of ticks and assert the resulting state or events. Run that file with `bun run test src/core/game.test.ts`. CI has no numeric coverage threshold.

## Commits and pull requests

Follow the history’s `type: [ scope ] summary` pattern, for example `docs: [ glossary ] 新增波次與備戰`. In a pull request, describe the behavior change, link the relevant issue when available, and identify how you verified it. CI runs lint, type checking, tests, and the production build on pull requests.
