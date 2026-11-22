import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "./icons";

/**
 * A single overlay primitive: centred dialog on wide screens, bottom sheet on
 * mobile. Handles Escape, scrim clicks, scroll locking and focus entry so no two
 * overlays can fight over the screen.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>(
        "button:not([disabled]), [href], input, textarea, select",
      );
      target?.focus();
    }, 40);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        ref={panel}
      >
        <div className="sheet__grab" aria-hidden="true" />
        <div className="sheet__head">
          <div>
            <h2 className="sheet__title" id={`${id}-title`}>
              {title}
            </h2>
            {description ? <p className="sheet__description">{description}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
