import { supabase } from "@/lib/supabase";
import { company, type Company } from "./exports";
import { longDateId } from "./ledger-book";

/**
 * The financial statements for a period — Laba Rugi, Neraca, Arus Kas — in one
 * shape that the preview, the PDF, the Excel workbook and the CSV are all drawn
 * from. Each statement is a list of rows: a section heading, account lines, a
 * subtotal, and the statement's grand total. Report text is in Bahasa Indonesia.
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
  | { kind: "line"; code: string; name: string; amount: number; note?: string; muted?: boolean }
  | { kind: "subtotal" | "total"; name: string; amount: number };

export type StatementKey = "laba-rugi" | "neraca" | "arus-kas";
export type Statement = {
  key: StatementKey;
  title: string;
  subtitle: string;
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
  /** Headline numbers for the summary. */
  facts: { income: number; expenses: number; profit: number; assets: number; cash: number };
  closedMonths: string[];
};

const round = (value: number) => Math.round(value * 100) / 100;

export function buildStatementBook(who: Company, s: Statements): StatementBook {
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

  return {
    company: who,
    from: s.from,
    to: s.to,
    period,
    printed: longDateId(new Date().toISOString()),
    statements: [labaRugi, neraca, arusKas],
    facts: { income: Number(pl.income), expenses: Number(pl.expenses), profit: Number(pl.profit), assets: totalAssets, cash: Number(cf.closing) },
    closedMonths: s.closed_months ?? [],
  };
}

export async function loadStatementBook(from: string, to: string): Promise<StatementBook> {
  const [who, statements] = await Promise.all([company(), loadStatements(from, to)]);
  return buildStatementBook(who, statements);
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
  const rows: (string | number | null)[][] = [["Bagian", "Kode Akun", "Keterangan", "Jumlah", "Baris"]];
  let section = "";
  for (const row of statement.rows) {
    if (row.kind === "section") section = row.name;
    else if (row.kind === "line") rows.push([section, row.code, row.note ? `${row.name} (${row.note})` : row.name, row.amount, "akun"]);
    else rows.push([section, "", row.name, row.amount, row.kind === "total" ? "total" : "subtotal"]);
  }
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
