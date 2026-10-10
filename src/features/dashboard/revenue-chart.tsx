import { Column } from "@ant-design/plots";
import { theme } from "antd";
import { useThemeMode } from "@/theme-mode";
import { formatCompact, formatExact, type Month } from "./sales-money";

/** Money received per month for the last 12 months: one series, so no legend; hover shows the exact figures. */
export function RevenueChart({ months, currency }: { months: Month[]; currency: string }) {
  const { dark } = useThemeMode();
  const { token } = theme.useToken();
  const data = months.map((month) => ({
    month: new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    received: Number(month.received),
    invoiced: Number(month.invoiced),
    count: Number(month.received_count),
  }));
  return (
    <Column
      data={data}
      xField="month"
      yField="received"
      height={220}
      autoFit
      theme={dark ? "classicDark" : "classic"}
      style={{ fill: token.colorPrimary, radiusTopLeft: 4, radiusTopRight: 4, maxWidth: 28 }}
      scale={{ y: { nice: true } }}
      axis={{
        x: { title: false, tick: false },
        y: { title: false, gridLineDash: [4, 4], labelFormatter: (value: number) => formatCompact(value, currency) },
      }}
      tooltip={{
        title: "month",
        items: [
          { field: "received", name: "Received in the bank", valueFormatter: (value: number) => formatExact(value, currency) },
          { field: "count", name: "Payments" },
          { field: "invoiced", name: "Invoiced", valueFormatter: (value: number) => formatExact(value, currency) },
        ],
      }}
    />
  );
}
