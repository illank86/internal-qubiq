import type { CustomerAccount } from "./account-picker";

/** Customer accounts as the pickers show them. */
export async function loadCustomerAccounts(
  supabaseQuery: () => PromiseLike<{ data: { id: string; full_name: string | null; email: string | null; company: string | null }[] | null }>,
): Promise<CustomerAccount[]> {
  const { data } = await supabaseQuery();
  return (data ?? []).map((account) => ({
    id: account.id,
    name: account.full_name || account.email || "Account",
    email: account.email ?? "",
    company: account.company ?? "",
  }));
}
