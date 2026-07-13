/**
 * The Bit mascot — a small pixel-cube character, reused as the site's brand
 * mark. Its dark details always render in the same fixed navy
 * (--color-ink-solid), regardless of light/dark app theme, so the mascot
 * never looks inverted — the same reasoning a logo doesn't recolor itself.
 */
export default function BitMascot({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect x="58" y="6" width="13" height="13" rx="3" fill="var(--color-ink-solid)" />
      <rect x="47" y="17" width="13" height="13" rx="3" fill="var(--color-ink-solid)" />
      <path
        d="M13 60c-3-6 1-12 7-12 1-6 9-8 12-2 5-2 10 4 7 9-1 3-4 5-8 5H21c-3 0-7-1-8 0z"
        fill="var(--color-ink-solid)"
      />
      <path
        d="M85 62c2-5-1-10-6-10-1-5-8-6-10-1-4-2-9 3-6 8 1 2 4 4 7 4h11c2 0 4 0 4-1z"
        fill="var(--color-ink-solid)"
      />
      <rect x="18" y="26" width="64" height="58" rx="17" fill="var(--color-accent)" />
      <rect x="29" y="38" width="42" height="31" rx="9" fill="#ffffff" />
      <circle cx="43" cy="53" r="3.8" fill="var(--color-ink-solid)" />
      <circle cx="59" cy="53" r="3.8" fill="var(--color-ink-solid)" />
      <path
        d="M43 59q8 8 16 0"
        stroke="var(--color-ink-solid)"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="36" cy="59" r="2.6" fill="#f7a8d8" opacity="0.85" />
      <circle cx="66" cy="59" r="2.6" fill="#f7a8d8" opacity="0.85" />
      <rect x="32" y="84" width="9" height="11" rx="4.5" fill="var(--color-ink-solid)" />
      <rect x="59" y="84" width="9" height="11" rx="4.5" fill="var(--color-ink-solid)" />
    </svg>
  );
}
