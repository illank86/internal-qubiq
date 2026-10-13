import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Flex, Input, InputNumber, Popconfirm, Table, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday } from "./api";
import { DateInput } from "@/components/date-input";

type Kind = "jp_wage_cap" | "minimum_wage";
type Amount = { kind: Kind; effective_from: string; amount: number; note: string | null };

/**
 * An amount that changes on a date — the JP wage cap (every March) or the
 * minimum wage (every January). Each payroll month uses the one in force
 * then, so earlier months keep the old amount when a new one is added.
 */
export function DatedAmounts({ kind, title, hint }: { kind: Kind; title: string; hint: string }) {
  const { data } = useQuery({
    queryKey: ["payroll-amounts", kind],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("payroll_amounts").select("kind, effective_from, amount, note").eq("kind", kind).order("effective_from", { ascending: false });
      if (error) throw error;
      return rows as Amount[];
    },
  });
  const { run, busy } = useAction([["payroll-amounts", kind]]);
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const today = jakartaToday();
  const current = (data ?? []).find((row) => row.effective_from <= today);

  const add = () =>
    run(
      `add-${kind}`,
      async () => {
        const { error } = await supabase.from("payroll_amounts").upsert({ kind, effective_from: from, amount: amount!, note: note.trim() || null, updated_at: new Date().toISOString() });
        if (error) throw error;
        setFrom("");
        setAmount(null);
        setNote("");
      },
      "Saved. Draft months refresh to it; posted months keep theirs.",
    );
  const remove = (row: Amount) =>
    run(`del-${kind}-${row.effective_from}`, async () => {
      const { error } = await supabase.from("payroll_amounts").delete().eq("kind", kind).eq("effective_from", row.effective_from);
      if (error) throw error;
    });

  return (
    <Card size="small" title={title} extra={current ? <Typography.Text type="secondary">Now {idr(current.amount)}</Typography.Text> : null}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {hint}
      </Typography.Paragraph>
      <Table<Amount>
        size="small"
        rowKey="effective_from"
        pagination={false}
        dataSource={data ?? []}
        locale={{ emptyText: "None yet" }}
        columns={[
          { title: "From", dataIndex: "effective_from", render: (value: string) => formatInvoiceDate(value) },
          { title: "Amount", dataIndex: "amount", align: "right", render: (value: number) => idr(value) },
          { title: "Note", dataIndex: "note", render: (value: string | null) => <Typography.Text type="secondary">{value ?? ""}</Typography.Text> },
          {
            key: "remove",
            width: 40,
            render: (_, row) => (
              <Popconfirm title="Remove this amount?" description="Months after it fall back to the one before." onConfirm={() => remove(row)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove" loading={busy === `del-${kind}-${row.effective_from}`} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Flex gap={8} wrap style={{ marginTop: 12 }}>
        <DateInput value={from} onChange={(value) => setFrom(value)} aria-label="From" style={{ width: 150 }} />
        <InputNumber<number> value={amount} onChange={setAmount} min={1} step={1000} placeholder="Amount (Rp)" style={{ width: 170 }} formatter={(value) => (value ? Number(value).toLocaleString("en-US") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
        <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" maxLength={200} style={{ flex: 1, minWidth: 140 }} />
        <Button icon={<PlusOutlined />} disabled={!from || !amount} loading={busy === `add-${kind}`} onClick={add}>
          Add
        </Button>
      </Flex>
    </Card>
  );
}
