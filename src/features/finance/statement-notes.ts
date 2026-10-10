import { supabase } from "@/lib/supabase";
import { longDateId, rp } from "./ledger-book";
import type { Statements } from "./statement-book";

/**
 * Notes to the financial statements (Catatan atas Laporan Keuangan, CALK) —
 * required with the statements under SAK EMKM and SAK EP. Built from the
 * company facts on Finance settings → Reports and the books as at the period
 * end. Each note is paragraphs and, where it helps, a small table.
 */

export type NoteTable = { head: string[]; rows: (string | number)[][]; total?: (string | number)[]; money: number[] };
export type Note = { number: number; title: string; paragraphs: string[]; table?: NoteTable };

type NotesData = {
  settings: { framework: "SAK EMKM" | "SAK EP"; established_on: string | null; deed: string | null; activity: string | null; management: string | null; extra: string | null; legal_name: string | null; npwp: string | null } | null;
  address: string | null;
  cash: number;
  banks: { name: string; currency: string; balance: number }[];
  receivable_balance: number;
  receivables: { count: number; total: number; current: number; d31_60: number; d61_90: number; over_90: number };
  assets: { group: string; years: number; count: number; cost: number; accumulated: number; book: number }[];
  taxes_payable: { account: string; balance: number }[];
  prepaid_taxes: { account: string; balance: number }[];
  employees: number;
  payroll: { wages: number; employer_bpjs: number };
  tax_expense: number;
  annual: { commercial: number; positive: number; negative: number; net: number; loss: number; taxable: number; tax: number } | null;
};

export async function loadNotesData(from: string, to: string) {
  const { data, error } = await supabase.rpc("statement_notes", { p_from: from, p_to: to });
  if (error) throw error;
  return data as unknown as NotesData;
}

const n = (value: number | string | null | undefined) => Number(value ?? 0);

export function buildNotes(companyName: string, npwp: string | null, s: Statements, d: NotesData): Note[] {
  const asOf = longDateId(s.to);
  const framework = d.settings?.framework ?? "SAK EMKM";
  const notes: Note[] = [];
  const add = (title: string, paragraphs: string[], table?: NoteTable) => notes.push({ number: notes.length + 1, title, paragraphs: paragraphs.filter(Boolean), table });

  // 1. Umum
  add("Umum", [
    `${companyName} ("Perusahaan")${d.settings?.established_on ? ` didirikan pada ${longDateId(d.settings.established_on)}` : ""}${d.settings?.deed ? ` berdasarkan ${d.settings.deed}` : ""}.`,
    d.address ? `Perusahaan berkedudukan di ${d.address.replace(/\s*\n\s*/g, ", ")}.` : "",
    d.settings?.activity ? `Kegiatan usaha Perusahaan: ${d.settings.activity}.` : "",
    `Perusahaan terdaftar sebagai wajib pajak dengan ${npwp ? `NPWP ${npwp}` : "NPWP (belum diisi)"}.`,
    d.settings?.management ? `Susunan pengurus: ${d.settings.management}.` : "",
    `Jumlah karyawan per ${asOf}: ${n(d.employees)} orang.`,
  ]);

  // 2. Kebijakan akuntansi
  add("Ikhtisar kebijakan akuntansi penting", [
    `a. Dasar penyusunan. Laporan keuangan disusun berdasarkan ${framework === "SAK EMKM" ? "Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM)" : "Standar Akuntansi Keuangan Entitas Privat (SAK EP)"} dengan dasar akrual, kecuali laporan arus kas yang disusun dengan metode langsung. Mata uang penyajian adalah Rupiah.`,
    "b. Transaksi dalam mata uang asing dicatat dengan kurs Menteri Keuangan (KMK) yang berlaku pada tanggal transaksi; selisih kurs yang timbul pada saat pelunasan diakui dalam laba rugi.",
    "c. Piutang usaha disajikan sebesar jumlah tagihan yang belum dilunasi.",
    "d. Aset tetap dicatat sebesar harga perolehan dikurangi akumulasi penyusutan. Penyusutan dihitung sejak bulan perolehan dengan metode garis lurus atau saldo menurun, berdasarkan kelompok harta dan masa manfaat sesuai PMK 72/2023, sehingga penyusutan komersial sama dengan fiskal.",
    "e. Pendapatan diakui pada saat lisensi atau jasa diserahkan dan tagihan diterbitkan. Beban diakui pada saat terjadinya (dasar akrual).",
    `f. Pajak penghasilan. Beban pajak kini dihitung dari penghasilan kena pajak tahun berjalan sesuai peraturan perpajakan.${framework === "SAK EMKM" ? " Sesuai SAK EMKM, Perusahaan tidak mengakui pajak tangguhan." : " Perbedaan temporer tidak material sehingga pajak tangguhan tidak diakui."}`,
    "g. Imbalan kerja jangka pendek (gaji, tunjangan, iuran BPJS bagian perusahaan) diakui sebagai beban pada periode terutangnya.",
  ]);

  // 3. Kas dan bank
  const banks = d.banks.filter((bank) => n(bank.balance) !== 0 || d.banks.length <= 4);
  const cashTotal = n(d.cash) + banks.reduce((sum, bank) => sum + n(bank.balance), 0);
  add("Kas dan bank", [`Saldo kas dan bank per ${asOf}:`], {
    head: ["Rekening", "Jumlah (Rp)"],
    rows: [...(n(d.cash) ? [["Kas", n(d.cash)]] : []), ...banks.map((bank) => [`${bank.name}${bank.currency !== "IDR" ? ` (${bank.currency}, dalam Rupiah)` : ""}`, n(bank.balance)])].concat(
      !n(d.cash) && !banks.length ? [["Belum ada rekening bank", 0]] : [],
    ),
    total: ["Jumlah", cashTotal],
    money: [1],
  });

  // 4. Piutang usaha
  const aging = d.receivables;
  const other = n(d.receivable_balance) - n(aging.total);
  add("Piutang usaha", [`Piutang usaha per ${asOf} berdasarkan umur sejak tanggal tagihan (${n(aging.count)} tagihan belum lunas). Seluruh piutang dinilai dapat ditagih.`], {
    head: ["Umur", "Jumlah (Rp)"],
    rows: [
      ["0 – 30 hari", n(aging.current)],
      ["31 – 60 hari", n(aging.d31_60)],
      ["61 – 90 hari", n(aging.d61_90)],
      ["Lebih dari 90 hari", n(aging.over_90)],
      ...(Math.abs(other) >= 1 ? [["Lainnya / belum dicocokkan dengan tagihan", other]] : []),
    ],
    total: ["Jumlah", n(d.receivable_balance)],
    money: [1],
  });

  // 5. Aset tetap
  if (d.assets.length) {
    add("Aset tetap", [`Aset tetap per ${asOf} menurut kelompok harta:`], {
      head: ["Kelompok", "Unit", "Harga perolehan", "Akumulasi penyusutan", "Nilai buku"],
      rows: d.assets.map((asset) => [`${asset.group} (${asset.years} tahun)`, n(asset.count), n(asset.cost), n(asset.accumulated), n(asset.book)]),
      total: ["Jumlah", d.assets.reduce((sum, asset) => sum + n(asset.count), 0), d.assets.reduce((sum, asset) => sum + n(asset.cost), 0), d.assets.reduce((sum, asset) => sum + n(asset.accumulated), 0), d.assets.reduce((sum, asset) => sum + n(asset.book), 0)],
      money: [2, 3, 4],
    });
  }

  // 6. Perpajakan
  const payable = d.taxes_payable.reduce((sum, row) => sum + n(row.balance), 0);
  const prepaid = d.prepaid_taxes.reduce((sum, row) => sum + n(row.balance), 0);
  add("Perpajakan", [
    d.prepaid_taxes.length ? `Pajak dibayar dimuka per ${asOf} sebesar ${rp(prepaid, "0")}: ${d.prepaid_taxes.map((row) => `${row.account} ${rp(n(row.balance), "0")}`).join("; ")}.` : "",
    `Utang pajak dan iuran per ${asOf}:`,
  ], {
    head: ["Jenis", "Jumlah (Rp)"],
    rows: d.taxes_payable.length ? d.taxes_payable.map((row) => [row.account, n(row.balance)]) : [["Tidak ada", 0]],
    total: ["Jumlah", payable],
    money: [1],
  });
  if (d.annual) {
    notes[notes.length - 1].paragraphs.push(
      `Rekonsiliasi fiskal tahun ${s.to.slice(0, 4)}: laba komersial sebelum pajak ${rp(n(d.annual.commercial), "0")}, koreksi positif ${rp(n(d.annual.positive), "0")}, koreksi negatif ${rp(n(d.annual.negative), "0")}, penghasilan neto fiskal ${rp(n(d.annual.net), "0")}, kompensasi kerugian ${rp(n(d.annual.loss), "0")}, penghasilan kena pajak ${rp(n(d.annual.taxable), "0")}, PPh badan terutang ${rp(n(d.annual.tax), "0")}.`,
    );
  } else if (n(d.tax_expense)) {
    notes[notes.length - 1].paragraphs.push(`Beban pajak penghasilan periode ini ${rp(n(d.tax_expense), "0")}.`);
  }

  // 7. Ekuitas
  const equity = s.balance_sheet.lines.filter((line) => line.type === "equity");
  add("Ekuitas", [`Komposisi ekuitas per ${asOf}:`], {
    head: ["Uraian", "Jumlah (Rp)"],
    rows: [
      ...equity.map((line) => [line.name_id || line.name, n(line.amount)]),
      ["Laba ditahan (tahun-tahun lalu)", n(s.balance_sheet.retained_prior)],
      ["Laba (rugi) tahun berjalan", n(s.balance_sheet.profit_this_year)],
    ],
    total: ["Jumlah ekuitas", equity.reduce((sum, line) => sum + n(line.amount), 0) + n(s.balance_sheet.retained_prior) + n(s.balance_sheet.profit_this_year)],
    money: [1],
  });

  // 8. Pendapatan
  const income = s.profit_and_loss.lines.filter((line) => line.type === "income");
  add("Pendapatan", [`Rincian pendapatan untuk periode ${longDateId(s.from)} s.d. ${asOf}:`], {
    head: ["Akun", "Jumlah (Rp)"],
    rows: income.length ? income.map((line) => [`${line.code} ${line.name_id || line.name}`, n(line.amount)]) : [["Tidak ada", 0]],
    total: ["Jumlah pendapatan", n(s.profit_and_loss.income)],
    money: [1],
  });

  // 9. Beban
  const expenses = s.profit_and_loss.lines.filter((line) => line.type === "expense");
  add("Beban", [
    `Rincian beban untuk periode ${longDateId(s.from)} s.d. ${asOf}:`,
    n(d.payroll.wages) ? `Termasuk gaji dan tunjangan ${rp(n(d.payroll.wages), "0")} serta iuran BPJS bagian perusahaan ${rp(n(d.payroll.employer_bpjs), "0")}.` : "",
  ], {
    head: ["Akun", "Jumlah (Rp)"],
    rows: expenses.length ? expenses.map((line) => [`${line.code} ${line.name_id || line.name}${line.deductible === false ? " *" : ""}`, n(line.amount)]) : [["Tidak ada", 0]],
    total: ["Jumlah beban", n(s.profit_and_loss.expenses)],
    money: [1],
  });
  if (expenses.some((line) => line.deductible === false)) notes[notes.length - 1].paragraphs.push("* Tidak dapat dikurangkan dari penghasilan bruto untuk keperluan pajak (dikoreksi fiskal).");

  // 10. Lain-lain
  if (d.settings?.extra) add("Informasi lain", d.settings.extra.split(/\n{2,}/).map((part) => part.trim()));

  return notes;
}
