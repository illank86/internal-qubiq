import { useQuery } from "@tanstack/react-query";
import { Alert, Col, Form, Input, InputNumber, Row, Segmented, Select, Typography } from "antd";
import { money, useWithholdingCodes, withholdingPreview, WITHHELD } from "./api";

/**
 * The vendor's tax identity and what QUBIQ withholds when paying them, inside
 * the expense form:
 *   company in Indonesia  → PPh 23 (services, rent of other assets) or PPh 4(2) (building rent, construction)
 *   individual in Indonesia → PPh 21 non-employee (freelancers, experts), or PPh 4(2) for rent
 *   abroad                → PPh 26 (20%, or the tax-treaty rate with a DGT form)
 * The amount is worked out by the database; this only shows it.
 */

export type VendorKind = "company" | "individual" | "foreign";

const TYPES_FOR: Record<VendorKind, string[]> = {
  company: ["pph23", "pph42"],
  individual: ["pph21", "pph42", "pph23"],
  foreign: ["pph26"],
};

export function VendorTaxFields() {
  const form = Form.useFormInstance();
  const kind = (Form.useWatch("vendor_kind", form) ?? "company") as VendorKind;
  return (
    <>
      <Form.Item name="vendor_kind" label="Vendor is" style={{ marginBottom: 12 }}>
        <Segmented<VendorKind>
          options={[
            { value: "company", label: "Business in Indonesia" },
            { value: "individual", label: "Person in Indonesia" },
            { value: "foreign", label: "Abroad" },
          ]}
          onChange={() => form.setFieldsValue({ withholding_code: undefined, treaty_rate: null })}
        />
      </Form.Item>
      <Row gutter={12}>
        {kind === "foreign" ? (
          <>
            <Col xs={24} sm={12}>
              <Form.Item label="Country" name="vendor_country" rules={[{ max: 80 }]}>
                <Input placeholder="e.g. Singapore" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Tax ID there (TIN)" name="vendor_tin" rules={[{ max: 60 }]}>
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
          </>
        ) : kind === "individual" ? (
          <Col xs={24} sm={12}>
            <Form.Item label="NIK" name="vendor_nik" rules={[{ pattern: /^\s*\d{16}\s*$/, message: "16 digits" }]} extra="Without it, PPh 21 is 20% higher.">
              <Input inputMode="numeric" maxLength={16} />
            </Form.Item>
          </Col>
        ) : (
          <Col xs={24} sm={12}>
            <Form.Item label="Vendor NPWP" name="vendor_npwp" rules={[{ pattern: /^[0-9.\-\s]{15,22}$/, message: "15–16 digits" }]} extra="Without it, PPh 23 doubles.">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
        )}
        <Col xs={24} sm={12}>
          <Form.Item label="Vendor's invoice number" name="reference_number" rules={[{ max: 80 }]} extra="The document the bukti potong refers to.">
            <Input placeholder="Optional" />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

export function WithholdingFields() {
  const form = Form.useFormInstance();
  const { data: codes } = useWithholdingCodes();
  const kind = (Form.useWatch("vendor_kind", form) ?? "company") as VendorKind;
  const code = Form.useWatch("withholding_code", form) as string | undefined;
  const amount = Number(Form.useWatch("amount", form) ?? 0);
  const ppn = Number(Form.useWatch("ppn_in_amount", form) ?? 0);
  const baseInput = Form.useWatch("withholding_base", form) as number | null | undefined;
  const treaty = Form.useWatch("treaty_rate", form) as number | null | undefined;
  const currency = (Form.useWatch("currency", form) ?? "IDR") as string;
  const npwp = Form.useWatch("vendor_npwp", form) as string | undefined;
  const nik = Form.useWatch("vendor_nik", form) as string | undefined;
  const chosen = (codes ?? []).find((item) => item.code === code);
  const base = baseInput ?? Math.max(amount - ppn, 0);
  const hasId = kind === "foreign" || Boolean((kind === "individual" ? nik || npwp : npwp)?.replace(/\D/g, ""));

  const { data: preview } = useQuery({
    queryKey: ["withholding-preview", code, base, hasId, treaty ?? null],
    enabled: Boolean(code) && base > 0,
    queryFn: () => withholdingPreview(code!, base, hasId, chosen?.tax_type === "pph26" ? (treaty ?? null) : null),
  });

  const allowed = TYPES_FOR[kind];
  const options = allowed.map((type) => ({
    label: WITHHELD[type],
    options: (codes ?? [])
      .filter((item) => item.tax_type === type && (kind !== "individual" || type !== "pph23" || !item.code.startsWith("24-104-")))
      .sort((a, b) => Number(b.common) - Number(a.common) || a.code.localeCompare(b.code))
      .map((item) => ({ value: item.code, label: `${item.code} · ${item.name}${item.rate === null ? "" : ` (${Number(item.rate)}%)`}` })),
  }));

  return (
    <>
      <Form.Item
        label="Tax to withhold"
        name="withholding_code"
        extra={
          kind === "company"
            ? "Most services from an Indonesian business need PPh 23 (2%); office rent is PPh 4(2) 10%. Goods need none."
            : kind === "individual"
              ? "Freelancers and experts: PPh 21 on 50% of the fee at Article 17 rates."
              : "Paying abroad: PPh 26 at 20%, or the tax-treaty rate if the vendor gives you a DGT form. Cloud services already charged PPN by the provider (AWS, Google…) usually need none."
        }
      >
        <Select allowClear showSearch optionFilterProp="label" placeholder="None" options={options} popupMatchSelectWidth={false} />
      </Form.Item>
      {chosen ? (
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item label="Taxed on (DPP)" name="withholding_base" extra="The amount without PPN unless it differs.">
              <InputNumber min={0} style={{ width: "100%" }} placeholder={String(Math.max(amount - ppn, 0))} />
            </Form.Item>
          </Col>
          {chosen.tax_type === "pph26" ? (
            <Col xs={24} sm={12}>
              <Form.Item label="Tax-treaty rate" name="treaty_rate" extra="Only with the vendor's DGT form (SKD) for this year.">
                <InputNumber min={0} max={20} step={0.5} suffix="%" style={{ width: "100%" }} placeholder="20" />
              </Form.Item>
            </Col>
          ) : null}
          <Col span={24}>
            {preview ? (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                title={
                  <span>
                    Withhold <Typography.Text strong>{money(preview.amount, currency)}</Typography.Text> ({Number(preview.rate)}%
                    {chosen.tax_type === "pph21" ? " effective" : ""}) — the vendor is paid {money(Math.max(amount - preview.amount, 0), currency)}. Pay the tax by the 15th of next month and make the bukti potong in Coretax.
                  </span>
                }
              />
            ) : null}
          </Col>
        </Row>
      ) : null}
    </>
  );
}
