import { Link, useLocation } from "react-router-dom";

import BitMascot from "./BitMascot";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { to: "/workspace", label: "Workspace" },
  { to: "/classrooms", label: "Projects" },
];

export default function TopBar({ crumbs = [], right, backTo, showNav = true }) {
  const location = useLocation();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2 font-bold text-ink">
        <BitMascot className="h-9 w-9" />
        <span className="hidden sm:inline">BIT Code Lab</span>
      </Link>

      {showNav && (
        <nav className="ml-1 hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => {
            const active = location.pathname.startsWith(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-accent-soft text-ink" : "text-ink/60 hover:bg-app-bg hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}

      {backTo && (
        <Link
          to={backTo.to}
          className="ml-2 text-sm font-medium text-ink/70 hover:text-ink hover:underline"
        >
          ← {backTo.label}
        </Link>
      )}
      {crumbs.map((crumb) => (
        <span key={crumb} className="flex items-center gap-3 text-sm text-ink/60">
          <span className="text-border-subtle">/</span>
          {crumb}
        </span>
      ))}

      <div className="ml-auto flex items-center gap-3">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
