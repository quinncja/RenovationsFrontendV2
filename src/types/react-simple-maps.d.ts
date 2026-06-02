// Minimal ambient types for react-simple-maps (no official @types package).
// Covers only the surface used by RevenueMapPage.
declare module "react-simple-maps" {
  import type { ReactNode, CSSProperties, SVGProps } from "react"

  export interface GeographyShape {
    rsmKey: string
    id: string
    properties: Record<string, unknown>
    [key: string]: unknown
  }

  export interface ComposableMapProps {
    projection?: string
    projectionConfig?: Record<string, unknown>
    width?: number
    height?: number
    className?: string
    style?: CSSProperties
    children?: ReactNode
  }
  export const ComposableMap: (props: ComposableMapProps) => JSX.Element

  export interface ZoomableGroupProps {
    center?: [number, number]
    zoom?: number
    minZoom?: number
    maxZoom?: number
    children?: ReactNode
  }
  export const ZoomableGroup: (props: ZoomableGroupProps) => JSX.Element

  export interface GeographiesProps {
    geography: string | Record<string, unknown> | unknown[]
    children: (args: { geographies: GeographyShape[]; outline: unknown; borders: unknown }) => ReactNode
  }
  export const Geographies: (props: GeographiesProps) => JSX.Element

  export interface GeographyProps extends Omit<SVGProps<SVGPathElement>, "style"> {
    geography: GeographyShape
    style?: {
      default?: CSSProperties
      hover?: CSSProperties
      pressed?: CSSProperties
    }
  }
  export const Geography: (props: GeographyProps) => JSX.Element
}
