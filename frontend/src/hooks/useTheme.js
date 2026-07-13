import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "codelab.theme";

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Reads/writes the app theme. Backed by localStorage + a `data-theme`
 * attribute on <html> (set synchronously in index.html to avoid a flash),
 * so every page's independent call stays in sync without needing a shared
 * layout or context provider.
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle };
}
