// src/theme.ts
export type Theme = {
  name: string;
  background: string;
  card: string;
  primary: string;
  secondary: string;
  primaryGradient: string[]; // start/end for two-tone buttons
  primaryShine: string[]; // (kept for compatibility, can be unused)
  softPrimary: string;
  textDark: string;
  textMuted: string;
  green: string;
  orange: string;
  purple: string;
  gradient: string[];
  border: string;
  overlayLight: string;
  shadow: string;
};

// Single dark theme (dark-but-not-black) with warm red → purple accent
export const darkTheme: Theme = {
  name: "dark",

  /* Surfaces — dark but not pitch-black */
  background: "#0f1a1f", // deep slate/teal with some depth (not pure black)
  card: "#162328",       // slightly elevated card surface with cool tint
  softPrimary: "#202a30", // subtle soft surface for inputs, etc.

  /* Primary + secondary colors (warm dark red → deep purple) */
  // primary is the main accent (fallback), secondary is the gradient end
  primary: "#b33b3b",    // warm dark red (fallback)
  secondary: "#6f2f64",  // deep plum / purple

  /* Primary gradient & a simple shine token for compatibility */
  primaryGradient: ["#b33b3b", "#6f2f64"], // warm red -> deep purple
  primaryShine: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)"],

  /* Text */
  textDark: "#eef6f5",   // soft off-white for good contrast
  textMuted: "#99a6ad",  // muted gray-blue for secondary text

  /* Accents (kept for other UI elements) */
  green: "#58e0b3",
  orange: "#ffab73",
  purple: "#a97cff",

  /* UI tint gradient (subtle warm-red + purple hints) */
  gradient: [
    "rgba(179,59,59,0.08)",  // red tint
    "rgba(111,47,100,0.06)", // purple tint
    "rgba(78,168,255,0.03)", // small cool hint for balance
  ],

  /* Depth & overlays */
  border: "rgba(255,255,255,0.05)",
  overlayLight: "rgba(255,255,255,0.02)",
  shadow: "rgba(5,8,12,0.75)",
};

// default export for convenience
export const theme = darkTheme;
