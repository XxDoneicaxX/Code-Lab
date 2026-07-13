export default function SaveIndicator({ status, savedAt }) {
  if (status === "saving") {
    return <span className="text-sm text-ink/60">Saving…</span>;
  }
  if (status === "dirty") {
    return <span className="text-sm text-ink/60">Unsaved changes</span>;
  }
  if (status === "error") {
    return <span className="text-sm font-semibold text-red-600">Save failed — retrying…</span>;
  }
  const time = savedAt
    ? ` · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "";
  return <span className="text-sm font-semibold text-emerald-600">Saved ✓{time}</span>;
}
