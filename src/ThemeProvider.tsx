// src/ThemeProvider.tsx
import React, { createContext, useContext, ReactNode } from "react";
import { darkTheme, Theme } from "./theme";

type ThemeContextShape = {
  theme: Theme;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextShape>({
  theme: darkTheme,
  isDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={{ theme: darkTheme, isDark: true }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
