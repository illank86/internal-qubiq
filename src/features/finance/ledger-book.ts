import { supabase } from "@/lib/supabase";
import { company, type Company, type Signer } from "./exports";

/**
 * The "Jurnal & Buku Besar" for a period, in one shape that the preview, the
 * PDF, the Excel workbook and the CSV are all drawn from:
 *   Jurnal Umum   every entry (voucher) with its lines, debits first
 *   Buku Besar    per account: saldo awal, the movements, running and closing balance
 *   Neraca Saldo  each account's closing balance on the debit or credit side
 * Report text is in Bahasa Indonesia; amounts are Rupiah.
 */

export type LedgerLine = { code: string; account: string; debit: number; credit: number; note: string | null };
export type LedgerEntry = { number: string; date: string; source: string; memo: string; lines: LedgerLine[]; debit: number; credit: number };
export type LedgerRow = { date: string; number: string; memo: string; debit: number; credit: number; balance: number };
export type LedgerAccount = {
  code: string;
  name: string;
  type: string;
  /** Normal balance side: D (aset, beban) or K (kewajiban, ekuitas, pendapatan). */
  normal: "D" | "K";
  opening: number;
  rows: LedgerRow[];
  debit: number;
  credit: number;
  closing: number;
};
export type TrialRow = { code: string; name: string; type: string; debit: number; credit: number };

export type LedgerBook = {
  company: Company;
  from: string;
  to: string;
  period: string;
  printed: string;
  entries: LedgerEntry[];
  accounts: LedgerAccount[];
  trial: TrialRow[];
  totals: { debit: number; credit: number; trialDebit: number; trialCredit: number };
};

/** What a report header and footer need: the company, the period and the print date. */
export type ReportDoc = Pick<LedgerBook, "company" | "period" | "printed">;

export const SOURCE_ID: Record<string, string> = {
  invoice: "Penjualan",
  receipt: "Penerimaan",
  expense: "Pembelian/biaya",
  expense_payment: "Pembayaran biaya",
  tax_payment: "Setoran pajak",
  manual: "Memorial",
  reversal: "Pembalik",
  payroll: "Penggajian",
  bpjs_payment: "Setoran BPJS",
};

export const TYPE_ID: Record<string, string> = { asset: "Aset", liability: "Kewajiban", equity: "Ekuitas", income: "Pendapatan", expense: "Beban" };

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const npwpLine = (npwp: string | null) => (npwp ? `NPWP ${npwp}` : "NPWP belum diisi");

/** 2026-01-05 → 5 Januari 2026 */
export const longDateId = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** 2026-01-05 → 05/01/2026 */
export const shortDateId = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/**
 * The sign-off under a report: "Jakarta, 10 Oktober 2026" (the signing date,
 * or the print date when none was chosen), then the preparer and approver —
 * their names and titles from Finance settings, or a blank to fill by hand.
 */
export function signoffOf(who: Company, printedIso = new Date().toISOString()) {
  const { city, date } = who.signoff;
  const signer = (label: string, person: Signer) => ({ label, name: person.name, title: person.title });
  return {
    place: [city, longDateId(date || printedIso)].filter(Boolean).join(", "),
    people: [signer("Disiapkan oleh", who.signoff.prepared), signer("Disetujui oleh", who.signoff.approved)],
  };
}

/** The same report, signed on another date. */
export const signedOn = <T extends { company: Company }>(report: T, date: string): T => ({ ...report, company: { ...report.company, signoff: { ...report.company.signoff, date } } });

/** Rupiah without the symbol, Indonesian grouping; negatives in brackets, zero as a dash. */
export const rp = (value: number, zero = "–") => {
  if (!value || Math.abs(value) < 0.005) return zero;
  const text = Math.abs(Math.round(value)).toLocaleString("id-ID");
  return value < 0 ? `(${text})` : text;
};

const round = (value: number) => Math.round(value * 100) / 100;

type RawLine = { debit: number | string; credit: number | string; description: string | null; account: { code: string; name: string; name_id: string | null; type: string } };
export type RawEntry = { number: string; entry_date: string; source_type: string; memo: string | null; lines: RawLine[] };

async function entriesBetween(from: string | null, to: string, inclusiveFrom: boolean) {
  let query = supabase
    .from("journal_entries")
    .select("number, entry_date, source_type, memo, lines:journal_lines(debit, credit, description, account:accounts(code, name, name_id, type))")
    .order("entry_date")
    .order("number")
    .limit(50000);
  if (from) query = inclusiveFrom ? query.gte("entry_date", from) : query.gt("entry_date", from);
  query = inclusiveFrom ? query.lte("entry_date", to) : query.lt("entry_date", to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as RawEntry[];
}

export async function loadLedgerBook(from: string, to: string): Promise<LedgerBook> {
  const [who, inPeriod, before] = await Promise.all([company(), entriesBetween(from, to, true), entriesBetween(null, from, false)]);
  return buildLedgerBook(who, from, to, inPeriod, before);
}

/** The book from the journal entries in the period and those before it (for saldo awal). */
export function buildLedgerBook(who: Company, from: string, to: string, inPeriod: RawEntry[], before: RawEntry[]): LedgerBook {
  const fiscalStart = `${from.slice(0, 4)}-01-01`;
  const name = (line: RawLine) => line.account.name_id || line.account.name;
  const normalOf = (type: string): "D" | "K" => (type === "asset" || type === "expense" ? "D" : "K");
  const signed = (normal: "D" | "K", debit: number, credit: number) => (normal === "D" ? debit - credit : credit - debit);

  const accounts = new Map<string, LedgerAccount>();
  const accountOf = (line: RawLine) => {
    const key = line.account.code;
    let account = accounts.get(key);
    if (!account) {
      account = { code: key, name: name(line), type: line.account.type, normal: normalOf(line.account.type), opening: 0, rows: [], debit: 0, credit: 0, closing: 0 };
      accounts.set(key, account);
    }
    return account;
  };

  // Saldo awal: balance-sheet accounts carry everything before the period;
  // income and expense only this fiscal year's (they start again each year).
  for (const entry of before) {
    for (const line of entry.lines) {
      const account = accountOf(line);
      const yearly = account.type === "income" || account.type === "expense";
      if (yearly && entry.entry_date < fiscalStart) continue;
      account.opening = round(account.opening + signed(account.normal, Number(line.debit), Number(line.credit)));
    }
  }

  const entries: LedgerEntry[] = inPeriod.map((entry) => {
    // Debits first, then credits (the credit lines are indented in print).
    const lines = entry.lines
      .map((line) => ({ code: line.account.code, account: name(line), debit: Number(line.debit) || 0, credit: Number(line.credit) || 0, note: line.description }))
      .sort((a, b) => Number(b.debit > 0) - Number(a.debit > 0) || a.code.localeCompare(b.code));
    return {
      number: entry.number,
      date: entry.entry_date,
      source: SOURCE_ID[entry.source_type] ?? entry.source_type,
      memo: entry.memo ?? "",
      lines,
      debit: round(lines.reduce((sum, line) => sum + line.debit, 0)),
      credit: round(lines.reduce((sum, line) => sum + line.credit, 0)),
    };
  });

  for (const entry of inPeriod) {
    for (const line of entry.lines) {
      const account = accountOf(line);
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      const previous = account.rows.length ? account.rows[account.rows.length - 1].balance : account.opening;
      account.rows.push({ date: entry.entry_date, number: entry.number, memo: line.description || entry.memo || "", debit, credit, balance: round(previous + signed(account.normal, debit, credit)) });
      account.debit = round(account.debit + debit);
      account.credit = round(account.credit + credit);
    }
  }

  const list = [...accounts.values()]
    .map((account) => ({ ...account, closing: account.rows.length ? account.rows[account.rows.length - 1].balance : account.opening }))
    .filter((account) => account.rows.length > 0 || Math.abs(account.opening) >= 0.005)
    .sort((a, b) => a.code.localeCompare(b.code));

  const trial: TrialRow[] = list
    .filter((account) => Math.abs(account.closing) >= 0.005)
    .map((account) => {
      // A balance on its normal side goes there; a negative one goes to the other side.
      const onDebit = (account.normal === "D") === account.closing > 0;
      return { code: account.code, name: account.name, type: account.type, debit: onDebit ? Math.abs(account.closing) : 0, credit: onDebit ? 0 : Math.abs(account.closing) };
    });

  return {
    company: who,
    from,
    to,
    period: `${longDateId(from)} s.d. ${longDateId(to)}`,
    printed: longDateId(new Date().toISOString()),
    entries,
    accounts: list,
    trial,
    totals: {
      debit: round(entries.reduce((sum, entry) => sum + entry.debit, 0)),
      credit: round(entries.reduce((sum, entry) => sum + entry.credit, 0)),
      trialDebit: round(trial.reduce((sum, row) => sum + row.debit, 0)),
      trialCredit: round(trial.reduce((sum, row) => sum + row.credit, 0)),
    },
  };
}

export type LedgerPart = "jurnal" | "buku-besar" | "neraca-saldo";
export const PART_TITLE: Record<LedgerPart, string> = { jurnal: "Jurnal Umum", "buku-besar": "Buku Besar", "neraca-saldo": "Neraca Saldo" };

export const fileBase = (book: LedgerBook) => `jurnal-buku-besar_${book.from}_${book.to}`;

// ------------------------------------------------------------------ CSV
// Plain data, no styling: one header row, ISO dates, numbers without grouping.

const csvCell = (value: string | number | null) => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(round(value)) : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (rows: (string | number | null)[][]) => `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

export function ledgerCsv(book: LedgerBook, part: LedgerPart): string {
  if (part === "jurnal") {
    return csv([
      ["Tanggal", "No. Bukti", "Jenis", "Keterangan", "Kode Akun", "Nama Akun", "Debit", "Kredit", "Uraian"],
      ...book.entries.flatMap((entry) => entry.lines.map((line) => [entry.date, entry.number, entry.source, entry.memo, line.code, line.account, line.debit, line.credit, line.note ?? ""])),
    ]);
  }
  if (part === "buku-besar") {
    return csv([
      ["Kode Akun", "Nama Akun", "Tanggal", "No. Bukti", "Keterangan", "Debit", "Kredit", "Saldo"],
      ...book.accounts.flatMap((account) => [
        [account.code, account.name, book.from, "", "Saldo awal", 0, 0, account.opening],
        ...account.rows.map((row) => [account.code, account.name, row.date, row.number, row.memo, row.debit, row.credit, row.balance]),
      ]),
    ]);
  }
  return csv([["Kode Akun", "Nama Akun", "Golongan", "Debit", "Kredit"], ...book.trial.map((row) => [row.code, row.name, TYPE_ID[row.type] ?? row.type, row.debit, row.credit])]);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
