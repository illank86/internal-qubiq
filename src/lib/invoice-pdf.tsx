
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

function InvoiceDocument({
  invoice,
  items,
  groups,
  signoff,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  groups: DocumentGroup[];
  signoff: DocumentSignoff | null;
}) {
  const seller = (invoice.seller ?? {}) as InvoiceSeller;
  const currency = invoice.currency || "USD";
  const money = (amount: number | string | null | undefined) => formatMoney(amount, currency, invoice.decimal_places ?? 2);
  const voided = invoice.status === "void";
  // A void invoice shows what it was for, struck through, never as a sum due.
  const dueText = money(invoice.total);
  const voidStyle = voided ? { color: MUTED, textDecoration: "line-through" as const } : {};
  // A page holds roughly 3,000 characters of payment text in bank cards;
  // beyond that, keeping the section whole would push it off the page.
  const paymentFitsOnAPage = (seller.bank_details ?? "").length < 2500;
  const overdue = isOverdue(invoice);
  const statusText = overdue ? "PAYMENT OVERDUE" : INVOICE_STATUS_LABEL[invoice.status];
  const licensee = invoice.licensee_name || invoice.bill_to_name;
  const settled = invoice.status === "paid" || invoice.status === "void";
  // Signed (approved), or with a space for materai to be signed across.
  const signed = Boolean(signoff) || invoice.materai === "physical";
  const termsDays = Math.round(
    (Date.parse(`${invoice.due_date}T00:00:00Z`) - Date.parse(`${invoice.issue_date}T00:00:00Z`)) / 86_400_000,
  );

  return (
    <Document
      title={`Invoice ${invoice.number ?? ""}`}
      author={seller.company_name ?? "QUBIQ"}
      subject={`Invoice for the licence issued to ${licensee}`}
      creator="goqubiq.com"
      producer="goqubiq.com"
    >
      <Page size="A4" style={styles.page}>
        <PageChrome watermark={voided ? "VOID" : undefined} continuedLabel={`Invoice ${invoice.number ?? ""}`} />
        <DocumentHeader
          title="INVOICE"
          number={invoice.number}
          reference={invoice.quotation_number ? `Quotation ref. ${invoice.quotation_number}` : null}
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

        <View style={styles.facts}>
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Invoice number</Text>
            <Text style={styles.factValue}>{invoice.number}</Text>
          </View>
          <View style={[styles.fact, styles.factDivider]}>
            <Text style={styles.factLabel}>Invoice date</Text>
            <Text style={styles.factValue}>{formatInvoiceDate(invoice.issue_date)}</Text>
          </View>
          <View style={[styles.fact, styles.factDivider]}>
            <Text style={styles.factLabel}>{invoice.status === "paid" ? "Paid on" : "Due date"}</Text>
            <Text style={styles.factValue}>
              {invoice.status === "paid" ? formatInvoiceDate(invoice.paid_at) : formatInvoiceDate(invoice.due_date)}
            </Text>
          </View>
          <View style={[styles.fact, styles.factDivider, { flex: 1.45 }]}>
            <Text style={styles.factLabel}>{settled ? "Amount" : "Amount due"}</Text>
            <Text style={[styles.factDue, { fontSize: fit(dueText, 12, FACT_DUE_WIDTH) }, voidStyle]}>{dueText}</Text>
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
          // Payment details, and beside them the signature (bottom right) when
          // there is one. Kept whole: if it does not fit below the totals it
          // moves to the next page entirely. Only payment text too long for any
          // page may break, and then between rows of bank cards, never inside one.
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 18, marginTop: 26 }} wrap={!paymentFitsOnAPage}>
          <View style={[styles.section, { marginTop: 0, flex: 1 }]} wrap={!paymentFitsOnAPage}>
            <View style={styles.sectionHead} wrap={false} minPresenceAhead={60}>
              <Text style={[styles.label, { marginBottom: 0 }]}>How to pay</Text>
              <Text style={styles.sectionAside}>
                Due {formatInvoiceDate(invoice.due_date)}
                {termsDays > 0 ? ` (${termsDays} days)` : ""} · Reference: {invoice.number}
              </Text>
            </View>
            {seller.bank_details ? (
              <PdfPaymentColumns source={seller.bank_details} linkColor={BRAND} muted={LINE} cardStyle={styles.card} />
            ) : (
              <Text>Please contact us for payment details.</Text>
            )}
            <Text style={styles.sectionNote}>
              Please quote {invoice.number} as the payment reference
              {seller.email ? `. Questions about this invoice: ${seller.email}` : ""}.
            </Text>
          </View>
          {signed ? <SignatureBlock signoff={signoff} company={seller.company_name ?? "QUBIQ"} materai={invoice.materai === "physical"} inline /> : null}
          </View>
        ) : signed ? (
          // Paid or void: no payment details, the signature on its own.
          <SignatureBlock signoff={signoff} company={seller.company_name ?? "QUBIQ"} materai={invoice.materai === "physical"} />
        ) : null}

        <PageFooter seller={seller} />
      </Page>
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
  return pdf(<InvoiceDocument invoice={invoice} items={items} groups={groups} signoff={signoff} />).toBlob();
}
