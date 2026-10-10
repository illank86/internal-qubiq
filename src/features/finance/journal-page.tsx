import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Alert, Button, Flex, Input, InputNumber, Modal, Select, Table, Tag, Typography, theme } from "antd";
import type { TableColumnsType } from "antd";
import { BookOutlined, DeleteOutlined, PlusOutlined, RollbackOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday, postManualJournal, reverseManualJournal, useAccounts } from "./api";

type Line = { id: string; debit: number; credit: number; description: string | null; currency: string; amount_fc: number | null; account: { code: string; name: string; name_id: string | null } | null };
type Entry = {
  id: string;
  number: string;
  entry_date: string;
  source_type: string;
  memo: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  rate_estimated: boolean;
  lines: Line[];
};

const SOURCE: Record<string, { label: string; color: string }> = {
  invoice: { label: "Invoice", color: "blue" },
  receipt: { label: "Money in", color: "green" },
  expense: { label: "Expense", color: "orange" },
  expense_payment: { label: "Expense paid", color: "gold" },
  tax_payment: { label: "Tax paid", color: "purple" },
  payroll: { label: "Payroll", color: "cyan" },
  bpjs_payment: { label: "BPJS paid", color: "geekblue" },
  manual: { label: "Manual", color: "default" },
  reversal: { label: "Reversal", color: "red" },
};

/** The journal: every booking, debit and credit, in Rupiah. Posted entries are never edited — only reversed. */
export function JournalPage() {
  const { token } = theme.useToken();
  const { run, busy } = useAction([["journal"], ["finance-dashboard"]]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["journal"],
    queryFn: async () => {
      const { data: rows, error: loadError } = await supabase
        .from("journal_entries")
        .select("id, number, entry_date, source_type, memo, reversal_of, reversed_by, rate_estimated, lines:journal_lines(id, debit, credit, description, currency, amount_fc, account:accounts(code, name, name_id))")
        .order("entry_date", { ascending: false })
        .order("number", { ascending: false })
        .limit(1000);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as Entry[];
    },
  });
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((entry) => !query || [entry.number, entry.memo, ...entry.lines.map((line) => line.account?.name)].some((value) => (value ?? "").toLowerCase().includes(query)));
  }, [data, search]);

  const columns: TableColumnsType<Entry> = [
    {
      title: "Entry",
      key: "number",
      width: 170,
      render: (_, entry) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }} delete={Boolean(entry.reversed_by)}>
            {entry.number}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatInvoiceDate(entry.entry_date)}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "What",
      key: "memo",
      render: (_, entry) => (
        <Flex vertical gap={2}>
          <Flex gap={6} align="center" wrap>
            <Tag color={SOURCE[entry.source_type]?.color} style={{ marginInlineEnd: 0 }}>
              {SOURCE[entry.source_type]?.label ?? entry.source_type}
            </Tag>
            {entry.rate_estimated ? <Tag color="warning">Estimated rate</Tag> : null}
            {entry.reversed_by ? <Tag>Reversed</Tag> : null}
          </Flex>
          <span>{entry.memo}</span>
        </Flex>
      ),
    },
    {
      title: "Amount",
      key: "amount",
      align: "right",
      render: (_, entry) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{idr(entry.lines.reduce((sum, line) => sum + Number(line.debit), 0))}</span>,
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, entry) =>
        entry.source_type === "manual" && !entry.reversed_by ? (
          <Button size="small" type="text" icon={<RollbackOutlined />} loading={busy === `reverse:${entry.id}`} aria-label={`Reverse ${entry.number}`}
            onClick={() => run(`reverse:${entry.id}`, () => reverseManualJournal(entry.id, "Reversed from the journal"), "Entry reversed.")} />
        ) : null,
    },
  ];
  const navigate = useNavigate();

  return (
    <>
      <PageTitle
        title="Journal"
        description="Every booking in Rupiah, debit and credit. Entries are never edited: a mistake is reversed and booked again."
        actions={
          <Flex gap={8}>
            <Button icon={<BookOutlined />} onClick={() => navigate("/finance/journal/book")}>
              Jurnal & Buku Besar
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              Manual entry
            </Button>
          </Flex>
        }
      />
      {error ? <Alert type="error" showIcon title="The journal could not be loaded." style={{ marginBottom: 16 }} /> : null}
      <Flex justify="flex-end" style={{ marginBottom: 16 }}>
        <Input.Search allowClear value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Entry, description, account" style={{ maxWidth: 320 }} />
      </Flex>
      <Table<Entry>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        locale={{ emptyText: "Nothing booked yet." }}
        expandable={{
          expandedRowRender: (entry) => (
            <div style={{ padding: "4px 8px", background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
              {entry.lines.map((line) => (
                <Flex key={line.id} justify="space-between" gap={12} style={{ padding: "3px 0", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ paddingLeft: Number(line.credit) > 0 ? 24 : 0 }}>
                    <Typography.Text type="secondary" style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }}>
                      {line.account?.code}
                    </Typography.Text>{" "}
                    {line.account?.name}
                    {line.description ? <Typography.Text type="secondary"> · {line.description}</Typography.Text> : null}
                  </span>
                  <span>{Number(line.debit) > 0 ? `Dr ${idr(line.debit)}` : `Cr ${idr(line.credit)}`}</span>
                </Flex>
              ))}
            </div>
          ),
        }}
      />
      {adding ? <ManualEntryModal onClose={() => setAdding(false)} /> : null}
    </>
  );
}

type DraftLine = { key: number; account_id?: string; debit: number | null; credit: number | null; description: string };

/** A manual entry: opening balances, capital paid in, owner loans… It must balance. */
function ManualEntryModal({ onClose }: { onClose: () => void }) {
  const { data: accounts } = useAccounts();
  const { run, busy } = useAction([["journal"], ["finance-dashboard"]]);
  const [date, setDate] = useState(jakartaToday());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { key: 1, debit: null, credit: null, description: "" },
    { key: 2, debit: null, credit: null, description: "" },
  ]);
  const debit = lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const credit = lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  const balanced = debit > 0 && Math.abs(debit - credit) < 0.005;
  const ready = balanced && memo.trim() && lines.every((line) => !(line.debit || line.credit) || line.account_id);
  const update = (key: number, patch: Partial<DraftLine>) => setLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  return (
    <Modal
      open
      onCancel={onClose}
      title="Manual journal entry"
      width={760}
      okText="Post entry"
      okButtonProps={{ disabled: !ready, loading: busy === "manual" }}
      onOk={() =>
        run("manual", () => postManualJournal(date, memo.trim(), lines.filter((line) => line.account_id && (line.debit || line.credit)).map((line) => ({ account_id: line.account_id!, debit: line.debit ?? 0, credit: line.credit ?? 0, description: line.description }))), "Entry posted.").then((ok) => ok && onClose())
      }
      destroyOnHidden
    >
      <Flex vertical gap={12}>
        <Flex gap={8} wrap>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ width: 170 }} />
          <Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="What it is, e.g. Capital paid in by the founders" maxLength={500} style={{ flex: 1, minWidth: 220 }} />
        </Flex>
        {lines.map((line) => (
          <Flex key={line.key} gap={8} align="center" wrap>
            <Select showSearch optionFilterProp="label" placeholder="Account" value={line.account_id} onChange={(value) => update(line.key, { account_id: value })} style={{ flex: "2 1 220px" }}
              options={(accounts ?? []).filter((account) => account.active).map((account) => ({ value: account.id, label: `${account.code} ${account.name}` }))} />
            <InputNumber placeholder="Debit" min={0} value={line.debit} onChange={(value) => update(line.key, { debit: value === null ? null : Number(value), credit: value ? null : line.credit })} style={{ width: 150 }} />
            <InputNumber placeholder="Credit" min={0} value={line.credit} onChange={(value) => update(line.key, { credit: value === null ? null : Number(value), debit: value ? null : line.debit })} style={{ width: 150 }} />
            <Button type="text" icon={<DeleteOutlined />} disabled={lines.length <= 2} onClick={() => setLines(lines.filter((item) => item.key !== line.key))} aria-label="Remove line" />
          </Flex>
        ))}
        <Flex justify="space-between" align="center">
          <Button icon={<PlusOutlined />} onClick={() => setLines([...lines, { key: Date.now(), debit: null, credit: null, description: "" }])}>
            Add line
          </Button>
          <Typography.Text type={balanced ? "success" : "warning"} style={{ fontVariantNumeric: "tabular-nums" }}>
            Debit {idr(debit)} · Credit {idr(credit)} {balanced ? "· balanced" : `· difference ${idr(Math.abs(debit - credit))}`}
          </Typography.Text>
        </Flex>
      </Flex>
    </Modal>
  );
}
