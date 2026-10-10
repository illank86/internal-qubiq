import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { INVOICE_LOGO_DATA_URI, INVOICE_LOGO_HEIGHT, INVOICE_LOGO_WIDTH } from "@/lib/invoice-logo";
import { BODY, BRAND, BRAND_SOFT, INK, LINE, MUTED, PANEL } from "@/lib/pdf-theme";
import type { Company } from "./exports";
import { longDateId, npwpLine } from "./ledger-book";
import type { AnnualWorking, Employee, PayrollLine, PayrollRun } from "./payroll-api";

/**
 * Payslips (slip gaji), one A4 page per employee, in Bahasa Indonesia: what
 * was earned, what was taken off (BPJS and PPh 21), the net pay, and what the
 * company paid on top. Same look as the invoices and reports.
 */

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9, color: BODY, lineHeight: 1.4 },
  topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, marginBottom: 14, borderBottomWidth: 0.8, borderColor: LINE },
  logo: { width: INVOICE_LOGO_WIDTH / 3.2, height: INVOICE_LOGO_HEIGHT / 3.2, marginBottom: 6 },
  company: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  muted: { color: MUTED },
  title: { fontSize: 16, lineHeight: 1.2, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1, textAlign: "right", marginBottom: 3 },
  right: { textAlign: "right", color: MUTED },
  confidential: { marginTop: 3, alignSelf: "flex-end", fontSize: 7, color: BRAND, borderWidth: 0.6, borderColor: BRAND, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, letterSpacing: 0.8 },
  facts: { flexDirection: "row", flexWrap: "wrap", backgroundColor: PANEL, borderRadius: 4, padding: 10, marginBottom: 14 },
  fact: { width: "50%", flexDirection: "row", paddingVertical: 2 },
  factLabel: { width: 90, color: MUTED },
  factValue: { flex: 1, color: INK },
  columns: { flexDirection: "row", gap: 16 },
  column: { flex: 1 },
  head: { backgroundColor: BRAND, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 4.5, paddingHorizontal: 6, borderRadius: 2, letterSpacing: 0.6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderColor: LINE },
  rowNote: { fontSize: 7, color: MUTED },
  subtotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4.5, paddingHorizontal: 6, borderTopWidth: 0.8, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  net: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: BRAND_SOFT, borderTopWidth: 0.8, borderBottomWidth: 2, borderColor: INK },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.8 },
  netValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  section: { marginTop: 18, fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: 0.8, paddingBottom: 3, borderBottomWidth: 0.8, borderColor: BRAND, marginBottom: 2 },
  note: { marginTop: 6, fontSize: 7.5, color: MUTED },
  footerRule: { position: "absolute", bottom: 32, left: 40, right: 40, borderTopWidth: 0.5, borderColor: LINE },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: MUTED },
});

const rp = (value: number | string) => {
  const n = Math.round(Number(value));
  const text = `Rp${Math.abs(n).toLocaleString("id-ID")}`;
  return n < 0 ? `(${text})` : text;
};

function Row({ label, value, note }: { label: string; value: number | string; note?: string | null }) {
  return (
    <View style={s.row} wrap={false}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ color: INK }}>{label}</Text>
        {note ? <Text style={s.rowNote}>{note}</Text> : null}
      </View>
      <Text>{rp(value)}</Text>
    </View>
  );
}

function Slip({ company, run, line, employee, printed }: { company: Company; run: PayrollRun; line: PayrollLine; employee: Employee | undefined; printed: string }) {
  const earningsTotal = Number(line.base_salary) + Number(line.allowance) + Number(line.other_income);
  const deductions = Number(line.kes_employee) + Number(line.jht_employee) + Number(line.jp_employee) + Number(line.pph21);
  const employer = Number(line.kes_employer) + Number(line.jht_employer) + Number(line.jp_employer) + Number(line.jkk) + Number(line.jkm);
  const annual = line.annual as AnnualWorking | null;
  const period = new Date(`${run.period.slice(0, 10)}T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
  const bank = [employee?.bank_name, employee?.bank_account_number, employee?.bank_account_name ? `a.n. ${employee.bank_account_name}` : null].filter(Boolean).join(" · ");
  const fact = (label: string, value: string | null | undefined) => (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value || "—"}</Text>
    </View>
  );
  return (
    <Page size="A4" style={s.page}>
      <View style={s.topRule} fixed />
      <View style={s.header}>
        <View>
          <Image src={INVOICE_LOGO_DATA_URI} style={s.logo} />
          <Text style={s.company}>{company.name}</Text>
          <Text style={s.muted}>{npwpLine(company.npwp)}</Text>
        </View>
        <View>
          <Text style={s.title}>SLIP GAJI</Text>
          <Text style={s.right}>Periode {period}</Text>
          {run.status !== "posted" ? <Text style={[s.right, { color: BRAND }]}>DRAF — belum final</Text> : null}
          <Text style={s.confidential}>RAHASIA</Text>
        </View>
      </View>

      <View style={s.facts}>
        {fact("Nama", line.employee_name)}
        {fact("Jabatan", line.position)}
        {fact("NIK", line.nik)}
        {fact("Status PTKP", line.ptkp_status)}
        {fact("Tanggal bayar", run.paid_on ? longDateId(run.paid_on) : null)}
        {fact("Rekening", bank || null)}
      </View>

      <View style={s.columns}>
        <View style={s.column}>
          <Text style={s.head}>PENGHASILAN</Text>
          <Row label="Gaji pokok" value={line.base_salary} />
          {Number(line.allowance) ? <Row label="Tunjangan tetap" value={line.allowance} /> : null}
          {Number(line.other_income) ? <Row label="Penghasilan lain" value={line.other_income} note={line.other_income_note} /> : null}
          <View style={s.subtotal}>
            <Text>Jumlah penghasilan</Text>
            <Text>{rp(earningsTotal)}</Text>
          </View>
        </View>
        <View style={s.column}>
          <Text style={s.head}>POTONGAN</Text>
          {Number(line.kes_employee) ? <Row label="BPJS Kesehatan" value={line.kes_employee} /> : null}
          {Number(line.jht_employee) ? <Row label="BPJS TK — Jaminan Hari Tua" value={line.jht_employee} /> : null}
          {Number(line.jp_employee) ? <Row label="BPJS TK — Jaminan Pensiun" value={line.jp_employee} /> : null}
          <Row
            label={Number(line.pph21) < 0 ? "PPh 21 (kelebihan dikembalikan)" : "PPh 21"}
            value={line.pph21}
            note={line.pph21_method === "ter" ? `TER kategori ${line.ter_category} ${Number(line.ter_rate)}% × ${rp(line.gross)}` : "Perhitungan setahun (Pasal 17)"}
          />
          <View style={s.subtotal}>
            <Text>Jumlah potongan</Text>
            <Text>{rp(deductions)}</Text>
          </View>
        </View>
      </View>

      <View style={s.net} wrap={false}>
        <Text style={s.netLabel}>GAJI BERSIH DITERIMA</Text>
        <Text style={s.netValue}>{rp(line.net_pay)}</Text>
      </View>

      {employer ? (
        <View wrap={false}>
          <Text style={s.section}>DIBAYAR PERUSAHAAN (TIDAK MEMOTONG GAJI)</Text>
          {Number(line.kes_employer) ? <Row label="BPJS Kesehatan" value={line.kes_employer} /> : null}
          {Number(line.jht_employer) ? <Row label="BPJS TK — Jaminan Hari Tua" value={line.jht_employer} /> : null}
          {Number(line.jp_employer) ? <Row label="BPJS TK — Jaminan Pensiun" value={line.jp_employer} /> : null}
          {Number(line.jkk) ? <Row label="BPJS TK — Jaminan Kecelakaan Kerja" value={line.jkk} /> : null}
          {Number(line.jkm) ? <Row label="BPJS TK — Jaminan Kematian" value={line.jkm} /> : null}
          <View style={s.subtotal}>
            <Text>Jumlah</Text>
            <Text>{rp(employer)}</Text>
          </View>
        </View>
      ) : null}

      {annual ? (
        <View wrap={false}>
          <Text style={s.section}>PERHITUNGAN PPh 21 SETAHUN ({annual.months} BULAN)</Text>
          <Row label="Penghasilan bruto setahun" value={annual.gross} />
          <Row label="Biaya jabatan" value={-annual.job_expense} />
          <Row label="Iuran JHT dan JP dibayar pegawai" value={-annual.pension_fees} />
          <Row label={`PTKP (${line.ptkp_status})`} value={-annual.ptkp} />
          <Row label="Penghasilan kena pajak (dibulatkan)" value={annual.taxable} />
          <Row label="PPh 21 terutang setahun" value={annual.tax} />
          <Row label="Sudah dipotong bulan-bulan sebelumnya" value={-annual.withheld_before} />
          <View style={s.subtotal}>
            <Text>PPh 21 bulan ini</Text>
            <Text>{rp(line.pph21)}</Text>
          </View>
        </View>
      ) : (
        <Text style={s.note}>
          Penghasilan bruto untuk PPh 21 ({rp(line.gross)}) termasuk iuran JKK, JKM dan BPJS Kesehatan yang dibayar perusahaan. Bukti potong PPh 21 tahunan (1721-A1) diberikan setelah akhir tahun.
        </Text>
      )}

      <View style={s.footerRule} fixed />
      <Text style={s.footer} fixed>
        {company.name} · Slip gaji {period} · dicetak {printed} · dokumen ini dibuat oleh sistem dan sah tanpa tanda tangan.
      </Text>
    </Page>
  );
}

/** `printed` is the print date, written in the footer (e.g. "10 Oktober 2026"). */
export function PayslipDocument({ company, run, lines, employees, printed }: { company: Company; run: PayrollRun; lines: PayrollLine[]; employees: Employee[]; printed: string }) {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return (
    <Document title={`Slip gaji ${run.period.slice(0, 7)}`} author={company.name} creator="QUBIQ Admin">
      {lines.map((line) => (
        <Slip key={line.id} company={company} run={run} line={line} employee={byId.get(line.employee_id)} printed={printed} />
      ))}
    </Document>
  );
}
