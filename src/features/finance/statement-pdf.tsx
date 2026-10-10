import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BODY, BRAND, BRAND_SOFT, INK, LINE, MUTED } from "@/lib/pdf-theme";
import { rp } from "./ledger-book";
import { Footer, Header, SignBlock } from "./ledger-pdf";
import type { Statement, StatementBook } from "./statement-book";

/**
 * The financial statements as a PDF (A4 portrait): Laba Rugi, Neraca and Arus
 * Kas, each on its own page, with the same header and footer as the ledger.
 * Section headings in brand orange, account lines indented, subtotals ruled,
 * the grand total double-underlined.
 */

const GOOD = "#15803d";
const BAD = "#b91c1c";

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 8.5, color: BODY, lineHeight: 1.35 },
  summary: { flexDirection: "row", gap: 8, marginBottom: 14 },
  fact: { flex: 1, borderWidth: 0.6, borderColor: LINE, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  factLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  factValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },
  head: { flexDirection: "row", backgroundColor: BRAND, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingVertical: 4.5, borderRadius: 2, marginBottom: 2 },
  section: { flexDirection: "row", marginTop: 10, paddingVertical: 3, borderBottomWidth: 0.8, borderColor: BRAND, color: BRAND, fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 0.6 },
  line: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.4, borderColor: LINE },
  subtotal: { flexDirection: "row", paddingVertical: 4, borderTopWidth: 0.8, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  total: { flexDirection: "row", paddingVertical: 5.5, marginTop: 6, backgroundColor: BRAND_SOFT, borderTopWidth: 0.8, borderBottomWidth: 2, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK, fontSize: 9 },
  check: { marginTop: 8, fontSize: 8, fontFamily: "Helvetica-Bold" },
  note: { marginTop: 4, fontSize: 7.5, color: MUTED, fontFamily: "Helvetica-Oblique" },
});

// Columns: Kode | Keterangan | Jumlah
const C = [0.9, 6, 2];
const cell = (flex: number, extra: object = {}) => ({ flex, paddingHorizontal: 4, ...extra });
const num = { textAlign: "right" as const };

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

function StatementPage({ book, statement, first }: { book: StatementBook; statement: Statement; first: boolean }) {
  return (
    <Page size="A4" style={s.page}>
      <Header book={book} title={statement.title} subtitle={statement.subtitle} />
      {first ? (
        <View style={s.summary}>
          <Fact label="Pendapatan" value={rp(book.facts.income, "0")} />
          <Fact label="Beban" value={rp(book.facts.expenses, "0")} />
          <Fact label={book.facts.profit < 0 ? "Rugi bersih" : "Laba bersih"} value={rp(book.facts.profit, "0")} />
          <Fact label="Kas & bank akhir" value={rp(book.facts.cash, "0")} />
        </View>
      ) : null}
      <View style={s.head} fixed>
        <Text style={cell(C[0])}>Kode</Text>
        <Text style={cell(C[1])}>Keterangan</Text>
        <Text style={cell(C[2], num)}>Jumlah (Rp)</Text>
      </View>
      {statement.rows.map((row, index) => {
        if (row.kind === "section")
          return (
            <View key={index} style={s.section} wrap={false} minPresenceAhead={40}>
              <Text style={cell(C[0] + C[1] + C[2])}>{row.name.toUpperCase()}</Text>
            </View>
          );
        if (row.kind === "line")
          return (
            <View key={index} style={s.line} wrap={false}>
              <Text style={cell(C[0], { color: MUTED })}>{row.code}</Text>
              <Text style={cell(C[1], { paddingLeft: 12, color: INK, fontFamily: row.muted ? "Helvetica-Oblique" : "Helvetica" })}>
                {row.name}
                {row.note ? <Text style={{ color: MUTED, fontSize: 7 }}> — {row.note}</Text> : null}
              </Text>
              <Text style={cell(C[2], num)}>{rp(row.amount)}</Text>
            </View>
          );
        return (
          <View key={index} style={row.kind === "total" ? s.total : s.subtotal} wrap={false}>
            <Text style={cell(C[0] + C[1])}>{row.kind === "total" ? row.name.toUpperCase() : row.name}</Text>
            <Text style={cell(C[2], num)}>{rp(row.amount, "0")}</Text>
          </View>
        );
      })}
      {statement.check ? <Text style={[s.check, { color: statement.check.ok ? GOOD : BAD }]}>{statement.check.text}</Text> : null}
      {statement.note ? <Text style={s.note}>{statement.note}</Text> : null}
      <SignBlock company={book.company} />
      <Footer book={book} label="Laporan Keuangan" />
    </Page>
  );
}

/** All three statements, each on its own page. */
export function StatementDocument({ book }: { book: StatementBook }) {
  return (
    <Document title={`Laporan Keuangan ${book.period}`} author={book.company.name} creator="QUBIQ Admin">
      {book.statements.map((statement, index) => (
        <StatementPage key={statement.key} book={book} statement={statement} first={index === 0} />
      ))}
    </Document>
  );
}
