import { useState } from "react";

import Button from "./Button";
import Dialog from "./Dialog";

export default function GroupNameDialog({
  title,
  submitLabel,
  initialValue = "",
  busy,
  error,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState(initialValue);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="text-sm font-medium text-ink/70" htmlFor="group-name">
          Group name
        </label>
        <input
          id="group-name"
          autoFocus
          type="text"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Python Ninjas"
          className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/30"
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="neutral" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
