import { supabase } from "@/lib/supabase";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { renderQuotationPdf } from "@/lib/quotation-pdf";
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

/** Emails the customer the private link (send_quotation bumps send_count; a trigger sends). */
export async function sendQuotation(id: string) {
  const { error } = await supabase.rpc("send_quotation", { p_quotation_id: id });
  fail(error);
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
      return renderQuotationPdf(quotation, items ?? [], groups ?? []);
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
      return renderInvoicePdf(invoice, items ?? [], groups ?? []);
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
