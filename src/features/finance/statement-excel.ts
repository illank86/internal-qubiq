import type { Worksheet } from "exceljs";
import { BAD, BRAND, fill, footer, GOOD, header, INK, MONEY, MUTED, signBlock, SOFT, thin } from "./ledger-excel";
import type { Statement, StatementBook } from "./statement-book";

/**
 * The financial statements as an Excel workbook — one sheet per statement,
 * laid out like the PDF: section headings, indented account lines, subtotals
 * as SUM formulas over their lines, and the grand total double-underlined.
 */

function statementSheet(ws: Worksheet, book: StatementBook, statement: Statement) {
  const prior = Boolean(statement.columns);
  const width = prior ? 4 : 3;
  const money = prior ? [3, 4] : [3];
  header(
    ws,
    book,
    statement.title,
    prior ? ["Kode", "Keterangan", `${statement.columns!.current} (Rp)`, `${statement.columns!.prior} (Rp)`] : ["Kode", "Keterangan", "Jumlah (Rp)"],
    prior ? [10, 56, 20, 20] : [10, 62, 22],
    money,
    statement.subtitle,
  );
  // Rows of the current section's lines, so a subtotal can sum them.
  let firstLine = 0;
  let lastLine = 0;
  let running = 0;
  for (const row of statement.rows) {
    if (row.kind === "section") {
      if (ws.lastRow && ws.lastRow.number > 6) ws.addRow([]);
      const added = ws.addRow([null, row.name.toUpperCase(), null]);
      added.getCell(2).font = { bold: true, size: 10, color: { argb: BRAND } };
      for (let column = 1; column <= width; column++) added.getCell(column).border = { bottom: { style: "thin", color: { argb: BRAND } } };
      firstLine = 0;
      lastLine = 0;
      running = 0;
      continue;
    }
    if (row.kind === "line") {
      const added = ws.addRow([row.code || null, row.note ? `${row.name} — ${row.note}` : row.name, row.amount, ...(prior ? [row.prior ?? 0] : [])]);
      if (prior) added.getCell(4).font = { color: { argb: MUTED } };
      added.getCell(1).font = { color: { argb: MUTED } };
      added.getCell(2).alignment = { indent: 1 };
      if (row.muted || row.note) added.getCell(2).font = { italic: Boolean(row.muted), color: { argb: row.note ? MUTED : INK } };
      for (let column = 1; column <= width; column++) added.getCell(column).border = { bottom: thin };
      if (!firstLine) firstLine = added.number;
      lastLine = added.number;
      running += row.amount;
      continue;
    }
    // A subtotal that is the sum of its section's lines (just above it) is a SUM formula; others keep the figure.
    const sums = row.kind === "subtotal" && firstLine && lastLine === (ws.lastRow?.number ?? 0) && Math.abs(running - row.amount) < 1;
    const formula = sums ? { formula: `SUM(C${firstLine}:C${lastLine})`, result: row.amount } : row.amount;
    const priorFormula = sums ? { formula: `SUM(D${firstLine}:D${lastLine})`, result: row.prior ?? 0 } : (row.prior ?? 0);
    const added = ws.addRow([null, row.kind === "total" ? row.name.toUpperCase() : row.name, formula, ...(prior ? [priorFormula] : [])]);
    added.height = row.kind === "total" ? 20 : 17;
    for (let column = 1; column <= width; column++) {
      const cell = added.getCell(column);
      cell.font = { bold: true, color: { argb: column === 4 ? MUTED : INK } };
      if (column >= 3) cell.numFmt = MONEY;
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
    ws.mergeCells(row.number, 2, row.number, width);
    row.font = { bold: true, size: 10, color: { argb: statement.check.ok ? GOOD : BAD } };
  }
  if (statement.note) {
    const row = ws.addRow([null, statement.note]);
    ws.mergeCells(row.number, 2, row.number, width);
    row.font = { size: 9, italic: true, color: { argb: MUTED } };
    row.getCell(2).alignment = { wrapText: true };
  }
  signBlock(ws, book.company, [2, width]);
  footer(ws, book);
}

export async function statementExcel(book: StatementBook): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = book.company.name;
  workbook.created = new Date();
  workbook.title = `Laporan Keuangan ${book.period}`;
  const tabs: Record<string, string> = { "laba-rugi": BRAND, neraca: "FF3F3F46", "perubahan-ekuitas": "FF71717A", "arus-kas": GOOD };
  book.statements.forEach((statement) => {
    statementSheet(workbook.addWorksheet(statement.short, { properties: { tabColor: { argb: tabs[statement.key] } } }), book, statement);
  });
  if (book.notes.length) notesSheet(workbook.addWorksheet("CALK", { properties: { tabColor: { argb: MUTED } } }), book);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Catatan atas Laporan Keuangan: numbered headings, wrapped paragraphs, small tables. */
function notesSheet(ws: Worksheet, book: StatementBook) {
  header(ws, book, "Catatan atas Laporan Keuangan", ["Uraian", "", "", "", ""], [46, 12, 20, 20, 20], [], `Periode ${book.period}`);
  // Free text: no money format on the columns; tables set it per cell.
  for (const note of book.notes) {
    ws.addRow([]);
    const title = ws.addRow([`${note.number}. ${note.title.toUpperCase()}`]);
    ws.mergeCells(title.number, 1, title.number, 5);
    title.getCell(1).font = { bold: true, color: { argb: BRAND } };
    title.getCell(1).border = { bottom: { style: "thin", color: { argb: BRAND } } };
    for (const paragraph of note.paragraphs) {
      const row = ws.addRow([paragraph]);
      ws.mergeCells(row.number, 1, row.number, 5);
      row.getCell(1).alignment = { wrapText: true, vertical: "top" };
      row.height = Math.max(15, Math.ceil(paragraph.length / 110) * 14);
    }
    if (note.table) {
      const table = note.table;
      // Tables right-align their money into the last columns.
      const width = table.head.length;
      const place = (cells: (string | number)[]) => [cells[0], ...Array(5 - width).fill(null), ...cells.slice(1)];
      const head = ws.addRow(place(table.head));
      head.font = { bold: true, color: { argb: MUTED } };
      head.eachCell((cell) => (cell.border = { bottom: { style: "thin", color: { argb: INK } } }));
      for (const cells of table.rows) {
        const row = ws.addRow(place(cells));
        table.money.forEach((index) => (row.getCell(5 - width + 1 + index).numFmt = MONEY));
        row.eachCell((cell) => (cell.border = { bottom: thin }));
      }
      if (table.total) {
        const row = ws.addRow(place(table.total));
        table.money.forEach((index) => (row.getCell(5 - width + 1 + index).numFmt = MONEY));
        row.font = { bold: true, color: { argb: INK } };
        row.eachCell((cell) => (cell.border = { top: { style: "thin", color: { argb: INK } } }));
      }
    }
  }
  signBlock(ws, book.company, [1, 4]);
  footer(ws, book);
}
