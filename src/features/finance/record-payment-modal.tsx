import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Divider, Flex, Input, InputNumber, Modal, Row, Segmented, Select, Skeleton, Typography, Upload, theme } from "antd";
import { CheckCircleOutlined, PaperClipOutlined } from "@ant-design/icons";
import { errorText } from "@/lib/sales";
import { documentFolder } from "@/features/sales/api";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { WITHHOLDING, invoiceOpenBalance, jakartaToday, money, recordReceipt, uploadAccountingFile, useBankAccounts } from "./api";
import { DateInput } from "@/components/date-input";

export type PaymentInvoice = {
  id: string;
  number: string | null;
  currency: string;
  total: number | string;
  subtotal: number | string;
  discount_amount?: number | string | null;
  issue_date: string;
};

/**
 * "Record payment": the money that actually reached the bank. By default the
 * invoice's open balance, as invoiced; otherwise what arrived, plus tax the
 * customer withheld (with their bukti potong), bank charges and any other
 * difference. The books (and the invoice's paid status) follow.
 */
export function RecordPaymentModal({ invoice, open, onClose }: { invoice: PaymentInvoice; open: boolean; onClose: () => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: banks, isLoading: banksLoading } = useBankAccounts();
  const { data: openBalance, isLoading } = useQuery({ queryKey: ["invoice-open", invoice.id], enabled: open, queryFn: () => invoiceOpenBalance(invoice.id) });
  // Customer advances in the invoice's currency with something left to apply.
  const { data: advances } = useQuery({
    queryKey: ["receipts", "open-advances", invoice.currency],
    enabled: open,
    queryFn: async () => {
      const [{ data }, { data: used }] = await Promise.all([
        supabase.from("receipts").select("id, number, received_on, payer_name, settled").eq("kind", "advance").eq("currency", invoice.currency).is("voided_at", null).order("received_on"),
        supabase.from("receipts").select("advance_receipt_id, settled").eq("kind", "advance_applied").is("voided_at", null),
      ]);
      const applied = new Map<string, number>();
      for (const row of used ?? []) if (row.advance_receipt_id) applied.set(row.advance_receipt_id, (applied.get(row.advance_receipt_id) ?? 0) + Number(row.settled));
      return (data ?? []).map((row) => ({ ...row, left: Number(row.settled) - (applied.get(row.id) ?? 0) })).filter((row) => row.left > 0.005);
    },
  });
  const [source, setSource] = useState<"bank" | "advance">("bank");
  const [advanceId, setAdvanceId] = useState<string | null>(null);
  const [applyAmount, setApplyAmount] = useState<number | null>(null);
  const today = jakartaToday();
  const net = Number(invoice.subtotal) - Number(invoice.discount_amount ?? 0);

  const [receivedOn, setReceivedOn] = useState(today);
  const [bankId, setBankId] = useState<string | null>(null);
  const [exact, setExact] = useState(true);
  const [netReceived, setNetReceived] = useState<number | null>(null);
  const [whtType, setWhtType] = useState<string | null>(null);
  const [whtAmount, setWhtAmount] = useState<number | null>(null);
  const [bpNumber, setBpNumber] = useState("");
  const [bpDate, setBpDate] = useState("");
  const [bpFile, setBpFile] = useState<File | null>(null);
  const [charges, setCharges] = useState<number | null>(null);
  const [other, setOther] = useState<number | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [idrCredited, setIdrCredited] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeBanks = (banks ?? []).filter((bank) => bank.active);
  const bank = activeBanks.find((item) => item.id === (bankId ?? activeBanks[0]?.id));
  const openAmount = Number(openBalance ?? invoice.total);
  const cur = invoice.currency;
  const advance = (advances ?? []).find((item) => item.id === advanceId);
  const fromAdvance = source === "advance";
  const settled = fromAdvance
    ? (applyAmount ?? Math.min(openAmount, advance?.left ?? 0))
    : exact
      ? openAmount
      : (netReceived ?? 0) + (whtAmount ?? 0) + (charges ?? 0) + (other ?? 0);
  const remaining = Math.round((openAmount - settled) * 100) / 100;
  const earlierMonth = receivedOn.slice(0, 7) < today.slice(0, 7);
  const foreignIntoIdr = cur !== "IDR" && bank?.currency === "IDR";
  const problem = fromAdvance
    ? !advance
      ? "Choose the advance to apply."
      : !receivedOn || receivedOn > today || receivedOn < invoice.issue_date || receivedOn < advance.received_on
        ? "The date is on or after both the invoice and the advance, and not in the future."
        : settled <= 0
          ? "Enter the amount to apply."
          : settled > advance.left + 0.005
            ? `Only ${money(advance.left, cur)} is left of ${advance.number}.`
            : remaining < -0.005
              ? "That is more than is open on the invoice."
              : earlierMonth && !reference.trim()
                ? "In an earlier month: add a note in the reference."
                : null
    : !bank
      ? "Add a bank account first (Finance → Settings → Bank accounts)."
      : !receivedOn || receivedOn > today || receivedOn < invoice.issue_date
        ? "The date is between the invoice date and today."
        : settled <= 0
          ? "Enter what arrived."
          : remaining < -0.005
            ? "That is more than is open on the invoice."
            : (whtAmount ?? 0) > 0 && !whtType
              ? "Choose which tax was withheld."
              : (other ?? 0) > 0 && !otherReason.trim()
                ? "Say why the rest is not paid."
                : earlierMonth && !reference.trim()
                  ? "Received in an earlier month: add the bank reference."
                  : null;

  const save = async () => {
    if (problem || (!fromAdvance && !bank)) return;
    setPending(true);
    setError(null);
    try {
      if (fromAdvance && advance) {
        await recordReceipt({ kind: "advance_applied", invoice_id: invoice.id, advance_receipt_id: advance.id, received_on: receivedOn, net_received: settled, reference });
        await Promise.all(["invoices", "receipts", "finance-dashboard", "invoice-open", "history", "order-overview", "sales-money"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
        message.success(remaining > 0.005 ? `Advance applied. ${money(remaining, cur)} is still open.` : `Advance applied; ${invoice.number ?? "the invoice"} is paid.`);
        onClose();
        return;
      }
      if (!bank) return;
      let bukti: { path: string; name: string } | null = null;
      if (!exact && bpFile) {
        const folder = await documentFolder("invoice", invoice.id).catch(() => `invoices/${invoice.id}`);
        bukti = await uploadAccountingFile(folder, "bukti-potong", bpFile);
      }
      const number = await recordReceipt({
        invoice_id: invoice.id,
        received_on: receivedOn,
        bank_account_id: bank.id,
        ...(exact
          ? {}
          : {
              net_received: netReceived ?? 0,
              withholding_type: (whtAmount ?? 0) > 0 ? whtType : null,
              withholding_amount: whtAmount ?? 0,
              bukti_potong_number: bpNumber,
              bukti_potong_date: bpDate || null,
              bukti_potong_path: bukti?.path ?? null,
              bank_charges: charges ?? 0,
              other_difference: other ?? 0,
              difference_reason: otherReason,
              idr_credited: foreignIntoIdr ? idrCredited : null,
            }),
        reference,
      });
      await Promise.all(["invoices", "receipts", "finance-dashboard", "invoice-open", "history", "order-overview", "sales-money"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      message.success(remaining > 0.005 ? `Payment recorded. ${money(remaining, cur)} is still open.` : `Payment recorded; ${invoice.number ?? "the invoice"} is paid.`);
      void number;
      onClose();
    } catch (cause) {
      setError(errorText(cause as { code?: string; message?: string }, "The payment could not be recorded. Please try again."));
    } finally {
      setPending(false);
    }
  };

  const amountInput = (value: number | null, onChange: (value: number | null) => void, label: string) => (
    <InputNumber value={value} onChange={(next) => onChange(next === null ? null : Number(next))} min={0} suffix={cur} style={{ width: "100%" }} aria-label={label} />
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Record payment · ${invoice.number ?? "invoice"}`}
      okText="Record payment"
      okButtonProps={{ disabled: Boolean(problem) || isLoading, loading: pending, icon: <CheckCircleOutlined /> }}
      onOk={save}
      width={640}
      destroyOnHidden
    >
      {isLoading || banksLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <Flex vertical gap={14}>
          <Typography.Text type="secondary">
            Open on this invoice: <Typography.Text strong>{money(openAmount, cur)}</Typography.Text>
            {Number(openAmount) !== Number(invoice.total) ? ` of ${money(invoice.total, cur)}` : ""}
          </Typography.Text>
          {advances?.length ? (
            <Segmented<"bank" | "advance">
              block
              value={source}
              onChange={setSource}
              options={[
                { value: "bank", label: "Money arrived in the bank" },
                { value: "advance", label: `From a customer advance (${advances.length})` },
              ]}
            />
          ) : null}
          {fromAdvance ? (
            <Row gutter={[12, 12]}>
              <Col span={24}>
                <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                  Advance
                </Typography.Text>
                <Select
                  style={{ width: "100%" }}
                  value={advanceId}
                  onChange={(id) => {
                    setAdvanceId(id);
                    setApplyAmount(null);
                  }}
                  placeholder="Choose the advance"
                  options={(advances ?? []).map((item) => ({
                    value: item.id,
                    label: `${item.number} · ${item.payer_name ?? "—"} · ${formatInvoiceDate(item.received_on)} · ${money(item.left, cur)} left`,
                  }))}
                />
              </Col>
              <Col xs={24} sm={10}>
                <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                  Applied on
                </Typography.Text>
                <DateInput value={receivedOn} min={invoice.issue_date} max={today} onChange={(value) => setReceivedOn(value)} />
              </Col>
              <Col xs={24} sm={14}>
                <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                  Amount to apply
                </Typography.Text>
                <InputNumber value={settled || null} onChange={(next) => setApplyAmount(next === null ? null : Number(next))} min={0} suffix={cur} style={{ width: "100%" }} />
              </Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  No money moves: the advance (a liability) settles the invoice. Still open after this: {money(Math.max(remaining, 0), cur)}.
                </Typography.Text>
              </Col>
            </Row>
          ) : null}
          {!fromAdvance ? (
          <>
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                Received on
              </Typography.Text>
              <DateInput value={receivedOn} min={invoice.issue_date} max={today} onChange={(value) => setReceivedOn(value)} />
            </Col>
            <Col xs={24} sm={14}>
              <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                Into bank account
              </Typography.Text>
              <Select
                style={{ width: "100%" }}
                value={bank?.id}
                onChange={setBankId}
                placeholder="Add one in Finance → Settings"
                options={activeBanks.map((item) => ({ value: item.id, label: `${item.name}${item.account_last4 ? ` ··${item.account_last4}` : ""} (${item.currency})` }))}
              />
            </Col>
          </Row>

          <Checkbox checked={exact} onChange={(event) => setExact(event.target.checked)}>
            Received exactly {money(openAmount, cur)}, as invoiced
          </Checkbox>

          {!exact ? (
            <div style={{ padding: 14, borderRadius: token.borderRadiusLG, border: `1px solid ${token.colorBorderSecondary}` }}>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12}>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    Arrived in the bank
                  </Typography.Text>
                  {amountInput(netReceived, setNetReceived, "Arrived in the bank")}
                </Col>
                {foreignIntoIdr ? (
                  <Col xs={24} sm={12}>
                    <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                      Rupiah credited by the bank
                    </Typography.Text>
                    <InputNumber value={idrCredited} onChange={(next) => setIdrCredited(next === null ? null : Number(next))} min={0} suffix="IDR" style={{ width: "100%" }} />
                  </Col>
                ) : null}
              </Row>
              <Divider style={{ margin: "14px 0 10px" }} titlePlacement="start" plain>
                Tax withheld by the customer
              </Divider>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12}>
                  <Select
                    allowClear
                    style={{ width: "100%" }}
                    placeholder="None"
                    value={whtType}
                    onChange={(value) => {
                      setWhtType(value ?? null);
                      // A suggestion from the invoice's amount before tax.
                      if (value === "pph23_2") setWhtAmount(Math.round(net * 0.02));
                      if (value === "pph23_15") setWhtAmount(Math.round(net * 0.15));
                      if (!value) setWhtAmount(null);
                    }}
                    options={Object.entries(WITHHOLDING).map(([value, label]) => ({ value, label }))}
                  />
                </Col>
                <Col xs={24} sm={12}>{amountInput(whtAmount, setWhtAmount, "Tax withheld")}</Col>
                {whtType ? (
                  <>
                    <Col xs={24} sm={8}>
                      <Input value={bpNumber} onChange={(event) => setBpNumber(event.target.value)} placeholder="“Bukti potong” number" maxLength={60} />
                    </Col>
                    <Col xs={24} sm={7}>
                      <DateInput value={bpDate} onChange={(value) => setBpDate(value)} aria-label="“Bukti potong” date" />
                    </Col>
                    <Col xs={24} sm={9}>
                      <Upload
                        accept="application/pdf,image/jpeg,image/png"
                        maxCount={1}
                        beforeUpload={(file) => {
                          setBpFile(file);
                          return false;
                        }}
                        onRemove={() => setBpFile(null)}
                        fileList={bpFile ? [{ uid: "bp", name: bpFile.name, status: "done" }] : []}
                      >
                        <Button icon={<PaperClipOutlined />} block>
                          Attach “bukti potong”
                        </Button>
                      </Upload>
                    </Col>
                  </>
                ) : null}
              </Row>
              <Divider style={{ margin: "14px 0 10px" }} titlePlacement="start" plain>
                Other differences
              </Divider>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Bank charges
                  </Typography.Text>
                  {amountInput(charges, setCharges, "Bank charges")}
                </Col>
                <Col xs={24} sm={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Not paid, let go (discount, write-off)
                  </Typography.Text>
                  {amountInput(other, setOther, "Let go")}
                </Col>
                {(other ?? 0) > 0 ? (
                  <Col span={24}>
                    <Input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Why, e.g. early payment discount agreed" maxLength={300} />
                  </Col>
                ) : null}
              </Row>
              <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: token.borderRadius, background: token.colorFillQuaternary, fontVariantNumeric: "tabular-nums" }}>
                <Flex justify="space-between">
                  <span>Settles on the invoice</span>
                  <strong>{money(settled, cur)}</strong>
                </Flex>
                <Flex justify="space-between">
                  <Typography.Text type="secondary">Still open after this</Typography.Text>
                  <Typography.Text type={remaining < -0.005 ? "danger" : "secondary"}>{money(Math.max(remaining, 0), cur)}</Typography.Text>
                </Flex>
              </div>
            </div>
          ) : null}

          </>
          ) : null}
          <div>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              Bank reference {earlierMonth ? <Typography.Text type="danger">(required: earlier month)</Typography.Text> : <Typography.Text type="secondary">(optional)</Typography.Text>}
            </Typography.Text>
            <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. BCA transfer ref 8812" maxLength={120} />
          </div>
          {problem && !banksLoading ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{problem}</Typography.Text> : null}
          {error ? <Alert type="error" showIcon title={error} /> : null}
        </Flex>
      )}
    </Modal>
  );
}
