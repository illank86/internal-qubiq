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
  const { error } = await supabase.rpc("send_quotation", { p_quotation_id: id });
  fail(error);
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

/** Physical materai box on the PDF, or none. (e-Meterai: not yet.) */
export async function setInvoiceMaterai(id: string, materai: "none" | "physical") {
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
async function fetchSigned(path: string) {
  const response = await fetch(`${env.siteUrl}${path}`, { credentials: "omit" });
  if (!response.ok) throw new Error(`The signed copy could not be loaded (${response.status})`);
  return response.blob();
}

function placeholder(info: SignatureInfo): DocumentSignoff | null {
  return info ? { name: info.signatory_name, title: info.signatory_title, place: info.place, pending: true } : null;
}

const safeName = (value: string) => value.replace(/[^\w.-]/g, "_");

/** A quotation for the PDF viewer: rendered in the browser from the same code as the website's. */
export function quotationPdf(id: string, number: string | null): PdfRequest {
  return {
    title: `Quotation ${number ?? ""}`.trim(),
    fileName: safeName(`${number ?? "quotation"}.pdf`),
    make: async () => {
      const [{ data: quotation, error }, { data: items }, { data: groups }] = await Promise.all([
        supabase.from("quotations").select("*").eq("id", id).maybeSingle(),
        supabase.from("quotation_items").select("*").eq("quotation_id", id).order("position"),
        supabase.from("quotation_groups").select("id, label, quantity, subtotal").eq("quotation_id", id).order("position"),
      ]);
      fail(error);
      if (!quotation) throw new Error("Quotation not found");
      const shared = ["sent", "accepted", "declined"].includes(quotation.status);
      if (quotation.approval_status === "approved" && quotation.signature_id && shared) {
        return fetchSigned(`/quotes/${quotation.public_token}/pdf`);
      }
      const signoff = quotation.approval_status === "approved" ? null : placeholder(await loadSignatureInfo());
      return renderQuotationPdf(quotation, items ?? [], groups ?? [], signoff);
    },
  };
}

/** An invoice for the PDF viewer. */
export function invoicePdf(id: string, number: string | null): PdfRequest {
  return {
    title: `Invoice ${number ?? ""}`.trim(),
    fileName: safeName(`${number ?? "invoice"}.pdf`),
    make: async () => {
      const [{ data: invoice, error }, { data: items }, { data: groups }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
        supabase.from("invoice_groups").select("id, label, quantity, subtotal").eq("invoice_id", id).order("position"),
      ]);
      fail(error);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.approval_status === "approved" && invoice.signature_id) {
        return fetchSigned(`/i/${invoice.public_token}/pdf`);
      }
      const signoff = invoice.approval_status === "approved" ? null : placeholder(await loadSignatureInfo());
      return renderInvoicePdf(invoice, items ?? [], groups ?? [], signoff);
    },
  };
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
