import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Flex, Result, Skeleton, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { env } from "@/lib/env";
import { formatInvoiceDate } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { AccountPicker } from "./account-picker";
import { loadCustomerAccounts } from "./accounts";

const VIA: Record<string, string> = {
  link: "claimed by the customer with the claim link",
  email: "matched on the same email",
  admin: "assigned by staff",
};

/**
 * Which customer account a quotation (and the invoices made from it) belongs
 * to. Usually set by itself — same email, or the customer's claim link — and
 * corrected here when a customer uses a different email.
 */
export function CustomerPage() {
  const { id = "" } = useParams();
  const staff = useStaff();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["quotation-customer", id],
    queryFn: async () => {
      const [{ data: quotation }, accounts] = await Promise.all([
        supabase
          .from("quotations")
          .select("id, number, status, company, contact_name, contact_email, customer_id, claim_token, claimed_at, claimed_via")
          .eq("id", id)
          .maybeSingle(),
        loadCustomerAccounts(() =>
          supabase.from("profiles").select("id, full_name, email, company").eq("user_type", "external").order("created_at", { ascending: false }).limit(2000),
        ),
      ]);
      return quotation ? { quotation, accounts } : null;
    },
  });

  if (isLoading) return <Skeleton active />;
  if (!data) return <Result status="404" title="Quotation not found" />;
  const { quotation, accounts } = data;
  const value = picked ?? quotation.customer_id ?? "";
  const current = accounts.find((account) => account.id === quotation.customer_id);
  const chosen = accounts.find((account) => account.id === value);
  const email = (quotation.contact_email ?? "").toLowerCase();
  const mismatch = chosen && email && chosen.email.toLowerCase() !== email;
  const claimUrl = `${env.siteUrl}/claim/${quotation.claim_token}`;

  const save = async () => {
    setPending(true);
    setError(null);
    const customerId = value || null;
    const { error: saveError } = await supabase.rpc("assign_quotation_customer", { p_quotation_id: quotation.id, p_customer_id: customerId as string });
    if (saveError) {
      setPending(false);
      return setError(errorText(saveError, "That did not save. Please try again."));
    }
    // Who sees an invoice is worth a line in the activity log.
    await supabase.from("audit_log").insert({
      actor_id: staff.id,
      actor_email: staff.email,
      action: "update",
      resource: "quotations",
      record_id: quotation.id,
      summary: customerId ? "Assigned the quotation to a customer account" : "Unlinked the quotation from its customer account",
      changes: { customer_id: customerId },
    });
    setPending(false);
    await Promise.all(["quotations", "invoices"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success("Customer account saved. Any invoice from that quotation moved with it.");
    navigate("/sales/quotations");
  };

  return (
    <>
      <PageTitle
        title={`Customer account · ${quotation.number ?? ""}`}
        description={`${quotation.company || quotation.contact_name}${quotation.contact_email ? ` · sent to ${quotation.contact_email}` : ""}`}
      />
      <Flex vertical gap={16} style={{ maxWidth: 960 }}>
        <Card>
          {current ? (
            <Typography.Paragraph style={{ margin: 0 }}>
              Linked to <Typography.Text strong>{current.name}</Typography.Text> ({current.email})
              {quotation.claimed_via ? `, ${VIA[quotation.claimed_via] ?? quotation.claimed_via}` : ""}
              {quotation.claimed_at ? ` on ${formatInvoiceDate(quotation.claimed_at.slice(0, 10))}` : ""}.
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph style={{ margin: 0 }}>
              <Typography.Text strong>Not linked to an account yet.</Typography.Text> Invoices made from it wait as &ldquo;awaiting customer account&rdquo; and move in when it is linked.
            </Typography.Paragraph>
          )}
          <Typography.Paragraph type="secondary" style={{ margin: "12px 0 4px", fontSize: 12 }}>
            Claim link — already in the quotation and invoice emails. Share it only with this customer; the first account to use it keeps the quotation.
          </Typography.Paragraph>
          <Typography.Text code copyable={{ text: claimUrl }} style={{ wordBreak: "break-all" }}>
            {claimUrl}
          </Typography.Text>
        </Card>

        <Card title="Customer account">
          <AccountPicker
            accounts={accounts}
            value={value}
            onChange={setPicked}
            matchEmail={quotation.contact_email ?? ""}
            noneLabel="No account yet — the customer links it with the claim link"
          />
        </Card>

        {mismatch ? (
          <Alert
            type="warning"
            showIcon
            title={`This account's email (${chosen.email}) is not the one the quotation was sent to (${quotation.contact_email}).`}
            description="Make sure it is the same customer — they will see the quotation's invoices."
          />
        ) : null}
        {error ? <Alert type="error" showIcon title={error} /> : null}
        <div>
          <Button type="primary" icon={<SaveOutlined />} loading={pending} onClick={save}>
            Save customer account
          </Button>
        </div>
      </Flex>
    </>
  );
}
