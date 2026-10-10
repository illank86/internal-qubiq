import { Column } from "@ant-design/plots";
import { theme } from "antd";
import { useThemeMode } from "@/theme-mode";
import { formatCompact } from "@/features/dashboard/sales-money";
import { idr } from "./api";

type Month = { month: string; money_in: number; money_out: number };

/** Money into and out of the bank accounts per month: two series, side by side, with a legend. */
export function CashChart({ months }: { months: Month[] }) {
  const { dark } = useThemeMode();
  const { token } = theme.useToken();
  const data = months.flatMap((month) => {
    const label = new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short" });
    return [
      { month: label, series: "Money in", value: Number(month.money_in) },
      { month: label, series: "Money out", value: Number(month.money_out) },
    ];
  });
  return (
    <Column
      data={data}
      xField="month"
      yField="value"
      colorField="series"
      group
      height={240}
      autoFit
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { range: [token.colorPrimary, token.colorInfo] }, y: { nice: true } }}
      style={{ radiusTopLeft: 3, radiusTopRight: 3, maxWidth: 18 }}
      axis={{ x: { title: false, tick: false }, y: { title: false, gridLineDash: [4, 4], labelFormatter: (value: number) => formatCompact(value, "IDR") } }}
      legend={{ color: { position: "top", layout: { justifyContent: "flex-end" }, itemMarker: "square" } }}
      tooltip={{ items: [{ channel: "y", valueFormatter: (value: number) => idr(value) }] }}
    />
  );
}
