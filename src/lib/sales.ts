import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/invoices";

/**
 * What the Sales screens work from: the price list (editions and modules),
 * the defaults in Sales settings, and the team. Read as the signed-in staff
 * member, so RLS decides what comes back.
 */

/** A named group of modules; it has no price of its own. */
export type BuilderEdition = { id: string; name: string; currency: string; moduleIds: string[] };
export type BuilderModule = { id: string; name: string; category: string; price: number; percent: number | null; recurring: boolean };
export type SalesPerson = { id: string; name: string; title: string; email: string; phone: string };

export type SalesCatalog = {
  editions: BuilderEdition[];
  modules: BuilderModule[];
  team: SalesPerson[];
  salesDesk: { email: string; phone: string };
  taxLabel: string;
  taxRate: number;
  decimals: number;
  dueDays: number;
  validityDays: number;
  terms: string;
  closing: string;
  signoff: string;
};

export async function loadSalesCatalog(): Promise<SalesCatalog> {
  const [{ data: editions }, { data: modules }, { data: links }, { data: settings }, { data: staff }, { data: site }] = await Promise.all([
    supabase.from("license_editions").select("id, name, currency").order("sort_order"),
    supabase
      .from("license_modules")
      .select("id, name, price, percent_of_licence, is_recurring, sort_order, category:license_module_categories(name, sort_order)")
      .order("sort_order"),
    supabase.from("license_edition_modules").select("edition_id, module_id"),
    supabase
      .from("invoice_settings")
      .select("tax_label, tax_rate, payment_terms_days, decimal_places, quote_validity_days, quote_terms, quote_closing, quote_signoff")
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name, email, phone, job_title").eq("user_type", "internal").order("full_name"),
    supabase.from("site_settings").select("sales_email, contact_email, phone").maybeSingle(),
  ]);

  const editionModules = new Map<string, string[]>();
  for (const link of links ?? []) editionModules.set(link.edition_id, [...(editionModules.get(link.edition_id) ?? []), link.module_id]);

  return {
    editions: (editions ?? []).map((edition) => ({
      id: edition.id,
      name: edition.name,
      currency: edition.currency ?? "USD",
      moduleIds: editionModules.get(edition.id) ?? [],
    })),
    modules: (modules ?? [])
      .map((row) => ({ row, category: row.category as unknown as { name: string; sort_order: number } | null }))
      .sort((a, b) => (a.category?.sort_order ?? 999) - (b.category?.sort_order ?? 999))
      .map(({ row, category }) => ({
        id: row.id,
        name: row.name,
        category: category?.name ?? "Other",
        price: Number(row.price ?? 0),
        percent: row.percent_of_licence ? Number(row.percent_of_licence) : null,
        recurring: Boolean(row.is_recurring),
      })),
    team: (staff ?? []).map((person) => ({
      id: person.id,
      name: person.full_name ?? person.email ?? "Team member",
      title: person.job_title ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
    })),
    salesDesk: { email: site?.sales_email || site?.contact_email || "", phone: site?.phone ?? "" },
    taxLabel: settings?.tax_label ?? "Tax",
    taxRate: Number(settings?.tax_rate ?? 0),
    decimals: settings?.decimal_places ?? 2,
    dueDays: settings?.payment_terms_days ?? 14,
    validityDays: settings?.quote_validity_days ?? 30,
    terms: settings?.quote_terms ?? "",
    closing: settings?.quote_closing ?? "",
    signoff: settings?.quote_signoff ?? "Best regards,",
  };
}

/** A server group being edited: identical servers sharing an edition and modules. */
export type GroupDraft = { key: string; label: string; editionId: string; moduleIds: string[]; quantity: number };

let counter = 0;
export const newKey = () => `g${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newGroup(editions: BuilderEdition[], index: number, from?: Partial<GroupDraft>): GroupDraft {
  const editionId = from?.editionId ?? editions[0]?.id ?? "";
  return {
    key: newKey(),
    label: from?.label ?? `Server group ${index + 1}`,
    editionId,
    moduleIds: from?.moduleIds ?? editions.find((edition) => edition.id === editionId)?.moduleIds ?? [],
    quantity: from?.quantity ?? 1,
  };
}

export type Money = { rate: number; decimals: number; currency: string; taxRate: number };

/**
 * Each group's subtotal and the document totals — the preview of what
 * private.price_quotation_groups() computes: per group, the edition and
 * one-off modules (each converted and rounded) × servers, then the group's
 * percentage modules on that; tax on the whole. The database does the real
 * calculation, so a preview that drifted could never change what is quoted.
 */
export function priceGroups(groups: GroupDraft[], editions: BuilderEdition[], modules: BuilderModule[], money: Money) {
  const scale = 10 ** money.decimals;
  const round = (amount: number) => Math.round(amount * scale) / scale;
  const convert = (amount: number) => round(amount * money.rate);

  const priced = groups.map((group) => {
    const edition = editions.find((item) => item.id === group.editionId);
    const picked = new Set(group.moduleIds);
    // The edition is a group of modules with no price of its own.
    const unitOneOff = modules.filter((item) => picked.has(item.id) && !item.percent).reduce((sum, item) => sum + convert(item.price), 0);
    const oneOff = unitOneOff * group.quantity;
    const percent = modules
      .filter((item) => picked.has(item.id) && item.percent)
      .map((item) => ({ item, amount: round((oneOff * (item.percent ?? 0)) / 100) }));
    const subtotal = oneOff + percent.reduce((sum, line) => sum + line.amount, 0);
    return { group, edition, unitOneOff, oneOff, percent, subtotal };
  });
  const subtotal = priced.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = round((subtotal * money.taxRate) / 100);
  return { priced, subtotal, tax, total: subtotal + tax, money: (amount: number) => formatMoney(amount, money.currency, money.decimals) };
}

/** A database error as something to show: our own checks' messages, or a generic line. */
export function errorText(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  if (!error) return fallback;
  return error.code === "22023" || error.code === "P0002" || error.code === "42501" ? (error.message ?? fallback) : fallback;
}
