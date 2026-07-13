export default function TileButton({ badge, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-2xl border border-white/50 bg-surface/40 p-5 text-left shadow-xl shadow-black/10 backdrop-blur-xl transition-all hover:border-accent hover:bg-surface/60 hover:shadow-2xl"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-bold text-white">
        {badge}
      </span>
      <span className="font-semibold text-ink">{title}</span>
      {subtitle && <span className="text-sm text-ink/60">{subtitle}</span>}
    </button>
  );
}
