const VARIANTS = {
  // Tight corner scatter for hero-style sections (e.g. the homepage).
  hero: [
    { top: "6%", left: "4%", size: 14, tone: "soft" },
    { top: "16%", left: "10%", size: 9, tone: "solid" },
    { top: "24%", left: "3%", size: 7, tone: "soft" },
    { top: "8%", right: "6%", size: 11, tone: "soft" },
    { top: "19%", right: "3%", size: 8, tone: "solid" },
    { bottom: "16%", left: "7%", size: 10, tone: "soft" },
    { bottom: "9%", right: "9%", size: 13, tone: "soft" },
    { bottom: "22%", right: "4%", size: 7, tone: "solid" },
  ],
  // Runs down both side gutters for taller content pages, staying clear of
  // a centered column of cards.
  page: [
    { top: "4%", left: "3%", size: 12, tone: "soft" },
    { top: "10%", left: "9%", size: 8, tone: "solid" },
    { top: "18%", left: "2%", size: 7, tone: "soft" },
    { top: "30%", left: "6%", size: 10, tone: "soft" },
    { top: "42%", left: "3%", size: 8, tone: "solid" },
    { top: "55%", left: "8%", size: 9, tone: "soft" },
    { top: "68%", left: "4%", size: 7, tone: "soft" },
    { top: "6%", right: "4%", size: 11, tone: "soft" },
    { top: "14%", right: "9%", size: 8, tone: "solid" },
    { top: "26%", right: "2%", size: 9, tone: "soft" },
    { top: "38%", right: "6%", size: 7, tone: "solid" },
    { top: "50%", right: "3%", size: 10, tone: "soft" },
    { top: "63%", right: "8%", size: 8, tone: "soft" },
    { top: "76%", right: "4%", size: 7, tone: "solid" },
  ],
};

/** Decorative floating pixel squares, echoing the mascot's pixel-dust motif. */
export default function PixelAccents({ variant = "hero" }) {
  const squares = VARIANTS[variant] ?? VARIANTS.hero;
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {squares.map((sq, index) => (
        <span
          key={index}
          className="absolute rounded-[3px]"
          style={{
            top: sq.top,
            left: sq.left,
            right: sq.right,
            bottom: sq.bottom,
            width: sq.size,
            height: sq.size,
            backgroundColor:
              sq.tone === "solid" ? "var(--color-accent)" : "var(--color-accent-soft)",
          }}
        />
      ))}
    </div>
  );
}
