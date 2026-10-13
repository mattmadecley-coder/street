/** Cookie names for the admin shell. Shared by the server layout (reads them) and the client chrome (writes them). */
export const THEME_COOKIE = "adm_theme";
export const COLLAPSE_COOKIE = "adm_sidebar";

export type ThemeChoice = "system" | "light" | "dark";

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
