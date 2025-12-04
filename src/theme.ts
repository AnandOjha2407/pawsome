// src/theme.ts

/**
 * PAWSOMEBOND THEME
 * DARYX Tech Inc. Brand Colors
 */

export const COLORS = {
  background: "#0E1217", // Kept as requested
  card: "#13161C", // Slightly darker, metallic feel
  cardElevated: "#1A1F29",
  border: "rgba(0, 240, 255, 0.3)", // Cyan glow border
  borderStrong: "#00F0FF", // Neon Cyan
  overlayLight: "rgba(255,255,255,0.1)",
  glassBackground: "rgba(14, 18, 23, 0.7)",
  glassBorder: "rgba(0, 240, 255, 0.2)",

  primary: "#00F0FF", // Cyberpunk Cyan
  secondary: "#D900FF", // Neon Magenta
  electric: "#7000FF", // Electric Purple
  magenta: "#FF0099", // Hot Pink

  textPrimary: "#FFFFFF",
  textSecondary: "#B0E0E6", // Light Cyan tint
  textMuted: "#5A6A7C",
  textOnPrimary: "#000000",

  success: "#00FF9D", // Neon Green
  warning: "#FFD600", // Neon Yellow
  error: "#FF2A6D", // Neon Red

  navInactive: "#4A5568",
  navActive: "#00F0FF",
};

// Component styles ready to use
export const STYLES = {
  // Screen wrapper
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header bar
  header: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginVertical: 8,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }, // Glowing effect
  },

  // Primary button (cyan)
  buttonPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonPrimaryText: {
    color: COLORS.textOnPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Secondary button (outline)
  buttonSecondary: {
    backgroundColor: COLORS.glassBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // Input fields
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // Navigation bar
  navBar: {
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
  },
  navActive: {
    color: COLORS.primary,
  },
  navInactive: {
    color: COLORS.navInactive,
  },

  // Chat bubbles
  chatUser: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 12,
    maxWidth: '75%',
    alignSelf: 'flex-end',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  chatUserText: {
    color: COLORS.textOnPrimary,
  },
  chatAI: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  chatAIText: {
    color: COLORS.textSecondary,
  },
};

export type Theme = {
  name: string;
  background: string;
  card: string;
  cardElevated: string;
  primary: string;
  secondary: string;
  electric: string;
  magenta: string;
  gradientColors: string[];
  gradientCSS: string;
  primaryShine: string[];
  softPrimary: string;
  textDark: string;
  textMuted: string;
  textOnPrimary: string;
  green: string;
  orange: string;
  purple: string;
  gradient: string[];
  border: string;
  borderStrong: string;
  overlayLight: string;
  glassBackground: string;
  glassBorder: string;
  shadow: string | undefined;
  navInactive: string;
  navActive: string;
  alert: string;
  success: string;
  buttonRadius: number;
};

export const darkTheme: Theme = {
  name: "cyberpunk-metallic",
  background: COLORS.background,
  card: COLORS.card,
  cardElevated: COLORS.cardElevated,
  primary: COLORS.primary,
  secondary: COLORS.secondary,
  electric: COLORS.electric,
  magenta: COLORS.magenta,

  // Derived gradients - Cyberpunk Neon
  gradientColors: [COLORS.primary, COLORS.electric, COLORS.secondary],

  // Web gradient
  gradientCSS: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.electric} 50%, ${COLORS.secondary} 100%)`,

  primaryShine: ["rgba(0, 240, 255, 0.4)", "rgba(0, 240, 255, 0.1)"],
  softPrimary: "rgba(0, 240, 255, 0.15)",
  textDark: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  textOnPrimary: COLORS.textOnPrimary,
  green: COLORS.success,
  orange: COLORS.error,
  purple: COLORS.secondary,
  gradient: [
    "rgba(0, 240, 255, 0.25)",
    "rgba(112, 0, 255, 0.20)",
    "rgba(217, 0, 255, 0.15)",
    "rgba(0, 240, 255, 0.10)",
  ],
  border: COLORS.border,
  borderStrong: COLORS.borderStrong,
  overlayLight: COLORS.overlayLight,
  glassBackground: COLORS.glassBackground,
  glassBorder: COLORS.glassBorder,
  shadow: `0px 0px 20px ${COLORS.primary}40`, // Neon glow shadow
  navInactive: COLORS.navInactive,
  navActive: COLORS.navActive,
  alert: COLORS.error,
  success: COLORS.success,
  buttonRadius: 12, // Sharper corners for tech feel
};

export const theme = darkTheme;

export default { COLORS, STYLES };
