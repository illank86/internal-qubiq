import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Col, Input, InputNumber, Modal, Row, Select, Typography, Upload, theme } from "antd";
import { CheckCircleOutlined, PaperClipOutlined } from "@ant-design/icons";
import { errorText } from "@/lib/sales";
import { RECEIPT_KIND, WITHHOLDING, jakartaToday, money, recordReceipt, uploadAccountingFile, useAccounts, useBankAccounts, vendorFolder, type ReceiptKind } from "./api";

type Kind = Exclude<ReceiptKind, "invoice" | "advance_applied">;

/** Each kind: what it is, where it goes in the books, and what it asks for. */
const KINDS: Record<Kind, { hint: string; payer?: string; account?: "expense" | "prepaid" | "income"; tax?: "customer" | "interest" }> = {
  capital: { hint: "Shareholders paying in their capital. Not income (UU PPh Pasal 4(3)); goes to paid-in capital. It should match the deed.", payer: "Shareholder" },
  shareholder_loan: {
    hint: "A loan from a shareholder: a liability, not income. Keep a written loan agreement; interest-free is accepted only from the shareholder's own money, with their capital fully paid in.",
    payer: "Shareholder",
  },
  interest: { hint: "Interest or “jasa giro” from the bank. The bank already withheld a final 20% (PPh 4(2)), so it is taken out of taxable profit on the annual return.", tax: "interest" },
  advance: {
    hint: "A customer paying before the invoice or the delivery. Held as a liability (customer advances) and applied to their invoice later, from Record payment. Once PKP, PPN is due on it when it arrives.",
    payer: "Customer",
    tax: "customer",
  },
  refund: { hint: "A vendor paying money back (a cancelled subscription, an overcharge). It reduces the cost it came from; it is not new income.", payer: "Vendor", account: "expense" },
  tax_refund: { hint: "Tax paid back by the tax office (“restitusi”, an overpayment). It clears the prepaid tax it repays; not income.", account: "prepaid" },
  other_income: { hint: "Anything else that is income: an insurance claim, a grant, sponsorship, a customer reimbursing costs. Taxed as usual.", account: "income", tax: "customer" },
};

/**
 * Money in without an invoice. The kind decides the ledger account (the
 * database enforces it too); bank interest books the bank's final tax, and a
 * customer advance waits as a liability until it is applied to an invoice.
 */
export function OtherMoneyInModal({ onClose }: { onClose: () => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: banks } = useBankAccounts();
  const { data: accounts } = useAccounts();
  const today = jakartaToday();

  const [kind, setKind] = useState<Kind>("other_income");
  const [receivedOn, setReceivedOn] = useState(today);
  const [bankId, setBankId] = useState<string | null>(null);
  const [payer, setPayer] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [gross, setGross] = useState<number | null>(null);
  const [whtType, setWhtType] = useState<string | null>(null);
  const [whtAmount, setWhtAmount] = useState<number | null>(null);
  const [bpNumber, setBpNumber] = useState("");
  const [bpFile, setBpFile] = useState<File | null>(null);
  const [charges, setCharges] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = KINDS[kind];
  const activeBanks = (banks ?? []).filter((bank) => bank.active);
  const bank = activeBanks.find((item) => item.id === (bankId ?? activeBanks[0]?.id));
  const cur = bank?.currency ?? "IDR";
  const accountOptions = (accounts ?? []).filter((account) =>
    spec.account === "expense"
      ? account.type === "expense"
      : spec.account === "prepaid"
        ? account.type === "asset" && ((account.role ?? "").startsWith("prepaid") || account.role === "ppn_in")
        : spec.account === "income"
          ? account.type === "income" && !["fx_gain", "asset_gain", "interest_income"].includes(account.role ?? "")
          : false,
  );
  const defaultAccount = spec.account === "income" ? accountOptions.find((account) => account.role === "other_income") : undefined;
  const account = accountOptions.find((item) => item.id === (accountId ?? defaultAccount?.id));
  // Interest: entered as the gross the bank paid; it withheld 20% final.
  const interestTax = kind === "interest" && gross ? Math.round(gross * 0.2 * 100) / 100 : 0;
  const net = kind === "interest" ? (gross ?? 0) - interestTax - (charges ?? 0) : (amount ?? 0);
  const withheld = kind === "interest" ? interestTax : spec.tax === "customer" && whtType ? (whtAmount ?? 0) : 0;
  const earlierMonth = receivedOn.slice(0, 7) < today.slice(0, 7);

  const problem = !bank
    ? "Add a bank account first (Finance → Settings → Bank accounts)."
    : !receivedOn || receivedOn > today
      ? "The date is today or earlier."
      : net <= 0
        ? "Enter the amount."
        : spec.payer && !payer.trim()
          ? `Say who it came from (${spec.payer.toLowerCase()}).`
          : spec.account && !account
            ? "Choose the account it goes to."
            : earlierMonth && !reference.trim() && !note.trim()
              ? "Received in an earlier month: add the bank reference or a note."
              : null;

  const save = async () => {
    if (problem || !bank) return;
    setPending(true);
    setError(null);
    try {
      let bukti: { path: string; name: string } | null = null;
      if (withheld > 0 && bpFile) bukti = await uploadAccountingFile(vendorFolder(payer || "bank"), "bukti-potong", bpFile);
      await recordReceipt({
        kind,
        received_on: receivedOn,
        bank_account_id: bank.id,
        currency: cur,
        payer_name: payer.trim() || null,
        credit_account_id: spec.account ? account?.id : null,
        net_received: net,
        withholding_type: kind === "interest" ? (withheld > 0 ? "interest_final" : null) : withheld > 0 ? whtType : null,
        withholding_amount: withheld,
        bukti_potong_number: withheld > 0 ? bpNumber : null,
        bukti_potong_path: bukti?.path ?? null,
        bank_charges: charges ?? 0,
        reference,
        note,
      });
      await Promise.all(["receipts", "finance-dashboard", "sales-money", "annual-tax"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      message.success(`${RECEIPT_KIND[kind]} recorded.`);
      onClose();
    } catch (cause) {
      setError(errorText(cause as { code?: string; message?: string }, "It could not be recorded. Please try again."));
    } finally {
      setPending(false);
    }
  };

  const label = (text: string, extra?: ReactNode) => (
    <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
      {text} {extra}
    </Typography.Text>
  );
  const amountInput = (value: number | null, onChange: (value: number | null) => void, aria: string) => (
    <InputNumber value={value} onChange={(next) => onChange(next === null ? null : Number(next))} min={0} suffix={cur} style={{ width: "100%" }} aria-label={aria} />
  );

  return (
    <Modal
      open
      onCancel={onClose}
      title="Other money in"
      okText="Record"
      okButtonProps={{ disabled: Boolean(problem), loading: pending, icon: <CheckCircleOutlined /> }}
      onOk={save}
      width={640}
      destroyOnHidden
    >
      <Row gutter={[12, 14]}>
        <Col span={24}>
          {label("What is it?")}
          <Select<Kind>
            style={{ width: "100%" }}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setAccountId(null);
              setWhtType(null);
              setWhtAmount(null);
            }}
            options={(Object.keys(KINDS) as Kind[]).map((value) => ({ value, label: RECEIPT_KIND[value] }))}
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "6px 0 0" }}>
            {spec.hint}
          </Typography.Paragraph>
        </Col>
        <Col xs={24} sm={10}>
          {label("Received on")}
          <Input type="date" value={receivedOn} max={today} onChange={(event) => setReceivedOn(event.target.value)} />
        </Col>
        <Col xs={24} sm={14}>
          {label("Into bank account")}
          <Select
            style={{ width: "100%" }}
            value={bank?.id}
            onChange={setBankId}
            placeholder="Add one in Finance → Settings"
            options={activeBanks.map((item) => ({ value: item.id, label: `${item.name}${item.account_last4 ? ` ··${item.account_last4}` : ""} (${item.currency})` }))}
          />
        </Col>
        {spec.payer || kind === "other_income" ? (
          <Col xs={24} sm={spec.account ? 12 : 24}>
            {label(spec.payer ? `${spec.payer}` : "From", spec.payer ? null : <Typography.Text type="secondary">(optional)</Typography.Text>)}
            <Input value={payer} onChange={(event) => setPayer(event.target.value)} maxLength={200} placeholder={spec.payer === "Customer" ? "e.g. PT Contoh Industri" : spec.payer === "Vendor" ? "e.g. Amazon Web Services" : "Name"} />
          </Col>
        ) : null}
        {spec.account ? (
          <Col xs={24} sm={spec.payer || kind === "other_income" ? 12 : 24}>
            {label(spec.account === "expense" ? "Reduces the cost" : spec.account === "prepaid" ? "Repays" : "Income account")}
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
              value={account?.id}
              onChange={setAccountId}
              placeholder="Choose the account"
              options={accountOptions.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))}
            />
          </Col>
        ) : null}

        {kind === "interest" ? (
          <>
            <Col xs={24} sm={12}>
              {label("Interest before tax")}
              {amountInput(gross, setGross, "Interest before tax")}
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ padding: "8px 12px", borderRadius: token.borderRadius, background: token.colorFillQuaternary, fontVariantNumeric: "tabular-nums", marginTop: 26 }}>
                Final tax 20%: {money(interestTax, cur)} · arrives {money(net, cur)}
              </div>
            </Col>
          </>
        ) : (
          <Col xs={24} sm={12}>
            {label("Arrived in the bank")}
            {amountInput(amount, setAmount, "Arrived in the bank")}
          </Col>
        )}
        <Col xs={24} sm={12}>
          {label("Bank charges", <Typography.Text type="secondary">(if any)</Typography.Text>)}
          {amountInput(charges, setCharges, "Bank charges")}
        </Col>

        {spec.tax === "customer" ? (
          <>
            <Col xs={24} sm={12}>
              {label("Tax withheld by the payer", <Typography.Text type="secondary">(if any)</Typography.Text>)}
              <Select
                allowClear
                style={{ width: "100%" }}
                placeholder="None"
                value={whtType}
                onChange={(value) => setWhtType(value ?? null)}
                options={Object.entries(WITHHOLDING)
                  .filter(([value]) => value !== "interest_final")
                  .map(([value, text]) => ({ value, label: text }))}
              />
            </Col>
            <Col xs={24} sm={12}>
              {whtType ? (
                <>
                  {label("Amount withheld")}
                  {amountInput(whtAmount, setWhtAmount, "Amount withheld")}
                </>
              ) : null}
            </Col>
          </>
        ) : null}
        {withheld > 0 ? (
          <>
            <Col xs={24} sm={12}>
              <Input value={bpNumber} onChange={(event) => setBpNumber(event.target.value)} placeholder="“Bukti potong” number" maxLength={60} />
            </Col>
            <Col xs={24} sm={12}>
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

        <Col xs={24} sm={12}>
          {label("Bank reference", earlierMonth ? <Typography.Text type="danger">(or a note: earlier month)</Typography.Text> : <Typography.Text type="secondary">(optional)</Typography.Text>)}
          <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. BCA ref 8812" maxLength={120} />
        </Col>
        <Col xs={24} sm={12}>
          {label("Note", <Typography.Text type="secondary">(optional)</Typography.Text>)}
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === "shareholder_loan" ? "e.g. loan agreement 1 Oct 2026" : ""} maxLength={500} />
        </Col>
        {net > 0 ? (
          <Col span={24}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Booked: {money(net + withheld + (charges ?? 0), cur)} to{" "}
              {kind === "capital" ? "paid-in capital" : kind === "shareholder_loan" ? "loans from shareholders" : kind === "interest" ? "bank interest income" : kind === "advance" ? "customer advances" : (account?.name ?? "…")}
              {withheld > 0 ? `, of which ${money(withheld, cur)} ${kind === "interest" ? "final tax" : "withheld tax"}` : ""}
              {(charges ?? 0) > 0 ? `, ${money(charges ?? 0, cur)} bank charges` : ""}.
            </Typography.Text>
          </Col>
        ) : null}
        {problem && banks ? (
          <Col span={24}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {problem}
            </Typography.Text>
          </Col>
        ) : null}
        {error ? (
          <Col span={24}>
            <Alert type="error" showIcon title={error} />
          </Col>
        ) : null}
      </Row>
    </Modal>
  );
}
