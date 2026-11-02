// Kept out of theme-toggle.tsx: a "use client" module can't hand a plain string to a
// Server Component.
// Runs before the page paints (see layout.tsx) so there's no flash of the wrong theme.
export const THEME_SCRIPT = `(() => {
  const t = localStorage.getItem("theme") || "system";
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})()`;
