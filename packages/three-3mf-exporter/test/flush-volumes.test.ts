import { describe, expect, it } from 'vitest'
import { computeFlushVolumesMatrix } from '../src/flush-volumes'

describe('computeFlushVolumesMatrix', () => {
  it('matches Bambu Studio for single color pairs (A1, nozzle volume 92)', () => {
    // [from, to] -> volume as produced by Bambu Studio's "Recalculate" on a Bambu Lab A1
    const cases: [string, string, number][] = [
      ['#FFFFFF', '#000000', 172],
      ['#000000', '#FFFFFF', 652],
      ['#FF0000', '#0000FF', 329],
      ['#0000FF', '#FF0000', 485],
      ['#FF0000', '#FFFF00', 632],
      ['#808080', '#FFFFFF', 435],
      // Same color in two different slots still needs the minimum purge.
      ['#FFFFFF', '#FFFFFF', 152],
    ]
    for (const [from, to, expected] of cases) {
      const [, volume] = computeFlushVolumesMatrix([from, to])
      expect(volume, `${from} -> ${to}`).toBe(expected)
    }
  })

  it('lays out the matrix row-major (from -> to) with a zero diagonal', () => {
    expect(computeFlushVolumesMatrix(['#FF0000', '#0000FF'])).toEqual([0, 329, 485, 0])
  })

  it('reproduces a matrix saved by Bambu Studio 2.05 for a Bambu Lab A1', () => {
    // Source: https://github.com/mvmvasconcelos/trecoletes-3d/blob/HEAD/models/tampa_bic/bambu_template/static/Metadata/project_settings.config
    const colors = ['#FFFFFF', '#161616', '#46A8F9', '#0ACC38', '#0085D5']
    expect(computeFlushVolumesMatrix(colors)).toEqual([0, 165, 272, 289, 312, 617, 0, 536, 513, 474, 503, 204, 0, 292, 152, 546, 187, 347, 0, 285, 607, 183, 279, 376, 0])
  })

  it('reproduces a matrix saved by Bambu Studio 2.02 for a Bambu Lab A1', () => {
    // Source: https://github.com/blchadick/MapTo3MF/blob/HEAD/MapTo3MF/templates/bambu_project_settings.config
    const colors = ['#C0C0C0', '#000000', '#008040', '#804000', '#00FFFF']
    expect(computeFlushVolumesMatrix(colors)).toEqual([0, 152, 227, 229, 305, 551, 0, 419, 406, 678, 472, 152, 0, 208, 466, 484, 152, 316, 0, 587, 364, 206, 251, 263, 0])
  })

  it('reproduces a 12-color matrix saved by Bambu Studio 1.7 for an X1 Carbon (nozzle volume 107)', () => {
    // Source: https://github.com/ukdavewood/BambuLab/blob/HEAD/Gcode/Xmas%20Pud.gcode.3mfxx/Metadata/project_settings.config
    const colors = ['#84620D', '#FFFFFF', '#C00D1E', '#000000', '#97999B', '#FF6A13', '#00358E', '#FCE300', '#8BD5EE', '#00AE42', '#FF6A13', '#005F61']
    const expected = [0, 567, 233, 168, 369, 348, 240, 496, 517, 349, 348, 210, 245, 0, 304, 187, 167, 339, 277, 341, 207, 290, 339, 234, 320, 655, 0, 177, 475, 404, 253, 609, 617, 486, 404, 223, 461, 667, 441, 0, 499, 617, 367, 740, 619, 519, 617, 380, 227, 404, 283, 167, 0, 309, 250, 476, 318, 265, 309, 207, 232, 570, 222, 212, 361, 0, 285, 409, 508, 293, 167, 254, 470, 667, 437, 167, 487, 587, 0, 703, 518, 441, 587, 255, 251, 450, 323, 228, 285, 240, 298, 0, 328, 304, 240, 267, 274, 370, 316, 221, 199, 340, 196, 430, 0, 246, 340, 167, 240, 582, 281, 182, 380, 465, 255, 594, 443, 0, 465, 218, 232, 570, 222, 212, 361, 167, 285, 409, 508, 293, 0, 254, 379, 609, 364, 167, 419, 551, 187, 671, 461, 338, 551, 0]
    expect(computeFlushVolumesMatrix(colors, { nozzleVolume: 107 })).toEqual(expected)
  })

  it('clamps volumes to Bambu Studio\'s 900 mm³ upper limit', () => {
    const [, volume] = computeFlushVolumesMatrix(['#000000', '#FFFFFF'], { nozzleVolume: 500 })
    expect(volume).toBe(900)
  })
})
