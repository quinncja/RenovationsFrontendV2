# Frontend conventions

## Navigating to the Job Cost detail page (`/jobcost/:recnum`)

Do **not** call `navigate(`/jobcost/${id}`)` directly. Use the shared hook instead:

```ts
import { useJobcostNav } from "<relative>/modules/jobcost/useJobcostNav"

const { goToJobcost } = useJobcostNav()
// ...
goToJobcost(id)                          // label derived from current page
goToJobcost(id, { backLabel: "Reports" }) // override for modal/widget contexts
```

`goToJobcost` stashes `{ backTo, backLabel }` in router state so the detail page's
back button returns the user to the page they came from, labeled by source
(e.g. "← Clients", "← Change Orders"). The label is derived from the current
pathname via a prefix→label map in `useJobcostNav.ts` — add a new entry there when
introducing a new source route. On a cold deep-link / refresh (no router state),
the button falls back to "← Job Costing" (`JOBCOST_BACK_FALLBACK`).

The detail page (`modules/jobcost/JobcostDetailPage.tsx`) reads `location.state`
with that fallback. The back button is desktop-only; mobile uses the bottom nav.

When adding the call: if `navigate` was used *only* for jobcost in that file, remove
the now-unused `const navigate = useNavigate()` and its import (`noUnusedLocals` is on).
