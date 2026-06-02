// Single source of truth for the employee initials badge. Used by the home
// page Employee Performance widget and the /employees directory page so
// they can't drift visually. Visual styling lives in App.css (.emp-avatar
// + .emp-avatar--unassigned) — this component only renders the right markup.

interface EmployeeAvatarProps {
  firstName: string
  lastName: string
}

function initialsFor(firstName: string, lastName: string): string {
  const f = firstName?.trim()?.[0] ?? ""
  const l = lastName?.trim()?.[0] ?? ""
  return `${f}${l}`.toUpperCase() || "?"
}

export function EmployeeAvatar({ firstName, lastName }: EmployeeAvatarProps) {
  // "Unassigned Work" is an aggregation bucket, not a person — render it
  // in a neutral gray variant with a `?` glyph instead of initials.
  const isUnassigned = firstName?.toLowerCase() === "unassigned"
  return (
    <span
      className={`emp-avatar${isUnassigned ? " emp-avatar--unassigned" : ""}`}
      aria-hidden="true"
    >
      {isUnassigned ? "?" : initialsFor(firstName, lastName)}
    </span>
  )
}
