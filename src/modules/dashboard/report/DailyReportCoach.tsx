import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import useIsMobile from "../../../shared/hooks/useIsMobile"

/**
 * First-run coachmark backdrop, held up for the whole intro sequence (both the
 * clock step and the Reports nav-item step) once the arrival hands off to the
 * dashboard. The arrival fades out (opacity), revealing the live dashboard; this
 * drops a blurred, dimmed layer over it. Whichever element is being taught lifts
 * itself above this layer — the header clock (DailyReportButton
 * `.rpt-btn-anchor--coach`), then the Reports nav item (`.nav-button-attention`)
 * — so it plus its hint is the one crisp thing over the blur; there is no mock
 * header. The backdrop only dims/blurs and blocks the dashboard behind it — it
 * does NOT dismiss; the user must click the taught control or its hint's "Got
 * it" to advance. Skipped on mobile (no header clock / sidebar there).
 */
export function DailyReportCoach({ active }: { active: boolean }) {
  const isMobile = useIsMobile()
  const show = active && !isMobile

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="rpt-coach"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      )}
    </AnimatePresence>,
    document.body
  )
}
