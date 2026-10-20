# Dependency upgrade (2026-10)

Toolchain baseline after the upgrade: Vite 8 (Rolldown), Vitest 5, Vue Router 5 (file-based routing built in), TresJS 5, three r186, ESLint 10 + @antfu/eslint-config 9, pnpm 12.

## Key locations

- `vite.config.ts` - file-based routing now comes from `vue-router/vite` and `vue-router/unplugin` (`unplugin-vue-router` is deprecated and removed).
- `pnpm-workspace.yaml` - pnpm settings (`allowBuilds`, `overrides`, `peerDependencyRules`); the `pnpm` field in `package.json` is no longer read by pnpm.
- `src/components/ModelRenderer.vue` - TresJS event bindings.

## Non-obvious decisions

- **TypeScript is pinned to 6.x.** TypeScript 7 is the native (Go) compiler and no longer exposes `typescript/lib/tsc`, which `vue-tsc` requires. Revisit when vue-tsc supports TS 7.
- **`baseUrl` was removed from `tsconfig.json`** (deprecated in TS 6); `paths` entries are relative to the tsconfig instead.
- **TresJS 5 events use DOM names** (`@pointerenter`, `@pointerleave`, `@pointermissed`) and pass a `TresPointerEvent` from `@pmndrs/pointer-events`. These events are processed in the render loop, so they arrive slightly after the native DOM event.
- **`tinypool` override** - `eslint-plugin-format` -> `oxfmt@0.35` pins a vulnerable `tinypool`; remove the override when upstream bumps it.
- **`.gitattributes` forces LF** so formatter lint rules behave the same on Windows CI checkouts.
- Remaining `pnpm audit` findings come from `potrace` -> `jimp@0.x` (`phin`, `file-type`) and `@eslint/markdown` -> `katex`; `potrace` is unmaintained, so fixing them means replacing it.
