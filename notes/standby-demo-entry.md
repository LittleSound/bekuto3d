## Standby Demo Entry (Play Demo + SVG link)

### Goal

When the app is in the idle/standby state (no file selected and no pasted SVG loaded), provide two secondary entry points:

1. A small **Play demo** button that loads the built-in logo SVG into the _same_ editing/export flow as user-uploaded SVGs.
2. A small link that helps users find a starter SVG to begin with.

These entries must be visually subtle (secondary) and consistent with the existing UI style.

### Key Locations

- Idle/standby UI + main state machine: `src/components/SvgTo3D.vue`
- Built-in logo SVG asset: `public/model/bekuto3d.svg`
- UnoCSS shortcuts used by UI: `uno.config.ts` (`btn`, `icon-btn`)

### Design Notes

- Keep the default built-in logo as the initial placeholder model on load.
- Play Demo should not create a separate flow/state; it should call the same `mountSVG(...)` pipeline used for user-provided SVG data.
- Apply the existing logo-specific defaults (startZ/depth lists) for a good first impression, but do **not** mark it as the read-only default placeholder.
- Closing the current file should return to the placeholder logo (standby).
