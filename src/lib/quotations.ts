import type { Database } from "@/lib/database.types";

export type Quotation = Database["public"]["Tables"]["quotations"]["Row"];
export type QuotationItem = Database["public"]["Tables"]["quotation_items"]["Row"];
export type QuotationStatus = Database["public"]["Enums"]["quotation_status"];

/** Today as YYYY-MM-DD, in UTC like the dates stored on quotations. */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * A sent quotation past its Valid until date. Not stored: it is a reading of
 * the date, so it is never out of step with it.
 */
export function isExpired(quotation: Pick<Quotation, "status" | "valid_until">) {
  return quotation.status === "sent" && quotation.valid_until < today();
}

export type QuotationTone = "draft" | "open" | "expired" | "won" | "closed";

/** What a quotation's state reads as, and how it is coloured, everywhere it is shown. */
export function quotationState(quotation: Pick<Quotation, "status" | "valid_until">): { label: string; tone: QuotationTone } {
  if (isExpired(quotation)) return { label: "EXPIRED", tone: "expired" };
  switch (quotation.status) {
    case "draft":
      return { label: "DRAFT", tone: "draft" };
    case "sent":
      return { label: "AWAITING RESPONSE", tone: "open" };
    case "accepted":
      return { label: "ACCEPTED", tone: "won" };
    case "declined":
      return { label: "DECLINED", tone: "closed" };
    default:
      return { label: "CANCELLED", tone: "closed" };
  }
}
