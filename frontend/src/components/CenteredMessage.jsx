import PixelAccents from "./PixelAccents";

export default function CenteredMessage({ title, detail, action }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 overflow-hidden bg-app-bg px-6 text-center">
      <PixelAccents variant="hero" />
      <p className="relative z-10 text-lg font-semibold text-ink">{title}</p>
      {detail && <p className="relative z-10 max-w-md text-sm text-ink/60">{detail}</p>}
      {action && <div className="relative z-10">{action}</div>}
    </div>
  );
}
