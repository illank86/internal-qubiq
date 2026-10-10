import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BODY, BRAND, BRAND_SOFT, INK, LINE, MUTED } from "@/lib/pdf-theme";
import { worksheetRows, type Worksheet } from "./annual-tax";
import { rp, type ReportDoc } from "./ledger-book";
import { Footer, Header, SignBlock } from "./ledger-pdf";

/** The annual corporate tax worksheet (A4): fiscal reconciliation, the tax and the credits — the working for SPT 1771. */

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 8.5, color: BODY, lineHeight: 1.35 },
  section: { marginTop: 12, paddingVertical: 3, borderBottomWidth: 0.8, borderColor: BRAND, color: BRAND, fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 0.6 },
  row: { flexDirection: "row", paddingVertical: 3.2, borderBottomWidth: 0.4, borderColor: LINE },
  strong: { flexDirection: "row", paddingVertical: 4, borderTopWidth: 0.8, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  final: { flexDirection: "row", paddingVertical: 6, marginTop: 4, backgroundColor: BRAND_SOFT, borderTopWidth: 0.8, borderBottomWidth: 2, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK, fontSize: 9.5 },
  note: { marginTop: 10, fontSize: 7.5, color: MUTED },
});

export function AnnualTaxDocument({ book, worksheet }: { book: ReportDoc & { company: ReportDoc["company"] }; worksheet: Worksheet }) {
  const rows = worksheetRows(worksheet);
  const line = (row: (typeof rows)[number]) => (
    <View key={row.key} style={row.key === "29" ? s.final : row.strong ? s.strong : s.row} wrap={false}>
      <Text style={{ flex: 1, paddingLeft: row.indent ? 12 : 4 }}>{row.label}</Text>
      <Text style={{ width: 130, textAlign: "right", paddingRight: 4 }}>{rp(row.amount, "0")}</Text>
    </View>
  );
  return (
    <Document title={`Rekonsiliasi fiskal ${worksheet.year}`} author={book.company.name} creator="QUBIQ Admin">
      <Page size="A4" style={s.page}>
        <Header book={book} title="Rekonsiliasi Fiskal" subtitle={`Tahun pajak ${worksheet.year} · bahan SPT 1771`} />
        <Text style={s.section}>REKONSILIASI FISKAL</Text>
        {rows.filter((row) => row.section === "fiscal").map(line)}
        {worksheet.adjustments.length || worksheet.non_deductible_detail.length ? (
          <>
            <Text style={s.section}>RINCIAN KOREKSI</Text>
            {worksheet.non_deductible_detail.map((item) => (
              <View key={item.account} style={s.row} wrap={false}>
                <Text style={{ flex: 1, paddingLeft: 4 }}>(+) {item.account}</Text>
                <Text style={{ width: 130, textAlign: "right", paddingRight: 4 }}>{rp(item.amount, "0")}</Text>
              </View>
            ))}
            {worksheet.adjustments.map((item) => (
              <View key={item.id} style={s.row} wrap={false}>
                <Text style={{ flex: 1, paddingLeft: 4 }}>({item.kind === "positive" ? "+" : "-"}) {item.description}</Text>
                <Text style={{ width: 130, textAlign: "right", paddingRight: 4 }}>{rp(item.amount, "0")}</Text>
              </View>
            ))}
          </>
        ) : null}
        <Text style={s.section}>PENGHITUNGAN PPh BADAN</Text>
        {rows.filter((row) => row.section === "tax").map(line)}
        <Text style={s.note}>
          {worksheet.regime === "pp55"
            ? "Tahun ini memakai PP 55 (PPh final 0,5% dari peredaran bruto, dibayar bulanan)."
            : worksheet.facility_share === 1
              ? `Tarif ${Number(worksheet.corporate_rate)}% dengan fasilitas Pasal 31E (pengurangan 50%) karena peredaran bruto ${rp(worksheet.gross_revenue)} tidak lebih dari Rp4,8 miliar.`
              : worksheet.facility_share
                ? `Tarif ${Number(worksheet.corporate_rate)}%; fasilitas Pasal 31E (50%) atas ${(worksheet.facility_share * 100).toFixed(2)}% PKP (bagian dari peredaran bruto sampai Rp4,8 miliar).`
                : `Tarif ${Number(worksheet.corporate_rate)}%.`}{" "}
          PPh 29 dibayar sebelum SPT disampaikan, paling lambat {worksheet.due}. Kertas kerja ini disusun dari pembukuan; SPT disampaikan melalui Coretax.
        </Text>
        <SignBlock company={book.company} />
        <Footer book={book} label="Rekonsiliasi fiskal" />
      </Page>
    </Document>
  );
}
