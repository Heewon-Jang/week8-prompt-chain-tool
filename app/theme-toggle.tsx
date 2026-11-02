"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
  { value: "system", label: "💻 System" },
];

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved choice once on mount
    setTheme((localStorage.getItem("theme") as Theme) || "system");
  }, []);

  // While on "system", follow the OS when it switches.
  useEffect(() => {
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
    apply(value);
  };

  return (
    <div role="radiogroup" aria-label="Color theme" className="flex rounded-lg border border-gray-300 p-0.5 text-xs dark:border-gray-700">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={`cursor-pointer rounded-md px-2 py-1 ${
            theme === value ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
