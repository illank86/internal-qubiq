import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { renderQuotationPdf } from "@/lib/quotation-pdf";
import type { DocumentSignoff } from "@/lib/pdf-theme";
import type { PdfRequest } from "@/components/pdf-viewer-context";

/**
 * Sales writes, all through the database: RLS and the functions' own checks
 * (save_quotation, send_quotation, convert_quotation_to_invoice, …) decide
 * what is allowed, and triggers send the emails. These only call them.
 */

type DbError = { code?: string; message?: string } | null;
const fail = (error: DbError) => {
  if (error) throw error;
};

export type QuotationOutcome = "accepted" | "declined" | "cancelled" | "sent" | "draft";

/** Accepted, declined, cancelled, or back to sent/draft. A quote request follows: won or lost. */
export async function setQuotationStatus(id: string, status: QuotationOutcome, late = false) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("quotations")
    .update({
      status,
      accepted_at: status === "accepted" ? now : null,
      declined_at: status === "declined" ? now : null,
      // "Accept anyway" on an expired quotation: deliberate, and recorded.
      accepted_late: status === "accepted" && late,
    })
    .eq("id", id)
    .select("quote_request_id")
    .maybeSingle();
  fail(error);
  const requestStatus = status === "accepted" ? "won" : status === "declined" ? "lost" : null;
  if (data?.quote_request_id && requestStatus) {
    await supabase.from("quote_requests").update({ status: requestStatus }).eq("id", data.quote_request_id);
  }
}

/**
 * Send a quotation: an approver's goes straight to the customer; anyone
 * else's waits for an approver (the database decides, and records who).
 */
export async function sendQuotation(id: string) {
  const { data, error } = await supabase.rpc("send_quotation", { p_quotation_id: id });
  fail(error);
  return data;
}

/** Send an invoice (again), through approval like a quotation. */
export async function sendInvoice(id: string) {
  const { data, error } = await supabase.rpc("send_invoice", { p_invoice_id: id });
  fail(error);
  return data;
}

export type DocumentType = "quotation" | "invoice";

/** Approve a waiting quotation or invoice: it is sent at once. */
export async function approveDocument(type: DocumentType, id: string) {
  const { error } = await supabase.rpc("approve_document", { p_type: type, p_id: id });
  fail(error);
}

/** Reject with a reason; the person who asked is told. */
export async function rejectDocument(type: DocumentType, id: string, reason: string) {
  const { error } = await supabase.rpc("reject_document", { p_type: type, p_id: id, p_reason: reason });
  fail(error);
}

export type Materai = "none" | "physical" | "e_meterai";
export type SignatureMode = "digital" | "wet";

/** Materai on the PDF: none, a box for a physical one, or empty space for an e-Meterai stamp. */
export async function setInvoiceMaterai(id: string, materai: Materai) {
  const { error } = await supabase.rpc("set_invoice_materai", { p_invoice_id: id, p_materai: materai });
  fail(error);
}

export type ApprovalEntry = {
  id: string;
  action: "requested" | "approved" | "self_approved" | "rejected";
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

export async function loadApprovalHistory(type: DocumentType, id: string) {
  const { data, error } = await supabase
    .from("document_approvals")
    .select("id, action, actor_name, note, created_at")
    .eq("document_type", type)
    .eq("document_id", id)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as ApprovalEntry[];
}

export type SignatureInfo = {
  id: string;
  signatory_name: string;
  signatory_title: string | null;
  place: string | null;
  created_at: string;
  created_by: string | null;
} | null;

/** The signature on file — who signs, never the image. */
export async function loadSignatureInfo(): Promise<SignatureInfo> {
  const { data, error } = await supabase.rpc("document_signature_info");
  fail(error);
  return (data as SignatureInfo) ?? null;
}

/**
 * An approved document that carries the signature is fetched as the
 * customer's own copy from the website — the only place the signature is
 * drawn. Anything else is drawn here, with a placeholder where the signature
 * will go once approved (or the QR code / a blank line if none is on file).
 */
/**
 * A staff member's own copy of an approved document, drawn on the website
 * with the company signature (the image never comes here on its own).
 */
async function fetchStaffPdf(type: DocumentType, id: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`${env.siteUrl}/api/staff/pdf/${type}/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`The PDF could not be loaded (${response.status})`);
  return response.blob();
}

/** The uploaded signed copy (signed by hand, materai or e-Meterai). */
async function signedCopyBlob(path: string) {
  const { data, error } = await supabase.storage.from("signed-documents").download(path);
  fail(error);
  if (!data) throw new Error("The signed copy could not be loaded");
  return data;
}

/** What goes in the signature space when it is drawn here, before approval (no image ever is). */
function localSignoff(doc: { approval_status: string; approved_at: string | null; signature_mode: string }, info: SignatureInfo): DocumentSignoff | null {
  if (doc.signature_mode === "wet") {
    return { wet: true, name: info?.signatory_name ?? "", title: info?.signatory_title, place: info?.place, date: doc.approval_status === "approved" ? doc.approved_at : null };
  }
  return info ? { name: info.signatory_name, title: info.signatory_title, place: info.place, pending: true } : null;
}

const safeName = (value: string) => value.replace(/[^\w.-]/g, "_");

/**
 * A quotation for the PDF viewer: the signed copy once there is one; the
 * approved PDF (with the signature) once approved; otherwise drawn here as a
 * preview. `original`: the approved PDF even when a signed copy exists — what
 * is printed to sign, or stamped.
 */
export function quotationPdf(id: string, number: string | null, { original = false }: { original?: boolean } = {}): PdfRequest {
  return {
    title: `${original ? "To sign · " : ""}Quotation ${number ?? ""}`.trim(),
    fileName: safeName(`${number ?? "quotation"}${original ? "-to-sign" : ""}.pdf`),
    make: async () => {
      const [{ data: quotation, error }, { data: items }, { data: groups }] = await Promise.all([
        supabase.from("quotations").select("*").eq("id", id).maybeSingle(),
        supabase.from("quotation_items").select("*").eq("quotation_id", id).order("position"),
        supabase.from("quotation_groups").select("id, label, quantity, subtotal").eq("quotation_id", id).order("position"),
      ]);
      fail(error);
      if (!quotation) throw new Error("Quotation not found");
      if (!original && quotation.signed_copy_path) return signedCopyBlob(quotation.signed_copy_path);
      if (quotation.approval_status === "approved") return fetchStaffPdf("quotation", id);
      return renderQuotationPdf(quotation, items ?? [], groups ?? [], localSignoff(quotation, await loadSignatureInfo()));
    },
  };
}

/** An invoice for the PDF viewer; as quotationPdf. */
export function invoicePdf(id: string, number: string | null, { original = false }: { original?: boolean } = {}): PdfRequest {
  return {
    title: `${original ? "To sign · " : ""}Invoice ${number ?? ""}`.trim(),
    fileName: safeName(`${number ?? "invoice"}${original ? "-to-sign" : ""}.pdf`),
    make: async () => {
      const [{ data: invoice, error }, { data: items }, { data: groups }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
        supabase.from("invoice_groups").select("id, label, quantity, subtotal").eq("invoice_id", id).order("position"),
      ]);
      fail(error);
      if (!invoice) throw new Error("Invoice not found");
      if (!original && invoice.signed_copy_path) return signedCopyBlob(invoice.signed_copy_path);
      if (invoice.approval_status === "approved") return fetchStaffPdf("invoice", id);
      return renderInvoicePdf(invoice, items ?? [], groups ?? [], localSignoff(invoice, await loadSignatureInfo()));
    },
  };
}

// ----------------------------------------------------------------- signing

type SignableDoc = {
  signature_mode: string;
  materai?: string | null;
  approval_status: string;
  signed_copy_path: string | null;
  signed_copy_check: string | null;
  signed_copy_confirmed_at: string | null;
  signed_copy_sent_at: string | null;
};

/** Signed by hand, or (invoices) with a physical materai or an e-Meterai: it goes out as a signed copy. */
export const needsSigning = (doc: { signature_mode: string; materai?: string | null }) =>
  doc.signature_mode === "wet" || doc.materai === "physical" || doc.materai === "e_meterai";

export type SigningState = "none" | "to_sign" | "needs_check" | "ready" | "sent";

/** Where an approved document stands with its signed copy. */
export function signingState(doc: SignableDoc): SigningState {
  if (!needsSigning(doc) || doc.approval_status !== "approved") return "none";
  if (!doc.signed_copy_path) return "to_sign";
  if (doc.signed_copy_sent_at) return "sent";
  return doc.signed_copy_check === "verified" || doc.signed_copy_confirmed_at ? "ready" : "needs_check";
}

/** One line on what the signed copy needs next. */
export function signingHint(doc: SignableDoc) {
  const how = doc.materai === "e_meterai" ? "stamped with an e-Meterai" : doc.materai === "physical" ? "signed over a physical materai" : "signed by hand";
  switch (signingState(doc)) {
    case "none":
      return `It goes out ${how}. Once approved, download it, sign or stamp it, and upload the signed copy.`;
    case "to_sign":
      return `Approved. Download it, have it ${how}, then upload the signed copy.`;
    case "needs_check":
      return "A scanned copy was uploaded. An approver checks it, then it is sent.";
    case "ready":
      return "The signed copy is checked and ready to send.";
    case "sent":
      return "The customer has the signed copy.";
  }
}

/**
 * Uploads the signed (or stamped) copy and has it checked: "verified" when it
 * is this approved version; "unreadable" for a scan, which an approver
 * confirms. Anything else is refused, with the reason.
 */
export async function uploadSignedCopy(type: DocumentType, id: string, file: File, serial?: string) {
  const path = `${type}/${id}/${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage.from("signed-documents").upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw { code: "22023", message: "The file could not be uploaded. Use a PDF under 15 MB." };
  const { data, error } = await supabase.functions.invoke<{ check: "verified" | "unreadable"; error?: string }>("signed-copy", {
    body: { type, id, path, serial: serial?.trim() || undefined },
  });
  if (error) {
    let message = "The signed copy could not be checked. Please try again.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the general message
    }
    throw { code: "22023", message };
  }
  return data?.check ?? "unreadable";
}

export async function confirmSignedCopy(type: DocumentType, id: string) {
  const { error } = await supabase.rpc("confirm_signed_copy", { p_type: type, p_id: id });
  fail(error);
}

export async function sendSignedCopy(type: DocumentType, id: string) {
  const { error } = await supabase.rpc("send_signed_copy", { p_type: type, p_id: id });
  fail(error);
}

// ----------------------------------------------------------------- history

export type HistoryEvent = {
  at: string;
  source: "created" | "change" | "approval" | "email";
  action: string;
  actor: string | null;
  summary: string | null;
  changes: Record<string, unknown> | null;
  note: string | null;
  recipient: string | null;
  cc: string[] | null;
  status: string | null;
};

export async function loadHistory(type: DocumentType, id: string) {
  const { data, error } = await supabase.rpc("document_history", { p_type: type, p_id: id });
  fail(error);
  return (data as HistoryEvent[] | null) ?? [];
}

export type InvoiceStatus = "paid" | "unpaid" | "void";

export async function setInvoiceStatus(id: string, status: InvoiceStatus) {
  const { error } = await supabase
    .from("invoices")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error?.code === "23505") {
    throw { code: "22023", message: "That quotation already has another live invoice; void that one first." };
  }
  fail(error);
}
