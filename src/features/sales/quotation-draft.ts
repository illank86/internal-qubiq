import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/invoices";
import type { SalesCatalog, GroupDraft } from "@/lib/sales";

/** Everything the builder starts from: a blank quotation, a quote request, a licence request, or a saved quotation. */
export type QuotationDraft = {
  quotationId: string | null;
  number: string | null;
  quoteRequestId: string | null;
  licenseId: string | null;
  requestNote: { reference: string; message: string | null; total: string | null } | null;
  groups: Omit<GroupDraft, "key">[];
  currency: string;
  exchangeRate: number | null;
  taxRate: number;
  decimals: number;
  validUntil: string;
  source: "website" | "phone" | "email" | "meeting" | "other";
  internalNote: string;
  contact: { name: string; email: string; company: string; jobTitle: string; phone: string; country: string; address: string };
  sales: { profileId: string; name: string; title: string; email: string; phone: string };
  introduction: string;
  terms: string;
  closing: string;
  signoff: string;
  sent: boolean;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** A new quotation — blank, or prefilled from a quote request or a licence request. */
export async function newQuotationDraft(catalog: SalesCatalog, me: string, requestId: string | null, licenseId: string | null): Promise<QuotationDraft> {
  const [{ data: request }, { data: license }, { data: catalogue }, { data: editionSlugs }] = await Promise.all([
    requestId ? supabase.from("quote_requests").select("*").eq("id", requestId).maybeSingle() : Promise.resolve({ data: null }),
    licenseId
      ? supabase
          .from("licenses")
          .select("id, label, customer_address, quotation_group_id, owner:profiles!licenses_owner_id_fkey(full_name, email, company, phone)")
          .eq("id", licenseId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("license_modules").select("id, slug"),
    supabase.from("license_editions").select("id, slug"),
  ]);
  const owner = license?.owner as unknown as { full_name: string | null; email: string | null; company: string | null; phone: string | null } | null;

  // A website request names its edition and modules by slug: match them to today's price list.
  const moduleIdBySlug = new Map((catalogue ?? []).map((row) => [row.slug, row.id]));
  const requested = Array.isArray(request?.modules) ? (request.modules as { slug?: string }[]) : [];
  const moduleIds = requested.flatMap((module) => {
    const id = module.slug ? moduleIdBySlug.get(module.slug) : undefined;
    return id ? [id] : [];
  });
  const editionId = request ? ((editionSlugs ?? []).find((edition) => edition.slug === request.edition_slug)?.id ?? "") : "";

  const person = catalog.team.find((member) => member.id === me);
  return {
    quotationId: null,
    number: null,
    quoteRequestId: request?.id ?? null,
    licenseId: license && !license.quotation_group_id ? license.id : null,
    requestNote: request
      ? {
          reference: request.reference,
          message: request.message,
          total: request.licence_total != null ? formatMoney(request.licence_total, request.currency ?? "USD") : null,
        }
      : null,
    groups: request
      ? [{ label: request.edition_name ? `${request.edition_name} server` : "Server group 1", editionId, moduleIds, quantity: 1 }]
      : license
        ? [{ label: license.label, editionId: catalog.editions[0]?.id ?? "", moduleIds: catalog.editions[0]?.moduleIds ?? [], quantity: 1 }]
        : [],
    currency: request?.currency ?? "",
    exchangeRate: null,
    taxRate: catalog.taxRate,
    decimals: catalog.decimals,
    validUntil: isoDate(new Date(Date.now() + catalog.validityDays * 86_400_000)),
    source: request ? "website" : license ? "other" : "phone",
    internalNote: "",
    contact: {
      name: request?.contact_name ?? owner?.full_name ?? "",
      email: request?.contact_email ?? owner?.email ?? "",
      company: request?.company ?? owner?.company ?? "",
      jobTitle: request?.job_title ?? "",
      phone: request?.phone ?? owner?.phone ?? "",
      country: request?.country ?? "",
      address: license?.customer_address ?? "",
    },
    sales: person
      ? { profileId: person.id, name: person.name, title: person.title, email: person.email || catalog.salesDesk.email, phone: person.phone || catalog.salesDesk.phone }
      : { profileId: "", name: "", title: "", email: catalog.salesDesk.email, phone: catalog.salesDesk.phone },
    introduction: request?.contact_name
      ? `Dear ${request.contact_name.split(/\s+/)[0]},\nThank you for your interest in QUBIQ. Please find our offer below.`
      : "",
    terms: catalog.terms,
    closing: catalog.closing,
    signoff: catalog.signoff,
    sent: false,
  };
}

/** A saved quotation, back into the builder. */
export async function savedQuotationDraft(id: string): Promise<QuotationDraft | null> {
  const [{ data: quotation, error }, { data: items }, { data: groups }] = await Promise.all([
    supabase.from("quotations").select("*, request:quote_requests(reference, message)").eq("id", id).maybeSingle(),
    supabase.from("quotation_items").select("group_id, module_id").eq("quotation_id", id),
    supabase.from("quotation_groups").select("id, label, edition_id, quantity").eq("quotation_id", id).order("position"),
  ]);
  if (error) throw error;
  if (!quotation) return null;
  const request = quotation.request as unknown as { reference: string; message: string | null } | null;

  return {
    quotationId: quotation.id,
    number: quotation.number,
    quoteRequestId: quotation.quote_request_id,
    licenseId: null,
    requestNote: request ? { reference: request.reference, message: request.message, total: null } : null,
    groups: (groups ?? []).map((group) => ({
      label: group.label,
      editionId: group.edition_id ?? "",
      quantity: group.quantity,
      moduleIds: (items ?? []).flatMap((item) => (item.group_id === group.id && item.module_id ? [item.module_id] : [])),
    })),
    currency: quotation.exchange_rate ? quotation.currency : "",
    exchangeRate: quotation.exchange_rate ? Number(quotation.exchange_rate) : null,
    taxRate: Number(quotation.tax_rate),
    decimals: quotation.decimal_places,
    validUntil: quotation.valid_until,
    source: (quotation.quote_request_id ? "website" : quotation.source) as QuotationDraft["source"],
    internalNote: quotation.internal_note ?? "",
    contact: {
      name: quotation.contact_name,
      email: quotation.contact_email ?? "",
      company: quotation.company ?? "",
      jobTitle: quotation.job_title ?? "",
      phone: quotation.phone ?? "",
      country: quotation.country ?? "",
      address: quotation.address ?? "",
    },
    sales: {
      profileId: quotation.sales_profile_id ?? "",
      name: quotation.sales_name ?? "",
      title: quotation.sales_title ?? "",
      email: quotation.sales_email ?? "",
      phone: quotation.sales_phone ?? "",
    },
    introduction: quotation.introduction ?? "",
    terms: quotation.terms ?? "",
    closing: quotation.closing ?? "",
    signoff: quotation.signoff ?? "",
    sent: quotation.status === "sent",
  };
}
