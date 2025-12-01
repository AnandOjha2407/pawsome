// src/theme.ts
export type Theme = {
  name: string;
  background: string;
  card: string;
  primary: string;
  secondary: string;
  // gradientColors: good for RN LinearGradient (array)
  gradientColors: string[];
  // gradientCSS: handy for web backgroundImage (css linear-gradient)
  gradientCSS: string;
  primaryShine: string[];
  softPrimary: string;
  textDark: string;
  textMuted: string;
  green: string;
  orange: string;
  purple: string;
  gradient: string[]; // kept for tint layers
  border: string;
  overlayLight: string;
  shadow: string | undefined;
};

export const darkTheme: Theme = {
  name: "futuristic-neon",
  background: "#05070D",
  card: "rgba(14, 22, 33, 0.55)",
  primary: "#12BFFF",
  secondary: "#4FF0F7",

  // For RN gradients: list of colors (start -> end -> optional stops)
  gradientColors: ["#3AB8FF", "#00A3FF", "#7D61FF"],

  // For web: linear-gradient CSS string (angle + color stops)
  gradientCSS:
    "linear-gradient(90deg, rgba(58,184,255,1) 0%, rgba(0,163,255,1) 45%, rgba(125,97,255,1) 100%)",

  primaryShine: ["rgba(255,255,255,0.25)", "rgba(255,255,255,0.07)"],
  softPrimary: "rgba(20, 32, 46, 0.35)",
  textDark: "#E6F9FF",
  textMuted: "#ffffffff",
  green: "#5EFCC8",
  orange: "#FFB37A",
  purple: "#9F7CFF",
  gradient: [
    "rgba(0,180,255,0.18)",
    "rgba(79,240,247,0.14)",
    "rgba(124,97,255,0.12)",
    "rgba(0,255,200,0.10)",
  ],
  border: "rgba(0,255,255,0.18)",
  overlayLight: "rgba(255,255,255,0.06)",
  shadow: "0px 0px 30px rgba(0,255,255,0.25)",
};

export const theme = darkTheme;
