import { useDarkMode } from "../../shared/hooks/useDarkMode"

// variant "white" pins the white artwork regardless of theme — for the
// permanently dark auth shell (login/signup/signout).
export default function Logo({
  size = 40,
  variant = "auto",
}: {
  size?: number
  variant?: "auto" | "white"
}) {
  const dark = useDarkMode()
  return (
    <img
      src={variant === "white" || dark ? "/r-logo-white.png" : "/r-logo.png"}
      alt="Renovations Delivered"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  )
}
