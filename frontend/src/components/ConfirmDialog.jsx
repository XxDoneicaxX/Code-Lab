import Button from "./Button";
import Dialog from "./Dialog";

export default function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="mt-3 text-sm text-ink/70">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="neutral" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Deleting…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
