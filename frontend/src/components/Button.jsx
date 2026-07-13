const VARIANTS = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:opacity-50",
  secondary: "bg-ink-solid text-white hover:bg-ink-solid-hover disabled:opacity-50",
  soft: "bg-accent-soft text-ink hover:opacity-80 disabled:opacity-50",
  neutral:
    "border border-border-subtle bg-surface text-ink hover:bg-app-bg disabled:text-ink/40",
  run: "bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-emerald-300",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
  "danger-outline": "border border-red-300 bg-surface text-red-600 hover:bg-red-500/10",
};

export default function Button({ variant = "neutral", className = "", ...props }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
