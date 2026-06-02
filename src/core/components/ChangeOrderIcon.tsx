// Change Orders nav icon — just the letters "CO". Uses currentColor so it
// inherits the navbar's active/inactive text color like the lucide icons
// around it, and accepts the `size` prop the navbar passes (`size={20}`).
interface ChangeOrderIconProps {
  size?: number | string
  className?: string
}

export default function ChangeOrderIcon({ size = 24, className }: ChangeOrderIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="inherit"
        fontSize="14"
        fontWeight="700"
        letterSpacing="0.4"
        fill="currentColor"
      >
        CO
      </text>
    </svg>
  )
}
