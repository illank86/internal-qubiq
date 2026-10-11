import { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Card, Col, Empty, Flex, Row, Segmented, Skeleton, Tag, Tooltip, Typography, theme } from "antd";
import { BankOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";
import { CurrencySwitch, RatesNote, RevenueCard, formatCompact, useSalesMoney } from "@/features/dashboard/sales-money";
import { idr, jakartaToday } from "./api";

const CashChart = lazy(() => import("./cash-chart").then((module) => ({ default: module.CashChart })));

type Dashboard = {
  year: number;
  regime: "general" | "pp55";
  pkp: boolean;
  banks: { id: string; name: string; currency: string; balance: number }[];
  months: { month: string; money_in: number; money_out: number; revenue: number; expenses: number }[];
  receivables: { total: number; count: number; current: number; d31_60: number; d61_90: number; over_90: number };
  profit: { revenue: number; expenses: number; non_deductible: number; profit: number; taxable: number; estimated_tax: number; credits: number; estimated_due: number };
  deadlines: { key: string; label: string; due: string; needed: boolean; paid: boolean }[];
  warnings: { missing_faktur?: number; missing_bukti_potong: number; expenses_without_receipt: number; estimated_rates: number; ppn_before_pkp: number; no_bank_account: boolean; paid_without_receipt: number };
};

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Finance at a glance: cash, money in and out, what customers owe, profit and the tax it implies, deadlines, and what to fix. */
export function FinanceDashboardPage() {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const thisYear = Number(jakartaToday().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance-dashboard", year],
    queryFn: async () => {
      const { data: result, error: loadError } = await supabase.rpc("accounting_dashboard", { p_year: year });
      if (loadError) throw loadError;
      return result as unknown as Dashboard;
    },
  });

  const figure = (label: string, value: number, hint?: React.ReactNode, tone?: string) => (
    <Card style={{ height: "100%" }} styles={{ body: { padding: 18 } }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {label}
      </Typography.Text>
      <Tooltip title={idr(value)}>
        <div style={{ fontSize: "clamp(20px, 1vw + 14px, 26px)", fontWeight: 600, margin: "4px 0", fontVariantNumeric: "tabular-nums", color: tone }}>{formatCompact(value, "IDR")}</div>
      </Tooltip>
      {hint ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      ) : null}
    </Card>
  );

  const warnings = data
    ? [
        (data.warnings.missing_faktur ?? 0) > 0 && { text: `${data.warnings.missing_faktur} invoice(s) issued as PKP have no “faktur pajak” attached yet.`, to: "/sales/invoices" },
        data.warnings.no_bank_account && { text: "Add your bank accounts in Finance → Settings before recording payments.", to: "/finance/settings?tab=banks" },
        data.warnings.paid_without_receipt > 0 && { text: `${data.warnings.paid_without_receipt} invoice(s) marked paid before Finance existed: record what was actually received.`, to: "/finance/money-in" },
        data.warnings.ppn_before_pkp > 0 && { text: `${idr(data.warnings.ppn_before_pkp)} was charged as tax before PKP. Review it with your tax consultant (Finance → Settings → Tax lists the documents).`, to: "/finance/settings" },
        data.warnings.missing_bukti_potong > 0 && { text: `${data.warnings.missing_bukti_potong} payment(s) with tax withheld but no “bukti potong” number — ask the customer for it; it is your tax credit.`, to: "/finance/money-in" },
        data.warnings.expenses_without_receipt > 0 && { text: `${data.warnings.expenses_without_receipt} expense(s) without a receipt attached.`, to: "/finance/money-out" },
        data.warnings.estimated_rates > 0 && { text: `${data.warnings.estimated_rates} entr(ies) used an estimated exchange rate — add the KMK rate for that week.`, to: "/finance/settings?tab=rates" },
      ].filter(Boolean) as { text: string; to: string }[]
    : [];

  return (
    <>
      <PageTitle
        title="Finance"
        description="Books in Rupiah: money in and out, what customers owe, profit and the corporate tax it implies."
        actions={<Segmented<number> value={year} onChange={setYear} options={[thisYear - 1, thisYear].map((value) => ({ value, label: String(value) }))} />}
      />
      {error ? <Alert type="error" showIcon title="Finance could not be loaded." style={{ marginBottom: 16 }} /> : null}
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Flex vertical gap={16}>
          {warnings.length ? (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              title="To look at"
              description={
                <Flex vertical gap={4}>
                  {warnings.map((item) => (
                    <Typography.Link key={item.text} onClick={() => navigate(item.to)}>
                      {item.text}
                    </Typography.Link>
                  ))}
                </Flex>
              }
            />
          ) : null}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={6}>
              {figure("Cash in the bank", data.banks.reduce((sum, bank) => sum + Number(bank.balance), 0), `${data.banks.length} account${data.banks.length === 1 ? "" : "s"}`)}
            </Col>
            <Col xs={24} sm={12} xl={6}>
              {figure("Customers owe", data.receivables.total, `${data.receivables.count} invoice(s)${data.receivables.over_90 ? ` · ${formatCompact(data.receivables.over_90, "IDR")} over 90 days` : ""}`, data.receivables.over_90 ? token.colorWarning : undefined)}
            </Col>
            <Col xs={24} sm={12} xl={6}>
              {figure(`Profit ${data.year} so far`, data.profit.profit, `Revenue ${formatCompact(data.profit.revenue, "IDR")} − costs ${formatCompact(data.profit.expenses, "IDR")}`, data.profit.profit < 0 ? token.colorError : undefined)}
            </Col>
            <Col xs={24} sm={12} xl={6}>
              {figure(
                data.regime === "pp55" ? "PPh final 0.5% so far" : "Estimated corporate tax",
                data.profit.estimated_tax,
                data.regime === "pp55" ? "0.5% of revenue (PP 55)" : `22% with Art. 31E · credits ${formatCompact(data.profit.credits, "IDR")} · still due ${formatCompact(data.profit.estimated_due, "IDR")}`,
              )}
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={16}>
              <Card title={`Money in and out · ${data.year}`} style={{ height: "100%" }}>
                <Suspense fallback={<Skeleton.Node active style={{ width: "100%", height: 240 }} />}>
                  <CashChart months={data.months} />
                </Suspense>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Tax deadlines" style={{ height: "100%" }}>
                <Flex vertical gap={10}>
                  {data.deadlines.filter((deadline) => deadline.needed).map((deadline) => (
                    <Flex key={deadline.key} justify="space-between" align="flex-start" gap={8}>
                      <div>
                        <Typography.Text>{deadline.label}</Typography.Text>
                        <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                          Due {dateLabel(deadline.due)}
                        </Typography.Text>
                      </div>
                      {deadline.paid ? (
                        <Tag icon={<CheckCircleOutlined />} color="success">
                          Paid
                        </Tag>
                      ) : (
                        <Tag icon={<ClockCircleOutlined />} color={deadline.due < jakartaToday() ? "error" : "warning"}>
                          Open
                        </Tag>
                      )}
                    </Flex>
                  ))}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {data.pkp ? "PKP: PPN returns monthly." : "Not PKP: no PPN returns."}{" "}
                    {data.regime === "general" ? "Normal corporate tax (22%, Article 31E)." : "PPh final 0.5% (PP 55)."} Change in Finance → Settings.
                  </Typography.Text>
                </Flex>
              </Card>
            </Col>
          </Row>

          <SalesRevenue />

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Bank accounts">
                {data.banks.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No bank accounts yet." />
                ) : (
                  <Flex vertical gap={8}>
                    {data.banks.map((bank) => (
                      <Flex key={bank.id} justify="space-between">
                        <span>
                          <BankOutlined /> {bank.name} <Typography.Text type="secondary">({bank.currency})</Typography.Text>
                        </span>
                        <Typography.Text strong style={{ fontVariantNumeric: "tabular-nums" }}>
                          {idr(bank.balance)}
                        </Typography.Text>
                      </Flex>
                    ))}
                  </Flex>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="What customers owe, by age">
                {[
                  ["Up to 30 days", data.receivables.current],
                  ["31–60 days", data.receivables.d31_60],
                  ["61–90 days", data.receivables.d61_90],
                  ["Over 90 days", data.receivables.over_90],
                ].map(([label, value]) => (
                  <Flex key={label as string} justify="space-between" style={{ padding: "4px 0" }}>
                    <Typography.Text type="secondary">{label}</Typography.Text>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{idr(value as number)}</span>
                  </Flex>
                ))}
              </Card>
            </Col>
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Estimates for planning; the annual return (“SPT Tahunan Badan”) is prepared with fiscal corrections and should be reviewed by a tax consultant.
          </Typography.Text>
        </Flex>
      )}
    </>
  );
}

/** Revenue per month from invoices and payments, shown in IDR or USD. */
function SalesRevenue() {
  const navigate = useNavigate();
  const { money, currency, choose } = useSalesMoney(true);
  if (!money?.months) return null;
  return (
    <Card
      title="Revenue"
      extra={
        <Flex gap={12} align="center">
          <CurrencySwitch value={currency} onChange={choose} />
          <Typography.Link onClick={() => navigate("/sales/invoices")}>Invoices</Typography.Link>
        </Flex>
      }
    >
      <RevenueCard money={money} />
      <div style={{ marginTop: 8 }}>
        <RatesNote money={money} />
      </div>
    </Card>
  );
}
