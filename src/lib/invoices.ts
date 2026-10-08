/**
 * Invoice helpers shared by the customer pages, the admin and the PDF.
 */

import type { Database } from "@/lib/database.types";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

/** The seller snapshot stored on each invoice (invoice_settings at issue time). */
export type InvoiceSeller = {
  company_name?: string | null;
  address?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  bank_details?: string | null;
  footer_note?: string | null;
};

/** What the customer reads: "PAYMENT REQUIRED" rather than an enum value. */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  unpaid: "PAYMENT REQUIRED",
  paid: "PAID",
  void: "VOID",
};

/** An amount in its currency, with the invoice's own number of decimal places (0–4). */
export function formatMoney(amount: number | string | null | undefined, currency = "USD", decimals = 2) {
  const value = Number(amount ?? 0);
  const places = Math.min(4, Math.max(0, Math.trunc(decimals)));
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(places)}`;
  }
}

export function formatInvoiceDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Overdue: still unpaid after its due date. */
export function isOverdue(invoice: Pick<Invoice, "status" | "due_date">) {
  return invoice.status === "unpaid" && invoice.due_date < new Date().toISOString().slice(0, 10);
}
