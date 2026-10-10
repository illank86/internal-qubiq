import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Flex, Input, Modal, Tag, Typography, Upload } from "antd";
import { CheckCircleOutlined, EyeOutlined, FileProtectOutlined, PaperClipOutlined, WarningOutlined } from "@ant-design/icons";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { documentFolder } from "@/features/sales/api";
import { accountingFileBlob, jakartaToday, uploadAccountingFile } from "./api";

type FakturInvoice = {
  id: string;
  number: string | null;
  approval_status: string;
  status: string;
  seller: unknown;
  faktur_number?: string | null;
  faktur_date?: string | null;
  faktur_path?: string | null;
  faktur_file_name?: string | null;
  buyer_npwp?: string | null;
};

/** Issued while PKP (approved, not void): it needs its faktur pajak from Coretax. */
export const needsFaktur = (invoice: FakturInvoice) =>
  invoice.approval_status === "approved" && invoice.status !== "void" && (invoice.seller as { pkp?: boolean } | null)?.pkp === true;

/** "Faktur pajak needed" or "Faktur pajak ✓" — nothing when the invoice was not issued as PKP. */
export function FakturTag({ invoice }: { invoice: FakturInvoice }) {
  if (!needsFaktur(invoice)) return null;
  return invoice.faktur_path ? (
    <Tag icon={<CheckCircleOutlined />} color="success" style={{ marginInlineEnd: 0 }}>
      Faktur pajak
    </Tag>
  ) : (
    <Tag icon={<WarningOutlined />} color="warning" style={{ marginInlineEnd: 0 }}>
      Faktur pajak needed
    </Tag>
  );
}

/** The faktur pajak on an invoice: shown, viewed, attached or replaced. */
export function FakturPanel({ invoice, onUpload }: { invoice: FakturInvoice; onUpload: () => void }) {
  const viewPdf = usePdfViewer();
  if (!needsFaktur(invoice)) return null;
  return (
    <Flex vertical gap={6}>
      <BuyerNpwp invoice={invoice} />
    <Flex align="center" gap={8} wrap>
      <FileProtectOutlined style={{ color: "var(--ant-color-primary)" }} />
      {invoice.faktur_path ? (
        <>
          <Typography.Text>
            Faktur pajak <Typography.Text strong>{invoice.faktur_number}</Typography.Text>
            {invoice.faktur_date ? ` · ${invoice.faktur_date}` : ""}
          </Typography.Text>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => viewPdf({ title: `Faktur pajak · ${invoice.number ?? ""}`, fileName: invoice.faktur_file_name || `${invoice.number}-faktur-pajak.pdf`, make: () => accountingFileBlob(invoice.faktur_path!) })}>
            View
          </Button>
          <Button size="small" type="link" onClick={onUpload}>
            Replace
          </Button>
        </>
      ) : (
        <>
          <Typography.Text type="warning">No faktur pajak yet — make it in Coretax and attach it.</Typography.Text>
          <Button size="small" type="primary" icon={<PaperClipOutlined />} onClick={onUpload}>
            Attach faktur pajak
          </Button>
        </>
      )}
    </Flex>
    </Flex>
  );
}

/** The customer's NPWP (on the faktur pajak): shown, or added inline. */
function BuyerNpwp({ invoice }: { invoice: FakturInvoice }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(invoice.buyer_npwp ?? "");
  const [saving, setSaving] = useState(false);
  const digits = value.replace(/\D/g, "");
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("invoices").update({ buyer_npwp: digits || null }).eq("id", invoice.id);
    setSaving(false);
    if (error) return message.error(errorText(error, "The NPWP could not be saved (15–16 digits)."));
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    message.success("Customer NPWP saved.");
    setEditing(false);
  };
  if (editing) {
    return (
      <Flex gap={6} align="center" wrap>
        <Typography.Text type="secondary">Customer NPWP</Typography.Text>
        <Input size="small" value={value} onChange={(event) => setValue(event.target.value)} placeholder="16 digits" style={{ width: 200 }}
          status={value && (digits.length < 15 || digits.length > 16) ? "error" : undefined} />
        <Button size="small" type="primary" loading={saving} disabled={Boolean(value) && (digits.length < 15 || digits.length > 16)} onClick={save}>
          Save
        </Button>
        <Button size="small" type="text" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Flex>
    );
  }
  return (
    <Typography.Text type={invoice.buyer_npwp ? "secondary" : "warning"} style={{ fontSize: 13 }}>
      Customer NPWP: {invoice.buyer_npwp ?? "not added — needed on the faktur pajak"}{" "}
      <Typography.Link onClick={() => setEditing(true)}>{invoice.buyer_npwp ? "Change" : "Add"}</Typography.Link>
    </Typography.Text>
  );
}

/** Attach the faktur pajak made in Coretax: its number, date and PDF. */
export function FakturModal({ invoice, onClose }: { invoice: FakturInvoice; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [number, setNumber] = useState(invoice.faktur_number ?? "");
  const [date, setDate] = useState(invoice.faktur_date ?? jakartaToday());
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = number.replace(/\D/g, "").length;
  const ready = digits >= 13 && digits <= 20 && Boolean(date) && Boolean(file);

  const save = async () => {
    if (!ready || !file) return;
    setPending(true);
    setError(null);
    try {
      if (file.type !== "application/pdf") throw { code: "22023", message: "The faktur pajak is a PDF from Coretax." };
      const folder = await documentFolder("invoice", invoice.id).catch(() => `invoices/${invoice.id}`);
      const stored = await uploadAccountingFile(folder, "faktur-pajak", file);
      const { error: saveError } = await supabase.rpc("set_invoice_faktur", { p_id: invoice.id, p_number: number.trim(), p_date: date, p_path: stored.path, p_file_name: stored.name });
      if (saveError) throw saveError;
      await Promise.all(["invoices", "finance-dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      message.success("Faktur pajak attached.");
      onClose();
    } catch (cause) {
      setError(errorText(cause as { code?: string; message?: string }, "The faktur pajak could not be attached."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onCancel={onClose} title={`Faktur pajak · ${invoice.number ?? "invoice"}`} okText="Attach" okButtonProps={{ disabled: !ready, loading: pending }} onOk={save} destroyOnHidden>
      <Flex vertical gap={12}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Make the faktur pajak for this invoice in Coretax (code 04 for the usual PPN), then attach the PDF here with its number and date.
        </Typography.Paragraph>
        <div>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Faktur pajak number (NSFP)
          </Typography.Text>
          <Input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="e.g. 04002500123456789" maxLength={40} status={number && (digits < 13 || digits > 20) ? "error" : undefined} />
        </div>
        <div>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            Faktur date
          </Typography.Text>
          <Input type="date" value={date} max={jakartaToday()} onChange={(event) => setDate(event.target.value)} style={{ maxWidth: 200 }} />
        </div>
        <Upload accept="application/pdf" maxCount={1} beforeUpload={(chosen) => { setFile(chosen); return false; }} onRemove={() => setFile(null)}
          fileList={file ? [{ uid: "faktur", name: file.name, status: "done" }] : []}>
          <Button icon={<PaperClipOutlined />}>Choose the PDF</Button>
        </Upload>
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </Flex>
    </Modal>
  );
}
