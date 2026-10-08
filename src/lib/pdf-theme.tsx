
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { INVOICE_LOGO_DATA_URI, INVOICE_LOGO_HEIGHT, INVOICE_LOGO_WIDTH } from "@/lib/invoice-logo";

/**
 * The look shared by every QUBIQ document PDF — invoices and quotations: the
 * palette, the type scale, and the pieces both are built from (header with a
 * status stamp, the line-item table, the totals, the footer with page
 * numbers).
 *
 * Design: the site's palette, used sparingly — brand orange for the top rule,
 * section labels and the headline amount; everything else neutral. Built-in
 * Helvetica, so there are no font files to ship.
 */

// Wrap at spaces only. react-pdf hyphenates by default, which split words like
// "Unit-ed" in addresses and bank names.
Font.registerHyphenationCallback((word) => [word]);

export const INK = "#18181b";
export const BODY = "#3f3f46";
export const MUTED = "#71717a";
export const LINE = "#e4e4e7";
export const PANEL = "#fafafa";
export const BRAND = "#c2410c";
export const BRAND_SOFT = "#fff4ec";

/** Stamp colours: coloured text in a coloured outline, no fill. */
export const STAMP = {
  red: "#b91c1c",
  green: "#15803d",
  slate: "#3f3f46",
  brand: BRAND,
};

/**
 * Text width inside the headline-amount cell: the A4 content width (595 − 2×46)
 * shared 1 : 1 : 1 : 1.45 by the four facts, less the cell's 12pt padding.
 */
export const FACT_DUE_WIDTH = ((595 - 92) * 1.45) / 4.45 - 24;

export const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 70, paddingHorizontal: 46, fontFamily: "Helvetica", fontSize: 9, color: BODY, lineHeight: 1.45 },
  topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: INVOICE_LOGO_WIDTH / 2.3, height: INVOICE_LOGO_HEIGHT / 2.3 },
  titleBlock: { alignItems: "flex-end" },
  // Explicit line heights: the page's 1.45 is for body text, and on a 20pt
  // title it made react-pdf misjudge the line box, drawing the number on top
  // of the title.
  title: { fontSize: 20, lineHeight: 1.2, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1.5 },
  number: { fontSize: 9.5, lineHeight: 1.2, color: MUTED, marginTop: 3 },
  status: { marginTop: 9, borderWidth: 1, borderRadius: 3, paddingTop: 4, paddingBottom: 3, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  statusText: { fontFamily: "Helvetica-Bold", fontSize: 7.5, lineHeight: 1, letterSpacing: 1, textAlign: "center" },

  parties: { flexDirection: "row", marginTop: 30, gap: 18 },
  party: { flex: 1 },
  label: { fontSize: 7, color: BRAND, fontFamily: "Helvetica-Bold", letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 5 },
  partyName: { fontFamily: "Helvetica-Bold", color: INK, fontSize: 9.5, marginBottom: 1 },
  muted: { color: MUTED },

  facts: { flexDirection: "row", marginTop: 24, backgroundColor: PANEL, borderRadius: 6, borderWidth: 0.6, borderColor: LINE },
  fact: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  factDivider: { borderLeftWidth: 0.6, borderColor: LINE },
  factLabel: { fontSize: 7, color: MUTED, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 },
  factValue: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },
  factDue: { fontSize: 12, color: BRAND, fontFamily: "Helvetica-Bold" },

  table: { marginTop: 26 },
  headRow: { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderColor: INK },
  headCell: { fontSize: 7, color: MUTED, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.6, borderColor: LINE },
  cNo: { width: 20, color: MUTED },
  cDesc: { flex: 1, paddingRight: 10 },
  cQty: { width: 34, textAlign: "right" },
  cPrice: { width: 100, textAlign: "right" },
  cAmount: { width: 106, textAlign: "right", color: INK },
  itemName: { fontFamily: "Helvetica-Bold", color: INK },
  groupRow: { flexDirection: "row", alignItems: "baseline", marginTop: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: PANEL, borderRadius: 4 },
  groupName: { flex: 1, fontFamily: "Helvetica-Bold", color: INK },
  editionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", paddingTop: 9, paddingBottom: 5, paddingLeft: 20, borderBottomWidth: 0.6, borderColor: LINE },
  editionName: { fontFamily: "Helvetica-Bold", color: BRAND },
  groupSubtotal: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 6, borderBottomWidth: 1, borderColor: INK },

  summary: { flexDirection: "row", marginTop: 18, gap: 24, alignItems: "flex-start" },
  terms: { flex: 1 },
  totals: { width: 236 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 10 },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: BRAND_SOFT, borderRadius: 5 },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: INK },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 12.5, color: BRAND },

  // A full-width boxed section (How to pay; Terms & conditions; Acceptance).
  section: { marginTop: 26, borderWidth: 0.6, borderColor: LINE, borderRadius: 6, padding: 14 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 },
  sectionAside: { fontSize: 9, color: INK, textAlign: "right", flex: 1 },
  card: { backgroundColor: PANEL, borderWidth: 0.6, borderColor: LINE, borderRadius: 5, padding: 10 },
  sectionNote: { marginTop: 10, fontSize: 9, color: INK },

  // Positioned from the top: a render-prop Text anchored with `bottom` came out empty.
  pageNumber: { position: "absolute", top: 812, right: 46, width: 200, textAlign: "right", fontSize: 8, color: INK },
  continued: { position: "absolute", top: 16, right: 46, width: 300, textAlign: "right", fontSize: 8, color: INK },
  // Behind everything: drawn first, very light, diagonal.
  watermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 150,
    letterSpacing: 12,
    color: "#ececee",
    transform: "rotate(-32deg)",
  },
  footerRule: { position: "absolute", bottom: 46, left: 46, right: 46, borderTopWidth: 0.6, borderColor: LINE },
  footerLeft: { position: "absolute", bottom: 30, left: 46, right: 260, fontSize: 8.5, color: INK, fontFamily: "Helvetica-Oblique" },
  footerRight: { position: "absolute", bottom: 30, right: 46, width: 200, textAlign: "right", fontSize: 8.5, color: INK },
});

/** Our seller block, as stored on each document (from Site and Sales settings). */
export type SellerBlock = {
  company_name?: string | null;
  address?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  bank_details?: string | null;
  footer_note?: string | null;
};

/**
 * The font size at which `text` fits on one line in `width` points, capped at
 * `max`. Large amounts (IDR 1,065,600,000.00) shrink instead of overflowing
 * their box or wrapping mid-number. Built-in Helvetica: digits are 0.556 em
 * and nothing in an amount is wider, so 0.58 em per character is a safe bound.
 */
export function fit(text: string, max: number, width: number, min = 6) {
  return Math.max(min, Math.min(max, width / (text.length * 0.58)));
}

/** Multi-line plain text, one Text per non-empty line. */
export function Lines({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <>
      {text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map((line, index) => (
          <Text key={index}>{line}</Text>
        ))}
    </>
  );
}

/**
 * What sits on every page behind and above the content: an optional diagonal
 * watermark (VOID, EXPIRED…), the brand rule, and from page 2 a line saying
 * which document the page belongs to.
 */
export function PageChrome({ watermark, continuedLabel }: { watermark?: string; continuedLabel: string }) {
  return (
    <>
      {watermark ? (
        // Sized to the word: VOID at 150pt, longer words smaller so they still fit the diagonal.
        <Text style={[styles.watermark, { fontSize: Math.min(150, 760 / watermark.length) }]} fixed>
          {watermark}
        </Text>
      ) : null}
      <View style={styles.topRule} fixed />
      <Text style={styles.continued} fixed render={({ pageNumber }) => (pageNumber > 1 ? `${continuedLabel} (continued)` : "")} />
    </>
  );
}

/** Logo on the left; title, number and status stamp on the right. */
export function DocumentHeader({
  title,
  number,
  reference,
  stamp,
  stampColor,
}: {
  title: string;
  number: string | null;
  /** A line under the number, e.g. "Quotation ref. QUO-2026-0001". */
  reference?: string | null;
  stamp: string;
  stampColor: string;
}) {
  return (
    <View style={styles.header}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
      <Image src={INVOICE_LOGO_DATA_URI} style={styles.logo} />
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.number}>{number}</Text>
        {reference ? <Text style={[styles.number, { marginTop: 1 }]}>{reference}</Text> : null}
        <View style={[styles.status, { borderColor: stampColor }]}>
          <Text style={[styles.statusText, { color: stampColor }]}>{stamp}</Text>
        </View>
      </View>
    </View>
  );
}

/** Our name and contact details, as a party column. */
export function SellerParty({ seller, label = "From" }: { seller: SellerBlock; label?: string }) {
  return (
    <View style={styles.party}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.partyName}>{seller.company_name ?? "QUBIQ"}</Text>
      <Lines text={seller.address} />
      {seller.tax_id ? <Text>Tax ID {seller.tax_id}</Text> : null}
      {seller.email ? <Text>{seller.email}</Text> : null}
      {seller.phone ? <Text>{seller.phone}</Text> : null}
    </View>
  );
}

export type DocumentLine = {
  id: string;
  description: string;
  detail: string | null;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
  group_id?: string | null;
  edition_id?: string | null;
  module_id?: string | null;
};

/**
 * An edition heading ("Plant edition"): the line a quotation writes ahead of
 * an edition's modules — the edition, no module, no price. (Before editions
 * lost their own price, an edition line had an amount and printed as a row.)
 */
const isEditionHeading = (item: DocumentLine) => Boolean(item.edition_id) && !item.module_id && Number(item.amount) === 0;

function EditionHeading({ item }: { item: DocumentLine }) {
  return (
    <View style={styles.editionRow} minPresenceAhead={30} wrap={false}>
      <Text style={styles.editionName}>{item.description}</Text>
      {item.detail ? <Text style={styles.muted}>{`  ·  ${item.detail}`}</Text> : null}
    </View>
  );
}

/** Lines in order: an edition heading as a heading (no server groups), the rest numbered from `start`. */
function ItemLines({ items, start, money }: { items: DocumentLine[]; start: number; money: (amount: number | string) => string }) {
  // Each priced line's number: `start` plus the priced lines before it.
  const numbers = items.map((_, index) => start + items.slice(0, index).filter((item) => !isEditionHeading(item)).length);
  return (
    <>
      {items.map((item, index) => {
        if (isEditionHeading(item)) {
          const next = items[index + 1];
          // A heading never ends a page on its own: it moves with its first line.
          return (
            <View key={item.id} wrap={false}>
              <EditionHeading item={item} />
              {next && !isEditionHeading(next) ? <LineRow item={next} index={numbers[index + 1]} money={money} /> : null}
            </View>
          );
        }
        // Already drawn with the heading before it.
        if (index > 0 && isEditionHeading(items[index - 1])) return null;
        return <LineRow key={item.id} item={item} index={numbers[index]} money={money} />;
      })}
    </>
  );
}

/** A server group: identical servers sharing an edition and modules. */
export type DocumentGroup = {
  id: string;
  label: string;
  quantity: number;
  subtotal: number | string;
};

function LineRow({ item, index, money }: { item: DocumentLine; index: number; money: (amount: number | string) => string }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.cNo}>{index + 1}</Text>
      <View style={styles.cDesc}>
        <Text style={styles.itemName}>{item.description}</Text>
        {item.detail ? <Text style={styles.muted}>{item.detail}</Text> : null}
      </View>
      <Text style={styles.cQty}>{Number(item.quantity)}</Text>
      <Text style={[styles.cPrice, { fontSize: fit(money(item.unit_price), 9, 98) }]}>{money(item.unit_price)}</Text>
      <Text style={[styles.cAmount, { fontSize: fit(money(item.amount), 9, 104) }]}>{money(item.amount)}</Text>
    </View>
  );
}

/**
 * The line items. Rows never split; the header is never stranded at a page end.
 *
 * With server groups — more than one, or one covering several servers — each
 * group gets a heading ("Main plant · 2 servers"), its lines and its subtotal.
 * A single one-server group prints flat, as before.
 */
export function ItemsTable({
  items,
  groups = [],
  money,
}: {
  items: DocumentLine[];
  groups?: DocumentGroup[];
  money: (amount: number | string) => string;
}) {
  const grouped = groups.length > 1 || groups.some((group) => group.quantity > 1);
  if (grouped) {
    const known = new Set(groups.map((group) => group.id));
    const loose = items.filter((item) => !item.group_id || !known.has(item.group_id));
    // Each group's edition goes into its heading ("Server group 1 — Plant
    // edition"), not a row of its own; numbering runs on across groups.
    const sections = groups.map((group) => {
      const lines = items.filter((item) => item.group_id === group.id);
      const edition = lines.find(isEditionHeading);
      return { group, edition, lines: lines.filter((item) => !isEditionHeading(item)) };
    });
    const starts = sections.map((_, index) => sections.slice(0, index).reduce((sum, section) => sum + section.lines.length, 0));
    const looseStart = sections.reduce((sum, section) => sum + section.lines.length, 0);
    return (
      <View style={styles.table}>
        <View style={styles.headRow} minPresenceAhead={110} fixed>
          <Text style={[styles.cNo, styles.headCell]}>#</Text>
          <Text style={[styles.cDesc, styles.headCell]}>Description</Text>
          <Text style={[styles.cQty, styles.headCell]}>Qty</Text>
          <Text style={[styles.cPrice, styles.headCell]}>Unit price</Text>
          <Text style={[styles.cAmount, styles.headCell]}>Amount</Text>
        </View>
        {sections.map(({ group, edition, lines }, index) => {
          const first = starts[index];
          const heading = (
            <View style={styles.groupRow}>
              <Text style={styles.groupName}>
                {group.label}
                {edition ? <Text style={styles.editionName}>{`  —  ${edition.description}`}</Text> : null}
              </Text>
              <Text style={styles.muted}>
                {group.quantity} server{group.quantity === 1 ? "" : "s"}
              </Text>
            </View>
          );
          const subtotal = (
            <View style={styles.groupSubtotal}>
              <Text style={[styles.itemName, { marginRight: 12 }]}>{group.label} subtotal</Text>
              <Text style={[styles.cAmount, { fontSize: fit(money(group.subtotal), 9, 104) }]}>{money(group.subtotal)}</Text>
            </View>
          );
          // A group's heading moves with its first line, and its subtotal with
          // its last, so a page never ends on a heading or starts on a total.
          if (lines.length <= 1) {
            return (
              <View key={group.id} wrap={false}>
                {heading}
                {lines[0] ? <LineRow item={lines[0]} index={first} money={money} /> : null}
                {subtotal}
              </View>
            );
          }
          return (
            <View key={group.id}>
              <View wrap={false}>
                {heading}
                <LineRow item={lines[0]} index={first} money={money} />
              </View>
              <ItemLines items={lines.slice(1, -1)} start={first + 1} money={money} />
              <View wrap={false}>
                <LineRow item={lines[lines.length - 1]} index={first + lines.length - 1} money={money} />
                {subtotal}
              </View>
            </View>
          );
        })}
        <ItemLines items={loose} start={looseStart} money={money} />
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={styles.headRow} minPresenceAhead={60} fixed>
        <Text style={[styles.cNo, styles.headCell]}>#</Text>
        <Text style={[styles.cDesc, styles.headCell]}>Description</Text>
        <Text style={[styles.cQty, styles.headCell]}>Qty</Text>
        <Text style={[styles.cPrice, styles.headCell]}>Unit price</Text>
        <Text style={[styles.cAmount, styles.headCell]}>Amount</Text>
      </View>
      <ItemLines items={items} start={0} money={money} />
    </View>
  );
}

/**
 * Notes on the left, subtotal / tax / total on the right — one block that
 * moves to the next page whole rather than splitting. Notes are capped in the
 * database, so the block always fits on a page.
 */
export function Summary({
  notesLabel,
  notes,
  subtotal,
  taxLabel,
  taxRate,
  taxAmount,
  total,
  currency,
  money,
  struck = false,
}: {
  notesLabel: string;
  notes: string | null;
  subtotal: number | string;
  taxLabel: string;
  taxRate: number | string;
  taxAmount: number | string;
  total: number | string;
  currency: string;
  money: (amount: number | string) => string;
  /** Void/cancelled: the total shown struck through in grey, not as a sum due. */
  struck?: boolean;
}) {
  const strike = struck ? { color: MUTED, textDecoration: "line-through" as const } : {};
  return (
    <View style={styles.summary} wrap={false}>
      <View style={styles.terms}>
        {notes ? (
          <>
            <Text style={styles.label}>{notesLabel}</Text>
            <Lines text={notes} />
          </>
        ) : null}
      </View>
      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.muted}>Subtotal</Text>
          <Text style={{ fontSize: fit(money(subtotal), 9, 150) }}>{money(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.muted}>
            {taxLabel} {Number(taxRate)}%
          </Text>
          <Text style={{ fontSize: fit(money(taxAmount), 9, 150) }}>{money(taxAmount)}</Text>
        </View>
        <View style={[styles.grandTotal, struck ? { backgroundColor: PANEL } : {}]}>
          <Text style={styles.grandLabel}>Total {currency}</Text>
          <Text style={[styles.grandValue, { fontSize: fit(money(total), 12.5, 150) }, strike]}>{money(total)}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The company signature on an approved quotation or invoice. Only ever drawn
 * from the approval's own record: the image comes with an approved document
 * (never on its own), so a preview before approval shows a placeholder.
 */
export type DocumentSignoff = {
  name: string;
  title?: string | null;
  place?: string | null;
  /** When it was approved (ISO); the date printed beside the place. */
  date?: string | null;
  /** data: URL of the signature image; absent on a preview or an unsigned document. */
  image?: string | null;
  /** A preview before approval: the signature is added once approved. */
  pending?: boolean;
};

const signoffDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    : "";

/**
 * Place and date, the company, the signature (or a space to sign by hand)
 * and the signatory. With `materai`, a box for a physical stamp duty seal
 * overlaps the signature, as it is signed across. Kept whole on one page.
 */
export function SignatureBlock({
  signoff,
  company,
  materai = false,
  inline = false,
}: {
  signoff: DocumentSignoff | null;
  company: string;
  materai?: boolean;
  /** Beside another block (an invoice's payment details) rather than on its own line. */
  inline?: boolean;
}) {
  const dated = [signoff?.place, signoffDate(signoff?.date)].filter(Boolean).join(", ");
  return (
    <View wrap={false} style={inline ? { width: 190 } : { marginTop: 22, alignSelf: "flex-end", width: 220 }}>
      {dated ? <Text style={{ color: INK }}>{dated}</Text> : null}
      <Text style={{ color: INK, fontFamily: "Helvetica-Bold", marginTop: 1 }}>{company}</Text>
      <View style={{ height: 52, marginTop: 2, justifyContent: "flex-end" }}>
        {materai ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 3,
              width: 56,
              height: 40,
              borderWidth: 0.8,
              borderStyle: "dashed",
              borderColor: MUTED,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 6.5, color: MUTED, letterSpacing: 0.6 }}>MATERAI</Text>
            <Text style={{ fontSize: 6.5, color: MUTED }}>Rp10.000</Text>
          </View>
        ) : null}
        {signoff?.image ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img
          <Image src={signoff.image} style={{ height: 48, width: 140, objectFit: "contain", marginLeft: materai ? 30 : 0 }} />
        ) : signoff?.pending ? (
          <View
            style={{
              height: 44,
              width: 140,
              marginLeft: materai ? 30 : 0,
              borderWidth: 0.8,
              borderStyle: "dashed",
              borderColor: LINE,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 7, color: MUTED }}>Signature added on approval</Text>
          </View>
        ) : null}
      </View>
      <View style={{ borderTopWidth: 0.8, borderColor: INK, marginTop: 3, paddingTop: 3 }}>
        <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>{signoff?.name || " "}</Text>
        {signoff?.title ? <Text style={{ color: MUTED }}>{signoff.title}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Footer on every page. Fixed text must be absolutely positioned Text elements
 * of its own (react-pdf's documented pattern); a fixed View wrapping them was
 * silently dropped.
 */
export function PageFooter({ seller }: { seller: SellerBlock }) {
  return (
    <>
      <View style={styles.footerRule} fixed />
      {/* The closing line, as a quote. */}
      <Text style={styles.footerLeft} fixed>
        {`“${(seller.footer_note ?? "Thank you for your business.").replace(/^["“]+|["”]+$/g, "")}”`}
      </Text>
      <Text style={styles.footerRight} fixed>
        {[seller.company_name, seller.website].filter(Boolean).join(" · ")}
      </Text>
      <Text style={styles.pageNumber} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </>
  );
}
