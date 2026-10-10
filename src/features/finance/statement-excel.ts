import type { Worksheet } from "exceljs";
import { BAD, BRAND, fill, footer, GOOD, header, INK, MONEY, MUTED, signBlock, SOFT, thin } from "./ledger-excel";
import type { Statement, StatementBook } from "./statement-book";

/**
 * The financial statements as an Excel workbook — one sheet per statement,
 * laid out like the PDF: section headings, indented account lines, subtotals
 * as SUM formulas over their lines, and the grand total double-underlined.
 */

function statementSheet(ws: Worksheet, book: StatementBook, statement: Statement) {
  const money = [3];
  header(ws, book, statement.title, ["Kode", "Keterangan", "Jumlah (Rp)"], [10, 62, 22], money, statement.subtitle);
  // Rows of the current section's lines, so a subtotal can sum them.
  let firstLine = 0;
  let lastLine = 0;
  let running = 0;
  for (const row of statement.rows) {
    if (row.kind === "section") {
      if (ws.lastRow && ws.lastRow.number > 6) ws.addRow([]);
      const added = ws.addRow([null, row.name.toUpperCase(), null]);
      added.getCell(2).font = { bold: true, size: 10, color: { argb: BRAND } };
      for (let column = 1; column <= 3; column++) added.getCell(column).border = { bottom: { style: "thin", color: { argb: BRAND } } };
      firstLine = 0;
      lastLine = 0;
      running = 0;
      continue;
    }
    if (row.kind === "line") {
      const added = ws.addRow([row.code || null, row.note ? `${row.name} — ${row.note}` : row.name, row.amount]);
      added.getCell(1).font = { color: { argb: MUTED } };
      added.getCell(2).alignment = { indent: 1 };
      if (row.muted || row.note) added.getCell(2).font = { italic: Boolean(row.muted), color: { argb: row.note ? MUTED : INK } };
      for (let column = 1; column <= 3; column++) added.getCell(column).border = { bottom: thin };
      if (!firstLine) firstLine = added.number;
      lastLine = added.number;
      running += row.amount;
      continue;
    }
    // A subtotal that is the sum of its section's lines (just above it) is a SUM formula; others keep the figure.
    const sums = row.kind === "subtotal" && firstLine && lastLine === (ws.lastRow?.number ?? 0) && Math.abs(running - row.amount) < 1;
    const formula = sums ? { formula: `SUM(C${firstLine}:C${lastLine})`, result: row.amount } : row.amount;
    const added = ws.addRow([null, row.kind === "total" ? row.name.toUpperCase() : row.name, formula]);
    added.height = row.kind === "total" ? 20 : 17;
    for (let column = 1; column <= 3; column++) {
      const cell = added.getCell(column);
      cell.font = { bold: true, color: { argb: INK } };
      if (column === 3) cell.numFmt = MONEY;
      cell.alignment = { vertical: "middle" };
      if (row.kind === "total") {
        cell.fill = fill(SOFT);
        cell.border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
      } else {
        cell.border = { top: { style: "thin", color: { argb: INK } } };
      }
    }
    firstLine = 0;
    lastLine = 0;
    running = 0;
  }
  if (statement.check) {
    const row = ws.addRow([null, `${statement.check.ok ? "✓" : "✗"} ${statement.check.text}`]);
    ws.mergeCells(row.number, 2, row.number, 3);
    row.font = { bold: true, size: 10, color: { argb: statement.check.ok ? GOOD : BAD } };
  }
  if (statement.note) {
    const row = ws.addRow([null, statement.note]);
    ws.mergeCells(row.number, 2, row.number, 3);
    row.font = { size: 9, italic: true, color: { argb: MUTED } };
    row.getCell(2).alignment = { wrapText: true };
  }
  signBlock(ws, book.company, [2, 3]);
  footer(ws, book);
}

export async function statementExcel(book: StatementBook): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = book.company.name;
  workbook.created = new Date();
  workbook.title = `Laporan Keuangan ${book.period}`;
  const tabs = [BRAND, "FF3F3F46", GOOD];
  book.statements.forEach((statement, index) => {
    const name = statement.key === "laba-rugi" ? "Laba Rugi" : statement.key === "neraca" ? "Neraca" : "Arus Kas";
    statementSheet(workbook.addWorksheet(name, { properties: { tabColor: { argb: tabs[index] } } }), book, statement);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
