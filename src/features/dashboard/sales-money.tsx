import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Empty, Flex, Segmented, Skeleton, Tag, Tooltip, Typography, theme } from "antd";
import { ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined, ClockCircleOutlined, CloseCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";
import { formatMoney } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";

const RevenueChart = lazy(() => import("./revenue-chart").then((module) => ({ default: module.RevenueChart })));

/**
 * The dashboard's money in one currency (sales_money in the database):
 * documents stay in the currency they were issued in; here they are converted
 * — money received at the rate of the day it was paid, what is still owed and
 * the pipeline at the latest rate (ECB reference rates).
 */

export type Month = { month: string; received: number; received_count: number; invoiced: number };
type Stage = { count: number; amount: number };
export type SalesMoney = {
  currency: string;
  rates_date: string | null;
  unconverted: string[];
  outstanding?: {
    amount: number;
    count: number;
    overdue_amount: number;
    overdue_count: number;
    by_currency: { currency: string; amount: number; decimals: number }[];
  };
  months?: Month[];
  pipeline?: Partial<Record<"draft" | "awaiting" | "expired" | "won" | "lost", Stage>> | null;
};

const CURRENCIES = ["IDR", "USD"] as const;
const STORAGE_KEY = "dashboard-currency";

function storedCurrency() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Short, never clipped: "Rp255.5M", "$14.3K". The exact amount goes in a tooltip. */
export function formatCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: "compact",
      maximumFractionDigits: Math.abs(amount) >= 1000 ? 1 : 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}
export const formatExact = (amount: number, currency: string) => formatMoney(amount, currency, currency === "IDR" ? 0 : 2);

/** The chosen currency (remembered on this browser), and the money in it. Rates are refreshed once a day. */
export function useSalesMoney(enabled: boolean) {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState<string | null>(() => storedCurrency());
  const query = useQuery({
    queryKey: ["sales-money", currency ?? "default"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sales_money", currency ? { p_currency: currency } : {});
      if (error) throw error;
      return data as unknown as SalesMoney | null;
    },
  });

  // Today's rates, fetched by the database's fx-rates function (at most once a day).
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    supabase.functions
      .invoke<{ fetched?: number }>("fx-rates", { method: "POST" })
      .then(({ data }) => {
        if (live && data?.fetched) void queryClient.invalidateQueries({ queryKey: ["sales-money"] });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, queryClient]);

  const choose = (next: string) => {
    setCurrency(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Remembering is a convenience only.
    }
  };
  return { money: query.data ?? null, loading: query.isLoading, currency: query.data?.currency ?? currency ?? "IDR", choose };
}

/** "Show in IDR | USD". */
export function CurrencySwitch({ value, onChange }: { value: string; onChange: (currency: string) => void }) {
  return (
    <Flex align="center" gap={8}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Show in
      </Typography.Text>
      <Segmented<string> size="small" value={value} onChange={onChange} options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))} />
    </Flex>
  );
}

/** Where the figures come from: the rates used and anything left unconverted. */
export function RatesNote({ money }: { money: SalesMoney }) {
  const day = money.rates_date ? new Date(`${money.rates_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  return (
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      <InfoCircleOutlined /> In {money.currency}: money received at the rate on the day it was paid; amounts owed at the latest rate
      {day ? ` (ECB, ${day})` : ""}.
      {money.unconverted.length ? (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          {" "}
          No rate for {money.unconverted.join(", ")} — left out.
        </Typography.Text>
      ) : null}
    </Typography.Text>
  );
}

/** Revenue received per month (excluding tax), this month against last, and the year so far. */
export function RevenueCard({ money }: { money: SalesMoney }) {
  const { token } = theme.useToken();
  const months = money.months ?? [];
  if (months.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invoices yet." />;
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const year = current.month.slice(0, 4);
  const yearToDate = months.filter((month) => month.month.startsWith(year)).reduce((sum, month) => sum + Number(month.received), 0);
  const change = previous && Number(previous.received) > 0 ? (Number(current.received) - Number(previous.received)) / Number(previous.received) : null;
  const monthName = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long" });

  const stat = (label: string, value: number, extra?: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
        {label}
      </Typography.Text>
      <Tooltip title={formatExact(value, money.currency)}>
        <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatCompact(value, money.currency)}</span>
      </Tooltip>
      {extra}
    </div>
  );

  return (
    <Flex vertical gap={16}>
      <Flex gap={32} wrap>
        {stat(
          `Received in ${monthName(current.month)}`,
          Number(current.received),
          change !== null ? (
            <Typography.Text style={{ fontSize: 12, marginLeft: 8, color: change >= 0 ? token.colorSuccess : token.colorError }}>
              {change >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(Math.round(change * 100))}% vs {monthName(previous.month).slice(0, 3)}
            </Typography.Text>
          ) : null,
        )}
        {stat(`Invoiced in ${monthName(current.month)}`, Number(current.invoiced))}
        {stat(`Received in ${year} so far`, yearToDate)}
      </Flex>
      <Suspense fallback={<Skeleton.Node active style={{ width: "100%", height: 220 }} />}>
        <RevenueChart months={months} currency={money.currency} />
      </Suspense>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Received = invoices paid that month, excluding tax. Profit needs costs as well, which are not recorded yet.
      </Typography.Text>
    </Flex>
  );
}

/**
 * Quotations as a flow: Draft → Awaiting reply → Won, each with how many and
 * what they are worth; Expired (to renew) and Lost beside it, and the win rate.
 */
export function PipelineFlow({ money, counts }: { money: SalesMoney | null; counts: { draft: number; open: number; expired: number; accepted: number; lost: number } }) {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const stage = (key: "draft" | "awaiting" | "expired" | "won" | "lost", fallback: number) => ({
    count: money?.pipeline?.[key]?.count ?? fallback,
    amount: money?.pipeline?.[key]?.amount ?? null,
  });
  const draft = stage("draft", counts.draft);
  const awaiting = stage("awaiting", counts.open);
  const won = stage("won", counts.accepted);
  const expired = stage("expired", counts.expired);
  const lost = stage("lost", counts.lost);
  const total = draft.count + awaiting.count + won.count + expired.count + lost.count;
  if (total === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotations yet." />;
  const decided = won.count + lost.count + expired.count;
  const currency = money?.currency ?? "IDR";

  const tile = (label: string, hint: string, value: { count: number; amount: number | null }, color: string, background: string) => (
    <div style={{ flex: "1 1 150px", minWidth: 0, padding: "14px 16px", borderRadius: token.borderRadiusLG, background, borderTop: `3px solid ${color}` }}>
      <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>{label}</Typography.Text>
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value.count}</div>
      <Tooltip title={value.amount !== null ? formatExact(value.amount, currency) : undefined}>
        <Typography.Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {value.amount !== null && value.count ? formatCompact(value.amount, currency) : "—"}
        </Typography.Text>
      </Tooltip>
      <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
        {hint}
      </Typography.Text>
    </div>
  );
  const arrow = (
    <Flex align="center" style={{ color: token.colorTextQuaternary, flex: "0 0 auto" }} aria-hidden>
      <ArrowRightOutlined />
    </Flex>
  );

  return (
    <Flex vertical gap={14}>
      <Flex gap={8} align="stretch" wrap>
        {tile("Draft", "Being prepared", draft, token.colorTextQuaternary, token.colorFillQuaternary)}
        {arrow}
        {tile("Awaiting reply", "Sent, still valid", awaiting, token.colorPrimary, token.colorPrimaryBg)}
        {arrow}
        {tile("Won", "Accepted", won, token.colorSuccess, token.colorSuccessBg)}
      </Flex>
      <Flex gap={8} wrap align="center">
        <Tag
          icon={<ClockCircleOutlined />}
          color={expired.count ? "warning" : "default"}
          style={{ cursor: expired.count ? "pointer" : undefined, marginInlineEnd: 0, padding: "2px 8px" }}
          onClick={expired.count ? () => navigate("/sales/quotations") : undefined}
        >
          {expired.count} expired{expired.count ? " — renew or close" : ""}
          {expired.amount ? ` · ${formatCompact(expired.amount, currency)}` : ""}
        </Tag>
        <Tag icon={<CloseCircleOutlined />} style={{ marginInlineEnd: 0, padding: "2px 8px" }}>
          {lost.count} declined or cancelled
        </Tag>
        {decided > 0 ? (
          <Tooltip title="Won out of every quotation that got an answer or ran out (won, declined, cancelled, expired).">
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
              Win rate <Typography.Text strong>{Math.round((won.count / decided) * 100)}%</Typography.Text>
            </Typography.Text>
          </Tooltip>
        ) : null}
      </Flex>
    </Flex>
  );
}
