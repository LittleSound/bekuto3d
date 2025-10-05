declare module 'fix-path-directions' {
  interface FixPathDirectionsOptions {
    arcToCubic?: boolean
    quadraticToCubic?: boolean
    toClockwise?: boolean
    returnD?: boolean
    decimals?: number
  }

  interface FixPathDirectionsApi {
    getFixedPathDataString: (pathData: string, options?: FixPathDirectionsOptions) => string
    getFixedPathData: (pathData: string, options?: FixPathDirectionsOptions) => unknown
  }

  const fixPathDirections: FixPathDirectionsApi
  export default fixPathDirections
  export function getFixedPathDataString(pathData: string, options?: FixPathDirectionsOptions): string
  export function getFixedPathData(pathData: string, options?: FixPathDirectionsOptions): unknown
}
