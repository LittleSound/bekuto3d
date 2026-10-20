# Three.js 3MF Exporter

Export 3D models to 3MF format in Three.js

<!-- Some beautiful tags -->
<p align="left">
  <a href="https://www.npmjs.com/package/three-3mf-exporter">
    <img alt="npm" src="https://badgen.net/npm/v/three-3mf-exporter">
  </a>
  <a href="#usage">
    <img alt="docs" src="https://img.shields.io/badge/-docs%20%26%20demos-1e8a7a">
  </a>
  <a href="https://github.com/sponsors/LittleSound">
    <img alt="sponsors" src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86">
  </a>
</p>

While developing [Bekuto3D](https://bekuto3d.ayaka.io), I discovered that Three.js lacked support for the 3MF format, which is essential for modern 3D printing workflows. Unlike STL, 3MF supports colors, materials, and print settings metadata. This exporter bridges the gap between web development and 3D printing, making it easier for Three.js developers to create 3D printable models with rich features.

## Features

- Export Three.js models to 3MF format
- BambuStudio compatible
- Support for multiple materials and colors
- Automatic model centering on print bed
- Customizable print settings
- Flushing volumes pre-computed from filament colors (same heuristic as Bambu Studio's "Recalculate")
- Preserves model names and hierarchy

## Usage

### Basic usage

```typescript
import { exportTo3MF } from 'three-3mf-exporter'

// Parse the three.js object and generate the 3MF encoded output
const blob = await exportTo3MF(mesh)

// Download the file
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
```

### With custom print settings (BambuStudio compatible)

```typescript
const blob = await exportTo3MF(meshOrGroup, {
  printer_name: 'Bambu Lab A1',
  filament: 'Bambu PLA Basic @BBL A1',
  printableWidth: 256,
  printableDepth: 256,
  printableHeight: 256,
  printerSettingsId: 'Bambu Lab A1 0.4 nozzle',
  printSettingsId: '0.20mm Standard @BBL A1',
  seam_position: 'back',

  // Compression method, can be either 'standard' or 'none'. Default is 'standard'.
  compression: 'standard',
})

// Download the file
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
```

### Flushing volumes

The exported project settings include a `flush_volumes_matrix` computed from the filament colors, using the same color heuristic Bambu Studio applies when you click "Recalculate" in the flushing volumes dialog. Without it, Bambu Studio falls back to 280 mm³ for every color change.

```typescript
const blob = await exportTo3MF(meshOrGroup, {
  // Minimum purge added to every color change. Bambu Studio uses the printer's
  // nozzle volume: 92 for A1 / A1 mini (default), 107 for X1 / P1.
  nozzleVolume: 107,

  // Optional: scale all flushing volumes in the slicer (written as `flush_multiplier`).
  flush_multiplier: 0.8,

  // Optional: provide your own matrix (mm³, row-major n * n, from -> to) instead.
  // n is the number of exported filaments; single-material exports are padded to 2,
  // so they need 4 entries. A matrix with the wrong length is ignored.
  // flush_volumes_matrix: [0, 300, 450, 0],
})
```

The matrix is also available on its own:

```typescript
import { computeFlushVolumesMatrix } from 'three-3mf-exporter'

computeFlushVolumesMatrix(['#FF0000', '#0000FF']) // [0, 329, 485, 0]
```

Bambu Studio additionally uses measured values for some Bambu Lab palette colors, filament pairs and support materials; those are not reproduced, so a few entries may differ from what the slicer shows after "Recalculate". The computed matrix covers single-nozzle printers only (multi-nozzle printers such as the H2D store one block per nozzle). Colors may be `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`; fully transparent or unparseable colors are treated as white.

## Sponsors

<p align="center">
  <a href="https://github.com/sponsors/LittleSound">
    <img src="https://cdn.jsdelivr.net/gh/littlesound/sponsors/sponsors.svg" alt="Sponsors"/>
  </a>
</p>

<p align="center">
  This project is made possible by all the sponsors supporting my work <br>
  You can join them at my sponsors profile:
</p>
<p align="center"><a href="https://github.com/sponsors/LittleSound"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86&style=for-the-badge" alt="Sponsor" /></a></p>

## Why 3MF?

The 3MF format offers significant advantages over alternatives like STL for 3D printing:

- **Color & Material Support**: Export models with multiple colors and materials
- **Print Settings**: Embed printer-specific configurations directly in the file
- **Modern Standard**: An open, industry-supported format designed specifically for 3D printing
- **Slicer Compatibility**: Works directly with popular slicers like BambuStudio without conversion

This exporter was created to enable web developers to easily bridge the gap between Three.js projects and physical 3D printing.
