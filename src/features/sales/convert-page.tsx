import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Descriptions, Flex, Result, Skeleton, Typography } from "antd";
import { TransactionOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { formatMoney } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { AccountPicker } from "./account-picker";
import { loadCustomerAccounts } from "./accounts";

/**
 * Turns an accepted quotation into an invoice for the quotation's customer
 * account. A linked quotation has nothing to choose; an unlinked one offers
 * its customer accounts, or "no account yet" — the invoice then waits and
 * moves in when the quotation is claimed. Licences are not picked here: each
 * links to the invoice through its order line.
 */
export function ConvertPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["convert", id],
    queryFn: async () => {
      const { data: quotation, error: loadError } = await supabase.from("quotations").select("*, invoices(id, number, status)").eq("id", id).maybeSingle();
      if (loadError) throw loadError;
      if (!quotation) return null;
      const [{ data: groups }, accounts] = await Promise.all([
        supabase.from("quotation_groups").select("id, label, quantity, subtotal").eq("quotation_id", id).order("position"),
        loadCustomerAccounts(() =>
          quotation.customer_id
            ? supabase.from("profiles").select("id, full_name, email, company").eq("id", quotation.customer_id)
            : supabase.from("profiles").select("id, full_name, email, company").eq("user_type", "external").order("created_at", { ascending: false }).limit(2000),
        ),
      ]);
      return { quotation, groups: groups ?? [], accounts };
    },
  });

  if (isLoading) return <Skeleton active />;
  if (!data) return <Result status="404" title="Quotation not found" />;
  const { quotation, groups, accounts } = data;
  const invoice = (quotation.invoices as unknown as { id: string; number: string; status: string }[]).find((candidate) => candidate.status !== "void");
  const money = (amount: number | string) => formatMoney(amount, quotation.currency, quotation.decimal_places);
  const linked = quotation.customer_id ? accounts.find((account) => account.id === quotation.customer_id) : undefined;
  const email = (quotation.contact_email ?? "").toLowerCase();
  const suggested = accounts.find((account) => email && account.email.toLowerCase() === email)?.id ?? "";
  const choice = picked ?? suggested;

  const title = `Convert ${quotation.number ?? ""} to an invoice`;
  const blocked = invoice
    ? `Already converted to invoice ${invoice.number}.`
    : quotation.status !== "accepted"
      ? "Only an accepted quotation can be converted. Mark it accepted in the quotation list first."
      : null;
  if (blocked) {
    return (
      <>
        <PageTitle title={title} />
        <Result status="info" title={blocked} extra={<Button onClick={() => navigate(invoice ? "/sales/invoices" : "/sales/quotations")}>{invoice ? "Open invoices" : "Back to quotations"}</Button>} />
      </>
    );
  }

  const convert = async () => {
    setPending(true);
    setError(null);
    const { error: convertError } = await supabase.rpc("convert_quotation_to_invoice", {
      p_quotation_id: quotation.id,
      // Linked, or "no account yet": the database uses the quotation's own account (or none).
      ...(linked || !choice ? {} : { p_owner_id: choice }),
    });
    setPending(false);
    if (convertError) return setError(errorText(convertError, "The invoice could not be created. Please try again."));
    await Promise.all(["quotations", "invoices"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success("Invoice created, and the customer has been emailed.");
    navigate("/sales/invoices");
  };

  return (
    <>
      <PageTitle
        title={title}
        description={`${quotation.company || quotation.contact_name} · ${money(quotation.total)} · the invoice copies the accepted lines and totals exactly.`}
      />
      <Flex vertical gap={16} style={{ maxWidth: 960 }}>
        <Card size="small" title="What is invoiced">
          <Flex vertical gap={8}>
            {groups.map((group) => (
              <Flex key={group.id} justify="space-between" gap={12}>
                <span>
                  {group.label}
                  <Typography.Text type="secondary">
                    {" "}
                    · {group.quantity} server{group.quantity === 1 ? "" : "s"}
                  </Typography.Text>
                </span>
                <Typography.Text strong>{money(group.subtotal)}</Typography.Text>
              </Flex>
            ))}
          </Flex>
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>
            Licences link to it by themselves: each fingerprint the customer uploads is requested against one of these order lines.
          </Typography.Paragraph>
        </Card>

        <Card title="Invoice it to">
          {quotation.customer_id ? (
            linked ? (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Account">{linked.name}</Descriptions.Item>
                <Descriptions.Item label="Email">{linked.email}</Descriptions.Item>
                {linked.company ? <Descriptions.Item label="Company">{linked.company}</Descriptions.Item> : null}
              </Descriptions>
            ) : (
              <Alert type="warning" showIcon title="The linked customer account could not be found." action={<Button size="small" onClick={() => navigate(`/sales/quotations/${quotation.id}/customer`)}>Check it</Button>} />
            )
          ) : (
            <AccountPicker
              accounts={accounts}
              value={choice}
              onChange={setPicked}
              matchEmail={quotation.contact_email ?? ""}
              noneLabel={
                <span>
                  <Typography.Text strong>No account yet — awaiting customer account.</Typography.Text>{" "}
                  <Typography.Text type="secondary">
                    Emailed to {quotation.contact_email || "the quotation contact"} with the PDF and the claim link; it moves into their account when they claim the quotation.
                  </Typography.Text>
                </span>
              }
            />
          )}
          {quotation.customer_id ? (
            <Typography.Paragraph type="secondary" style={{ margin: "12px 0 0", fontSize: 12 }}>
              The quotation&rsquo;s customer account. To invoice someone else, change the quotation&rsquo;s customer account first.
            </Typography.Paragraph>
          ) : null}
        </Card>

        {error ? <Alert type="error" showIcon title={error} /> : null}
        <div>
          <Button type="primary" size="large" icon={<TransactionOutlined />} loading={pending} disabled={Boolean(quotation.customer_id && !linked)} onClick={convert}>
            Create the invoice
          </Button>
        </div>
      </Flex>
    </>
  );
}
