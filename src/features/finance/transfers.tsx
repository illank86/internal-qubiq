import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Col, Flex, Input, InputNumber, Modal, Row, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { ArrowRightOutlined, CheckCircleOutlined, StopOutlined } from "@ant-design/icons";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { jakartaToday, money, recordBankTransfer, useBankAccounts, voidBankTransfer } from "./api";

type Transfer = {
  id: string;
  number: string;
  transferred_on: string;
  amount_out: number;
  amount_in: number;
  fee: number;
  reference: string | null;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  from: { name: string; currency: string } | null;
  to: { name: string; currency: string } | null;
};

const INVALIDATE = [["bank-transfers"], ["finance-dashboard"], ["receipts"]];

/** Money moved between our own accounts: not income, not a cost (only the fee, and any exchange difference). */
export function TransfersTable() {
  const { run, busy } = useAction(INVALIDATE);
  const [voiding, setVoiding] = useState<Transfer | null>(null);
  const [reason, setReason] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["bank-transfers"],
    queryFn: async () => {
      const { data: rows, error: loadError } = await supabase
        .from("bank_transfers")
        .select("*, from:bank_accounts!from_bank_id(name, currency), to:bank_accounts!to_bank_id(name, currency)")
        .order("transferred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as Transfer[];
    },
  });

  const columns: TableColumnsType<Transfer> = [
    {
      title: "Transfer",
      key: "number",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }} delete={Boolean(row.voided_at)}>
            {row.number}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatInvoiceDate(row.transferred_on)}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "Between",
      key: "between",
      render: (_, row) => (
        <Flex vertical>
          <span>
            {row.from?.name ?? "—"} <ArrowRightOutlined style={{ fontSize: 11, opacity: 0.6 }} /> {row.to?.name ?? "—"}
          </span>
          {row.reference ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.reference}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    { title: "Out", key: "out", align: "right", render: (_, row) => money(row.amount_out, row.from?.currency ?? "IDR") },
    { title: "In", key: "in", align: "right", render: (_, row) => money(row.amount_in, row.to?.currency ?? "IDR") },
    {
      title: "Fee",
      key: "fee",
      align: "right",
      responsive: ["md"],
      render: (_, row) => (Number(row.fee) > 0 ? money(row.fee, row.from?.currency ?? "IDR") : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) =>
        row.voided_at ? (
          <Tooltip title={row.void_reason ?? undefined}>
            <Tag>Voided</Tag>
          </Tooltip>
        ) : (
          <Button size="small" type="text" danger icon={<StopOutlined />} aria-label={`Void ${row.number}`} onClick={() => setVoiding(row)} loading={busy === `void:${row.id}`} />
        ),
    },
  ];

  return (
    <>
      {error ? <Alert type="error" showIcon title="Transfers could not be loaded." style={{ marginBottom: 16 }} /> : null}
      <Table<Transfer> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 700 }} locale={{ emptyText: "No transfers between accounts yet." }} />
      <Modal
        open={Boolean(voiding)}
        onCancel={() => setVoiding(null)}
        title={`Void ${voiding?.number ?? "transfer"}?`}
        okText="Void transfer"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        onOk={() =>
          voiding &&
          run(`void:${voiding.id}`, () => voidBankTransfer(voiding.id, reason.trim()), "Transfer voided.").then((ok) => {
            if (ok) {
              setVoiding(null);
              setReason("");
            }
          })
        }
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">Its booking is reversed (kept in the journal).</Typography.Paragraph>
        <Input.TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why, e.g. wrong account" maxLength={300} />
      </Modal>
    </>
  );
}

/** Record a transfer: what left one account, what arrived in the other (they differ across currencies), and the fee. */
export function TransferModal({ onClose }: { onClose: () => void }) {
  const { run, busy } = useAction(INVALIDATE);
  const { data: banks } = useBankAccounts();
  const today = jakartaToday();
  const [on, setOn] = useState(today);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amountOut, setAmountOut] = useState<number | null>(null);
  const [amountIn, setAmountIn] = useState<number | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [reference, setReference] = useState("");

  const active = (banks ?? []).filter((bank) => bank.active);
  const from = active.find((bank) => bank.id === fromId);
  const to = active.find((bank) => bank.id === toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);
  const earlierMonth = on.slice(0, 7) < today.slice(0, 7);
  const problem =
    active.length < 2
      ? "You need two bank accounts (Finance → Settings → Bank accounts)."
      : !from || !to
        ? "Choose both accounts."
        : from.id === to.id
          ? "Choose two different accounts."
          : !on || on > today
            ? "The date is today or earlier."
            : !amountOut
              ? "Enter the amount sent."
              : crossCurrency && !amountIn
                ? `Enter what arrived in ${to.currency}.`
                : earlierMonth && !reference.trim()
                  ? "In an earlier month: add the bank reference."
                  : null;
  const options = active.map((bank) => ({ value: bank.id, label: `${bank.name}${bank.account_last4 ? ` ··${bank.account_last4}` : ""} (${bank.currency})` }));

  const save = () =>
    run(
      "transfer",
      () => recordBankTransfer({ transferred_on: on, from_bank_id: fromId, to_bank_id: toId, amount_out: amountOut, amount_in: crossCurrency ? amountIn : null, fee: fee ?? 0, reference }),
      "Transfer recorded.",
    ).then((ok) => ok && onClose());

  return (
    <Modal
      open
      onCancel={onClose}
      title="Transfer between accounts"
      okText="Record transfer"
      okButtonProps={{ disabled: Boolean(problem), loading: busy === "transfer", icon: <CheckCircleOutlined /> }}
      onOk={save}
      width={560}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Moving our own money, e.g. converting USD to IDR. It is not income or a cost: only the fee is a cost, and across currencies the difference from the day's rate is an exchange gain or loss.
      </Typography.Paragraph>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12}>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            From
          </Typography.Text>
          <Select style={{ width: "100%" }} value={fromId} onChange={setFromId} options={options} placeholder="Account sent from" />
        </Col>
        <Col xs={24} sm={12}>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            To
          </Typography.Text>
          <Select style={{ width: "100%" }} value={toId} onChange={setToId} options={options.filter((option) => option.value !== fromId)} placeholder="Account received in" />
        </Col>
        <Col xs={24} sm={12}>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Sent
          </Typography.Text>
          <InputNumber value={amountOut} onChange={(next) => setAmountOut(next === null ? null : Number(next))} min={0} suffix={from?.currency} style={{ width: "100%" }} />
        </Col>
        {crossCurrency ? (
          <Col xs={24} sm={12}>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              Arrived
            </Typography.Text>
            <InputNumber value={amountIn} onChange={(next) => setAmountIn(next === null ? null : Number(next))} min={0} suffix={to?.currency} style={{ width: "100%" }} />
          </Col>
        ) : null}
        <Col xs={24} sm={12}>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Fee <Typography.Text type="secondary">(charged on the first account)</Typography.Text>
          </Typography.Text>
          <InputNumber value={fee} onChange={(next) => setFee(next === null ? null : Number(next))} min={0} suffix={from?.currency} style={{ width: "100%" }} />
        </Col>
        <Col xs={24} sm={12}>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Date
          </Typography.Text>
          <Input type="date" value={on} max={today} onChange={(event) => setOn(event.target.value)} />
        </Col>
        <Col span={24}>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Bank reference {earlierMonth ? <Typography.Text type="danger">(required: earlier month)</Typography.Text> : <Typography.Text type="secondary">(optional)</Typography.Text>}
          </Typography.Text>
          <Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} />
        </Col>
        {problem && banks ? (
          <Col span={24}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {problem}
            </Typography.Text>
          </Col>
        ) : null}
      </Row>
    </Modal>
  );
}
