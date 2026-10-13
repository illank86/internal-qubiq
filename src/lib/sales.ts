import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/invoices";

/**
 * What the Sales screens work from: the price list (editions and modules),
 * the defaults in Sales settings, and the team. Read as the signed-in staff
 * member, so RLS decides what comes back.
 */

/** A named group of modules; it has no price of its own. `custom`: the customer picks (no set, no heading). */
export type BuilderEdition = { id: string; name: string; tagline: string; custom: boolean; currency: string; moduleIds: string[] };
export type BuilderModule = { id: string; name: string; description: string; category: string; price: number; percent: number | null; recurring: boolean };
export type SalesPerson = { id: string; name: string; title: string; email: string; phone: string };
/** Category of a custom item (Software, Hardware, Services, …); `inLicenceBase`: percentage modules are charged on it too. */
export type ItemCategory = { id: string; name: string; inLicenceBase: boolean; active: boolean; defaultUnit: string };

/** Units offered for items (any other can be typed). Modules print as "ea". */
export const UNITS = ["ea", "pcs", "set", "unit", "lot", "licence", "man-day", "hour", "month", "year"];

/** Currencies offered for quoting and for custom items' prices. */
export const CURRENCIES = ["USD", "IDR", "EUR", "SGD", "MYR", "AUD", "GBP", "JPY", "CNY", "THB", "PHP", "VND", "INR"];

export type SalesCatalog = {
  editions: BuilderEdition[];
  modules: BuilderModule[];
  /** All categories in their order, inactive ones too (saved quotations may use them). */
  categories: ItemCategory[];
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
  const [{ data: editions }, { data: modules }, { data: links }, { data: settings }, { data: staff }, { data: site }, { data: categories }] = await Promise.all([
    supabase.from("license_editions").select("id, name, tagline, allows_module_selection, currency").order("sort_order"),
    supabase
      .from("license_modules")
      .select("id, name, description, price, percent_of_licence, is_recurring, sort_order, category:license_module_categories(name, sort_order)")
      .order("sort_order"),
    supabase.from("license_edition_modules").select("edition_id, module_id"),
    supabase
      .from("invoice_settings")
      .select("tax_label, tax_rate, payment_terms_days, decimal_places, quote_validity_days, quote_terms, quote_closing, quote_signoff")
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name, email, phone, job_title").eq("user_type", "internal").order("full_name"),
    supabase.from("site_settings").select("sales_email, contact_email, phone").maybeSingle(),
    supabase.from("quotation_item_categories").select("id, name, in_licence_base, is_active, default_unit").order("sort_order").order("name"),
  ]);

  const editionModules = new Map<string, string[]>();
  for (const link of links ?? []) editionModules.set(link.edition_id, [...(editionModules.get(link.edition_id) ?? []), link.module_id]);

  return {
    editions: (editions ?? []).map((edition) => ({
      id: edition.id,
      name: edition.name,
      tagline: edition.tagline ?? "",
      custom: Boolean(edition.allows_module_selection),
      currency: edition.currency ?? "USD",
      moduleIds: editionModules.get(edition.id) ?? [],
    })),
    modules: (modules ?? [])
      .map((row) => ({ row, category: row.category as unknown as { name: string; sort_order: number } | null }))
      .sort((a, b) => (a.category?.sort_order ?? 999) - (b.category?.sort_order ?? 999))
      .map(({ row, category }) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        category: category?.name ?? "Other",
        price: Number(row.price ?? 0),
        percent: row.percent_of_licence ? Number(row.percent_of_licence) : null,
        recurring: Boolean(row.is_recurring),
      })),
    categories: (categories ?? []).map((row) => ({ id: row.id, name: row.name, inLicenceBase: row.in_licence_base, active: row.is_active, defaultUnit: row.default_unit })),
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

export type ItemPricing = "item" | "breakdown" | "lump_sum";
/** A line under a breakdown (priced) or a lump sum (what it covers; no price). */
export type ItemPartDraft = { key: string; description: string; detail: string; unit: string; quantity: number; price: number; currency: string };
/**
 * Something sold with QUBIQ that is not a module: hardware, services, other
 * software. Priced in its own currency; the quantity is for the server group.
 */
export type CustomItemDraft = {
  key: string;
  categoryId: string;
  /** The section it sits in on this quotation: the category's name, or what it was renamed to. */
  section: string;
  description: string;
  detail: string;
  unit: string;
  quantity: number;
  price: number;
  currency: string;
  pricing: ItemPricing;
  parts: ItemPartDraft[];
};

/**
 * A group being edited. `servers`: identical servers sharing an edition and
 * modules, plus custom items. `shared`: items that cover every server group
 * (project management, a shared server) — no edition, modules or server count.
 */
export type GroupDraft = {
  key: string;
  kind: "servers" | "shared";
  label: string;
  editionId: string;
  moduleIds: string[];
  quantity: number;
  items: CustomItemDraft[];
};

let counter = 0;
export const newKey = () => `g${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newGroup(editions: BuilderEdition[], index: number, from?: Partial<GroupDraft>): GroupDraft {
  const editionId = from?.editionId ?? editions[0]?.id ?? "";
  return {
    key: newKey(),
    kind: from?.kind ?? "servers",
    label: from?.label ?? `Server group ${index + 1}`,
    editionId,
    moduleIds: from?.moduleIds ?? editions.find((edition) => edition.id === editionId)?.moduleIds ?? [],
    quantity: from?.quantity ?? 1,
    // Copies get their own keys, so editing one never touches the other.
    items: (from?.items ?? []).map((item) => ({ ...item, key: newKey(), parts: item.parts.map((part) => ({ ...part, key: newKey() })) })),
  };
}

/** Items for all server groups at once: no edition, modules or server count. */
export function newSharedGroup(): GroupDraft {
  return { key: newKey(), kind: "shared", label: "Project items", editionId: "", moduleIds: [], quantity: 1, items: [] };
}

export function newItem(category: ItemCategory, currency: string, section = category.name): CustomItemDraft {
  return { key: newKey(), categoryId: category.id, section, description: "", detail: "", unit: category.defaultUnit, quantity: 1, price: 0, currency, pricing: "item", parts: [] };
}

export function newPart(currency: string, unit = "ea"): ItemPartDraft {
  return { key: newKey(), description: "", detail: "", unit, quantity: 1, price: 0, currency };
}

/** A group as save_quotation takes it. */
export function groupPayload(group: GroupDraft) {
  const shared = group.kind === "shared";
  return {
    kind: group.kind,
    label: group.label,
    edition_id: shared ? null : group.editionId || null,
    module_ids: shared ? [] : group.moduleIds,
    quantity: shared ? 1 : group.quantity,
    items: group.items.map((item) => ({
      category_id: item.categoryId,
      section_name: item.section,
      description: item.description,
      detail: item.detail,
      unit: item.unit,
      quantity: item.quantity,
      // Items belong to their server group: the quantity is what was entered.
      per_server: false,
      price: item.pricing === "breakdown" ? 0 : item.price,
      currency: item.currency,
      pricing: item.pricing,
      parts:
        item.pricing === "item"
          ? []
          : item.parts.map((part) => ({
              description: part.description,
              detail: part.detail,
              unit: part.unit,
              quantity: part.quantity,
              price: item.pricing === "breakdown" ? part.price : 0,
              currency: part.currency || item.currency,
            })),
    })),
  };
}

/** The item currencies that need a rate: neither the price list's (base) nor the quotation's. */
export function ratesNeeded(groups: GroupDraft[], baseCurrency: string, currency: string): string[] {
  const used = groups.flatMap((group) =>
    group.items.flatMap((item) => (item.pricing === "breakdown" ? item.parts.map((part) => part.currency || item.currency) : [item.currency])),
  );
  return [...new Set(used.filter((code) => /^[A-Z]{3}$/.test(code) && code !== baseCurrency && code !== currency))].sort();
}

export type DiscountInput = { partnerPercent: number; type: "none" | "percent" | "amount"; value: number };
export type Money = {
  rate: number;
  decimals: number;
  currency: string;
  taxRate: number;
  discount?: DiscountInput;
  /** The price list's currency (USD); `rate` is one of it in `currency`. */
  baseCurrency?: string;
  /** One base-currency unit in each other item currency, e.g. { SGD: 1.29 }. */
  rates?: Record<string, number>;
};

/**
 * A custom item's unit price in the quotation currency, as
 * private.custom_unit_price(): entered in the quotation currency, exactly as
 * entered; otherwise through the base currency. Null while a rate is missing.
 */
export function customUnit(price: number, from: string, money: Money): number | null {
  const scale = 10 ** money.decimals;
  const round = (amount: number) => Math.round(amount * scale) / scale;
  const base = money.baseCurrency ?? money.currency;
  if (from === money.currency) return round(price);
  const per = (code: string) => (code === base ? 1 : code === money.currency ? money.rate : money.rates?.[code]);
  const fromRate = per(from);
  const toRate = per(money.currency);
  if (!fromRate || fromRate <= 0 || !toRate || toRate <= 0) return null;
  return round((price / fromRate) * toRate);
}

/** A custom line as private.price_quotation_groups() writes it. */
export type CustomLine = {
  key: string;
  parentKey: string | null;
  categoryId: string;
  categoryName: string;
  pricing: ItemPricing | null;
  description: string;
  detail: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
};

/**
 * A group's custom items as lines (by category, then as entered), and what
 * they add: to the licence (percentage modules are charged on it) and on top.
 * A rate still missing counts as 0 here; saving asks for it.
 */
export function customLines(group: GroupDraft, categories: ItemCategory[], money: Money) {
  const scale = 10 ** money.decimals;
  const round = (amount: number) => Math.round(amount * scale) / scale;
  const order = (id: string) => {
    const index = categories.findIndex((category) => category.id === id);
    return index < 0 ? categories.length : index;
  };
  // As the database orders them: by category, then sections in the order they were made, then items.
  const first = new Map<string, number>();
  group.items.forEach((item, index) => {
    const key = `${item.categoryId}|${item.section}`;
    if (!first.has(key)) first.set(key, index);
  });
  const items = group.items
    .map((item, index) => ({ item, index, section: first.get(`${item.categoryId}|${item.section}`) ?? index }))
    .sort((a, b) => order(a.item.categoryId) - order(b.item.categoryId) || a.section - b.section || a.index - b.index);
  const lines: CustomLine[] = [];
  let licence = 0;
  let extra = 0;
  for (const { item } of items) {
    const category = categories.find((entry) => entry.id === item.categoryId);
    const common = { categoryId: item.categoryId, categoryName: item.section.trim() || category?.name || "Other" };
    let total = 0;
    if (item.pricing === "breakdown") {
      lines.push({ ...common, key: item.key, parentKey: null, pricing: "breakdown", description: item.description, detail: item.detail || null, unit: item.unit || null, quantity: 1, unitPrice: 0, amount: 0 });
      for (const part of item.parts) {
        const unit = customUnit(part.price, part.currency || item.currency, money) ?? 0;
        const amount = round(unit * part.quantity);
        total += amount;
        lines.push({ ...common, key: part.key, parentKey: item.key, pricing: null, description: part.description, detail: part.detail || null, unit: part.unit || null, quantity: part.quantity, unitPrice: unit, amount });
      }
    } else {
      const unit = customUnit(item.price, item.currency, money) ?? 0;
      total = round(unit * item.quantity);
      lines.push({ ...common, key: item.key, parentKey: null, pricing: item.pricing, description: item.description, detail: item.detail || null, unit: item.unit || null, quantity: item.quantity, unitPrice: unit, amount: total });
      if (item.pricing === "lump_sum") {
        for (const part of item.parts) {
          lines.push({ ...common, key: part.key, parentKey: item.key, pricing: null, description: part.description, detail: part.detail || null, unit: part.unit || null, quantity: part.quantity, unitPrice: 0, amount: 0 });
        }
      }
    }
    if (category?.inLicenceBase) licence += total;
    else extra += total;
  }
  return { lines, licence, extra };
}

/**
 * Each group's subtotal and the document totals — the preview of what
 * private.price_quotation_groups() computes: per group, the edition and
 * one-off modules (each converted and rounded) × servers, custom items in
 * their own currency, then the group's percentage modules on the licence
 * (modules plus custom items that count with it); tax on the whole. The
 * database does the real calculation, so a preview that drifted could never
 * change what is quoted.
 */
export function priceGroups(groups: GroupDraft[], editions: BuilderEdition[], modules: BuilderModule[], money: Money, categories: ItemCategory[] = []) {
  const scale = 10 ** money.decimals;
  const round = (amount: number) => Math.round(amount * scale) / scale;
  const convert = (amount: number) => round(amount * money.rate);

  const priced = groups.map((group) => {
    const shared = group.kind === "shared";
    const edition = shared ? undefined : editions.find((item) => item.id === group.editionId);
    const picked = new Set(shared ? [] : group.moduleIds);
    // The edition is a group of modules with no price of its own.
    const unitOneOff = modules.filter((item) => picked.has(item.id) && !item.percent).reduce((sum, item) => sum + convert(item.price), 0);
    const oneOff = unitOneOff * group.quantity;
    const custom = customLines(group, categories, money);
    const licence = oneOff + custom.licence;
    const percent = modules
      .filter((item) => picked.has(item.id) && item.percent)
      .map((item) => ({ item, amount: round((licence * (item.percent ?? 0)) / 100) }));
    const subtotal = oneOff + custom.licence + custom.extra + percent.reduce((sum, line) => sum + line.amount, 0);
    return { group, edition, unitOneOff, oneOff, licence, custom, percent, subtotal };
  });
  const subtotal = priced.reduce((sum, item) => sum + item.subtotal, 0);
  // As private.discounted_totals(): partner % of the subtotal, then the own discount on what is left; tax after both.
  const partner = round((subtotal * (money.discount?.partnerPercent ?? 0)) / 100);
  const left = subtotal - partner;
  const own =
    money.discount?.type === "percent"
      ? round((left * Math.min(money.discount.value, 100)) / 100)
      : money.discount?.type === "amount"
        ? Math.min(round(money.discount.value), left)
        : 0;
  const discount = partner + own;
  const tax = round(((subtotal - discount) * money.taxRate) / 100);
  return { priced, subtotal, partner, own, discount, tax, total: subtotal - discount + tax, money: (amount: number) => formatMoney(amount, money.currency, money.decimals) };
}

/** A database error as something to show: our own checks' messages, or a generic line. */
export function errorText(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  if (!error) return fallback;
  return error.code === "22023" || error.code === "P0002" || error.code === "42501" ? (error.message ?? fallback) : fallback;
}
