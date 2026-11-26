## Standby Demo Entry (Play Demo + SVG link)

### Goal

When the app is in the idle/standby state (no file selected and no pasted SVG loaded), provide two secondary entry points:

1. A small **Play demo** button that loads the built-in logo SVG into the _same_ editing/export flow as user-uploaded SVGs.
2. An Iconify library picker for importing a remote icon directly into the editor.

These entries must be visually subtle (secondary) and consistent with the existing UI style.

### Key Locations

- Idle/standby UI + main state machine: `src/components/SvgTo3D.vue`
- Built-in logo SVG asset: `public/model/bekuto3d.svg`
- UnoCSS shortcuts used by UI: `uno.config.ts` (`btn`, `icon-btn`)

### Design Notes

- Keep the default built-in logo as the initial placeholder model on load.
- Keep root-relative URLs for assets in `public/` as browser URLs in Vue templates. Importing them as modules can produce drive-less file URLs when Vitest loads the editor on Windows.
- Play Demo should not create a separate flow/state; it should call the same shape-mounting pipeline used for user-provided SVG data.
- Load the foreground relief depths and the editable rounded-square base preset together for both standby and Play demo.
- Closing the current file should return to the placeholder logo (standby).

### Iconify library

- The Browse Iconify button displays the [Iconify brand mark from Simple Icons](https://cdn.simpleicons.org/iconify) in the button’s text color. Bundle this single mark locally so the entry is recognizable before the picker contacts the API.
- `src/components/IconifyPicker.vue` opens a modal from the standby panel. Collection highlights use an ordered list of Iconify IDs in `src/iconify/catalog.ts`. Lead with Vue and Vite, then mix ecosystem tools with language marks from systems, mobile, scripting, and scientific computing so the first page represents several communities. Prefer compact silhouettes and flat fills that translate clearly into small magnets. Only the IDs ship with the app.
- Opening the picker loads the public collections directory. Users can search across collections, narrow to one collection, or page through its visible icons.
- Use the [public Iconify API](https://iconify.design/docs/api/queries.html) for the directory, collection lists, search results, and SVGs. The official Vue client batches the current page’s previews by collection and reuses the downloaded geometry on import. Keep catalog data out of the application bundle and initial page load.
- Show the selected icon's identifier and collection license before import. Use an explicit color for monochrome SVGs while preserving authored colors. Pass the SVG through the same shape loader as uploads and use the icon identifier to name exports.
- Keep the dialog open on network errors or icons without convertible paths. Cancel obsolete requests when the query changes or the picker closes. The current model is replaced only after successful conversion.
