import type { Transition } from "framer-motion"

// Shared spring for every segmented-control sliding thumb in the app (Job
// Costing's view/scope toggles, Overhead Report's trend/movers toggles,
// Settings' light/dark + on/off toggles, Employees' PM-scope toggle, Property
// Detail's PM toggle, Reports' range toggle). Deliberately a standalone file
// with no other exports — importing it doesn't pull any page's lazy chunk
// into the caller's bundle.
export const SEG_SPRING: Transition = { type: "spring", bounce: 0.15, visualDuration: 0.35 }
