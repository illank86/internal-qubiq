import { useMemo } from "react";
import { Area, Column, Pie } from "@ant-design/plots";
import { Empty, theme } from "antd";
import { useThemeMode } from "@/theme-mode";

type Day = { day: string; downloads: number; unique_visitors: number };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Every day in the window, zero where nobody downloaded — the reporting view
 * only has days with downloads, and a line drawn straight across a gap would
 * claim a trend that did not happen.
 */
function fillDays(days: Day[], span: number) {
  const byDay = new Map(days.map((day) => [day.day.slice(0, 10), day]));
  const rows: { day: string; series: string; value: number }[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const key = isoDay(new Date(Date.now() - offset * 86_400_000));
    const found = byDay.get(key);
    rows.push({ day: key, series: "Downloads", value: Number(found?.downloads ?? 0) });
    rows.push({ day: key, series: "Visitors", value: Number(found?.unique_visitors ?? 0) });
  }
  return rows;
}

function useChartTheme() {
  const { dark } = useThemeMode();
  const { token } = theme.useToken();
  return { chartTheme: dark ? "classicDark" : "classic", primary: token.colorPrimary, secondary: token.colorInfo, token };
}

/** Downloads and unique visitors per day: two smooth, lightly filled lines. */
export function DownloadTrend({ days, span = 90 }: { days: Day[]; span?: number }) {
  const { chartTheme, primary, secondary } = useChartTheme();
  const data = useMemo(() => fillDays(days, span), [days, span]);
  if (days.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No downloads yet." />;

  return (
    <Area
      data={data}
      xField={(row: { day: string }) => new Date(`${row.day}T00:00:00Z`)}
      yField="value"
      colorField="series"
      shapeField="smooth"
      stack={false}
      height={280}
      autoFit
      theme={chartTheme}
      scale={{ color: { range: [primary, secondary] }, y: { nice: true } }}
      style={{ fillOpacity: 0.12 }}
      line={{ shapeField: "smooth", style: { lineWidth: 2 } }}
      axis={{ x: { title: false, labelFormatter: (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tick: false }, y: { title: false, gridLineDash: [4, 4] } }}
      legend={{ color: { position: "top", layout: { justifyContent: "flex-end" }, itemMarker: "circle" } }}
      tooltip={{ title: (row: { day: string }) => new Date(`${row.day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) }}
      interaction={{ tooltip: { crosshairsLineDash: [4, 4] } }}
    />
  );
}

/** Downloads per release, newest versions first. */
export function DownloadsByRelease({ rows }: { rows: { version: string | null; downloads: number | null }[] }) {
  const { chartTheme, primary } = useChartTheme();
  const data = rows.filter((row) => row.version).map((row) => ({ version: row.version!, downloads: Number(row.downloads ?? 0) }));
  if (data.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No releases downloaded yet." />;
  return (
    <Column
      data={data}
      xField="version"
      yField="downloads"
      height={260}
      autoFit
      theme={chartTheme}
      style={{ fill: primary, radiusTopLeft: 6, radiusTopRight: 6, maxWidth: 48 }}
      axis={{ x: { title: false, tick: false }, y: { title: false, gridLineDash: [4, 4] } }}
      label={{ text: "downloads", position: "top", style: { dy: -4, fontSize: 11 } }}
    />
  );
}

/** Share of downloads per platform, as a donut. */
export function DownloadsByPlatform({ rows }: { rows: { platform: string | null; downloads: number | null }[] }) {
  const { chartTheme } = useChartTheme();
  const data = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const platform = row.platform ? row.platform[0].toUpperCase() + row.platform.slice(1) : "Other";
      totals.set(platform, (totals.get(platform) ?? 0) + Number(row.downloads ?? 0));
    }
    return [...totals].map(([platform, downloads]) => ({ platform, downloads })).filter((row) => row.downloads > 0);
  }, [rows]);
  if (data.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No downloads yet." />;
  const total = data.reduce((sum, row) => sum + row.downloads, 0);
  return (
    <Pie
      data={data}
      angleField="downloads"
      colorField="platform"
      innerRadius={0.64}
      height={260}
      autoFit
      theme={chartTheme}
      scale={{ color: { range: ["#c2410c", "#1677ff", "#13c2c2", "#722ed1", "#8c8c8c"] } }}
      style={{ stroke: "transparent", inset: 1, radius: 6 }}
      label={false}
      legend={{ color: { position: "right", layout: { justifyContent: "center" }, itemMarker: "circle" } }}
      annotations={[
        {
          type: "text",
          style: { text: `${total}\ndownloads`, x: "50%", y: "50%", textAlign: "center", fontSize: 16, fontWeight: 600, lineHeight: 20 },
        },
      ]}
    />
  );
}
