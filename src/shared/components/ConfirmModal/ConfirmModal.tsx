import { type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useModalLayer } from "../../hooks/useModalLayer"

interface ConfirmModalProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions. */
  danger?: boolean
  /** Disables the buttons and shows a busy label while the action runs. */
  loading?: boolean
  /** Error to surface inside the dialog (e.g. a failed request). */
  error?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  loading,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { overlayZ, contentZ } = useModalLayer(open)
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={loading ? undefined : onCancel}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal confirm-modal"
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <h2 className="title3 emphasized">{title}</h2>
              {message && <div className="body-text text-secondary">{message}</div>}
              {error && <p className="auth-error">{error}</p>}
              <div className="confirm-modal-actions">
                <button className="button secondary-button" onClick={onCancel} disabled={loading}>
                  {cancelLabel}
                </button>
                <button
                  className={`button ${danger ? "danger-button" : "primary-button"}`}
                  onClick={onConfirm}
                  disabled={loading}
                >
                  {loading ? "Working…" : confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
