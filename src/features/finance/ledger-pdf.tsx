import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { INVOICE_LOGO_DATA_URI, INVOICE_LOGO_HEIGHT, INVOICE_LOGO_WIDTH } from "@/lib/invoice-logo";
import { BODY, BRAND, BRAND_SOFT, INK, LINE, MUTED, PANEL } from "@/lib/pdf-theme";
import type { Company } from "./exports";
import { npwpLine, rp, shortDateId, signoffOf, TYPE_ID, type LedgerAccount, type LedgerBook, type ReportDoc } from "./ledger-book";

/**
 * The ledger book as a PDF (A4 portrait): Jurnal Umum, Buku Besar and Neraca
 * Saldo, each starting on its own page. Same look as the invoices — brand
 * orange used sparingly (top rule, column heads, account bands), neutral
 * everywhere else, tabular figures right-aligned.
 */

const GOOD = "#15803d";
const BAD = "#b91c1c";

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 8, color: BODY, lineHeight: 1.35 },
  topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, marginBottom: 12, borderBottomWidth: 0.8, borderColor: LINE },
  logo: { width: INVOICE_LOGO_WIDTH / 3.2, height: INVOICE_LOGO_HEIGHT / 3.2, marginBottom: 6 },
  company: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  muted: { color: MUTED },
  // Explicit line heights: the page's on a 15pt title makes react-pdf draw the next line over it.
  title: { fontSize: 15, lineHeight: 1.2, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1, textAlign: "right", marginBottom: 3 },
  period: { fontSize: 8.5, lineHeight: 1.3, color: MUTED, textAlign: "right" },
  head: { flexDirection: "row", backgroundColor: BRAND, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingVertical: 4.5, borderRadius: 2 },
  row: { flexDirection: "row", paddingVertical: 2.6 },
  entry: { borderBottomWidth: 0.5, borderColor: LINE, paddingBottom: 3, marginBottom: 1 },
  voucher: { flexDirection: "row", backgroundColor: PANEL, paddingVertical: 3.5, marginTop: 3, color: INK },
  chip: { fontSize: 6.5, color: MUTED, borderWidth: 0.5, borderColor: LINE, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 0.5, marginLeft: 5 },
  band: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: BRAND_SOFT, borderTopWidth: 1.2, borderColor: BRAND, paddingVertical: 5, paddingHorizontal: 6, marginTop: 12 },
  bandTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  subHead: { flexDirection: "row", borderBottomWidth: 0.8, borderColor: INK, paddingVertical: 3, fontFamily: "Helvetica-Bold", fontSize: 7, color: MUTED },
  line: { flexDirection: "row", paddingVertical: 2.4, borderBottomWidth: 0.4, borderColor: LINE },
  closing: { flexDirection: "row", paddingVertical: 3.5, borderTopWidth: 0.8, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  total: { flexDirection: "row", paddingVertical: 5, marginTop: 8, backgroundColor: BRAND_SOFT, borderTopWidth: 0.8, borderBottomWidth: 2, borderColor: INK, fontFamily: "Helvetica-Bold", color: INK },
  check: { marginTop: 6, fontSize: 8, fontFamily: "Helvetica-Bold" },
  // Footer pieces are each positioned on the page (as on the invoices): a rule, then text left and right.
  footerRule: { position: "absolute", bottom: 32, left: 34, right: 34, borderTopWidth: 0.5, borderColor: LINE },
  footerLeft: { position: "absolute", bottom: 20, left: 34, right: 240, fontSize: 7, color: MUTED },
  footerRight: { position: "absolute", top: 813, right: 34, width: 200, textAlign: "right", fontSize: 7, color: MUTED },
  summary: { flexDirection: "row", gap: 8, marginBottom: 12 },
  fact: { flex: 1, borderWidth: 0.6, borderColor: LINE, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  factLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  factValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },
  signs: { flexDirection: "row", justifyContent: "space-around", marginTop: 6 },
  place: { marginTop: 30, textAlign: "right", paddingRight: 40, color: BODY },
  sign: { width: 170, alignItems: "center" },
  signLine: { marginTop: 48, width: 150, borderTopWidth: 0.6, borderColor: INK },
});

const num = { textAlign: "right" as const };
const cell = (flex: number, extra: object = {}) => ({ flex, paddingHorizontal: 4, ...extra });

export function Header({ book, title, subtitle }: { book: ReportDoc; title: string; subtitle?: string }) {
  return (
    <>
      <View style={s.topRule} fixed />
      <View style={s.header} fixed>
        <View>
          <Image src={INVOICE_LOGO_DATA_URI} style={s.logo} />
          <Text style={s.company}>{book.company.name}</Text>
          <Text style={s.muted}>{npwpLine(book.company.npwp)}</Text>
        </View>
        <View>
          <Text style={s.title}>{title.toUpperCase()}</Text>
          <Text style={s.period}>{subtitle ?? `Periode ${book.period}`}</Text>
          <Text style={s.period}>Dalam Rupiah</Text>
        </View>
      </View>
    </>
  );
}

export function Footer({ book, label = "Jurnal & Buku Besar" }: { book: ReportDoc; label?: string }) {
  return (
    <>
      <View style={s.footerRule} fixed />
      <Text style={s.footerLeft} fixed>
        {book.company.name} · {label} · dicetak {book.printed}
      </Text>
      <Text style={s.footerRight} fixed render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
    </>
  );
}

function Balanced({ debit, credit }: { debit: number; credit: number }) {
  const ok = Math.abs(debit - credit) < 0.5;
  return (
    <Text style={[s.check, { color: ok ? GOOD : BAD }]}>
      {ok ? "Seimbang — jumlah debit sama dengan jumlah kredit." : `Tidak seimbang — selisih ${rp(Math.abs(debit - credit))}.`}
    </Text>
  );
}

// Jurnal Umum columns: Tanggal | No. Bukti | Keterangan / Akun | Kode | Debit | Kredit
const J = [1.1, 1.5, 4.6, 0.8, 1.6, 1.6];

function JournalPage({ book }: { book: LedgerBook }) {
  return (
    <Page size="A4" style={s.page}>
      <Header book={book} title="Jurnal Umum" />
      <View style={s.summary}>
        <Fact label="Jumlah bukti" value={String(book.entries.length)} />
        <Fact label="Total debit" value={rp(book.totals.debit, "0")} />
        <Fact label="Total kredit" value={rp(book.totals.credit, "0")} />
      </View>
      <View style={s.head} fixed>
        <Text style={cell(J[0])}>Tanggal</Text>
        <Text style={cell(J[1])}>No. Bukti</Text>
        <Text style={cell(J[2])}>Keterangan / Akun</Text>
        <Text style={cell(J[3])}>Kode</Text>
        <Text style={cell(J[4], num)}>Debit</Text>
        <Text style={cell(J[5], num)}>Kredit</Text>
      </View>
      {book.entries.length === 0 ? <Text style={{ marginTop: 12, color: MUTED }}>Tidak ada transaksi pada periode ini.</Text> : null}
      {book.entries.map((entry) => (
        <View key={entry.number} style={s.entry} wrap={false}>
          <View style={s.voucher}>
            <Text style={cell(J[0], { fontFamily: "Helvetica-Bold" })}>{shortDateId(entry.date)}</Text>
            <Text style={cell(J[1], { fontFamily: "Helvetica-Bold" })}>{entry.number}</Text>
            <View style={[cell(J[2] + J[3] + J[4] + J[5]), { flexDirection: "row", alignItems: "center" }]}>
              <Text style={{ fontFamily: "Helvetica-Bold", maxWidth: "85%" }}>{entry.memo || "—"}</Text>
              <Text style={s.chip}>{entry.source}</Text>
            </View>
          </View>
          {entry.lines.map((line, index) => (
            <View key={index} style={s.row}>
              <Text style={cell(J[0])} />
              <Text style={cell(J[1])} />
              {/* Credit accounts indented, as in a handwritten journal. */}
              <Text style={cell(J[2], { paddingLeft: line.credit > 0 ? 22 : 4, color: INK })}>
                {line.account}
                {line.note && line.note !== entry.memo ? <Text style={s.muted}> — {line.note}</Text> : null}
              </Text>
              <Text style={cell(J[3], { color: MUTED })}>{line.code}</Text>
              <Text style={cell(J[4], num)}>{line.debit ? rp(line.debit) : ""}</Text>
              <Text style={cell(J[5], num)}>{line.credit ? rp(line.credit) : ""}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={s.total} wrap={false}>
        <Text style={cell(J[0] + J[1] + J[2] + J[3])}>JUMLAH</Text>
        <Text style={cell(J[4], num)}>{rp(book.totals.debit, "0")}</Text>
        <Text style={cell(J[5], num)}>{rp(book.totals.credit, "0")}</Text>
      </View>
      <Balanced debit={book.totals.debit} credit={book.totals.credit} />
      <Footer book={book} />
    </Page>
  );
}

// Buku Besar columns: Tanggal | No. Bukti | Keterangan | Debit | Kredit | Saldo
const L = [1.1, 1.5, 3.9, 1.5, 1.5, 1.7];

function Account({ account, from }: { account: LedgerAccount; from: string }) {
  return (
    <View>
      <View style={s.band} wrap={false} minPresenceAhead={60}>
        <Text style={s.bandTitle}>
          {account.code}  {account.name}
        </Text>
        <Text style={{ fontSize: 7, color: MUTED }}>
          {TYPE_ID[account.type] ?? account.type} · saldo normal {account.normal === "D" ? "debit" : "kredit"}
        </Text>
      </View>
      <View style={s.subHead}>
        <Text style={cell(L[0])}>Tanggal</Text>
        <Text style={cell(L[1])}>No. Bukti</Text>
        <Text style={cell(L[2])}>Keterangan</Text>
        <Text style={cell(L[3], num)}>Debit</Text>
        <Text style={cell(L[4], num)}>Kredit</Text>
        <Text style={cell(L[5], num)}>Saldo</Text>
      </View>
      <View style={[s.line, { color: MUTED }]}>
        <Text style={cell(L[0])}>{shortDateId(from)}</Text>
        <Text style={cell(L[1])} />
        <Text style={cell(L[2], { fontFamily: "Helvetica-Oblique" })}>Saldo awal</Text>
        <Text style={cell(L[3])} />
        <Text style={cell(L[4])} />
        <Text style={cell(L[5], num)}>{rp(account.opening, "0")}</Text>
      </View>
      {account.rows.map((row, index) => (
        <View key={index} style={s.line} wrap={false}>
          <Text style={cell(L[0])}>{shortDateId(row.date)}</Text>
          <Text style={cell(L[1])}>{row.number}</Text>
          <Text style={cell(L[2])}>{row.memo}</Text>
          <Text style={cell(L[3], num)}>{row.debit ? rp(row.debit) : ""}</Text>
          <Text style={cell(L[4], num)}>{row.credit ? rp(row.credit) : ""}</Text>
          <Text style={cell(L[5], { ...num, color: INK })}>{rp(row.balance, "0")}</Text>
        </View>
      ))}
      <View style={s.closing} wrap={false}>
        <Text style={cell(L[0] + L[1] + L[2])}>Mutasi periode & saldo akhir</Text>
        <Text style={cell(L[3], num)}>{rp(account.debit, "0")}</Text>
        <Text style={cell(L[4], num)}>{rp(account.credit, "0")}</Text>
        <Text style={cell(L[5], num)}>{rp(account.closing, "0")}</Text>
      </View>
    </View>
  );
}

function LedgerPage({ book }: { book: LedgerBook }) {
  return (
    <Page size="A4" style={s.page}>
      <Header book={book} title="Buku Besar" />
      <Text style={s.muted}>
        {book.accounts.length} akun · saldo berjalan menurut saldo normal tiap akun; angka dalam kurung berarti saldo di sisi sebaliknya.
      </Text>
      {book.accounts.length === 0 ? <Text style={{ marginTop: 12, color: MUTED }}>Tidak ada akun dengan saldo atau mutasi.</Text> : null}
      {book.accounts.map((account) => (
        <Account key={account.code} account={account} from={book.from} />
      ))}
      <Footer book={book} />
    </Page>
  );
}

// Neraca Saldo columns: Kode | Nama Akun | Golongan | Debit | Kredit
const T = [0.9, 4.6, 1.4, 1.8, 1.8];

function TrialPage({ book }: { book: LedgerBook }) {
  const asOf = book.period.split(" s.d. ")[1];
  return (
    <Page size="A4" style={s.page}>
      <Header book={book} title="Neraca Saldo" subtitle={`Per ${asOf}`} />
      <View style={s.head} fixed>
        <Text style={cell(T[0])}>Kode</Text>
        <Text style={cell(T[1])}>Nama Akun</Text>
        <Text style={cell(T[2])}>Golongan</Text>
        <Text style={cell(T[3], num)}>Debit</Text>
        <Text style={cell(T[4], num)}>Kredit</Text>
      </View>
      {book.trial.map((row, index) => (
        <View key={row.code} style={[s.line, { paddingVertical: 3.5, backgroundColor: index % 2 ? PANEL : undefined }]} wrap={false}>
          <Text style={cell(T[0], { color: MUTED })}>{row.code}</Text>
          <Text style={cell(T[1], { color: INK })}>{row.name}</Text>
          <Text style={cell(T[2], { color: MUTED })}>{TYPE_ID[row.type] ?? row.type}</Text>
          <Text style={cell(T[3], num)}>{row.debit ? rp(row.debit) : ""}</Text>
          <Text style={cell(T[4], num)}>{row.credit ? rp(row.credit) : ""}</Text>
        </View>
      ))}
      <View style={s.total} wrap={false}>
        <Text style={cell(T[0] + T[1] + T[2])}>JUMLAH</Text>
        <Text style={cell(T[3], num)}>{rp(book.totals.trialDebit, "0")}</Text>
        <Text style={cell(T[4], num)}>{rp(book.totals.trialCredit, "0")}</Text>
      </View>
      <Balanced debit={book.totals.trialDebit} credit={book.totals.trialCredit} />
      <SignBlock company={book.company} />
      <Footer book={book} />
    </Page>
  );
}

/** Place and date, then the preparer and approver with a line to sign on (names and titles from Finance settings). */
export function SignBlock({ company }: { company: Company }) {
  const { place, people } = signoffOf(company);
  return (
    <View wrap={false}>
      <Text style={s.place}>{place}</Text>
      <View style={s.signs}>
        {people.map((person) => (
          <View key={person.label} style={s.sign}>
            <Text style={s.muted}>{person.label},</Text>
            <View style={s.signLine} />
            {person.name ? <Text style={{ marginTop: 3, fontFamily: "Helvetica-Bold", color: INK }}>{person.name}</Text> : <Text style={[s.muted, { marginTop: 3, fontSize: 7 }]}>Nama</Text>}
            {person.title ? <Text style={[s.muted, { fontSize: 7.5 }]}>{person.title}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

/** The whole book: Jurnal Umum, Buku Besar, Neraca Saldo. */
export function LedgerDocument({ book }: { book: LedgerBook }) {
  return (
    <Document title={`Jurnal & Buku Besar ${book.period}`} author={book.company.name} creator="QUBIQ Admin">
      <JournalPage book={book} />
      <LedgerPage book={book} />
      <TrialPage book={book} />
    </Document>
  );
}
