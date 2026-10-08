import { supabase } from "@/lib/supabase";
import { renderQuotationPdf, type QuotationForPdf } from "@/lib/quotation-pdf";
import { priceGroups, type GroupDraft, type SalesCatalog } from "@/lib/sales";

/**
 * Our company block, as private.invoice_seller() builds it when a quotation
 * is saved: Site settings (legal name, address, sales email, phone) and
 * Sales settings (tax ID, how to pay, footer).
 */
async function loadSeller() {
  const [{ data: site }, { data: settings }] = await Promise.all([
    supabase.from("site_settings").select("organization_legal_name, site_name, address_lines, sales_email, contact_email, phone").maybeSingle(),
    supabase.from("invoice_settings").select("tax_id, bank_details, footer_note").eq("id", true).maybeSingle(),
  ]);
  return {
    company_name: site?.organization_legal_name?.trim() || site?.site_name || "QUBIQ",
    address: (site?.address_lines ?? []).join("\n"),
    email: site?.sales_email?.trim() || site?.contact_email || "",
    phone: site?.phone ?? null,
    website: "goqubiq.com",
    tax_id: settings?.tax_id ?? null,
    bank_details: settings?.bank_details ?? null,
    footer_note: settings?.footer_note ?? null,
  };
}

export type PreviewInput = {
  number: string | null;
  sent: boolean;
  groups: GroupDraft[];
  currency: string;
  baseCurrency: string;
  rate: number;
  decimals: number;
  taxRate: number;
  taxLabel: string;
  issueDate: string;
  validUntil: string;
  contact: { name: string; email: string; company: string; jobTitle: string; phone: string; country: string; address: string };
  sales: { name: string; title: string; email: string; phone: string };
  introduction: string;
  terms: string;
  closing: string;
  signoff: string;
};

/**
 * The quotation as it would print, from what is on screen — nothing saved.
 * Lines are built the way private.price_quotation_groups() builds them: per
 * group the edition's modules (labelled with the edition — it has no line or
 * price of its own), then other one-off modules (each × servers), then
 * percentage modules on the group's one-off total.
 */
export async function renderQuotationPreview(catalog: SalesCatalog, input: PreviewInput): Promise<Blob> {
  const money = { rate: input.rate, decimals: input.decimals, currency: input.currency, taxRate: input.taxRate };
  const totals = priceGroups(input.groups, catalog.editions, catalog.modules, money);
  const scale = 10 ** input.decimals;
  const round = (amount: number) => Math.round(amount * scale) / scale;
  const convert = (amount: number) => round(amount * input.rate);

  const items: { id: string; group_id: string; description: string; detail: string | null; quantity: number; unit_price: number; amount: number }[] = [];
  const groups = totals.priced.map(({ group, edition, oneOff, subtotal }, index) => {
    const id = `group-${index}`;
    const picked = new Set(group.moduleIds);
    const inEdition = new Set(edition?.moduleIds ?? []);
    const oneOffModules = catalog.modules.filter((item) => picked.has(item.id) && !item.percent);
    // The edition's own modules first, then anything added on top.
    for (const module of [...oneOffModules.filter((item) => inEdition.has(item.id)), ...oneOffModules.filter((item) => !inEdition.has(item.id))]) {
      const unit = convert(module.price);
      items.push({
        id: `${id}-${module.id}`,
        group_id: id,
        description: module.name,
        detail: edition && inEdition.has(module.id) ? `${edition.name} edition` : module.category,
        quantity: group.quantity,
        unit_price: unit,
        amount: unit * group.quantity,
      });
    }
    for (const module of catalog.modules.filter((item) => picked.has(item.id) && item.percent)) {
      const amount = round((oneOff * (module.percent ?? 0)) / 100);
      items.push({
        id: `${id}-${module.id}`,
        group_id: id,
        description: module.name,
        detail: `${module.percent}% of licence${module.recurring ? ", first year" : ""}`,
        quantity: 1,
        unit_price: amount,
        amount,
      });
    }
    return { id, label: group.label || `Server group ${index + 1}`, quantity: group.quantity, subtotal };
  });

  const seller = await loadSeller();
  const quotation = {
    id: "preview",
    number: input.number,
    status: input.sent ? "sent" : "draft",
    // A preview has no public link yet; the QR points nowhere real until it is saved.
    public_token: "00000000-0000-0000-0000-000000000000",
    issue_date: input.issueDate,
    valid_until: input.validUntil,
    contact_name: input.contact.name,
    contact_email: input.contact.email || null,
    company: input.contact.company || null,
    job_title: input.contact.jobTitle || null,
    phone: input.contact.phone || null,
    country: input.contact.country || null,
    address: input.contact.address || null,
    sales_name: input.sales.name || null,
    sales_title: input.sales.title || null,
    sales_email: input.sales.email || null,
    sales_phone: input.sales.phone || null,
    currency: input.currency,
    base_currency: input.currency === input.baseCurrency ? null : input.baseCurrency,
    exchange_rate: input.currency === input.baseCurrency ? null : input.rate,
    decimal_places: input.decimals,
    subtotal: totals.subtotal,
    tax_label: input.taxLabel,
    tax_rate: input.taxRate,
    tax_amount: totals.tax,
    total: totals.total,
    introduction: input.introduction || null,
    terms: input.terms || null,
    closing: input.closing || null,
    signoff: input.signoff || null,
    seller,
  } as unknown as QuotationForPdf;

  return renderQuotationPdf(quotation, items, groups);
}
