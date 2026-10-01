import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
// Native dialog provides focus trapping, Escape and focus restoration.
export function CCModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="cc-dialog cc"
      aria-label={title}
      onCancel={onClose}
    >
      <header className="cc-dialog-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="cc-icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="cc-dialog-body">{children}</div>
    </dialog>,
    document.body,
  );
}
