import { useCallback, useMemo, useState } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import enGB from "antd/locale/en_GB";
import { BRAND, ThemeModeContext } from "@/theme-mode";

function initialDark() {
  return document.documentElement.classList.contains("dark");
}

/** Ant Design with the QUBIQ look: brand orange, Geist, light or dark. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(initialDark);

  const toggle = useCallback(() => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {
        // Storage blocked: the choice lasts for this visit only.
      }
      return next;
    });
  }, []);

  const mode = useMemo(() => ({ dark, toggle }), [dark, toggle]);

  return (
    <ThemeModeContext.Provider value={mode}>
      <ConfigProvider
        locale={enGB}
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: dark ? BRAND.dark : BRAND.light,
            colorLink: dark ? BRAND.dark : BRAND.light,
            fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            borderRadius: 8,
          },
          components: {
            Layout: { headerBg: dark ? "#1f1f1f" : "#ffffff", siderBg: dark ? "#1f1f1f" : "#ffffff", headerPadding: "0 24px" },
            Menu: { itemBg: "transparent" },
          },
        }}
      >
        {/* App provides message / notification / modal with the theme applied. */}
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
