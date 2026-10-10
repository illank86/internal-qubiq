import { supabase } from "@/lib/supabase";

/**
 * Exports for the accountant and the tax office: Excel workbooks (one sheet
 * per report, a header with the company, NPWP and period, real numbers in
 * Rupiah format, frozen headings and filters) and PDF prints of the same
 * tables. Column headings are in Bahasa Indonesia (reports); the app itself
 * stays in English.
 */

export type Column = { header: string; key: string; width?: number; kind?: "text" | "money" | "number" | "date" };
export type Sheet = { name: string; title: string; columns: Column[]; rows: Record<string, unknown>[]; totals?: Record<string, number | string> };

type Company = { name: string; npwp: string | null };

async function company(): Promise<Company> {
  const [{ data: accounting }, { data: invoice }] = await Promise.all([
    supabase.from("accounting_settings").select("legal_name, npwp").eq("id", true).maybeSingle(),
    supabase.from("invoice_settings").select("company_name, local_company_name, tax_id").eq("id", true).maybeSingle(),
  ]);
  return {
    name: accounting?.legal_name || invoice?.local_company_name || invoice?.company_name || "QUBIQ",
    npwp: accounting?.npwp || invoice?.tax_id || null,
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

const fmtMoney = (value: unknown) => (value === null || value === undefined || value === "" ? "" : Math.round(Number(value)).toLocaleString("id-ID"));

/** The same tables as a printable PDF (landscape A4), for the archive or signing. */
export async function exportPdf(fileName: string, period: string, sheets: Sheet[]) {
  const [{ pdf, Document, Page, Text, View, StyleSheet }, who, React] = await Promise.all([import("@react-pdf/renderer"), company(), import("react")]);
  const h = React.createElement;
  const styles = StyleSheet.create({
    page: { padding: 28, fontSize: 7.5, fontFamily: "Helvetica", color: "#1f2937" },
    company: { fontSize: 12, fontFamily: "Helvetica-Bold" },
    title: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8 },
    muted: { color: "#6b7280" },
    head: { flexDirection: "row", backgroundColor: "#c2410c", color: "#ffffff", fontFamily: "Helvetica-Bold", paddingVertical: 4 },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 3 },
    total: { flexDirection: "row", borderTopWidth: 1, borderColor: "#1f2937", paddingVertical: 4, fontFamily: "Helvetica-Bold" },
    footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", color: "#9ca3af", fontSize: 7 },
  });
  const cell = (column: Column, value: unknown) =>
    h(Text, { key: column.key, style: { flex: (column.width ?? 18) / 10, paddingHorizontal: 3, textAlign: column.kind === "money" || column.kind === "number" ? "right" : "left" } },
      column.kind === "money" ? fmtMoney(value) : value === null || value === undefined ? "" : String(value));
  const doc = h(Document, { title: fileName, author: who.name },
    ...sheets.map((sheet) =>
      h(Page, { key: sheet.name, size: "A4", orientation: "landscape", style: styles.page, wrap: true },
        h(Text, { style: styles.company }, who.name),
        h(Text, { style: styles.muted }, npwpText(who.npwp)),
        h(Text, { style: styles.title }, `${sheet.title} — ${period}`),
        h(View, { style: { marginTop: 10 } },
          h(View, { style: styles.head, fixed: true }, ...sheet.columns.map((column) => h(Text, { key: column.key, style: { flex: (column.width ?? 18) / 10, paddingHorizontal: 3, textAlign: column.kind === "money" || column.kind === "number" ? "right" : "left" } }, column.header))),
          ...sheet.rows.map((row, index) => h(View, { key: index, style: styles.row, wrap: false }, ...sheet.columns.map((column) => cell(column, row[column.key])))),
          sheet.totals ? h(View, { style: styles.total }, ...sheet.columns.map((column) => cell(column, sheet.totals?.[column.key] ?? ""))) : null,
        ),
        h(View, { style: styles.footer, fixed: true },
          h(Text, null, `Dicetak ${today()} dari QUBIQ Admin`),
          h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Halaman ${pageNumber} dari ${totalPages}` }),
        ),
      ),
    ),
  );
  const blob = await pdf(doc as Parameters<typeof pdf>[0]).toBlob();
  download(blob, fileName);
}

/**
 * The general ledger for a period as three sheets: Jurnal Umum (every line),
 * Buku Besar (per account, with running balance) and Neraca Saldo (trial
 * balance at the end).
 */
export async function ledgerSheets(from: string, to: string): Promise<Sheet[]> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("number, entry_date, source_type, memo, lines:journal_lines(debit, credit, description, account:accounts(code, name, name_id, type))")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date")
    .order("number")
    .limit(20000);
  if (error) throw error;
  type L = { debit: number; credit: number; description: string | null; account: { code: string; name: string; name_id: string | null; type: string } };
  const entries = (data ?? []) as unknown as { number: string; entry_date: string; source_type: string; memo: string | null; lines: L[] }[];
  const accountName = (line: L) => line.account.name_id || line.account.name;

  const journal = entries.flatMap((entry) =>
    entry.lines.map((line) => ({ date: entry.entry_date, number: entry.number, memo: entry.memo, code: line.account.code, account: accountName(line), debit: Number(line.debit) || null, credit: Number(line.credit) || null, note: line.description })),
  );
  const byAccount = new Map<string, { code: string; account: string; type: string; rows: { date: string; number: string; memo: string | null; debit: number; credit: number }[] }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const key = line.account.code;
      if (!byAccount.has(key)) byAccount.set(key, { code: key, account: accountName(line), type: line.account.type, rows: [] });
      byAccount.get(key)!.rows.push({ date: entry.entry_date, number: entry.number, memo: entry.memo, debit: Number(line.debit), credit: Number(line.credit) });
    }
  }
  const accounts = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  const debitNormal = (type: string) => type === "asset" || type === "expense";
  const ledger = accounts.flatMap((account) => {
    let balance = 0;
    return [
      { date: "", number: "", memo: `${account.code} ${account.account}`, debit: null, credit: null, balance: null },
      ...account.rows.map((row) => {
        balance += debitNormal(account.type) ? row.debit - row.credit : row.credit - row.debit;
        return { date: row.date, number: row.number, memo: row.memo, debit: row.debit || null, credit: row.credit || null, balance };
      }),
    ];
  });
  const trial = accounts.map((account) => {
    const debit = account.rows.reduce((sum, row) => sum + row.debit, 0);
    const credit = account.rows.reduce((sum, row) => sum + row.credit, 0);
    return { code: account.code, account: account.account, debit: debit > credit ? debit - credit : null, credit: credit > debit ? credit - debit : null };
  });
  const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  return [
    {
      name: "Jurnal Umum",
      title: "Jurnal Umum",
      columns: [
        { header: "Tanggal", key: "date", kind: "date" },
        { header: "Nomor", key: "number", width: 16 },
        { header: "Keterangan", key: "memo", width: 40 },
        { header: "Kode", key: "code", width: 9 },
        { header: "Akun", key: "account", width: 30 },
        { header: "Debit", key: "debit", kind: "money" },
        { header: "Kredit", key: "credit", kind: "money" },
        { header: "Uraian", key: "note", width: 24 },
      ],
      rows: journal,
      totals: { memo: "Jumlah", debit: sum(journal, "debit"), credit: sum(journal, "credit") },
    },
    {
      name: "Buku Besar",
      title: "Buku Besar",
      columns: [
        { header: "Tanggal", key: "date", kind: "date" },
        { header: "Nomor", key: "number", width: 16 },
        { header: "Keterangan", key: "memo", width: 44 },
        { header: "Debit", key: "debit", kind: "money" },
        { header: "Kredit", key: "credit", kind: "money" },
        { header: "Saldo", key: "balance", kind: "money" },
      ],
      rows: ledger,
    },
    {
      name: "Neraca Saldo",
      title: "Neraca Saldo",
      columns: [
        { header: "Kode", key: "code", width: 9 },
        { header: "Akun", key: "account", width: 40 },
        { header: "Debit", key: "debit", kind: "money" },
        { header: "Kredit", key: "credit", kind: "money" },
      ],
      rows: trial,
      totals: { account: "Jumlah", debit: sum(trial, "debit"), credit: sum(trial, "credit") },
    },
  ];
}
