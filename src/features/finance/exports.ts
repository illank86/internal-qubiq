import { supabase } from "@/lib/supabase";

/**
 * Exports for the accountant and the tax office: Excel workbooks (one sheet
 * per report, a header with the company, NPWP and period, real numbers in
 * Rupiah format, frozen headings and filters). Column headings are in Bahasa Indonesia (reports); the app itself
 * stays in English.
 */

export type Column = { header: string; key: string; width?: number; kind?: "text" | "money" | "number" | "date" };
export type Sheet = { name: string; title: string; columns: Column[]; rows: Record<string, unknown>[]; totals?: Record<string, number | string> };

export type Signer = { name: string | null; title: string | null };
/** Who signs the reports, set on Finance settings → Reports; `date` (ISO) is chosen when a report is made. */
export type Signoff = { city: string | null; date: string | null; prepared: Signer; approved: Signer };
export type Company = { name: string; npwp: string | null; signoff: Signoff };

export async function company(): Promise<Company> {
  const [{ data: accounting }, { data: invoice }] = await Promise.all([
    supabase
      .from("accounting_settings")
      .select("legal_name, npwp, report_city, prepared_by_name, prepared_by_title, approved_by_name, approved_by_title")
      .eq("id", true)
      .maybeSingle(),
    supabase.from("invoice_settings").select("company_name, local_company_name, tax_id").eq("id", true).maybeSingle(),
  ]);
  return {
    name: accounting?.legal_name || invoice?.local_company_name || invoice?.company_name || "QUBIQ",
    npwp: accounting?.npwp || invoice?.tax_id || null,
    signoff: {
      city: accounting?.report_city || null,
      date: null,
      prepared: { name: accounting?.prepared_by_name || null, title: accounting?.prepared_by_title || null },
      approved: { name: accounting?.approved_by_name || null, title: accounting?.approved_by_title || null },
    },
  };
}

const npwpText = (npwp: string | null) => (npwp ? `NPWP ${npwp}` : "NPWP —");
const today = () => new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** An Excel workbook: one sheet per report. */
export async function exportExcel(fileName: string, period: string, sheets: Sheet[]) {
  const [{ default: ExcelJS }, who] = await Promise.all([import("exceljs"), company()]);
  const book = new ExcelJS.Workbook();
  book.creator = who.name;
  book.created = new Date();
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 5 }] });
    const span = Math.max(sheet.columns.length, 2);
    // Header block: company, NPWP, report and period.
    ws.mergeCells(1, 1, 1, span);
    ws.getCell(1, 1).value = who.name;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    ws.mergeCells(2, 1, 2, span);
    ws.getCell(2, 1).value = npwpText(who.npwp);
    ws.mergeCells(3, 1, 3, span);
    ws.getCell(3, 1).value = `${sheet.title} — ${period}`;
    ws.getCell(3, 1).font = { bold: true, size: 12 };
    ws.getRow(5).values = sheet.columns.map((column) => column.header);
    ws.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(5).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC2410C" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    sheet.columns.forEach((column, index) => {
      const col = ws.getColumn(index + 1);
      col.width = column.width ?? (column.kind === "money" ? 18 : column.kind === "date" ? 12 : 22);
      if (column.kind === "money") col.numFmt = '#,##0;[Red]-#,##0';
      if (column.kind === "number") col.numFmt = '#,##0.##';
    });
    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((column) => {
        const value = row[column.key];
        if (value === null || value === undefined || value === "") return null;
        if (column.kind === "money" || column.kind === "number") return Number(value);
        return String(value);
      }));
    }
    if (sheet.totals) {
      const total = ws.addRow(sheet.columns.map((column) => sheet.totals?.[column.key] ?? null));
      total.font = { bold: true };
      total.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
    }
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: sheet.columns.length } };
    ws.addRow([]);
    ws.addRow([`Dicetak ${today()} dari QUBIQ Admin`]).font = { italic: true, color: { argb: "FF888888" } };
  }
  const buffer = await book.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}
