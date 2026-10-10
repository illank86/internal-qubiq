import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Dropdown, Empty, Flex, Input, Modal, Row, Segmented, Skeleton, Tabs, Tag, Typography, theme } from "antd";
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { useCan } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday } from "./api";
import { exportExcel, exportPdf, ledgerSheets, type Sheet } from "./exports";

type Line = { code: string; name: string; name_id: string | null; type: string; amount: number; deductible?: boolean };
type Statements = {
  from: string;
  to: string;
  profit_and_loss: { lines: Line[]; income: number; expenses: number; profit: number };
  balance_sheet: { lines: Line[]; retained_prior: number; profit_this_year: number };
  cash_flow: { opening: number; from_customers: number; to_suppliers: number; taxes: number; financing: number; other: number; closing: number };
  closed_months: string[];
};

type Preset = "this_month" | "last_month" | "this_year" | "last_year" | "custom";
const iso = (date: Date) => date.toISOString().slice(0, 10);

function range(preset: Preset): [string, string] {
  const [y, m] = jakartaToday().split("-").map(Number);
  if (preset === "this_month") return [iso(new Date(Date.UTC(y, m - 1, 1))), jakartaToday()];
  if (preset === "last_month") return [iso(new Date(Date.UTC(y, m - 2, 1))), iso(new Date(Date.UTC(y, m - 1, 0)))];
  if (preset === "last_year") return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  return [`${y}-01-01`, jakartaToday()];
}
const longDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Financial statements for a period, their exports, and closing months. */
export function ReportsPage() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [preset, setPreset] = useState<Preset>("this_year");
  const [custom, setCustom] = useState<[string, string]>(range("this_year"));
  const [from, to] = preset === "custom" ? custom : range(preset);
  const [exporting, setExporting] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["financial-statements", from, to],
    queryFn: async () => {
      const { data: result, error: loadError } = await supabase.rpc("financial_statements", { p_from: from, p_to: to });
      if (loadError) throw loadError;
      return result as unknown as Statements;
    },
  });
  const period = `${longDate(from)} – ${longDate(to)}`;

  const statementSheets = (s: Statements): Sheet[] => {
    const pl = s.profit_and_loss;
    const bs = s.balance_sheet;
    const sumType = (lines: Line[], type: string) => lines.filter((line) => line.type === type).reduce((total, line) => total + Number(line.amount), 0);
    const plRows = [
      { code: "", name: "PENDAPATAN", amount: null },
      ...pl.lines.filter((line) => line.type === "income").map((line) => ({ code: line.code, name: line.name_id || line.name, amount: line.amount })),
      { code: "", name: "Jumlah pendapatan", amount: pl.income },
      { code: "", name: "BEBAN", amount: null },
      ...pl.lines.filter((line) => line.type === "expense").map((line) => ({ code: line.code, name: (line.name_id || line.name) + (line.deductible === false ? " (tidak dapat dibiayakan)" : ""), amount: line.amount })),
      { code: "", name: "Jumlah beban", amount: pl.expenses },
    ];
    const bsRows = [
      { code: "", name: "ASET", amount: null },
      ...bs.lines.filter((line) => line.type === "asset").map((line) => ({ code: line.code, name: line.name_id || line.name, amount: line.amount })),
      { code: "", name: "Jumlah aset", amount: sumType(bs.lines, "asset") },
      { code: "", name: "LIABILITAS", amount: null },
      ...bs.lines.filter((line) => line.type === "liability").map((line) => ({ code: line.code, name: line.name_id || line.name, amount: line.amount })),
      { code: "", name: "Jumlah liabilitas", amount: sumType(bs.lines, "liability") },
      { code: "", name: "EKUITAS", amount: null },
      ...bs.lines.filter((line) => line.type === "equity").map((line) => ({ code: line.code, name: line.name_id || line.name, amount: line.amount })),
      { code: "", name: "Laba ditahan (tahun lalu)", amount: bs.retained_prior },
      { code: "", name: "Laba tahun berjalan", amount: bs.profit_this_year },
      { code: "", name: "Jumlah liabilitas dan ekuitas", amount: sumType(bs.lines, "liability") + sumType(bs.lines, "equity") + Number(bs.retained_prior) + Number(bs.profit_this_year) },
    ];
    const cf = s.cash_flow;
    const cfRows = [
      { name: "Saldo kas awal", amount: cf.opening },
      { name: "Penerimaan dari pelanggan", amount: cf.from_customers },
      { name: "Pembayaran kepada pemasok dan beban", amount: cf.to_suppliers },
      { name: "Pembayaran pajak", amount: cf.taxes },
      { name: "Arus kas operasi bersih", amount: Number(cf.from_customers) + Number(cf.to_suppliers) + Number(cf.taxes) },
      { name: "Arus kas pendanaan (modal, pinjaman pemegang saham)", amount: cf.financing },
      { name: "Lain-lain", amount: cf.other },
      { name: "Saldo kas akhir", amount: cf.closing },
    ];
    const cols = [{ header: "Kode", key: "code", width: 9 }, { header: "Akun", key: "name", width: 50 }, { header: "Jumlah (Rp)", key: "amount", kind: "money" as const }];
    return [
      { name: "Laba Rugi", title: "Laporan Laba Rugi", columns: cols, rows: plRows, totals: { name: "LABA (RUGI) BERSIH", amount: pl.profit } },
      { name: "Neraca", title: `Neraca per ${longDate(s.to)}`, columns: cols, rows: bsRows },
      { name: "Arus Kas", title: "Laporan Arus Kas (metode langsung)", columns: [{ header: "Keterangan", key: "name", width: 60 }, { header: "Jumlah (Rp)", key: "amount", kind: "money" }], rows: cfRows },
    ];
  };

  const run = async (kind: string, work: () => Promise<void>) => {
    setExporting(kind);
    try {
      await work();
    } catch (cause) {
      message.error(errorText(cause as { code?: string; message?: string }, "The export could not be made."));
    } finally {
      setExporting(null);
    }
  };
  const exportItems = data
    ? [
        { key: "statements-xlsx", icon: <FileExcelOutlined />, label: "Statements — Excel", onClick: () => run("x", () => exportExcel(`laporan-keuangan-${from}-${to}.xlsx`, period, statementSheets(data))) },
        { key: "statements-pdf", icon: <FilePdfOutlined />, label: "Statements — PDF", onClick: () => run("p", () => exportPdf(`laporan-keuangan-${from}-${to}.pdf`, period, statementSheets(data))) },
        { type: "divider" as const },
        { key: "ledger-xlsx", icon: <FileExcelOutlined />, label: "Journal, ledger & trial balance — Excel", onClick: () => run("lx", async () => exportExcel(`jurnal-buku-besar-${from}-${to}.xlsx`, period, await ledgerSheets(from, to))) },
        { key: "ledger-pdf", icon: <FilePdfOutlined />, label: "Journal, ledger & trial balance — PDF", onClick: () => run("lp", async () => exportPdf(`jurnal-buku-besar-${from}-${to}.pdf`, period, await ledgerSheets(from, to))) },
      ]
    : [];

  const section = (title: string, lines: Line[], total: number, totalLabel: string) => (
    <div>
      <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
        {title}
      </Typography.Text>
      <div style={{ marginTop: 6 }}>
        {lines.length === 0 ? <Typography.Text type="secondary">—</Typography.Text> : null}
        {lines.map((line) => (
          <Flex key={line.code} justify="space-between" gap={12} style={{ padding: "3px 0", borderBottom: `1px dashed ${token.colorBorderSecondary}` }}>
            <span>
              <Typography.Text type="secondary" style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }}>
                {line.code}
              </Typography.Text>{" "}
              {line.name}
              {line.deductible === false ? <Tag color="warning" style={{ marginLeft: 6 }}>Not deductible</Tag> : null}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{idr(line.amount)}</span>
          </Flex>
        ))}
        <Flex justify="space-between" style={{ padding: "6px 0", fontWeight: 600 }}>
          <span>{totalLabel}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{idr(total)}</span>
        </Flex>
      </div>
    </div>
  );

  return (
    <>
      <PageTitle
        title="Reports"
        description="Profit and loss, balance sheet and cash flow — and the journal, ledger and trial balance — for any period, in Excel or PDF."
        actions={
          <Dropdown menu={{ items: exportItems }} disabled={!data} trigger={["click"]}>
            <Button type="primary" icon={<DownloadOutlined />} loading={Boolean(exporting)}>
              Export
            </Button>
          </Dropdown>
        }
      />
      <Flex gap={8} wrap align="center" style={{ marginBottom: 16 }}>
        <Segmented<Preset>
          value={preset}
          onChange={setPreset}
          options={[
            { value: "this_month", label: "This month" },
            { value: "last_month", label: "Last month" },
            { value: "this_year", label: "This year" },
            { value: "last_year", label: "Last year" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {preset === "custom" ? (
          <Flex gap={6} align="center">
            <Input type="date" value={custom[0]} onChange={(event) => setCustom([event.target.value, custom[1]])} style={{ width: 150 }} />
            <span>–</span>
            <Input type="date" value={custom[1]} onChange={(event) => setCustom([custom[0], event.target.value])} style={{ width: 150 }} />
          </Flex>
        ) : (
          <Typography.Text type="secondary">{period}</Typography.Text>
        )}
      </Flex>
      {error ? <Alert type="error" showIcon title="The statements could not be loaded." style={{ marginBottom: 16 }} /> : null}
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Flex vertical gap={16}>
          <Card>
            <Tabs
              items={[
                {
                  key: "pl",
                  label: "Profit & loss",
                  children: (
                    <Flex vertical gap={16} style={{ maxWidth: 760 }}>
                      {section("Income", data.profit_and_loss.lines.filter((line) => line.type === "income"), data.profit_and_loss.income, "Total income")}
                      {section("Expenses", data.profit_and_loss.lines.filter((line) => line.type === "expense"), data.profit_and_loss.expenses, "Total expenses")}
                      <Flex justify="space-between" style={{ padding: "10px 12px", borderRadius: token.borderRadius, background: token.colorPrimaryBg, fontWeight: 700 }}>
                        <span>Net profit (loss)</span>
                        <span style={{ color: data.profit_and_loss.profit < 0 ? token.colorError : token.colorPrimary, fontVariantNumeric: "tabular-nums" }}>{idr(data.profit_and_loss.profit)}</span>
                      </Flex>
                    </Flex>
                  ),
                },
                {
                  key: "bs",
                  label: "Balance sheet",
                  children: (() => {
                    const lines = data.balance_sheet.lines;
                    const assets = lines.filter((line) => line.type === "asset");
                    const liabilities = lines.filter((line) => line.type === "liability");
                    const equity = lines.filter((line) => line.type === "equity");
                    const total = (rows: Line[]) => rows.reduce((sum, line) => sum + Number(line.amount), 0);
                    const equityTotal = total(equity) + Number(data.balance_sheet.retained_prior) + Number(data.balance_sheet.profit_this_year);
                    const balanced = Math.abs(total(assets) - total(liabilities) - equityTotal) < 1;
                    return (
                      <Row gutter={[32, 16]}>
                        <Col xs={24} lg={12}>
                          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                            At {longDate(data.to)}
                          </Typography.Text>
                          {section("Assets", assets, total(assets), "Total assets")}
                        </Col>
                        <Col xs={24} lg={12}>
                          <Flex vertical gap={16}>
                            {section("Liabilities", liabilities, total(liabilities), "Total liabilities")}
                            {section(
                              "Equity",
                              [
                                ...equity,
                                { code: "", name: "Retained earnings (earlier years)", name_id: null, type: "equity", amount: data.balance_sheet.retained_prior },
                                { code: "", name: "Profit this year", name_id: null, type: "equity", amount: data.balance_sheet.profit_this_year },
                              ],
                              equityTotal,
                              "Total equity",
                            )}
                            <Tag color={balanced ? "success" : "error"} style={{ alignSelf: "flex-start" }}>
                              {balanced ? "Assets = liabilities + equity" : "Does not balance — check the journal"}
                            </Tag>
                          </Flex>
                        </Col>
                      </Row>
                    );
                  })(),
                },
                {
                  key: "cf",
                  label: "Cash flow",
                  children: (
                    <Flex vertical gap={4} style={{ maxWidth: 640 }}>
                      {[
                        ["Cash at the start", data.cash_flow.opening, true],
                        ["Received from customers", data.cash_flow.from_customers],
                        ["Paid to suppliers and for expenses", data.cash_flow.to_suppliers],
                        ["Taxes paid", data.cash_flow.taxes],
                        ["Capital and shareholder loans", data.cash_flow.financing],
                        ["Other", data.cash_flow.other],
                        ["Cash at the end", data.cash_flow.closing, true],
                      ].map(([label, value, strong]) => (
                        <Flex key={label as string} justify="space-between" style={{ padding: "6px 0", borderBottom: `1px dashed ${token.colorBorderSecondary}`, fontWeight: strong ? 600 : 400 }}>
                          <span>{label}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{idr(value as number)}</span>
                        </Flex>
                      ))}
                      <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                        Direct method, from the bank and cash accounts.
                      </Typography.Text>
                    </Flex>
                  ),
                },
              ]}
            />
          </Card>
          <MonthClosing />
        </Flex>
      )}
    </>
  );
}

/** Closing months: once closed, nothing dated in it can be booked. */
function MonthClosing() {
  const can = useCan();
  const { run, busy } = useAction([["accounting-periods"], ["financial-statements"]]);
  const [reopening, setReopening] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { data } = useQuery({
    queryKey: ["accounting-periods"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("accounting_periods").select("month, closed_at, note").order("month", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as { month: string; closed_at: string; note: string | null }[];
    },
  });
  const [y, m] = jakartaToday().split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, index) => iso(new Date(Date.UTC(y, m - 2 - index, 1))));
  const closed = new Set((data ?? []).map((row) => row.month));
  const label = (month: string) => new Date(`${month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <Card title="Closing months" extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Close a month once its books are checked; nothing dated in it can be changed after.</Typography.Text>}>
      {months.length === 0 ? (
        <Empty />
      ) : (
        <Flex wrap gap={8}>
          {months.map((month) =>
            closed.has(month) ? (
              <Button key={month} icon={<LockOutlined />} disabled={!can("users.manage")} onClick={() => setReopening(month)} title={can("users.manage") ? "Reopen" : "Closed"}>
                {label(month)}
              </Button>
            ) : (
              <Button key={month} icon={<UnlockOutlined />} loading={busy === month}
                onClick={() => run(month, async () => {
                  const { error } = await supabase.rpc("close_month", { p_month: month });
                  if (error) throw error;
                }, `${label(month)} closed.`)}>
                Close {label(month)}
              </Button>
            ),
          )}
        </Flex>
      )}
      <Modal
        open={Boolean(reopening)}
        onCancel={() => setReopening(null)}
        title={`Reopen ${reopening ? label(reopening) : ""}?`}
        okText="Reopen"
        okButtonProps={{ disabled: !reason.trim() }}
        onOk={() =>
          reopening &&
          run(reopening, async () => {
            const { error } = await supabase.rpc("reopen_month", { p_month: reopening, p_reason: reason.trim() });
            if (error) throw error;
          }, "Month reopened.").then((ok) => {
            if (ok) {
              setReopening(null);
              setReason("");
            }
          })
        }
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">Reopening is recorded in the activity log with your reason.</Typography.Paragraph>
        <Input.TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why, e.g. a late bank charge to book" maxLength={300} />
      </Modal>
    </Card>
  );
}
