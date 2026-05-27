import { useDarkMode } from "../../shared/hooks/useDarkMode"

export default function Logo({ size = 40 }: { size?: number; color?: string }) {
  const dark = useDarkMode()
  return (
    <img
      src={dark ? "/r-logo-white.png" : "/r-logo.png"}
      alt="Renovations Delivered"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  )
}
