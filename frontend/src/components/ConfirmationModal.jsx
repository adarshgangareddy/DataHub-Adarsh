import { useEffect, useRef } from 'react';
import Button from './Button.jsx';

/**
 * Uses the native <dialog>: focus is trapped, Escape cancels, and the page behind is inert.
 * Focus starts on Cancel so an accidental Enter never fires a gate command.
 */
export default function ConfirmationModal({ open, title, message, confirmLabel, cancelLabel = 'Cancel', busy = false, onConfirm, onCancel }) {
  const ref = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={(e) => {
        e.preventDefault(); // Escape: let React state close it
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md border-2 border-ink bg-panel p-0 text-ink"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-muted">
          {message}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-line bg-recess p-4 sm:flex-row sm:justify-end">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
