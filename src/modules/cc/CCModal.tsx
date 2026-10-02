import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useModalLayer } from "../../shared/hooks/useModalLayer";

// The dashboard's modal shell (same overlay, positioner, entrance and close
// pill as ChangeOrderModal / DetailModal), so CC dialogs stack and read like
// every other modal. With a `title` it draws the eyebrow-titled header; without
// one the content leads (the receipt's own head band) under a floating close.
// Callers mount it only while open.
export function CCModal({
  eyebrow,
  title,
  narrow,
  footer,
  onClose,
  children,
}: {
  eyebrow?: string;
  title?: string;
  narrow?: boolean;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(true);
  useEffect(() => {
    // Only the top modal answers Escape, so a stacked confirm closes first.
    if (!isTopLayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTopLayer, onClose]);

  return createPortal(
    <>
      <motion.div
        className={`modal-overlay${isTopLayer ? " modal-overlay--blur" : ""}`}
        style={{ zIndex: overlayZ }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <div className="modal-positioner" style={{ zIndex: contentZ }}>
        <motion.div
          className={`modal co-modal cc-modal${narrow ? " cc-modal--narrow" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {title ? (
            <div className="modal-header co-modal-header">
              <div className="co-modal-title">
                {eyebrow && <span className="co-modal-eyebrow">{eyebrow}</span>}
                <h2 className="title2 emphasized">{title}</h2>
              </div>
              <button className="button modal-close" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              className="button modal-close cc-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
          <div className="cc-modal-body">{children}</div>
          {footer && <div className="cc-modal-footer">{footer}</div>}
        </motion.div>
      </div>
    </>,
    document.body,
  );
}
