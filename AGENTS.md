Bekuto 3D is a web app that converts SVG files into 3D models (each shape gets its own depth, Z offset, and color) and exports them as STL, binary glTF, or 3MF for 3D printing and web 3D. Built with Vue 3 + Vite + TresJS (three.js) + UnoCSS. Deployed to Netlify (`netlify.toml`) and Cloudflare (`wrangler.toml`), both serving `dist/`.

It also publishes [`three-3mf-exporter`](./packages/three-3mf-exporter), a three.js 3MF exporter; the app imports it from source via a Vite/tsconfig alias.

### directory

- src/
  - main.ts, App.vue # App entry
  - pages/ # File-based routes (unplugin-vue-router), main page: index.vue
  - components/ # Auto-registered components, e.g. SvgTo3D.vue (main UI), ModelRenderer.vue, ModelExporter.vue
  - composables/ # useSvgLoader.ts (SVG parsing to shapes), useModelSize.ts, dark.ts
- packages/three-3mf-exporter/ # Published 3MF exporter (src/index.ts, test/, built with unbuild)
- test/ # App unit tests (vitest)
- notes/ # Design documents
- .github/workflows/test.yml # CI: build, test, lint, typecheck on ubuntu + windows

### commands

- `nr dev` - Dev server on port 3333
- `nr build` - Build the app to `dist/`
- `nr packages:build` - Build packages under `packages/`
- `nr test` - Run vitest
- `nr lint` / `nr typecheck` - ESLint (also formats markdown) / vue-tsc

## Research, Design, Implement - Three-Step Workflow

Design documents are stored in [notes/](./notes)

When you receive a requirement, first check if related design documents exist. If so, read them first.
If not, create corresponding design documents with appropriate folder organization.
When implementing features or fixing bugs, update design documents accordingly.

Execute each task in this order:
Step 1: Research - Find and read related design documents and source code. If no design documents exist, examine the codebase directly.
Step 2: Design - Create or update design documents, clarifying requirements and implementation approach.
Step 3: Implement - Write the code to implement the feature or fix the bug. and update design documents.

### Design Document Guidelines

- Write design documents before coding
- Document key code locations (main folder paths, entry files, etc.) for easy reference
- Focus on high-level design abstractions and important non-obvious decisions, not implementation details
- When updating for bug fixes, briefly describe what to watch for in future implementations, not fix details

## Comment Style

- Write comments in English.
- Use the `/** ... */` syntax at the beginning of a function to write comments, focusing on aspects that are not easily understood by reading the function interface.
- Avoid writing comments inside the function body unless the code logic is very complex.

## Conversation Style

- You are a coding AI catgirl. Please speak to me in a cute tone.
- When conversing with me, reply in the same language I used to ask the question.

## Code Style

- Use `invoke(() => {})` for immediately invoked function expressions instead of `;(() => {})()`
- Use `nr lint --fix` and `nr typecheck` to ensure code quality and type safety.

## ni - use the right package manager

```
# ni - pnpm install
ni vite
ni @types/node -D

# nr - pnpm run
nr dev --port=3000

# nlx - pnpm download & execute
nlx vitest

# and more:
# nup - pnpm update
# nun - pnpm remove
# nci - clean install
# nd - pnpm dedupe
# na - agent alias for pnpm

# ni -v - check pnpm, node, npm, @antfu/ni versions
```

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
