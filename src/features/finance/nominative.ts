import { supabase } from "@/lib/supabase";

/** What kind of cost needs a nominative list (daftar nominatif) to be deductible. */
export type NominativeKind = "promotion" | "entertainment" | "benefit";

export const NOMINATIVE_LABEL: Record<NominativeKind, string> = {
  promotion: "Promotion",
  entertainment: "Entertainment",
  benefit: "Benefit in kind",
};

type NomineeRow = {
  kind: NominativeKind;
  given_on: string;
  name: string;
  tax_id: string;
  address: string;
  job_title: string;
  company: string;
  business_type: string;
  place: string;
  description: string;
  amount: number;
  tax_withheld: number;
  note: string;
  expense: string;
};

/**
 * A year's nominative lists for the annual return, and the costs that should
 * have one but do not (added back on the worksheet). Amounts are in Rupiah.
 */
export async function loadNominativeLists(year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, number, spent_on, vendor_name, description, amount, currency, nominative_kind, voided_at, account:accounts(nominative_kind), nominees:expense_nominees(*)")
    .gte("spent_on", from)
    .lte("spent_on", to)
    .is("voided_at", null)
    .order("spent_on");
  if (error) throw error;
  const nominees: NomineeRow[] = [];
  const missing: { spent_on: string; number: string; vendor_name: string; description: string; kind_text: string; amount: number }[] = [];
  for (const expense of expenses ?? []) {
    const kind = (expense.nominative_kind ?? (expense.account as { nominative_kind: string | null } | null)?.nominative_kind ?? null) as NominativeKind | null;
    if (!kind) continue;
    const list = (expense.nominees ?? []) as { given_on: string | null; name: string; tax_id: string | null; address: string | null; job_title: string | null; company: string | null; business_type: string | null; place: string | null; description: string | null; amount: number; tax_withheld: number; note: string | null; position: number }[];
    if (!list.length) {
      missing.push({ spent_on: expense.spent_on, number: expense.number, vendor_name: expense.vendor_name, description: expense.description, kind_text: NOMINATIVE_LABEL[kind], amount: Number(expense.amount) });
      continue;
    }
    for (const item of [...list].sort((a, b) => a.position - b.position)) {
      nominees.push({
        kind,
        given_on: item.given_on ?? expense.spent_on,
        name: item.name,
        tax_id: item.tax_id ?? "",
        address: item.address ?? "",
        job_title: item.job_title ?? "",
        company: item.company ?? "",
        business_type: item.business_type ?? "",
        place: item.place ?? "",
        description: item.description ?? "",
        amount: Number(item.amount),
        tax_withheld: Number(item.tax_withheld),
        note: item.note ?? "",
        expense: expense.number,
      });
    }
  }
  return { nominees, missing };
}
