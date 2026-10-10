import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Flex, Row, Statistic, Table, Tag, Typography } from "antd";
import { CodeOutlined, FileExcelOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";
import { idr } from "./api";
import { exportExcel } from "./exports";

type OutLine = { id: string; number: string; date: string; customer: string; buyer_npwp: string | null; harga_jual: number; dpp_nilai_lain: number; ppn: number; faktur_number: string | null };
type InLine = { number: string; date: string; vendor: string; vendor_npwp: string | null; faktur_number: string | null; ppn: number };
type Recap = { masa: string; pkp: boolean; output: OutLine[]; input: InLine[]; output_ppn: number; input_ppn: number; net: number; due_date: string; missing_faktur: number; missing_buyer_npwp: number; paid: number };
type CoretaxRows = {
  seller_tin: string | null;
  seller_idtku: string | null;
  trx_code: string;
  supply_type: string;
  item_code: string;
  unit: string;
  vat_rate: number;
  dpp_numerator: number;
  dpp_denominator: number;
  invoices: { number: string; date: string; buyer_name: string; buyer_address: string; buyer_email: string; buyer_npwp: string | null; buyer_nitku: string | null; faktur_number: string | null; rate: number; discount: number; subtotal: number; lines: { label: string; quantity: number; subtotal: number }[] }[];
};

const xml = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (name: string, value: string | number | null | undefined, indent: string) => (value === null || value === undefined || value === "" ? `${indent}<${name}/>` : `${indent}<${name}>${xml(value)}</${name}>`);

/**
 * The Coretax import file for faktur pajak keluaran, in DJP's TaxInvoiceBulk
 * layout: one TaxInvoice per invoice, one GoodService per server group, in
 * Rupiah; PPN on DPP nilai lain (11/12) at the PPN rate (code 04).
 */
export function coretaxXml(data: CoretaxRows, invoices: CoretaxRows["invoices"]) {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">'];
  lines.push(tag("TIN", data.seller_tin, "  "), "  <ListOfTaxInvoice>");
  for (const invoice of invoices) {
    lines.push("    <TaxInvoice>");
    lines.push(
      tag("TaxInvoiceDate", invoice.date, "      "),
      tag("TaxInvoiceOpt", "Normal", "      "),
      tag("TrxCode", data.trx_code, "      "),
      tag("AddInfo", "", "      "),
      tag("CustomDoc", "", "      "),
      tag("RefDesc", invoice.number, "      "),
      tag("FacilityStamp", "", "      "),
      tag("SellerIDTKU", data.seller_idtku, "      "),
      tag("BuyerTin", invoice.buyer_npwp ?? "0000000000000000", "      "),
      tag("BuyerDocument", invoice.buyer_npwp ? "TIN" : "Other ID", "      "),
      tag("BuyerCountry", "IDN", "      "),
      tag("BuyerDocumentNumber", invoice.buyer_npwp ? "-" : invoice.number, "      "),
      tag("BuyerName", invoice.buyer_name, "      "),
      tag("BuyerAdress", invoice.buyer_address.replace(/\s*\n\s*/g, ", "), "      "),
      tag("BuyerEmail", invoice.buyer_email, "      "),
      tag("BuyerIDTKU", invoice.buyer_nitku ?? "000000", "      "),
      "      <ListOfGoodService>",
    );
    for (const line of invoice.lines) {
      const share = Number(invoice.subtotal) ? Number(line.subtotal) / Number(invoice.subtotal) : 0;
      const quantity = Math.max(Number(line.quantity), 1);
      const price = Math.round((Number(line.subtotal) / quantity) * Number(invoice.rate) * 100) / 100;
      const discount = Math.round(Number(invoice.discount) * share * Number(invoice.rate));
      const taxBase = Math.round(price * quantity - discount);
      const otherBase = Math.round((taxBase * data.dpp_numerator) / data.dpp_denominator);
      const vat = Math.round((otherBase * Number(data.vat_rate)) / 100);
      lines.push(
        "        <GoodService>",
        tag("Opt", data.supply_type, "          "),
        tag("Code", data.item_code, "          "),
        tag("Name", `Lisensi QUBIQ — ${line.label}`, "          "),
        tag("Unit", data.unit, "          "),
        tag("Price", price, "          "),
        tag("Qty", quantity, "          "),
        tag("TotalDiscount", discount, "          "),
        tag("TaxBase", taxBase, "          "),
        tag("OtherTaxBase", otherBase, "          "),
        tag("VATRate", Number(data.vat_rate), "          "),
        tag("VAT", vat, "          "),
        tag("STLGRate", 0, "          "),
        tag("STLG", 0, "          "),
        "        </GoodService>",
      );
    }
    lines.push("      </ListOfGoodService>", "    </TaxInvoice>");
  }
  lines.push("  </ListOfTaxInvoice>", "</TaxInvoiceBulk>");
  return lines.join("\n");
}

/** PPN for the month: output (invoices issued as PKP), input (expenses with a faktur), what is due; Coretax import file and Excel recap. */
export function PpnCard({ masa, period }: { masa: string; period: string }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["ppn-recap", masa],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("ppn_recap", { p_masa: masa });
      if (error) throw error;
      return result as unknown as Recap;
    },
  });
  if (isLoading || !data) return null;
  if (!data.pkp && data.output.length === 0) return null;

  const downloadXml = async () => {
    setBusy("xml");
    try {
      const { data: rows, error } = await supabase.rpc("coretax_faktur_rows", { p_masa: masa });
      if (error) throw error;
      const result = rows as unknown as CoretaxRows;
      if (!result.seller_tin) throw { code: "22023", message: "Add our NPWP in Finance → Settings → Tax first." };
      const todo = result.invoices.filter((invoice) => !invoice.faktur_number);
      const chosen = todo.length ? todo : result.invoices;
      if (!chosen.length) throw { code: "22023", message: "No invoices issued as PKP this month." };
      const blob = new Blob([coretaxXml(result, chosen)], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `faktur-keluaran-${masa}.xml`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.success(`${chosen.length} invoice(s) in the file. Import it in Coretax → e-Faktur → Pajak Keluaran → Impor.`);
    } catch (cause) {
      message.error(errorText(cause as { code?: string; message?: string }, "The Coretax file could not be made."));
    } finally {
      setBusy(null);
    }
  };
  const excel = async () => {
    setBusy("xlsx");
    try {
      await exportExcel(`rekap-ppn-${masa}.xlsx`, period, [
        {
          name: "PPN Keluaran",
          title: "Rekap PPN Keluaran",
          columns: [
            { header: "Tanggal", key: "date", kind: "date" },
            { header: "Invoice", key: "number", width: 16 },
            { header: "Pembeli", key: "customer", width: 30 },
            { header: "NPWP pembeli", key: "buyer_npwp", width: 20 },
            { header: "Harga jual", key: "harga_jual", kind: "money" },
            { header: "DPP nilai lain", key: "dpp_nilai_lain", kind: "money" },
            { header: "PPN", key: "ppn", kind: "money" },
            { header: "No. faktur", key: "faktur_number", width: 22 },
          ],
          rows: data.output,
          totals: { customer: "Jumlah", ppn: data.output_ppn },
        },
        {
          name: "PPN Masukan",
          title: "Rekap PPN Masukan",
          columns: [
            { header: "Tanggal", key: "date", kind: "date" },
            { header: "Nomor", key: "number", width: 14 },
            { header: "Pemasok", key: "vendor", width: 30 },
            { header: "NPWP pemasok", key: "vendor_npwp", width: 20 },
            { header: "No. faktur", key: "faktur_number", width: 22 },
            { header: "PPN", key: "ppn", kind: "money" },
          ],
          rows: data.input,
          totals: { vendor: "Jumlah", ppn: data.input_ppn },
        },
      ]);
    } catch (cause) {
      message.error(errorText(cause as { code?: string; message?: string }, "The recap could not be made."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="PPN (VAT)"
      extra={
        <Flex gap={8}>
          <Button size="small" icon={<CodeOutlined />} loading={busy === "xml"} onClick={downloadXml} disabled={!data.output.length}>
            Coretax import (XML)
          </Button>
          <Button size="small" icon={<FileExcelOutlined />} loading={busy === "xlsx"} onClick={excel}>
            Excel
          </Button>
        </Flex>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Statistic title="PPN Keluaran" value={idr(data.output_ppn)} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="PPN Masukan" value={idr(data.input_ppn)} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title={data.net >= 0 ? "To pay (kurang bayar)" : "Carried over (lebih bayar)"} value={idr(Math.abs(data.net))} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="Pay and report by" value={new Date(`${data.due_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} />
          <Tag color={data.paid >= data.net ? "success" : "warning"}>{data.paid >= data.net ? "Paid" : `${idr(data.net - data.paid)} open`}</Tag>
        </Col>
      </Row>
      {data.missing_faktur || data.missing_buyer_npwp ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={[data.missing_faktur ? `${data.missing_faktur} invoice(s) without a faktur number yet` : "", data.missing_buyer_npwp ? `${data.missing_buyer_npwp} without the customer's NPWP` : ""].filter(Boolean).join(" · ")}
          description="Download the Coretax import, import it in Coretax, then attach each faktur pajak to its invoice. Add customers' NPWP on the invoice (Details)."
        />
      ) : null}
      <Table<OutLine>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={data.output}
        locale={{ emptyText: "No invoices issued as PKP this month." }}
        columns={[
          { title: "Invoice", dataIndex: "number" },
          { title: "Customer", key: "customer", render: (_, row) => (
            <Flex vertical>
              <span>{row.customer}</span>
              <Typography.Text type={row.buyer_npwp ? "secondary" : "warning"} style={{ fontSize: 12 }}>{row.buyer_npwp ?? "NPWP missing"}</Typography.Text>
            </Flex>
          ) },
          { title: "DPP nilai lain", key: "dpp", align: "right", render: (_, row) => idr(row.dpp_nilai_lain) },
          { title: "PPN", key: "ppn", align: "right", render: (_, row) => idr(row.ppn) },
          { title: "Faktur", key: "faktur", render: (_, row) => (row.faktur_number ? row.faktur_number : <Tag color="warning">Needed</Tag>) },
        ]}
      />
    </Card>
  );
}
