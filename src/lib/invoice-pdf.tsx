
import { Document, Page, Text, View, pdf } from "@react-pdf/renderer";
import { PdfPaymentColumns } from "@/lib/pdf-markdown";
import {
  BRAND,
  DocumentHeader,
  FACT_DUE_WIDTH,
  ItemsTable,
  LINE,
  Lines,
  MUTED,
  PageChrome,
  PageFooter,
  STAMP,
  SellerParty,
  Summary,
  fit,
  styles,
  type DocumentGroup,
  SignatureBlock,
  type DocumentSignoff,
  INK,
  PaymentMethodCards,
  methodsFor,
  sellerForCurrency,
  documentFingerprint,
  FingerprintMark,
} from "@/lib/pdf-theme";
import {
  INVOICE_STATUS_LABEL,
  formatInvoiceDate,
  formatMoney,
  isOverdue,
  type Invoice,
  type InvoiceItem,
  type InvoiceSeller,
} from "@/lib/invoices";

/**
 * The invoice as a PDF, drawn on demand from the stored invoice.
 *
 * Generated per request rather than stored: the invoice row and its items are
 * the record, and the PDF is a view of them — including its PAID / PAYMENT
 * REQUIRED state, which changes after issue. Everything printed comes from
 * the row, including the seller details (`seller`, from Site settings and
 * Sales settings). The shared look lives in ./pdf-theme.
 *
 * One reading order: who it is from and to, the key facts, the lines, the
 * total, how to pay.
 */

const STATUS_COLORS: Record<string, string> = {
  unpaid: STAMP.red,
  overdue: STAMP.red,
  paid: STAMP.green,
  void: STAMP.slate,
};

/** Width for a value in one of the three fact cells beside the amount, less the cell's padding. */
const FACT_CELL_WIDTH = (595 - 92) / 4.45 - 24;

/** One labelled fact in the invoice's header panel; "—" when there is none. */
function Fact({ label, value, divider = false, small = false }: { label: string; value: string | null | undefined; divider?: boolean; small?: boolean }) {
  const text = value?.trim() || "—";
  const size = small ? 9 : 10;
  return (
    <View style={divider ? [styles.fact, styles.factDivider] : styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      {/* The dates always fit; a long reference (bold capitals and digits) shrinks to stay on one line. */}
      <Text style={[styles.factValue, { fontSize: small ? Math.max(6, Math.min(size, FACT_CELL_WIDTH / (text.length * 0.68))) : size, color: value?.trim() ? INK : MUTED }]}>
        {text}
      </Text>
    </View>
  );
}

function InvoiceDocument({
  invoice,
  items,
  groups,
  signoff,
  verify,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  groups: DocumentGroup[];
  signoff: DocumentSignoff | null;
  /** The approved version's fingerprint line (see documentFingerprint). */
  verify: string | null;
}) {
  // In IDR, named as in Indonesia (PT. …).
  const seller = sellerForCurrency((invoice.seller ?? {}) as InvoiceSeller, invoice.currency);
  const methods = methodsFor(seller.payment_methods, invoice.currency);
  const currency = invoice.currency || "USD";
  const money = (amount: number | string | null | undefined) => formatMoney(amount, currency, invoice.decimal_places ?? 2);
  const voided = invoice.status === "void";
  // A void invoice shows what it was for, struck through, never as a sum due.
  const dueText = money(invoice.total);
  const voidStyle = voided ? { color: MUTED, textDecoration: "line-through" as const } : {};
  const overdue = isOverdue(invoice);
  const statusText = overdue ? "PAYMENT OVERDUE" : INVOICE_STATUS_LABEL[invoice.status];
  const licensee = invoice.licensee_name || invoice.bill_to_name;
  const settled = invoice.status === "paid" || invoice.status === "void";
  // Signed (approved), or with a space for materai to be signed across.
  const signed = Boolean(signoff) || invoice.materai !== "none";
  // The customer's references: shown when there is a quotation or a PO to quote.
  const references = Boolean(invoice.quotation_number || invoice.po_number);
  const termsDays = Math.round(
    (Date.parse(`${invoice.due_date}T00:00:00Z`) - Date.parse(`${invoice.issue_date}T00:00:00Z`)) / 86_400_000,
  );

  return (
    <Document
      title={`Invoice ${invoice.number ?? ""}`}
      author={seller.company_name ?? "QUBIQ"}
      subject={`Invoice for the licence issued to ${licensee}`}
      keywords={verify ?? undefined}
      creator="goqubiq.com"
      producer="goqubiq.com"
    >
      <Page size="A4" style={styles.page}>
        <PageChrome watermark={voided ? "VOID" : undefined} continuedLabel={`Invoice ${invoice.number ?? ""}`} />
        <DocumentHeader
          title="INVOICE"
          number={invoice.number}
          stamp={statusText}
          stampColor={STATUS_COLORS[overdue ? "overdue" : invoice.status]}
        />

        <View style={styles.parties}>
          <SellerParty seller={seller} />
          <View style={styles.party}>
            <Text style={styles.label}>Invoiced to</Text>
            <Text style={styles.partyName}>{invoice.bill_to_name}</Text>
            {invoice.bill_to_company && invoice.bill_to_company !== invoice.bill_to_name ? (
              <Text>{invoice.bill_to_company}</Text>
            ) : null}
            <Lines text={invoice.bill_to_address} />
            {invoice.bill_to_email ? <Text>{invoice.bill_to_email}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>Licence issued to</Text>
            <Text style={styles.partyName}>{licensee}</Text>
            <Lines text={invoice.licensee_address} />
          </View>
        </View>

        {/* Dates on top; the customer's references under them; the amount spans both. */}
        <View style={styles.facts}>
          <View style={{ flex: 3 }}>
            <View style={{ flexDirection: "row" }}>
              <Fact label="Invoice number" value={invoice.number} />
              <Fact divider label="Invoice date" value={formatInvoiceDate(invoice.issue_date)} />
              <Fact
                divider
                label={invoice.status === "paid" ? "Paid on" : "Due date"}
                value={invoice.status === "paid" ? formatInvoiceDate(invoice.paid_at) : formatInvoiceDate(invoice.due_date)}
              />
            </View>
            {references ? (
              <View style={{ flexDirection: "row", borderTopWidth: 0.6, borderColor: LINE }}>
                <Fact small label="Quotation ref." value={invoice.quotation_number} />
                <Fact small divider label="PO ref." value={invoice.po_number} />
                <Fact small divider label="Payment terms" value={termsDays > 0 ? `${termsDays} days` : "On receipt"} />
              </View>
            ) : null}
          </View>
          <View style={[styles.fact, styles.factDivider, { flex: 1.45, justifyContent: "center" }]}>
            <Text style={styles.factLabel}>{settled ? "Amount" : "Amount due"}</Text>
            <Text style={[styles.factDue, { fontSize: fit(dueText, references ? 14 : 12, FACT_DUE_WIDTH) }, voidStyle]}>{dueText}</Text>
          </View>
        </View>

        <ItemsTable items={items} groups={groups} money={money} />

        <Summary
          notesLabel="Notes"
          notes={invoice.notes}
          subtotal={invoice.subtotal}
          taxLabel={invoice.tax_label}
          taxRate={invoice.tax_rate}
          taxAmount={invoice.tax_amount}
          total={invoice.total}
          currency={currency}
          money={money}
          struck={voided}
        />

        {!settled ? (
          <Text style={{ marginTop: 14, color: MUTED }}>
            How to pay is on the next page. Please quote {invoice.number} as the payment reference.
          </Text>
        ) : null}

        {/* Signed (approved), by hand, or with a space for materai. */}
        {signed ? <SignatureBlock signoff={signoff} company={seller.company_name ?? "QUBIQ"} materai={invoice.materai} /> : null}

        <FingerprintMark value={verify} />
        <PageFooter seller={seller} />
      </Page>

      {/* How to pay: a page of its own, with room for every way to pay. */}
      {!settled ? (
        <Page size="A4" style={styles.page}>
          <PageChrome continuedLabel={`Invoice ${invoice.number ?? ""}`} />
          <Text style={[styles.label, { marginTop: 14 }]}>How to pay</Text>
          <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: INK }}>Payment for invoice {invoice.number}</Text>

          <View style={[styles.facts, { marginTop: 16 }]}>
            <View style={[styles.fact, { flex: 1.45 }]}>
              <Text style={styles.factLabel}>Amount due</Text>
              <Text style={[styles.factDue, { fontSize: fit(dueText, 12, FACT_DUE_WIDTH) }]}>{dueText}</Text>
            </View>
            <View style={[styles.fact, styles.factDivider]}>
              <Text style={styles.factLabel}>Due date</Text>
              <Text style={styles.factValue}>
                {formatInvoiceDate(invoice.due_date)}
                {termsDays > 0 ? ` (${termsDays} days)` : ""}
              </Text>
            </View>
            <View style={[styles.fact, styles.factDivider]}>
              <Text style={styles.factLabel}>Payment reference</Text>
              <Text style={styles.factValue}>{invoice.number}</Text>
            </View>
          </View>

          <View style={{ marginTop: 22 }}>
            {methods.length > 0 ? (
              <>
                {seller.bank_details ? (
                  // The free-text note in Sales settings, above the methods.
                  <View style={{ marginBottom: 14 }}>
                    <PdfPaymentColumns source={seller.bank_details} linkColor={BRAND} muted={LINE} cardStyle={{}} />
                  </View>
                ) : null}
                <PaymentMethodCards methods={methods} currency={currency} />
              </>
            ) : seller.bank_details ? (
              // Before ways to pay were set up: the free text, as cards.
              <PdfPaymentColumns source={seller.bank_details} linkColor={BRAND} muted={LINE} cardStyle={styles.card} />
            ) : (
              <Text>Please contact us for payment details.</Text>
            )}
          </View>

          <View style={[styles.card, { marginTop: 22, flexDirection: "row", gap: 10 }]} wrap={false}>
            <View style={{ width: 3, backgroundColor: BRAND, borderRadius: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>Please quote {invoice.number} as the payment reference.</Text>
              <Text style={{ color: MUTED, marginTop: 3 }}>
                Pay the full amount of {dueText} by {formatInvoiceDate(invoice.due_date)}. Any transfer charges are paid by the sender.
                {seller.email ? ` Questions about this invoice: ${seller.email}.` : ""}
              </Text>
            </View>
          </View>

          <FingerprintMark value={verify} />
          <PageFooter seller={seller} />
        </Page>
      ) : null}
    </Document>
  );
}

/** Renders the invoice to PDF bytes. */
export async function renderInvoicePdf(
  invoice: Invoice,
  items: InvoiceItem[],
  groups: DocumentGroup[] = [],
  signoff: DocumentSignoff | null = null,
) {
  const verify = invoice.approved_at
    ? `QUBIQ-VERIFY ${invoice.number} ${await documentFingerprint("invoice", invoice.id, invoice.approved_at, invoice.total)}`
    : null;
  return pdf(<InvoiceDocument invoice={invoice} items={items} groups={groups} signoff={signoff} verify={verify} />).toBlob();
}
