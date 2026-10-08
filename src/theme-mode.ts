import { createContext, useContext } from "react";

export type ThemeMode = { dark: boolean; toggle: () => void };

export const ThemeModeContext = createContext<ThemeMode>({ dark: false, toggle: () => {} });

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

/**
 * QUBIQ orange, a step darker than the logo so white text on buttons stays
 * readable — the same as the website's --primary. Lighter on dark.
 */
export const BRAND = { light: "#c2410c", dark: "#f08a4b" };
