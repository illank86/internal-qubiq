import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import type { Database, Json } from "@/lib/database.types";
import type { PdfRequest } from "@/components/pdf-viewer-context";
import { renderDeliveryOrderPdf } from "@/lib/delivery-order-pdf";
import { documentFolder } from "./api";

/**
 * Delivery orders: made from a paid invoice, issued to the customer, received
 * online or with the signed DO / BAST uploaded. Every write is a database
 * function (create_delivery_order, issue_…, attach_delivery_file…), which
 * checks the rules: paid invoice, no more than is left, draft-only edits.
 */

export type DeliveryOrder = Database["public"]["Tables"]["delivery_orders"]["Row"];
export type DeliveryItem = Database["public"]["Tables"]["delivery_order_items"]["Row"];
export type DeliveryFile = Database["public"]["Tables"]["delivery_order_files"]["Row"];
export type DeliveryStatus = "draft" | "issued" | "received" | "cancelled";
export type DeliveryMethod = "download" | "licence_file" | "usb" | "onsite" | "other";
export type DeliverySignature = "qr" | "digital" | "wet";
export type FileKind = "signed_do" | "bast" | "other";

export const METHOD_LABEL: Record<DeliveryMethod, string> = {
  download: "Download",
  licence_file: "Licence file",
  usb: "USB / media",
  onsite: "On site",
  other: "Other",
};
export const FILE_KIND_LABEL: Record<FileKind, string> = { signed_do: "Signed DO", bast: "BAST", other: "Other" };
export const STATUS_LABEL: Record<DeliveryStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "default" },
  issued: { label: "Issued · awaiting receipt", color: "processing" },
  received: { label: "Received", color: "success" },
  cancelled: { label: "Cancelled", color: "default" },
};

/** Per server group of the invoice: ordered, already delivered, still to deliver. */
export type Remaining = { invoice_group_id: string; label: string; detail: string | null; quantity: number; delivered: number; remaining: number };

export type DeliveryDetails = {
  method?: DeliveryMethod;
  delivery_date?: string | null;
  ship_to_name?: string;
  ship_to_company?: string;
  ship_to_address?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  cc_emails?: string[];
  software_version?: string;
  notes?: string;
  signature_mode?: DeliverySignature;
  prepared_by_name?: string;
  prepared_by_title?: string;
  delivered_by_name?: string;
  delivered_by_title?: string;
  /** Delivered by whoever prepared it: their name and position are printed in both boxes. */
  delivered_by_same?: boolean;
};
export type DeliveryLine = { invoice_group_id: string; quantity: number };

const fail = (error: { message?: string } | null) => {
  if (error) throw error;
};

/** A delivery order is issued only once the invoice's licence has been issued (sent). */
export async function licenceIssued(invoiceId: string) {
  const { data, error } = await supabase.rpc("invoice_licence_issued", { p_invoice_id: invoiceId });
  fail(error);
  return Boolean(data);
}

export async function loadRemaining(invoiceId: string) {
  const { data, error } = await supabase.rpc("delivery_remaining", { p_invoice_id: invoiceId });
  fail(error);
  return ((data as Remaining[] | null) ?? []).map((row) => ({ ...row, quantity: Number(row.quantity), delivered: Number(row.delivered), remaining: Number(row.remaining) }));
}

export async function createDeliveryOrder(invoiceId: string, lines: DeliveryLine[], details: DeliveryDetails) {
  const { data, error } = await supabase.rpc("create_delivery_order", { p_invoice_id: invoiceId, p_lines: lines as unknown as Json, p_details: details as unknown as Json });
  fail(error);
  return data as string;
}

export async function updateDeliveryOrder(id: string, lines: DeliveryLine[] | null, details: DeliveryDetails) {
  const { error } = await supabase.rpc("update_delivery_order", { p_id: id, p_lines: lines as unknown as Json, p_details: details as unknown as Json });
  fail(error);
}

export type DeliverySigners = Pick<DeliveryDetails, "prepared_by_name" | "prepared_by_title" | "delivered_by_name" | "delivered_by_title" | "delivered_by_same">;

/** Names and positions under Prepared by / Delivered by: changeable until it is received. */
export async function updateDeliverySigners(id: string, signers: DeliverySigners) {
  const { error } = await supabase.rpc("update_delivery_signers", { p_id: id, p_details: signers as unknown as Json });
  fail(error);
}

export async function issueDeliveryOrder(id: string) {
  const { error } = await supabase.rpc("issue_delivery_order", { p_id: id });
  fail(error);
}

export async function cancelDeliveryOrder(id: string, reason: string) {
  const { error } = await supabase.rpc("cancel_delivery_order", { p_id: id, p_reason: reason });
  fail(error);
}

const BUCKET = "delivery-documents";
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** What the customer signed and sent back: the signed DO, a BAST, or another paper. */
export async function attachDeliveryFile(
  order: { id: string },
  file: File,
  kind: FileKind,
  received: { name?: string; title?: string; on?: string | null },
) {
  if (!TYPES[file.type]) throw { code: "22023", message: "Use a PDF, JPG or PNG." };
  if (file.size === 0 || file.size > 15 * 1024 * 1024) throw { code: "22023", message: "Use a file under 15 MB." };
  const path = `${await documentFolder("delivery_order", order.id)}/${kind}-${Date.now()}.${TYPES[file.type]}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw { code: "22023", message: "The file could not be uploaded. Please try again." };
  const { error } = await supabase.rpc("attach_delivery_file", {
    p_id: order.id,
    p_kind: kind,
    p_path: path,
    p_file_name: file.name,
    p_received_name: received.name ?? "",
    p_received_title: received.title ?? "",
    p_received_on: received.on || (null as unknown as string),
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    fail(error);
  }
}

export async function removeDeliveryFile(file: DeliveryFile) {
  const { error } = await supabase.rpc("remove_delivery_file", { p_file_id: file.id });
  fail(error);
  await supabase.storage.from(BUCKET).remove([file.path]);
}

/** A received document, for the PDF viewer (an image becomes a one-page PDF there). */
export function deliveryFileRequest(file: DeliveryFile, number: string | null): PdfRequest {
  return {
    title: `${FILE_KIND_LABEL[file.kind as FileKind] ?? "File"} · ${number ?? ""}`.trim(),
    fileName: file.file_name || `${number ?? "delivery-order"}-${file.kind}.pdf`,
    make: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
      fail(error);
      if (!data) throw new Error("The file could not be loaded");
      if (data.type === "application/pdf") return data;
      const [{ PDFDocument }, { appendAttachment }] = await Promise.all([import("pdf-lib"), import("@/lib/append-attachment")]);
      const empty = await (await PDFDocument.create()).save();
      const pdf = await appendAttachment(empty, { bytes: await data.arrayBuffer(), type: data.type }, FILE_KIND_LABEL[file.kind as FileKind] ?? "Document");
      return new Blob([pdf as BlobPart], { type: "application/pdf" });
    },
  };
}

/**
 * The delivery order PDF: a draft is drawn here (no signature yet); an issued
 * one comes from the website, which draws the company signature server-side.
 */
export function deliveryOrderPdf(order: Pick<DeliveryOrder, "id" | "number" | "status">): PdfRequest {
  return {
    title: `Delivery order ${order.number ?? ""}`.trim(),
    fileName: `${order.number ?? "delivery-order"}.pdf`.replace(/[^\w.-]/g, "_"),
    make: async () => {
      const [{ data: row, error }, { data: items }] = await Promise.all([
        supabase.from("delivery_orders").select("*").eq("id", order.id).maybeSingle(),
        supabase.from("delivery_order_items").select("id, position, description, detail, quantity, unit").eq("delivery_order_id", order.id).order("position"),
      ]);
      fail(error);
      if (!row) throw new Error("Delivery order not found");
      if (row.status === "draft") {
        const { data: settings } = await supabase.from("invoice_settings").select("company_name, company_address, company_email, company_phone, footer_note").eq("id", true).maybeSingle();
        const seller = { company_name: settings?.company_name ?? "QUBIQ", address: settings?.company_address, email: settings?.company_email, phone: settings?.company_phone, footer_note: settings?.footer_note, website: "goqubiq.com" };
        return renderDeliveryOrderPdf({ ...row, seller }, items ?? [], null);
      }
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(`${env.siteUrl}/api/staff/pdf/delivery_order/${order.id}`, {
        headers: session.session ? { Authorization: `Bearer ${session.session.access_token}` } : {},
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`The PDF could not be loaded (${response.status})`);
      return response.blob();
    },
  };
}
