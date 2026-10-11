import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, App, Button, Card, Flex, Input, Result, Skeleton, Tabs, Tag, Tooltip, Typography, theme } from "antd";
import { ArrowLeftOutlined, CheckCircleFilled, CloseCircleFilled, FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { useCan } from "@/auth/use-auth";
import { errorText } from "@/lib/sales";
import { downloadBlob, fileBase, signedOn, ledgerCsv, loadLedgerBook, PART_TITLE, rp, shortDateId, TYPE_ID, type LedgerBook, type LedgerPart } from "./ledger-book";
import { jakartaToday } from "./api";
import { PAPER, rangeOf, type Preset } from "./report-period";
import { CheckLine, SignBlock, PaperEmpty as Empty, PaperSheet, PeriodPicker } from "./report-paper";

/**
 * "Jurnal & Buku Besar" as a page (not a dialog, so the PDF viewer is the only
 * one that opens): pick the period, look at it as it will print, then
 * download — PDF (opens in the PDF viewer first), Excel (all three sheets) or
 * CSV (the open tab, plain data). `?from=&to=` opens it on a period.
 */

const PREVIEW_LIMIT = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function LedgerBookPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { message } = App.useApp();
  const viewPdf = usePdfViewer();
  const initialFrom = ISO_DATE.test(params.get("from") ?? "") ? params.get("from")! : null;
  const initialTo = ISO_DATE.test(params.get("to") ?? "") ? params.get("to")! : null;
  const [preset, setPreset] = useState<Preset>(initialFrom ? "custom" : "year");
  const [custom, setCustom] = useState<[string, string]>(() => [initialFrom ?? rangeOf("year")[0], initialTo ?? jakartaToday()]);
  const [from, to] = preset === "custom" ? custom : rangeOf(preset);
  const [part, setPart] = useState<LedgerPart>("jurnal");
  const [busy, setBusy] = useState<string | null>(null);
  const valid = Boolean(from && to && from <= to);
  const allowed = can("accounting.manage");

  const { data: loaded, isLoading, error } = useQuery({ queryKey: ["ledger-book", from, to], enabled: valid && allowed, queryFn: () => loadLedgerBook(from, to) });
  // The date written above the signatures; today unless changed.
  const [signDate, setSignDate] = useState(jakartaToday);
  const book = loaded ? signedOn(loaded, signDate) : undefined;

  if (!allowed) return <Result status="403" title="Finance only" subTitle="The journal and ledger are for the Finance role." />;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
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
      title: `Jurnal & Buku Besar · ${book.period}`,
      fileName: `${fileBase(book)}.pdf`,
      note: "“Jurnal Umum”, “Buku Besar” and “Neraca Saldo”",
      make: async () => (await import("./ledger-pdf-file")).ledgerPdf(book),
    });
  const excel = () => book && run("xlsx", async () => downloadBlob(await (await import("./ledger-excel")).ledgerExcel(book), `${fileBase(book)}.xlsx`));
  const csv = () =>
    book && run("csv", async () => downloadBlob(new Blob([ledgerCsv(book, part)], { type: "text/csv;charset=utf-8" }), `${part}_${book.from}_${book.to}.csv`));

  return (
    <>
      <PageTitle
        title="Jurnal & Buku Besar"
        description="General journal, ledger per account and trial balance for a period, as they will print. PDF and Excel hold all three; CSV is the open tab only, as plain data."
        actions={
          <Flex gap={8} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
              Back
            </Button>
            <Tooltip title={`${PART_TITLE[part]} as plain CSV, no styling`}>
              <Button icon={<FileTextOutlined />} disabled={!book} loading={busy === "csv"} onClick={csv}>
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
        }
      />
      <Card>
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
          {error ? <Alert type="error" showIcon title={errorText(error as { code?: string; message?: string }, "The journal could not be loaded.")} /> : null}
          {isLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : null}
          {book ? (
            <>
              <Summary book={book} />
              <Tabs
                activeKey={part}
                onChange={(key) => setPart(key as LedgerPart)}
                items={[
                  { key: "jurnal", label: `Jurnal Umum (${book.entries.length})` },
                  { key: "buku-besar", label: `Buku Besar (${book.accounts.length})` },
                  { key: "neraca-saldo", label: "Neraca Saldo" },
                ]}
                style={{ marginBottom: -12 }}
              />
              <Paper book={book} part={part} />
            </>
          ) : null}
        </Flex>
      </Card>
    </>
  );
}

function Summary({ book }: { book: LedgerBook }) {
  const { token } = theme.useToken();
  const ok = Math.abs(book.totals.debit - book.totals.credit) < 0.5 && Math.abs(book.totals.trialDebit - book.totals.trialCredit) < 0.5;
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
      {fact("Entries", book.entries.length)}
      {fact("Accounts", book.accounts.length)}
      {fact("Total debit", `Rp ${rp(book.totals.debit, "0")}`)}
      {fact("Total credit", `Rp ${rp(book.totals.credit, "0")}`)}
      {fact(
        "Check",
        ok ? (
          <Tag icon={<CheckCircleFilled />} color="success" style={{ marginTop: 2 }}>
            Balanced
          </Tag>
        ) : (
          <Tag icon={<CloseCircleFilled />} color="error" style={{ marginTop: 2 }}>
            Not balanced
          </Tag>
        ),
      )}
    </Flex>
  );
}

// ------------------------------------------------------------------ the paper

const th = (align: "left" | "right" = "left"): React.CSSProperties => ({ background: PAPER.brand, color: "#fff", fontWeight: 600, fontSize: 11, padding: "6px 8px", textAlign: align, whiteSpace: "nowrap" });
const td = (align: "left" | "right" = "left", extra: React.CSSProperties = {}): React.CSSProperties => ({ padding: "4px 8px", textAlign: align, fontVariantNumeric: "tabular-nums", verticalAlign: "top", ...extra });

function Paper({ book, part }: { book: LedgerBook; part: LedgerPart }) {
  const asOf = book.period.split(" s.d. ")[1];
  return (
    <PaperSheet scroll={false} company={book.company} title={PART_TITLE[part]} subtitle={part === "neraca-saldo" ? `Per ${asOf}` : `Periode ${book.period}`} printed={book.printed}>
      {part === "jurnal" ? <JournalTable book={book} /> : part === "buku-besar" ? <LedgerTables book={book} /> : <TrialTable book={book} />}
    </PaperSheet>
  );
}

function Balanced({ debit, credit }: { debit: number; credit: number }) {
  const ok = Math.abs(debit - credit) < 0.5;
  return <CheckLine ok={ok} text={ok ? "Seimbang — jumlah debit sama dengan jumlah kredit." : `Tidak seimbang — selisih ${rp(Math.abs(debit - credit))}.`} />;
}

const Clipped = ({ shown, total }: { shown: number; total: number }) =>
  total > shown ? <div style={{ marginTop: 8, color: PAPER.muted, fontStyle: "italic" }}>Pratinjau menampilkan {shown} dari {total} — file PDF, Excel dan CSV berisi semuanya.</div> : null;

function JournalTable({ book }: { book: LedgerBook }) {
  const entries = book.entries.slice(0, PREVIEW_LIMIT);
  if (book.entries.length === 0) return <Empty text="Tidak ada transaksi pada periode ini." />;
  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th()}>Tanggal</th>
            <th style={th()}>No. Bukti</th>
            <th style={th()}>Keterangan / Akun</th>
            <th style={th()}>Kode</th>
            <th style={th("right")}>Debit</th>
            <th style={th("right")}>Kredit</th>
          </tr>
        </thead>
        {entries.map((entry) => (
          <tbody key={entry.number} style={{ borderBottom: `1px solid ${PAPER.line}` }}>
            <tr style={{ background: PAPER.panel, color: PAPER.ink }}>
              <td style={td("left", { fontWeight: 600, whiteSpace: "nowrap", paddingTop: 6 })}>{shortDateId(entry.date)}</td>
              <td style={td("left", { fontWeight: 600, whiteSpace: "nowrap", paddingTop: 6 })}>{entry.number}</td>
              <td colSpan={4} style={td("left", { paddingTop: 6 })}>
                <span style={{ fontWeight: 600 }}>{entry.memo || "—"}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: PAPER.muted, border: `1px solid ${PAPER.line}`, borderRadius: 8, padding: "0 6px" }}>{entry.source}</span>
              </td>
            </tr>
            {entry.lines.map((line, index) => (
              <tr key={index}>
                <td />
                <td />
                <td style={td("left", { paddingLeft: line.credit > 0 ? 36 : 8, color: PAPER.ink })}>
                  {line.account}
                  {line.note && line.note !== entry.memo ? <span style={{ color: PAPER.muted }}> — {line.note}</span> : null}
                </td>
                <td style={td("left", { color: PAPER.muted })}>{line.code}</td>
                <td style={td("right")}>{line.debit ? rp(line.debit) : ""}</td>
                <td style={td("right")}>{line.credit ? rp(line.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr style={{ background: PAPER.soft, color: PAPER.ink, fontWeight: 700, borderTop: `1px solid ${PAPER.ink}`, borderBottom: `3px double ${PAPER.ink}` }}>
            <td colSpan={4} style={td("left", { padding: "7px 8px" })}>
              JUMLAH
            </td>
            <td style={td("right", { padding: "7px 8px" })}>{rp(book.totals.debit, "0")}</td>
            <td style={td("right", { padding: "7px 8px" })}>{rp(book.totals.credit, "0")}</td>
          </tr>
        </tfoot>
      </table>
      <Clipped shown={entries.length} total={book.entries.length} />
      <Balanced debit={book.totals.debit} credit={book.totals.credit} />
    </>
  );
}

function LedgerTables({ book }: { book: LedgerBook }) {
  if (book.accounts.length === 0) return <Empty text="Tidak ada akun dengan saldo atau mutasi." />;
  // As many accounts as fit in the preview's row budget (at least one).
  const rowsUpTo = book.accounts.map((_, index) => book.accounts.slice(0, index + 1).reduce((sum, account) => sum + account.rows.length + 2, 0));
  const shown = book.accounts.filter((_, index) => index === 0 || rowsUpTo[index] <= PREVIEW_LIMIT);
  return (
    <>
      <div style={{ color: PAPER.muted, fontSize: 11 }}>Saldo berjalan menurut saldo normal tiap akun; angka dalam kurung berarti saldo di sisi sebaliknya.</div>
      {shown.map((account) => (
        <div key={account.code} style={{ marginTop: 14 }}>
          <Flex justify="space-between" align="center" style={{ background: PAPER.soft, borderTop: `2px solid ${PAPER.brand}`, padding: "6px 8px" }} gap={8} wrap>
            <span style={{ fontWeight: 700, color: PAPER.ink, fontSize: 13 }}>
              <span style={{ fontFamily: "Geist Mono, monospace" }}>{account.code}</span> {account.name}
            </span>
            <span style={{ color: PAPER.muted, fontSize: 11 }}>
              {TYPE_ID[account.type] ?? account.type} · saldo normal {account.normal === "D" ? "debit" : "kredit"}
            </span>
          </Flex>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PAPER.ink}`, color: PAPER.muted, fontSize: 11 }}>
                <th style={td("left", { fontWeight: 600, width: 90 })}>Tanggal</th>
                <th style={td("left", { fontWeight: 600, width: 120 })}>No. Bukti</th>
                <th style={td("left", { fontWeight: 600 })}>Keterangan</th>
                <th style={td("right", { fontWeight: 600, width: 110 })}>Debit</th>
                <th style={td("right", { fontWeight: 600, width: 110 })}>Kredit</th>
                <th style={td("right", { fontWeight: 600, width: 120 })}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${PAPER.line}`, color: PAPER.muted }}>
                <td style={td()}>{shortDateId(book.from)}</td>
                <td />
                <td style={td("left", { fontStyle: "italic" })}>Saldo awal</td>
                <td />
                <td />
                <td style={td("right")}>{rp(account.opening, "0")}</td>
              </tr>
              {account.rows.map((row, index) => (
                <tr key={index} style={{ borderBottom: `1px solid ${PAPER.line}` }}>
                  <td style={td("left", { whiteSpace: "nowrap" })}>{shortDateId(row.date)}</td>
                  <td style={td("left", { whiteSpace: "nowrap" })}>{row.number}</td>
                  <td style={td()}>{row.memo}</td>
                  <td style={td("right")}>{row.debit ? rp(row.debit) : ""}</td>
                  <td style={td("right")}>{row.credit ? rp(row.credit) : ""}</td>
                  <td style={td("right", { color: PAPER.ink })}>{rp(row.balance, "0")}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${PAPER.ink}`, fontWeight: 700, color: PAPER.ink }}>
                <td colSpan={3} style={td("left", { padding: "6px 8px" })}>
                  Mutasi periode & saldo akhir
                </td>
                <td style={td("right", { padding: "6px 8px" })}>{rp(account.debit, "0")}</td>
                <td style={td("right", { padding: "6px 8px" })}>{rp(account.credit, "0")}</td>
                <td style={td("right", { padding: "6px 8px" })}>{rp(account.closing, "0")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <Clipped shown={shown.length} total={book.accounts.length} />
    </>
  );
}

function TrialTable({ book }: { book: LedgerBook }) {
  if (book.trial.length === 0) return <Empty text="Semua akun bersaldo nol." />;
  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th()}>Kode</th>
            <th style={th()}>Nama Akun</th>
            <th style={th()}>Golongan</th>
            <th style={th("right")}>Debit</th>
            <th style={th("right")}>Kredit</th>
          </tr>
        </thead>
        <tbody>
          {book.trial.map((row, index) => (
            <tr key={row.code} style={{ background: index % 2 ? PAPER.panel : undefined, borderBottom: `1px solid ${PAPER.line}` }}>
              <td style={td("left", { color: PAPER.muted, fontFamily: "Geist Mono, monospace", padding: "6px 8px" })}>{row.code}</td>
              <td style={td("left", { color: PAPER.ink, padding: "6px 8px" })}>{row.name}</td>
              <td style={td("left", { color: PAPER.muted, padding: "6px 8px" })}>{TYPE_ID[row.type] ?? row.type}</td>
              <td style={td("right", { padding: "6px 8px" })}>{row.debit ? rp(row.debit) : ""}</td>
              <td style={td("right", { padding: "6px 8px" })}>{row.credit ? rp(row.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: PAPER.soft, color: PAPER.ink, fontWeight: 700, borderTop: `1px solid ${PAPER.ink}`, borderBottom: `3px double ${PAPER.ink}` }}>
            <td colSpan={3} style={td("left", { padding: "7px 8px" })}>
              JUMLAH
            </td>
            <td style={td("right", { padding: "7px 8px" })}>{rp(book.totals.trialDebit, "0")}</td>
            <td style={td("right", { padding: "7px 8px" })}>{rp(book.totals.trialCredit, "0")}</td>
          </tr>
        </tfoot>
      </table>
      <Balanced debit={book.totals.trialDebit} credit={book.totals.trialCredit} />
      <SignBlock company={book.company} />
    </>
  );
}
