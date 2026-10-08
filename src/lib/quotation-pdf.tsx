
import { Document, Image, Page, Text, View, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { PdfMarkdown } from "@/lib/pdf-markdown";
import {
  BRAND,
  DocumentHeader,
  FACT_DUE_WIDTH,
  INK,
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
  type DocumentLine,
  type SellerBlock,
  type DocumentSignoff,
} from "@/lib/pdf-theme";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { quotationState, type Quotation, type QuotationTone } from "@/lib/quotations";

/**
 * The quotation as a PDF, in the same design as the invoice (./pdf-theme) but
 * laid out for a different job: an offer to be accepted, not a request to pay.
 *
 * What a quotation carries that an invoice does not, following the common
 * structure of commercial quotes:
 *  - a validity date, prominent in the header stamp and the facts strip;
 *  - "Prepared for" (the prospect) and "Your contact" (the salesperson), so
 *    the reader knows who to call;
 *  - an optional introduction before the lines;
 *  - terms & conditions;
 *  - a signed close: "Best regards", a QR signature that verifies the
 *    document, and the salesperson's name, position and details.
 *
 * Draft, expired and cancelled quotations carry a diagonal watermark, so a
 * copy that escapes is never mistaken for a live offer.
 */

const STAMP_COLORS: Record<QuotationTone, string> = {
  draft: STAMP.slate,
  open: STAMP.brand,
  expired: STAMP.red,
  won: STAMP.green,
  closed: STAMP.slate,
};

const WATERMARK: Partial<Record<string, string>> = {
  DRAFT: "DRAFT",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

/** Quotation data as the PDF needs it; the token route passes the same shape without internal fields. */
export type QuotationForPdf = Omit<Quotation, "created_by" | "quote_request_id" | "sales_profile_id"> &
  Partial<Pick<Quotation, "created_by" | "quote_request_id" | "sales_profile_id">>;

const SITE = env.siteUrl;

/**
 * The QR signature: it links to this quotation's online original, so anyone
 * holding a printed or forwarded copy can scan it and check the figures
 * against ours. (The link only opens once the quotation has been sent.)
 */
async function signatureQr(token: string) {
  return QRCode.toDataURL(`${SITE}/quotes/${token}/pdf`, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 240,
    color: { dark: INK, light: "#ffffff" },
  });
}

function QuotationDocument({
  quotation,
  items,
  groups,
  qr,
  signoff,
}: {
  quotation: QuotationForPdf;
  items: DocumentLine[];
  groups: DocumentGroup[];
  qr: string;
  signoff: DocumentSignoff | null;
}) {
  const seller = (quotation.seller ?? {}) as SellerBlock;
  const currency = quotation.currency || "USD";
  const money = (amount: number | string | null | undefined) => formatMoney(amount, currency, quotation.decimal_places ?? 2);
  const state = quotationState(quotation);
  const closed = state.tone === "closed" || state.tone === "expired";
  const stamp = state.tone === "open" ? `VALID UNTIL ${formatInvoiceDate(quotation.valid_until).toUpperCase()}` : state.label;
  const totalText = money(quotation.total);
  const replyTo = quotation.sales_email || seller.email;
  // The closing paragraph, with its placeholders filled in.
  const closing = (quotation.closing ?? "")
    .replace(/\{company\}/g, seller.company_name ?? "QUBIQ")
    .replace(/\{name\}/g, quotation.sales_name ?? "")
    .replace(/\{email\}/g, replyTo ?? "")
    .replace(/\{phone\}/g, quotation.sales_phone || seller.phone || "")
    .trim();

  return (
    <Document
      title={`Quotation ${quotation.number ?? ""}`}
      author={seller.company_name ?? "QUBIQ"}
      subject={`Quotation for ${quotation.company || quotation.contact_name}`}
      creator="goqubiq.com"
      producer="goqubiq.com"
    >
      <Page size="A4" style={styles.page}>
        <PageChrome watermark={WATERMARK[state.label]} continuedLabel={`Quotation ${quotation.number ?? ""}`} />
        <DocumentHeader title="QUOTATION" number={quotation.number} stamp={stamp} stampColor={STAMP_COLORS[state.tone]} />

        <View style={styles.parties}>
          <SellerParty seller={seller} />
          <View style={styles.party}>
            <Text style={styles.label}>Prepared for</Text>
            <Text style={styles.partyName}>{quotation.contact_name}</Text>
            {quotation.job_title ? <Text>{quotation.job_title}</Text> : null}
            {quotation.company ? <Text>{quotation.company}</Text> : null}
            <Lines text={quotation.address} />
            {quotation.country ? <Text>{quotation.country}</Text> : null}
            {quotation.contact_email ? <Text>{quotation.contact_email}</Text> : null}
            {quotation.phone ? <Text>{quotation.phone}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>Your contact</Text>
            <Text style={styles.partyName}>{quotation.sales_name || seller.company_name || "QUBIQ Sales"}</Text>
            {quotation.sales_title ? <Text>{quotation.sales_title}</Text> : null}
            {replyTo ? <Text>{replyTo}</Text> : null}
            {quotation.sales_phone || seller.phone ? <Text>{quotation.sales_phone || seller.phone}</Text> : null}
          </View>
        </View>

        <View style={styles.facts}>
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Quotation number</Text>
            <Text style={styles.factValue}>{quotation.number}</Text>
          </View>
          <View style={[styles.fact, styles.factDivider]}>
            <Text style={styles.factLabel}>Quotation date</Text>
            <Text style={styles.factValue}>{formatInvoiceDate(quotation.issue_date)}</Text>
          </View>
          <View style={[styles.fact, styles.factDivider]}>
            <Text style={styles.factLabel}>Valid until</Text>
            <Text style={[styles.factValue, state.tone === "expired" ? { color: STAMP.red } : {}]}>
              {formatInvoiceDate(quotation.valid_until)}
            </Text>
          </View>
          <View style={[styles.fact, styles.factDivider, { flex: 1.45 }]}>
            <Text style={styles.factLabel}>Total</Text>
            <Text
              style={[
                styles.factDue,
                { fontSize: fit(totalText, 12, FACT_DUE_WIDTH) },
                closed ? { color: MUTED } : {},
              ]}
            >
              {totalText}
            </Text>
          </View>
        </View>

        {quotation.introduction ? (
          <View style={{ marginTop: 22 }}>
            <Lines text={quotation.introduction} />
          </View>
        ) : null}

        <ItemsTable items={items} groups={groups} money={money} />

        <Summary
          notesLabel=""
          notes={null}
          subtotal={quotation.subtotal}
          taxLabel={quotation.tax_label}
          taxRate={quotation.tax_rate}
          taxAmount={quotation.tax_amount}
          total={quotation.total}
          currency={currency}
          money={money}
        />

        {quotation.terms ? (
          // Kept whole unless the terms are too long for a page.
          <View style={styles.section} wrap={quotation.terms.length > 2500}>
            <View style={styles.sectionHead} minPresenceAhead={60}>
              <Text style={[styles.label, { marginBottom: 0 }]}>Terms &amp; conditions</Text>
            </View>
            <PdfMarkdown source={quotation.terms} linkColor={BRAND} muted={LINE} />
          </View>
        ) : null}

        {/* The sign-off, as a business letter closes: a line of thanks, the
            complimentary close, the signature (here a QR code that verifies
            the document), then name, position, company and contact details.
            Kept together on one page. */}
        <View style={{ marginTop: 28 }} wrap={false}>
          {closing ? (
            <View style={{ marginBottom: 14 }}>
              {closing.split(/\r?\n/).map((line, index) => (
                <Text key={index} style={{ color: INK }}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={{ color: INK }}>{quotation.signoff || "Best regards,"}</Text>
          {signoff ? (
            // The company signature (approved), or where it will go (a preview).
            <View style={{ marginTop: 8, height: 62, justifyContent: "flex-end" }}>
              {signoff.image ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img
                <Image src={signoff.image} style={{ height: 58, width: 150, objectFit: "contain" }} />
              ) : signoff.pending ? (
                <View style={{ height: 50, width: 150, borderWidth: 0.8, borderStyle: "dashed", borderColor: LINE, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 7, color: MUTED }}>Signature added on approval</Text>
                </View>
              ) : (
                // Signed by hand: the space is left for it.
                <View style={{ height: 50 }} />
              )}
            </View>
          ) : (
            // No signature on file: the QR that verifies the document instead.
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
              <Image src={qr} style={{ width: 68, height: 68 }} />
              <Text style={{ fontSize: 7, color: MUTED, width: 110, marginBottom: 2 }}>
                Digitally signed. Scan to verify this quotation ({quotation.number}).
              </Text>
            </View>
          )}
          <Text style={[styles.partyName, { marginTop: 8, fontSize: 10.5 }]}>
            {(signoff ? signoff.name : null) || quotation.sales_name || `${seller.company_name ?? "QUBIQ"} Sales`}
          </Text>
          {(signoff?.name ? signoff.title : quotation.sales_title) ? (
            <Text style={{ color: INK }}>{signoff?.name ? signoff.title : quotation.sales_title}</Text>
          ) : null}
          <Text>{seller.company_name ?? "QUBIQ"}</Text>
          <Text>{[replyTo, quotation.sales_phone || seller.phone].filter(Boolean).join("  ·  ")}</Text>
        </View>

        <PageFooter seller={seller} />
      </Page>
    </Document>
  );
}

/** Renders the quotation to PDF bytes. */
export async function renderQuotationPdf(
  quotation: QuotationForPdf,
  items: DocumentLine[],
  groups: DocumentGroup[] = [],
  signoff: DocumentSignoff | null = null,
) {
  const qr = await signatureQr(quotation.public_token);
  return pdf(<QuotationDocument quotation={quotation} items={items} groups={groups} qr={qr} signoff={signoff} />).toBlob();
}
