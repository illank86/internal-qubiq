import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Alert, App, Button, Flex, Input, Modal, Skeleton, Tabs, Tag, Tooltip, Typography, theme } from "antd";
import { CheckCircleFilled, CloseCircleFilled, FileExcelOutlined, FilePdfOutlined, FileTextOutlined, LockOutlined } from "@ant-design/icons";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { errorText } from "@/lib/sales";
import { downloadBlob, rp, signedOn } from "./ledger-book";
import { jakartaToday } from "./api";
import { PAPER, rangeOf, type Preset } from "./report-period";
import { CheckLine, SignBlock, PaperSheet, PeriodPicker } from "./report-paper";
import type { Company } from "./exports";
import { loadStatementBook, statementCsv, statementFileBase, type Statement, type StatementBook, type StatementKey } from "./statement-book";

/**
 * Financial statements: pick the period, look at them as they will print,
 * then download — PDF (opens in the PDF viewer first), Excel (all three
 * sheets) or CSV (the open tab, plain data).
 */

export function StatementPreviewModal({ from: initialFrom, to: initialTo, onClose }: { from?: string; to?: string; onClose: () => void }) {
  const { message } = App.useApp();
  const viewPdf = usePdfViewer();
  const [preset, setPreset] = useState<Preset>(initialFrom ? "custom" : "year");
  const [custom, setCustom] = useState<[string, string]>(() => [initialFrom ?? rangeOf("year")[0], initialTo ?? jakartaToday()]);
  const [from, to] = preset === "custom" ? custom : rangeOf(preset);
  const [key, setKey] = useState<StatementKey>("laba-rugi");
  const [busy, setBusy] = useState<string | null>(null);
  const valid = Boolean(from && to && from <= to);

  const { data: loaded, isLoading, error } = useQuery({ queryKey: ["statement-book", from, to], enabled: valid, queryFn: () => loadStatementBook(from, to) });
  // The date written above the signatures; today unless changed.
  const [signDate, setSignDate] = useState(jakartaToday);
  const book = loaded ? signedOn(loaded, signDate) : undefined;
  const statement = book?.statements.find((item) => item.key === key);

  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    try {
      await work();
    } catch (cause) {
      message.error(errorText(cause as { code?: string; message?: string }, "The file could not be made."));
    } finally {
      setBusy(null);
    }
  };
  const pdf = () =>
    book &&
    viewPdf({
      title: `Laporan Keuangan · ${book.period}`,
      fileName: `${statementFileBase(book)}.pdf`,
      note: "Laba Rugi, Neraca and Arus Kas",
      make: async () => (await import("./statement-pdf-file")).statementPdf(book),
    });
  const excel = () => book && run("xlsx", async () => downloadBlob(await (await import("./statement-excel")).statementExcel(book), `${statementFileBase(book)}.xlsx`));
  const csv = () =>
    book && statement && run("csv", async () => downloadBlob(new Blob([statementCsv(statement)], { type: "text/csv;charset=utf-8" }), `${statement.key}_${book.from}_${book.to}.csv`));

  return (
    <Modal
      open
      onCancel={onClose}
      width={1080}
      title="Financial statements"
      styles={{ body: { paddingTop: 4 } }}
      footer={
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            PDF and Excel hold all three statements. CSV is the open tab only, as plain data.
          </Typography.Text>
          <Flex gap={8} wrap>
            <Tooltip title={statement ? `${statement.title} as plain CSV, no styling` : undefined}>
              <Button icon={<FileTextOutlined />} disabled={!statement} loading={busy === "csv"} onClick={csv}>
                CSV
              </Button>
            </Tooltip>
            <Button icon={<FileExcelOutlined />} disabled={!book} loading={busy === "xlsx"} onClick={excel}>
              Excel
            </Button>
            <Button type="primary" icon={<FilePdfOutlined />} disabled={!book} onClick={pdf}>
              View PDF
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Flex vertical gap={12}>
        <Flex gap={8} align="center" justify="space-between" wrap>
          <PeriodPicker preset={preset} custom={custom} from={from} to={to} onPreset={setPreset} onCustom={setCustom} />
          <Flex gap={6} align="center">
            <Typography.Text type="secondary">Signed on</Typography.Text>
            <Input type="date" value={signDate} onChange={(event) => setSignDate(event.target.value || jakartaToday())} style={{ width: 150 }} aria-label="Signed on" />
            <Link to="/finance/settings?tab=reports" style={{ fontSize: 12 }}>
              Who signs?
            </Link>
          </Flex>
        </Flex>
        {!valid ? <Alert type="warning" showIcon title="Choose a start date on or before the end date." /> : null}
        {error ? <Alert type="error" showIcon title={errorText(error as { code?: string; message?: string }, "The statements could not be loaded.")} /> : null}
        {isLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : null}
        {book && statement ? (
          <>
            <Summary book={book} />
            <Tabs
              activeKey={key}
              onChange={(value) => setKey(value as StatementKey)}
              items={book.statements.map((item) => ({ key: item.key, label: item.key === "laba-rugi" ? "Laba Rugi" : item.key === "neraca" ? "Neraca" : "Arus Kas" }))}
              style={{ marginBottom: -12 }}
            />
            <PaperSheet company={book.company} title={statement.title} subtitle={statement.subtitle} printed={book.printed}>
              <StatementTable statement={statement} company={book.company} />
            </PaperSheet>
          </>
        ) : null}
      </Flex>
    </Modal>
  );
}

function Summary({ book }: { book: StatementBook }) {
  const { token } = theme.useToken();
  const checks = book.statements.filter((item) => item.check);
  const ok = checks.every((item) => item.check?.ok);
  const fact = (label: string, value: React.ReactNode) => (
    <div style={{ flex: "1 1 140px", padding: "8px 12px", borderRadius: token.borderRadiusLG, background: token.colorFillQuaternary }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
  return (
    <Flex gap={8} wrap>
      {fact("Income", `Rp ${rp(book.facts.income, "0")}`)}
      {fact("Expenses", `Rp ${rp(book.facts.expenses, "0")}`)}
      {fact(book.facts.profit < 0 ? "Net loss" : "Net profit", <span style={{ color: book.facts.profit < 0 ? token.colorError : undefined }}>Rp {rp(book.facts.profit, "0")}</span>)}
      {fact("Cash & bank at end", `Rp ${rp(book.facts.cash, "0")}`)}
      {fact(
        "Check",
        <Flex gap={4} wrap style={{ marginTop: 2 }}>
          {ok ? (
            <Tag icon={<CheckCircleFilled />} color="success">
              Balanced
            </Tag>
          ) : (
            <Tag icon={<CloseCircleFilled />} color="error">
              Not balanced
            </Tag>
          )}
          {book.closedMonths.length ? (
            <Tooltip title={`Closed: ${book.closedMonths.join(", ")}`}>
              <Tag icon={<LockOutlined />}>{book.closedMonths.length} closed</Tag>
            </Tooltip>
          ) : null}
        </Flex>,
      )}
    </Flex>
  );
}

const td = (align: "left" | "right" = "left", extra: React.CSSProperties = {}): React.CSSProperties => ({ padding: "5px 8px", textAlign: align, fontVariantNumeric: "tabular-nums", verticalAlign: "top", ...extra });
const th = (align: "left" | "right" = "left"): React.CSSProperties => ({ background: PAPER.brand, color: "#fff", fontWeight: 600, fontSize: 11, padding: "6px 8px", textAlign: align, whiteSpace: "nowrap" });

function StatementTable({ statement, company }: { statement: Statement; company: Company }) {
  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th(), width: 80 }}>Kode</th>
            <th style={th()}>Keterangan</th>
            <th style={{ ...th("right"), width: 170 }}>Jumlah (Rp)</th>
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((row, index) => {
            if (row.kind === "section")
              return (
                <tr key={index} style={{ borderBottom: `1px solid ${PAPER.brand}` }}>
                  <td colSpan={3} style={td("left", { color: PAPER.brand, fontWeight: 700, fontSize: 11, letterSpacing: 0.8, paddingTop: 14 })}>
                    {row.name.toUpperCase()}
                  </td>
                </tr>
              );
            if (row.kind === "line")
              return (
                <tr key={index} style={{ borderBottom: `1px solid ${PAPER.line}` }}>
                  <td style={td("left", { color: PAPER.muted, fontFamily: "Geist Mono, monospace" })}>{row.code}</td>
                  <td style={td("left", { paddingLeft: 20, color: PAPER.ink, fontStyle: row.muted ? "italic" : undefined })}>
                    {row.name}
                    {row.note ? <span style={{ color: PAPER.muted, fontSize: 11 }}> — {row.note}</span> : null}
                  </td>
                  <td style={td("right")}>{rp(row.amount)}</td>
                </tr>
              );
            const total = row.kind === "total";
            return (
              <tr
                key={index}
                style={{
                  fontWeight: 700,
                  color: PAPER.ink,
                  background: total ? PAPER.soft : undefined,
                  borderTop: `1px solid ${PAPER.ink}`,
                  borderBottom: total ? `3px double ${PAPER.ink}` : undefined,
                }}
              >
                <td colSpan={2} style={td("left", { padding: total ? "8px" : "6px 8px" })}>
                  {total ? row.name.toUpperCase() : row.name}
                </td>
                <td style={td("right", { padding: total ? "8px" : "6px 8px" })}>{rp(row.amount, "0")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {statement.check ? <CheckLine ok={statement.check.ok} text={statement.check.text} /> : null}
      {statement.note ? <div style={{ marginTop: 4, color: PAPER.muted, fontStyle: "italic", fontSize: 11 }}>{statement.note}</div> : null}
      <SignBlock company={company} />
    </>
  );
}
