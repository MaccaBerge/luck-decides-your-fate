import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}
function system(): Theme {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

/** Class-based dark mode. Follows the system until the user toggles, then persists. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system());

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    if (stored()) return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      if (!stored()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
