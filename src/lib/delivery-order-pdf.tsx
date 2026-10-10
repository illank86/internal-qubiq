import QRCode from "qrcode";
import { Document, Image, Page, Text, View, pdf } from "@react-pdf/renderer";
import {

  DocumentHeader,
  INK,
  LINE,
  Lines,
  MUTED,
  PANEL,
  PageChrome,
  PageFooter,
  STAMP,
  SellerParty,
  styles,
  type DocumentSignoff,
  type SellerBlock,
} from "@/lib/pdf-theme";
import { formatInvoiceDate } from "@/lib/invoices";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

export type DeliveryOrder = Database["public"]["Tables"]["delivery_orders"]["Row"];
export type DeliveryOrderItem = Pick<Database["public"]["Tables"]["delivery_order_items"]["Row"], "id" | "position" | "description" | "detail" | "quantity" | "unit">;
export type DeliveryOrderForPdf = Omit<DeliveryOrder, "public_token" | "created_by" | "issued_by" | "owner_id" | "signature_id" | "cc_emails"> & {
  public_token?: string | null;
};

const SITE = env.siteUrl;

export const DELIVERY_METHOD_LABEL: Record<string, string> = {
  download: "Download",
  licence_file: "Licence file",
  usb: "USB / media",
  onsite: "On site",
  other: "Other",
};
const STATUS: Record<string, { text: string; color: string }> = {
  draft: { text: "DRAFT", color: STAMP.slate },
  issued: { text: "ISSUED", color: STAMP.brand },
  received: { text: "RECEIVED", color: STAMP.green },
  cancelled: { text: "CANCELLED", color: STAMP.red },
};

/** The QR signature: it opens this delivery order online, where receipt can be confirmed. */
async function deliveryQr(token: string | null | undefined) {
  return QRCode.toDataURL(`${SITE}/do/${token ?? "preview"}`, { errorCorrectionLevel: "M", margin: 0, width: 240, color: { dark: INK, light: "#ffffff" } });
}

const when = (value: string | null | undefined) => (value ? formatInvoiceDate(value.slice(0, 10)) : "");

/** One signature box: a heading, the signing space, then name / position lines. */
function SignBox({ heading, company, children, name, title, date }: { heading: string; company?: string | null; children?: React.ReactNode; name?: string | null; title?: string | null; date?: string | null }) {
  return (
    <View style={{ flex: 1 }} wrap={false}>
      <Text style={styles.label}>{heading}</Text>
      {company ? <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>{company}</Text> : <Text> </Text>}
      <View style={{ height: 72, justifyContent: "flex-end", marginTop: 4 }}>{children}</View>
      <View style={{ borderTopWidth: 0.8, borderColor: INK, marginTop: 3, paddingTop: 3 }}>
        <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>{name || "Name:"}</Text>
        <Text style={{ color: MUTED }}>{title || "Position:"}</Text>
        <Text style={{ color: MUTED }}>{date ? `Date: ${date}` : "Date:"}</Text>
      </View>
    </View>
  );
}

function DeliveryOrderDocument({ order, items, signoff, qr }: { order: DeliveryOrderForPdf; items: DeliveryOrderItem[]; signoff: DocumentSignoff | null; qr: string }) {
  const seller = (order.seller ?? {}) as SellerBlock;
  const status = STATUS[order.status] ?? STATUS.draft;
  const company = seller.company_name ?? "QUBIQ";
  const total = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  // A digital signature is the signatory's; otherwise whoever is named as preparing it.
  const digital = order.signature_mode === "digital" && Boolean(signoff?.image);
  const prepared = {
    name: digital ? signoff?.name : order.prepared_by_name,
    title: digital ? signoff?.title : order.prepared_by_title,
  };

  return (
    <Document title={`Delivery order ${order.number ?? ""}`} author={company} subject={`Delivery for invoice ${order.invoice_number ?? ""}`} creator="goqubiq.com" producer="goqubiq.com">
      <Page size="A4" style={styles.page}>
        <PageChrome watermark={order.status === "cancelled" ? "CANCELLED" : order.status === "draft" ? "DRAFT" : undefined} continuedLabel={`Delivery order ${order.number ?? ""}`} />
        <DocumentHeader
          title="DELIVERY ORDER"
          number={order.number}
          references={[
            ["Invoice no.", order.invoice_number],
            ["PO ref.", order.po_number],
            ["Quotation ref.", order.quotation_number],
          ]}
          stamp={status.text}
          stampColor={status.color}
        />

        <View style={styles.parties}>
          <SellerParty seller={seller} />
          <View style={styles.party}>
            <Text style={styles.label}>Deliver to</Text>
            <Text style={styles.partyName}>{order.ship_to_name}</Text>
            {order.ship_to_company && order.ship_to_company !== order.ship_to_name ? <Text>{order.ship_to_company}</Text> : null}
            <Lines text={order.ship_to_address} />
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>Contact</Text>
            <Text style={styles.partyName}>{order.contact_name || "—"}</Text>
            {order.contact_phone ? <Text>{order.contact_phone}</Text> : null}
            {order.contact_email ? <Text>{order.contact_email}</Text> : null}
          </View>
        </View>

        <View style={styles.facts}>
          {[
            ["Delivery order", order.number ?? "—"],
            ["Issued", when(order.issued_at) || when(order.issue_date)],
            ["Delivery date", when(order.delivery_date) || "—"],
            ["Delivery method", DELIVERY_METHOD_LABEL[order.method] ?? order.method],
          ].map(([label, value], index) => (
            <View key={label} style={index ? [styles.fact, styles.factDivider] : styles.fact}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* What is delivered: no prices — that is the invoice's job. */}
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.headCell, { width: 22 }]}>#</Text>
            <Text style={[styles.headCell, { flex: 1 }]}>Description</Text>
            <Text style={[styles.headCell, { width: 50, textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.headCell, { width: 60, textAlign: "right" }]}>Unit</Text>
          </View>
          {items.map((item, index) => (
            <View key={item.id} style={styles.row} wrap={false}>
              <Text style={{ width: 22, color: MUTED }}>{index + 1}</Text>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>{item.description}</Text>
                {item.detail ? <Text style={{ color: MUTED, marginTop: 2 }}>{item.detail}</Text> : null}
              </View>
              <Text style={{ width: 50, textAlign: "right", color: INK }}>{Number(item.quantity).toLocaleString("en-US")}</Text>
              <Text style={{ width: 60, textAlign: "right", color: MUTED }}>{item.unit}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", paddingTop: 8 }}>
            <Text style={{ flex: 1, textAlign: "right", color: MUTED }}>Total delivered</Text>
            <Text style={{ width: 50, textAlign: "right", color: INK, fontFamily: "Helvetica-Bold" }}>{total.toLocaleString("en-US")}</Text>
            <Text style={{ width: 60 }} />
          </View>
        </View>

        {order.software_version || order.notes ? (
          <View style={{ marginTop: 18, flexDirection: "row", gap: 18 }} wrap={false}>
            {order.software_version ? (
              <View style={{ width: 140 }}>
                <Text style={styles.label}>Software version</Text>
                <Text style={{ color: INK }}>{order.software_version}</Text>
              </View>
            ) : null}
            {order.notes ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Notes</Text>
                <Lines text={order.notes} />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ marginTop: 20, padding: 10, borderRadius: 6, backgroundColor: PANEL, borderWidth: 0.6, borderColor: LINE }} wrap={false}>
          <Text style={{ color: INK }}>
            The licences and items above were handed over in full and in good order. The receiver signs and stamps below (or attaches the BAST),
            or confirms receipt online from the delivery order link.
          </Text>
        </View>

        {/* Prepared by (us) · Delivered by · Received by (the customer). */}
        <View style={{ flexDirection: "row", gap: 22, marginTop: 24 }} wrap={false}>
          <SignBox heading="Prepared by" company={company} name={prepared.name} title={prepared.title} date={when(order.issued_at)}>
            {order.signature_mode === "qr" ? (
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
                <Image src={qr} style={{ width: 60, height: 60 }} />
                <Text style={{ fontSize: 6.5, color: MUTED, width: 70, marginBottom: 2 }}>Digitally issued. Scan to verify {order.number}.</Text>
              </View>
            ) : signoff?.image ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img
              <Image src={signoff.image} style={{ maxHeight: 44, maxWidth: 140, height: 44, objectFit: "contain", objectPosition: "left", marginBottom: 6 }} />
            ) : null}
          </SignBox>
          <SignBox
            heading="Delivered by"
            company={company}
            name={order.delivered_by_same ? prepared.name : order.delivered_by_name}
            title={order.delivered_by_same ? prepared.title : order.delivered_by_title}
            date={order.delivered_by_same ? when(order.issued_at) : undefined}
          >
            {order.delivered_by_same && order.signature_mode === "digital" && signoff?.image ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img
              <Image src={signoff.image} style={{ maxHeight: 44, maxWidth: 140, height: 44, objectFit: "contain", objectPosition: "left", marginBottom: 6 }} />
            ) : null}
          </SignBox>
          <SignBox
            heading="Received by"
            company={order.ship_to_company || order.ship_to_name}
            name={order.received_by_name}
            title={order.received_by_title}
            date={when(order.received_at)}
          >
            {order.received_via === "online" ? (
              <View style={{ borderWidth: 0.8, borderColor: STAMP.green, borderRadius: 4, padding: 6, marginBottom: 6 }}>
                <Text style={{ fontSize: 7, color: STAMP.green, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 }}>RECEIVED ONLINE</Text>
                <Text style={{ fontSize: 7, color: INK, marginTop: 2 }}>
                  Confirmed by {order.received_by_name}
                  {order.received_by_title ? `, ${order.received_by_title}` : ""} on {when(order.received_at)}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 6.5, color: MUTED, marginBottom: 4 }}>Signature and company stamp</Text>
            )}
          </SignBox>
        </View>

        <PageFooter seller={seller} />
      </Page>
    </Document>
  );
}

/** Renders the delivery order to PDF bytes. */
export async function renderDeliveryOrderPdf(order: DeliveryOrderForPdf, items: DeliveryOrderItem[], signoff: DocumentSignoff | null = null) {
  const qr = await deliveryQr(order.public_token);
  return pdf(<DeliveryOrderDocument order={order} items={items} signoff={signoff} qr={qr} />).toBlob();
}
