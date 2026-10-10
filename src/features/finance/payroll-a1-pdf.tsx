import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { INVOICE_LOGO_DATA_URI, INVOICE_LOGO_HEIGHT, INVOICE_LOGO_WIDTH } from "@/lib/invoice-logo";
import { BODY, BRAND, BRAND_SOFT, INK, LINE, MUTED, PANEL } from "@/lib/pdf-theme";
import type { Company } from "./exports";
import { npwpLine } from "./ledger-book";
import { A1_ITEMS, type Form1721A1 } from "./payroll-a1";

/** The 1721-A1 working per employee (A4): the numbered items of the form, for Coretax and the employee's copy. */

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 8.5, color: BODY, lineHeight: 1.4 },
  topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, marginBottom: 12, borderBottomWidth: 0.8, borderColor: LINE },
  logo: { width: INVOICE_LOGO_WIDTH / 3.2, height: INVOICE_LOGO_HEIGHT / 3.2, marginBottom: 6 },
  company: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  muted: { color: MUTED },
  title: { fontSize: 14, lineHeight: 1.2, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.8, textAlign: "right", marginBottom: 3 },
  right: { textAlign: "right", color: MUTED },
  facts: { flexDirection: "row", flexWrap: "wrap", backgroundColor: PANEL, borderRadius: 4, padding: 10, marginBottom: 12 },
  fact: { width: "50%", flexDirection: "row", paddingVertical: 2 },
  factLabel: { width: 95, color: MUTED },
  factValue: { flex: 1, color: INK },
  section: { marginTop: 10, fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: 0.8, paddingBottom: 3, borderBottomWidth: 0.8, borderColor: BRAND },
  row: { flexDirection: "row", paddingVertical: 3.2, borderBottomWidth: 0.4, borderColor: LINE },
  total: { flexDirection: "row", paddingVertical: 4, borderTopWidth: 0.8, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  final: { flexDirection: "row", paddingVertical: 6, marginTop: 4, backgroundColor: BRAND_SOFT, borderTopWidth: 0.8, borderBottomWidth: 2, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  no: { width: 22, color: MUTED },
  note: { marginTop: 12, fontSize: 7.5, color: MUTED },
  footerRule: { position: "absolute", bottom: 32, left: 40, right: 40, borderTopWidth: 0.5, borderColor: LINE },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: MUTED },
});

const rp = (value: number) => {
  const n = Math.round(Number(value));
  return n < 0 ? `(${Math.abs(n).toLocaleString("id-ID")})` : n.toLocaleString("id-ID");
};

function Item({ no, label, value, strong, final }: { no: number; label: string; value: number; strong?: boolean; final?: boolean }) {
  return (
    <View style={final ? s.final : strong ? s.total : s.row} wrap={false}>
      <Text style={[s.no, strong || final ? { color: INK } : {}]}>{no}.</Text>
      <Text style={{ flex: 1, paddingRight: 8 }}>{label}</Text>
      <Text style={{ width: 110, textAlign: "right" }}>{rp(value)}</Text>
    </View>
  );
}

function Slip({ company, form, printed }: { company: Company; form: Form1721A1; printed: string }) {
  const fact = (label: string, value: string | null | undefined) => (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value || "—"}</Text>
    </View>
  );
  const masa = `${String(form.masa_from).padStart(2, "0")} s.d. ${String(form.masa_to).padStart(2, "0")} / ${form.year}`;
  const group = (name: "bruto" | "pengurang" | "hitung") => A1_ITEMS.filter((item) => item.group === name);
  return (
    <Page size="A4" style={s.page}>
      <View style={s.topRule} fixed />
      <View style={s.header}>
        <View>
          <Image src={INVOICE_LOGO_DATA_URI} style={s.logo} />
          <Text style={s.company}>{company.name}</Text>
          <Text style={s.muted}>{npwpLine(company.npwp)} · pemotong</Text>
        </View>
        <View>
          <Text style={s.title}>REKAP 1721-A1</Text>
          <Text style={s.right}>PPh Pasal 21 pegawai tetap · tahun {form.year}</Text>
          <Text style={s.right}>Masa perolehan {masa}</Text>
        </View>
      </View>
      <View style={s.facts}>
        {fact("Nama", form.employee.name)}
        {fact("Jabatan", form.employee.position)}
        {fact("NIK / NPWP", form.employee.npwp || form.employee.nik)}
        {fact("Status PTKP", form.employee.ptkp_status)}
        {fact("Kode objek pajak", "21-100-01")}
        {fact("Mulai / berhenti", `${form.employee.joined_on}${form.employee.left_on ? ` — ${form.employee.left_on}` : ""}`)}
      </View>

      <Text style={s.section}>A. PENGHASILAN BRUTO</Text>
      {group("bruto").map((item) => <Item key={item.no} no={item.no} label={item.label} value={form.items[String(item.no)]} strong={item.no === 8} />)}
      <Text style={s.section}>B. PENGURANGAN</Text>
      {group("pengurang").map((item) => <Item key={item.no} no={item.no} label={item.label} value={form.items[String(item.no)]} strong={item.no === 11} />)}
      <Text style={s.section}>C. PENGHITUNGAN PPh PASAL 21</Text>
      {group("hitung").map((item) => (
        <Item key={item.no} no={item.no} label={item.label} value={form.items[String(item.no)]} strong={item.no === 16 || item.no === 19} final={item.no === 20} />
      ))}
      <Text style={s.note}>
        Rekap ini adalah kertas kerja dari penggajian yang telah dibukukan. Bukti potong 1721-A1 resmi dibuat di Coretax (e-Bupot 21/26) berdasarkan PPh 21 masa Desember atau
        masa terakhir bekerja. Premi asuransi (butir 5) adalah iuran JKK, JKM dan BPJS Kesehatan yang dibayar pemberi kerja; butir 10 adalah iuran JHT dan JP yang dibayar pegawai.
      </Text>
      <View style={s.footerRule} fixed />
      <Text style={s.footer} fixed>
        {company.name} · Rekap 1721-A1 {form.year} · {form.employee.name} · dicetak {printed}
      </Text>
    </Page>
  );
}

export function A1Document({ company, forms, printed }: { company: Company; forms: Form1721A1[]; printed: string }) {
  return (
    <Document title={`Rekap 1721-A1 ${forms[0]?.year ?? ""}`} author={company.name} creator="QUBIQ Admin">
      {forms.map((form) => (
        <Slip key={form.employee_id} company={company} form={form} printed={printed} />
      ))}
    </Document>
  );
}
