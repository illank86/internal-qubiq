import { supabase } from "@/lib/supabase";
import { company, type Company } from "./exports";
import { longDateId } from "./ledger-book";
import { buildNotes, loadNotesData, type Note } from "./statement-notes";

/**
 * The financial statements for a period — Laba Rugi, Neraca, Arus Kas — in one
 * shape that the preview, the PDF, the Excel workbook and the CSV are all drawn
 * from. Each statement is a list of rows: a section heading, account lines, a
 * subtotal, and the statement's grand total. Report text is in Bahasa Indonesia.
 *
 * From the second year each statement also shows the same period a year
 * earlier (SAK EMKM 3.8: one comparative period), matched line by line.
 */

type Line = { code: string; name: string; name_id: string | null; type: string; amount: number; deductible?: boolean };
export type Statements = {
  from: string;
  to: string;
  profit_and_loss: { lines: Line[]; income: number; expenses: number; profit: number };
  balance_sheet: { lines: Line[]; retained_prior: number; profit_this_year: number };
  cash_flow: { opening: number; from_customers: number; to_suppliers: number; taxes: number; financing: number; other: number; closing: number };
  closed_months: string[];
};

export async function loadStatements(from: string, to: string): Promise<Statements> {
  const { data, error } = await supabase.rpc("financial_statements", { p_from: from, p_to: to });
  if (error) throw error;
  return data as unknown as Statements;
}

export type StatementRow =
  | { kind: "section"; name: string }
  | { kind: "line"; code: string; name: string; amount: number; prior?: number; note?: string; muted?: boolean }
  | { kind: "subtotal" | "total"; name: string; amount: number; prior?: number };

export type StatementKey = "laba-rugi" | "neraca" | "perubahan-ekuitas" | "arus-kas";
export type Statement = {
  key: StatementKey;
  /** The tab and sheet name. */
  short: string;
  title: string;
  subtitle: string;
  /** Column headings when the prior period is shown beside this one. */
  columns?: { current: string; prior: string };
  rows: StatementRow[];
  check?: { ok: boolean; text: string };
  note?: string;
};

export type StatementBook = {
  company: Company;
  from: string;
  to: string;
  period: string;
  printed: string;
  statements: Statement[];
  /** Catatan atas Laporan Keuangan. */
  notes: Note[];
  /** Whether the statements show the same period a year earlier. */
  comparative: boolean;
  /** Headline numbers for the summary. */
  facts: { income: number; expenses: number; profit: number; assets: number; cash: number };
  closedMonths: string[];
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Build the statements. `opening` is the books as at the day before the period
 * (for the statement of changes in equity); without it that statement is left out.
 */
export function buildStatementBook(who: Company, s: Statements, opening?: Statements): StatementBook {
  const name = (line: Line) => line.name_id || line.name;
  const of = (lines: Line[], type: string) => lines.filter((line) => line.type === type);
  const sum = (lines: Line[]) => round(lines.reduce((total, line) => total + Number(line.amount), 0));
  const asLines = (lines: Line[]): StatementRow[] =>
    lines.map((line) => ({ kind: "line", code: line.code, name: name(line), amount: Number(line.amount), note: line.deductible === false ? "tidak dapat dibiayakan (koreksi fiskal)" : undefined }));
  const period = `${longDateId(s.from)} s.d. ${longDateId(s.to)}`;

  // Laba Rugi
  const pl = s.profit_and_loss;
  const income = of(pl.lines, "income");
  const expenses = of(pl.lines, "expense");
  const nonDeductible = sum(expenses.filter((line) => line.deductible === false));
  const labaRugi: Statement = {
    key: "laba-rugi",
    short: "Laba Rugi",
    title: "Laporan Laba Rugi",
    subtitle: `Periode ${period}`,
    rows: [
      { kind: "section", name: "Pendapatan" },
      ...asLines(income),
      { kind: "subtotal", name: "Jumlah pendapatan", amount: Number(pl.income) },
      { kind: "section", name: "Beban" },
      ...asLines(expenses),
      { kind: "subtotal", name: "Jumlah beban", amount: Number(pl.expenses) },
      { kind: "total", name: Number(pl.profit) < 0 ? "Rugi bersih" : "Laba bersih", amount: Number(pl.profit) },
    ],
    note: nonDeductible ? `Beban tidak dapat dibiayakan Rp ${Math.round(nonDeductible).toLocaleString("id-ID")} — dikoreksi pada perhitungan PPh Badan.` : undefined,
  };

  // Neraca
  const bs = s.balance_sheet;
  const assets = of(bs.lines, "asset");
  const liabilities = of(bs.lines, "liability");
  const equity = of(bs.lines, "equity");
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = round(sum(equity) + Number(bs.retained_prior) + Number(bs.profit_this_year));
  const difference = round(totalAssets - totalLiabilities - totalEquity);
  const neraca: Statement = {
    key: "neraca",
    short: "Neraca",
    title: "Neraca",
    subtitle: `Per ${longDateId(s.to)}`,
    rows: [
      { kind: "section", name: "Aset" },
      ...asLines(assets),
      { kind: "total", name: "Jumlah aset", amount: totalAssets },
      { kind: "section", name: "Liabilitas" },
      ...asLines(liabilities),
      { kind: "subtotal", name: "Jumlah liabilitas", amount: totalLiabilities },
      { kind: "section", name: "Ekuitas" },
      ...asLines(equity),
      { kind: "line", code: "", name: "Laba ditahan (tahun-tahun lalu)", amount: Number(bs.retained_prior), muted: true },
      { kind: "line", code: "", name: "Laba (rugi) tahun berjalan", amount: Number(bs.profit_this_year), muted: true },
      { kind: "subtotal", name: "Jumlah ekuitas", amount: totalEquity },
      { kind: "total", name: "Jumlah liabilitas dan ekuitas", amount: round(totalLiabilities + totalEquity) },
    ],
    check: Math.abs(difference) < 1
      ? { ok: true, text: "Seimbang — jumlah aset sama dengan liabilitas dan ekuitas." }
      : { ok: false, text: `Tidak seimbang — selisih ${Math.round(Math.abs(difference)).toLocaleString("id-ID")}. Periksa jurnal.` },
  };

  // Arus Kas (metode langsung)
  const cf = s.cash_flow;
  const operating = round(Number(cf.from_customers) + Number(cf.to_suppliers) + Number(cf.taxes));
  const net = round(operating + Number(cf.financing) + Number(cf.other));
  const cashDifference = round(Number(cf.opening) + net - Number(cf.closing));
  const line = (label: string, amount: number): StatementRow => ({ kind: "line", code: "", name: label, amount: Number(amount) });
  const arusKas: Statement = {
    key: "arus-kas",
    short: "Arus Kas",
    title: "Laporan Arus Kas",
    subtitle: `Periode ${period} · metode langsung`,
    rows: [
      { kind: "section", name: "Arus kas dari aktivitas operasi" },
      line("Penerimaan dari pelanggan", cf.from_customers),
      line("Pembayaran kepada pemasok dan beban", cf.to_suppliers),
      line("Pembayaran pajak", cf.taxes),
      { kind: "subtotal", name: "Arus kas bersih dari aktivitas operasi", amount: operating },
      { kind: "section", name: "Arus kas dari aktivitas pendanaan" },
      line("Setoran modal dan pinjaman pemegang saham", cf.financing),
      { kind: "subtotal", name: "Arus kas bersih dari aktivitas pendanaan", amount: Number(cf.financing) },
      { kind: "section", name: "Lain-lain" },
      line("Penerimaan dan pengeluaran lainnya", cf.other),
      { kind: "section", name: "Kas dan bank" },
      { kind: "subtotal", name: "Kenaikan (penurunan) kas bersih", amount: net },
      line("Saldo kas dan bank awal periode", cf.opening),
      { kind: "total", name: "Saldo kas dan bank akhir periode", amount: Number(cf.closing) },
    ],
    check: Math.abs(cashDifference) < 1
      ? { ok: true, text: "Cocok — saldo awal ditambah arus kas bersih sama dengan saldo akhir." }
      : { ok: false, text: `Tidak cocok — selisih ${Math.round(Math.abs(cashDifference)).toLocaleString("id-ID")}.` },
    note: "Dari akun kas dan rekening bank. Angka dalam kurung adalah arus kas keluar.",
  };

  // Laporan Perubahan Ekuitas: each equity account and the retained earnings,
  // from the day before the period to its end.
  const ekuitas = opening ? equityStatement(s, opening, period, totalEquity) : null;

  return {
    company: who,
    from: s.from,
    to: s.to,
    period,
    printed: longDateId(new Date().toISOString()),
    statements: [labaRugi, neraca, ...(ekuitas ? [ekuitas] : []), arusKas],
    notes: [],
    comparative: false,
    facts: { income: Number(pl.income), expenses: Number(pl.expenses), profit: Number(pl.profit), assets: totalAssets, cash: Number(cf.closing) },
    closedMonths: s.closed_months ?? [],
  };
}

function equityStatement(s: Statements, opening: Statements, period: string, totalEquity: number): Statement {
  const accounts = new Map<string, { name: string; open: number; close: number }>();
  const add = (lines: Line[], field: "open" | "close") => {
    for (const line of lines.filter((item) => item.type === "equity")) {
      const entry = accounts.get(line.code) ?? { name: line.name_id || line.name, open: 0, close: 0 };
      entry[field] = Number(line.amount);
      accounts.set(line.code, entry);
    }
  };
  add(opening.balance_sheet.lines, "open");
  add(s.balance_sheet.lines, "close");
  const retainedOpen = round(Number(opening.balance_sheet.retained_prior) + Number(opening.balance_sheet.profit_this_year));
  const retainedClose = round(Number(s.balance_sheet.retained_prior) + Number(s.balance_sheet.profit_this_year));
  const profit = Number(s.profit_and_loss.profit);
  const otherRetained = round(retainedClose - retainedOpen - profit);
  const rows: StatementRow[] = [];
  let openTotal = retainedOpen;
  for (const [code, account] of [...accounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    openTotal = round(openTotal + account.open);
    rows.push(
      { kind: "section", name: account.name },
      { kind: "line", code, name: "Saldo awal periode", amount: account.open },
      { kind: "line", code: "", name: "Penambahan (pengurangan) dalam periode", amount: round(account.close - account.open) },
      { kind: "subtotal", name: `Saldo akhir ${account.name.toLowerCase()}`, amount: account.close },
    );
  }
  rows.push(
    { kind: "section", name: "Saldo laba" },
    { kind: "line", code: "", name: "Saldo awal periode", amount: retainedOpen },
    { kind: "line", code: "", name: profit < 0 ? "Rugi bersih periode berjalan" : "Laba bersih periode berjalan", amount: profit },
    ...(Math.abs(otherRetained) >= 1 ? [{ kind: "line" as const, code: "", name: "Dividen dan perubahan lain", amount: otherRetained }] : []),
    { kind: "subtotal", name: "Saldo akhir saldo laba", amount: retainedClose },
    { kind: "section", name: "Ekuitas" },
    { kind: "line", code: "", name: "Jumlah ekuitas awal periode", amount: openTotal },
    { kind: "total", name: "Jumlah ekuitas akhir periode", amount: totalEquity },
  );
  const closeTotal = round(retainedClose + [...accounts.values()].reduce((sum, account) => sum + account.close, 0));
  return {
    key: "perubahan-ekuitas",
    short: "Perubahan Ekuitas",
    title: "Laporan Perubahan Ekuitas",
    subtitle: `Periode ${period}`,
    rows,
    check: Math.abs(closeTotal - totalEquity) < 1
      ? { ok: true, text: "Cocok — ekuitas akhir sama dengan jumlah ekuitas di Neraca." }
      : { ok: false, text: `Tidak cocok dengan Neraca — selisih ${Math.round(Math.abs(closeTotal - totalEquity)).toLocaleString("id-ID")}.` },
  };
}

/** The date `days` before an ISO date (YYYY-MM-DD). */
const dayBefore = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
/** The same date a year earlier (29 Feb becomes 28 Feb). */
const yearBefore = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** A column heading: the year for a whole calendar year, else the dates. */
const periodLabel = (from: string, to: string) =>
  from.slice(5) === "01-01" && to.slice(5) === "12-31" && from.slice(0, 4) === to.slice(0, 4) ? to.slice(0, 4) : `${shortDate(from)} – ${shortDate(to)}`;

/** Whether a period has anything in it: money moved, or balances standing. */
const hasActivity = (s: Statements) =>
  Number(s.profit_and_loss.income) !== 0 || Number(s.profit_and_loss.expenses) !== 0 || s.balance_sheet.lines.some((line) => Number(line.amount) !== 0);

/**
 * Put the prior period's figures beside this one's. Lines match by section,
 * code and name; a line only the prior period had is added (at 0 now) before
 * its section's subtotal. Subtotals and totals match by their order.
 */
function withPrior(current: Statement, prior: Statement, columns: Statement["columns"]): Statement {
  const keyOf = (section: string, row: { code: string; name: string }) => `${section}|${row.code}|${row.name}`;
  const priorLines = new Map<string, Map<string, Extract<StatementRow, { kind: "line" }>>>();
  const priorTotals: number[] = [];
  let section = "";
  for (const row of prior.rows) {
    if (row.kind === "section") section = row.name;
    else if (row.kind === "line") {
      const lines = priorLines.get(section) ?? new Map();
      lines.set(keyOf(section, row), row);
      priorLines.set(section, lines);
    } else priorTotals.push(row.amount);
  }
  const rows: StatementRow[] = [];
  const flush = (name: string) => {
    for (const row of priorLines.get(name)?.values() ?? []) rows.push({ ...row, amount: 0, prior: row.amount });
    priorLines.delete(name);
  };
  section = "";
  let totals = 0;
  for (const row of current.rows) {
    if (row.kind === "section") {
      flush(section);
      section = row.name;
      rows.push(row);
    } else if (row.kind === "line") {
      const match = priorLines.get(section)?.get(keyOf(section, row));
      priorLines.get(section)?.delete(keyOf(section, row));
      rows.push({ ...row, prior: match ? match.amount : 0 });
    } else {
      flush(section);
      rows.push({ ...row, prior: priorTotals[totals++] ?? 0 });
    }
  }
  flush(section);
  return { ...current, columns, rows };
}

export async function loadStatementBook(from: string, to: string): Promise<StatementBook> {
  const priorFrom = yearBefore(from);
  const priorTo = yearBefore(to);
  const [who, statements, opening, prior, priorOpening, notes] = await Promise.all([
    company(),
    loadStatements(from, to),
    loadStatements(dayBefore(from), dayBefore(from)),
    loadStatements(priorFrom, priorTo),
    loadStatements(dayBefore(priorFrom), dayBefore(priorFrom)),
    loadNotesData(from, to),
  ]);
  const book = buildStatementBook(who, statements, opening);
  // The first year has nothing to compare with.
  const comparative = hasActivity(prior) || hasActivity(priorOpening);
  const result: StatementBook = { ...book, notes: buildNotes(who.name, who.npwp, statements, notes, comparative) };
  if (!comparative) return result;
  const before = buildStatementBook(who, prior, priorOpening);
  const label = (key: StatementKey) =>
    key === "neraca"
      ? { current: shortDate(to), prior: shortDate(priorTo) }
      : { current: periodLabel(from, to), prior: periodLabel(priorFrom, priorTo) };
  return {
    ...result,
    comparative: true,
    statements: result.statements.map((statement) => {
      const match = before.statements.find((item) => item.key === statement.key);
      return match ? withPrior(statement, match, label(statement.key)) : statement;
    }),
  };
}

export const statementFileBase = (book: StatementBook) => `laporan-keuangan_${book.from}_${book.to}`;

// ------------------------------------------------------------------ CSV
// Plain data, no styling: one header row, numbers without grouping.

const csvCell = (value: string | number | null) => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(round(value)) : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function statementCsv(statement: Statement): string {
  const prior = Boolean(statement.columns);
  const rows: (string | number | null)[][] = [
    ["Bagian", "Kode Akun", "Keterangan", prior ? `Jumlah ${statement.columns!.current}` : "Jumlah", ...(prior ? [`Jumlah ${statement.columns!.prior}`] : []), "Baris"],
  ];
  let section = "";
  for (const row of statement.rows) {
    if (row.kind === "section") section = row.name;
    else if (row.kind === "line") rows.push([section, row.code, row.note ? `${row.name} (${row.note})` : row.name, row.amount, ...(prior ? [row.prior ?? 0] : []), "akun"]);
    else rows.push([section, "", row.name, row.amount, ...(prior ? [row.prior ?? 0] : []), row.kind === "total" ? "total" : "subtotal"]);
  }
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
