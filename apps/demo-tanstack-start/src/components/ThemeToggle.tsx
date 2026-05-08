import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "auto";

const getInitialMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }

  return "auto";
};

const applyThemeMode = (mode: ThemeMode) => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let resolved: "dark" | "light";
  if (mode === "auto") {
    resolved = prefersDark ? "dark" : "light";
  } else {
    resolved = mode;
  }

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);

  if (mode === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = mode;
  }

  document.documentElement.style.colorScheme = resolved;
};

const nextThemeMode = (current: ThemeMode): ThemeMode => {
  if (current === "light") {
    return "dark";
  }
  if (current === "dark") {
    return "auto";
  }
  return "light";
};

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");

    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [mode]);

  const handleToggle = () => {
    const next = nextThemeMode(mode);
    setMode(next);
    window.localStorage.setItem("theme", next);
  };

  const label =
    mode === "auto"
      ? "Theme mode: auto (system). Click to switch to light mode."
      : `Theme mode: ${mode}. Click to switch mode.`;

  let modeLabel: string;
  if (mode === "dark") {
    modeLabel = "Dark";
  } else if (mode === "light") {
    modeLabel = "Light";
  } else {
    modeLabel = "Auto";
  }

  return (
    <button
      aria-label={label}
      className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5"
      onClick={handleToggle}
      title={label}
      type="button"
    >
      {modeLabel}
    </button>
  );
}
