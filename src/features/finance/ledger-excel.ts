import type { Fill, Font, Worksheet } from "exceljs";
import { npwpLine, type LedgerBook, TYPE_ID } from "./ledger-book";

/**
 * The ledger book as an Excel workbook — three sheets, laid out like the PDF:
 * a header with the company, NPWP, report and period; brand-orange column
 * heads (repeated on every printed page); real numbers in Rupiah format and
 * real dates, so the accountant can sum, filter and pivot.
 */

const BRAND = "FFC2410C";
const SOFT = "FFFFF4EC";
const PANEL = "FFF7F7F8";
const INK = "FF18181B";
const MUTED = "FF71717A";
const LINE = "FFE4E4E7";
const GOOD = "FF15803D";
const BAD = "FFB91C1C";

const MONEY = '#,##0;(#,##0);"–"';
const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: LINE } };
const date = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** Rows 1–4: company, NPWP, title, period; row 6: the column heads. Returns the head row number. */
function header(ws: Worksheet, book: LedgerBook, title: string, heads: string[], widths: number[], money: number[], subtitle = `Periode ${book.period}`) {
  const span = heads.length;
  widths.forEach((width, index) => (ws.getColumn(index + 1).width = width));
  money.forEach((column) => (ws.getColumn(column).numFmt = MONEY));
  const line = (row: number, value: string, font: Partial<Font>) => {
    ws.mergeCells(row, 1, row, span);
    const cell = ws.getCell(row, 1);
    cell.value = value;
    cell.font = { name: "Calibri", ...font };
  };
  line(1, book.company.name, { bold: true, size: 14, color: { argb: INK } });
  line(2, npwpLine(book.company.npwp), { size: 10, color: { argb: MUTED } });
  line(3, title.toUpperCase(), { bold: true, size: 13, color: { argb: BRAND } });
  line(4, `${subtitle} · dalam Rupiah`, { size: 10, color: { argb: MUTED } });
  ws.getRow(3).height = 20;
  const head = ws.getRow(6);
  head.values = heads;
  head.height = 20;
  head.eachCell((cell, column) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(BRAND);
    cell.alignment = { vertical: "middle", horizontal: money.includes(column) ? "right" : "left" };
  });
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "6:6",
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = {
    oddFooter: `&L&8${book.company.name} — ${title}&R&8Halaman &P dari &N`,
  };
  return 6;
}

function footer(ws: Worksheet, book: LedgerBook) {
  ws.addRow([]);
  const row = ws.addRow([`Dicetak ${book.printed} dari QUBIQ Admin`]);
  row.font = { italic: true, size: 9, color: { argb: MUTED } };
}

function balanceNote(ws: Worksheet, span: number, debit: number, credit: number) {
  const ok = Math.abs(debit - credit) < 0.5;
  const row = ws.addRow([ok ? "✓ Seimbang — jumlah debit sama dengan jumlah kredit." : `✗ Tidak seimbang — selisih ${Math.round(Math.abs(debit - credit)).toLocaleString("id-ID")}.`]);
  ws.mergeCells(row.number, 1, row.number, span);
  row.font = { bold: true, size: 10, color: { argb: ok ? GOOD : BAD } };
}

type Value = string | number | null | { formula: string; result: number };
/** A SUM over the data rows, so the total stays right if the sheet is edited. */
const sum = (column: string, first: number, last: number, result: number): Value => (last >= first ? { formula: `SUM(${column}${first}:${column}${last})`, result } : result);

function totalRow(ws: Worksheet, values: Value[], money: number[]) {
  const row = ws.addRow(values);
  row.height = 18;
  for (let column = 1; column <= values.length; column++) {
    const cell = row.getCell(column);
    if (money.includes(column)) cell.numFmt = MONEY;
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = fill(SOFT);
    cell.border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
  }
  return row;
}

function journalSheet(ws: Worksheet, book: LedgerBook) {
  const money = [5, 6];
  header(ws, book, "Jurnal Umum", ["Tanggal", "No. Bukti", "Keterangan / Akun", "Kode", "Debit", "Kredit"], [12, 17, 52, 9, 18, 18], money);
  for (const entry of book.entries) {
    // The voucher line: date, number, what it was, and its kind.
    const head = ws.addRow([date(entry.date), entry.number, `${entry.memo || "—"}  ·  ${entry.source}`, null, null, null]);
    head.getCell(1).numFmt = "dd/mm/yyyy";
    for (let column = 1; column <= 6; column++) {
      const cell = head.getCell(column);
      cell.fill = fill(PANEL);
      cell.font = { bold: column <= 3, color: { argb: INK } };
      cell.border = { top: thin };
    }
    entry.lines.forEach((line, index) => {
      const row = ws.addRow([null, null, line.note && line.note !== entry.memo ? `${line.account} — ${line.note}` : line.account, line.code, line.debit || null, line.credit || null]);
      // Credit accounts are indented, as in a handwritten journal.
      row.getCell(3).alignment = { indent: line.credit > 0 ? 3 : 1 };
      row.getCell(4).font = { color: { argb: MUTED } };
      if (index === entry.lines.length - 1) for (let column = 1; column <= 6; column++) row.getCell(column).border = { bottom: thin };
    });
  }
  const last = ws.lastRow?.number ?? 6;
  ws.addRow([]);
  totalRow(ws, [null, null, "JUMLAH", null, sum("E", 7, last, book.totals.debit), sum("F", 7, last, book.totals.credit)], money);
  balanceNote(ws, 6, book.totals.debit, book.totals.credit);
  footer(ws, book);
}

function ledgerSheet(ws: Worksheet, book: LedgerBook) {
  const money = [4, 5, 6];
  header(ws, book, "Buku Besar", ["Tanggal", "No. Bukti", "Keterangan", "Debit", "Kredit", "Saldo"], [12, 17, 50, 18, 18, 19], money);
  for (const account of book.accounts) {
    // The account band: code and name, its group and normal side.
    const band = ws.addRow([`${account.code}  ${account.name}`, null, null, `${TYPE_ID[account.type] ?? account.type} · saldo normal ${account.normal === "D" ? "Debit" : "Kredit"}`]);
    ws.mergeCells(band.number, 1, band.number, 3);
    ws.mergeCells(band.number, 4, band.number, 6);
    band.height = 20;
    band.getCell(1).font = { bold: true, size: 11, color: { argb: INK } };
    band.getCell(4).font = { size: 9, color: { argb: MUTED } };
    band.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
    band.getCell(1).alignment = { vertical: "middle" };
    for (let column = 1; column <= 6; column++) {
      band.getCell(column).fill = fill(SOFT);
      band.getCell(column).border = { top: { style: "medium", color: { argb: BRAND } } };
    }
    const opening = ws.addRow([date(book.from), null, "Saldo awal", null, null, account.opening]);
    opening.getCell(1).numFmt = "dd/mm/yyyy";
    opening.font = { italic: true, color: { argb: MUTED } };
    for (const item of account.rows) {
      const row = ws.addRow([date(item.date), item.number, item.memo, item.debit || null, item.credit || null, item.balance]);
      row.getCell(1).numFmt = "dd/mm/yyyy";
      for (let column = 1; column <= 6; column++) row.getCell(column).border = { bottom: thin };
    }
    const close = ws.addRow([null, null, "Mutasi periode & saldo akhir", account.debit, account.credit, account.closing]);
    for (let column = 1; column <= 6; column++) {
      const cell = close.getCell(column);
      cell.font = { bold: true, color: { argb: INK } };
      cell.border = { top: { style: "thin", color: { argb: INK } } };
    }
    ws.addRow([]);
  }
  footer(ws, book);
}

function trialSheet(ws: Worksheet, book: LedgerBook) {
  const money = [4, 5];
  header(ws, book, "Neraca Saldo", ["Kode", "Nama Akun", "Golongan", "Debit", "Kredit"], [10, 46, 14, 20, 20], money, `Per ${book.period.split(" s.d. ")[1]}`);
  for (const [index, item] of book.trial.entries()) {
    const row = ws.addRow([item.code, item.name, TYPE_ID[item.type] ?? item.type, item.debit || null, item.credit || null]);
    row.getCell(3).font = { color: { argb: MUTED } };
    for (let column = 1; column <= 5; column++) {
      row.getCell(column).border = { bottom: thin };
      if (index % 2) row.getCell(column).fill = fill(PANEL);
    }
  }
  const last = ws.lastRow?.number ?? 6;
  totalRow(ws, [null, "JUMLAH", null, sum("D", 7, last, book.totals.trialDebit), sum("E", 7, last, book.totals.trialCredit)], money);
  balanceNote(ws, 5, book.totals.trialDebit, book.totals.trialCredit);
  // Sign-off: prepared and approved.
  ws.addRow([]);
  ws.addRow([]);
  const labels = ws.addRow([null, "Disiapkan oleh,", null, "Disetujui oleh,"]);
  labels.font = { color: { argb: MUTED } };
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  const lines = ws.addRow([null, "(                                        )", null, "(                                        )"]);
  lines.font = { color: { argb: MUTED } };
  footer(ws, book);
}

export async function ledgerExcel(book: LedgerBook): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = book.company.name;
  workbook.created = new Date();
  workbook.title = `Jurnal & Buku Besar ${book.period}`;
  journalSheet(workbook.addWorksheet("Jurnal Umum", { properties: { tabColor: { argb: BRAND } } }), book);
  ledgerSheet(workbook.addWorksheet("Buku Besar", { properties: { tabColor: { argb: "FF3F3F46" } } }), book);
  trialSheet(workbook.addWorksheet("Neraca Saldo", { properties: { tabColor: { argb: GOOD } } }), book);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
