import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Segmented, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { useAction } from "@/features/sales/use-action";
import { idr } from "./api";
import { NOMINATIVE_LABEL, type NominativeKind } from "./nominative";

type Nominee = {
  given_on: string;
  name: string;
  tax_id: string;
  address: string;
  job_title: string;
  company: string;
  business_type: string;
  place: string;
  description: string;
  amount: number | null;
  tax_withheld: number | null;
  note: string;
};

type Values = { kind: NominativeKind | "none"; nominees: Nominee[] };

const HINT: Record<NominativeKind, string> = {
  promotion: "Gifts, samples, sponsorship and similar given to named parties (PMK 02/2010). Advertising in media needs no list.",
  entertainment: "Meals and hospitality for business relations (SE-27/PJ.22/1986): who was entertained, their position and company, where and when.",
  benefit: "Benefits in kind to employees or others (PMK 66/2023): who received what.",
};

/**
 * The nominative list (daftar nominatif) of one expense: who received the
 * promotion, entertainment or benefit in kind. Without it the cost is added
 * back on the annual return; with it, it goes to attachment 11A in Coretax.
 */
export function NominativeModal({
  expense,
  defaultKind,
  onClose,
  run,
}: {
  expense: { id: string; number: string; spent_on: string; amount: number | string; currency: string; vendor_name: string; nominative_kind: string | null };
  defaultKind: NominativeKind | null;
  onClose: () => void;
  run: ReturnType<typeof useAction>["run"];
}) {
  const [form] = Form.useForm<Values>();
  const { data: existing, isLoading } = useQuery({
    queryKey: ["expense-nominees", expense.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_nominees").select("*").eq("expense_id", expense.id).order("position");
      if (error) throw error;
      return data;
    },
  });
  const kind = (Form.useWatch("kind", form) ?? "none") as Values["kind"];
  const nominees = (Form.useWatch("nominees", form) ?? []) as Nominee[];
  const listed = nominees.reduce((sum, item) => sum + Number(item?.amount ?? 0), 0);
  const expenseAmount = Number(expense.amount);

  const save = (values: Values) =>
    run(
      `nominees:${expense.id}`,
      async () => {
        const { error } = await supabase.rpc("set_expense_nominees", {
          p_expense: expense.id,
          p_kind: (values.kind === "none" ? null : values.kind) as string,
          p_nominees: (values.kind === "none" ? [] : (values.nominees ?? [])) as unknown as Json,
        });
        if (error) throw error;
      },
      "Nominative list saved.",
    ).then((ok) => ok && onClose());

  const blank = (): Nominee => ({ given_on: expense.spent_on, name: "", tax_id: "", address: "", job_title: "", company: "", business_type: "", place: "", description: "", amount: null, tax_withheld: null, note: "" });

  return (
    <Modal open onCancel={onClose} title={`Nominative list · ${expense.number}`} okText="Save" onOk={() => form.submit()} width={860} destroyOnHidden loading={isLoading}>
      {isLoading ? null : (
        <Form<Values>
          form={form}
          layout="vertical"
          onFinish={save}
          initialValues={{
            kind: (expense.nominative_kind as NominativeKind | null) ?? defaultKind ?? "none",
            nominees: (existing ?? []).map((item) => ({
              given_on: item.given_on ?? expense.spent_on,
              name: item.name,
              tax_id: item.tax_id ?? "",
              address: item.address ?? "",
              job_title: item.job_title ?? "",
              company: item.company ?? "",
              business_type: item.business_type ?? "",
              place: item.place ?? "",
              description: item.description ?? "",
              amount: Number(item.amount),
              tax_withheld: Number(item.tax_withheld),
              note: item.note ?? "",
            })),
          }}
        >
          <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
            {expense.vendor_name} · {idr(expense.amount)} {expense.currency !== "IDR" ? `(${expense.currency})` : ""}. Promotion, entertainment and benefits in kind are deductible only with a list of who received them; without it the cost is added back on the annual return.
          </Typography.Paragraph>
          <Form.Item name="kind" label="This cost is">
            <Segmented<Values["kind"]>
              options={[
                { value: "none", label: "None of these" },
                { value: "promotion", label: NOMINATIVE_LABEL.promotion },
                { value: "entertainment", label: NOMINATIVE_LABEL.entertainment },
                { value: "benefit", label: NOMINATIVE_LABEL.benefit },
              ]}
            />
          </Form.Item>
          {kind !== "none" ? (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 12 }} title={HINT[kind]} />
              <Form.List name="nominees">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => (
                      <div key={field.key} style={{ border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8, padding: "12px 12px 0", marginBottom: 10 }}>
                        <Row gutter={10}>
                          <Col xs={24} sm={8}>
                            <Form.Item label={`${index + 1}. Name`} name={[field.name, "name"]} rules={[{ required: true, whitespace: true, message: "Name" }]}>
                              <Input maxLength={200} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={8}>
                            <Form.Item label="NPWP / NIK" name={[field.name, "tax_id"]} rules={[{ pattern: /^[\d.\-\s]{15,22}$/, message: "15–16 digits" }]}>
                              <Input placeholder="Optional" />
                            </Form.Item>
                          </Col>
                          <Col xs={12} sm={4}>
                            <Form.Item label="Date" name={[field.name, "given_on"]}>
                              <Input type="date" />
                            </Form.Item>
                          </Col>
                          <Col xs={12} sm={4} style={{ textAlign: "right" }}>
                            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label="Remove" style={{ marginTop: 30 }} />
                          </Col>
                          {kind === "entertainment" ? (
                            <>
                              <Col xs={24} sm={8}>
                                <Form.Item label="Position" name={[field.name, "job_title"]}>
                                  <Input maxLength={120} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Form.Item label="Company" name={[field.name, "company"]}>
                                  <Input maxLength={200} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Form.Item label="Line of business" name={[field.name, "business_type"]}>
                                  <Input maxLength={120} />
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12}>
                                <Form.Item label="Place" name={[field.name, "place"]}>
                                  <Input maxLength={200} placeholder="Restaurant, city" />
                                </Form.Item>
                              </Col>
                            </>
                          ) : (
                            <Col xs={24} sm={12}>
                              <Form.Item label="Address" name={[field.name, "address"]}>
                                <Input maxLength={400} />
                              </Form.Item>
                            </Col>
                          )}
                          <Col xs={24} sm={12}>
                            <Form.Item label="What was given" name={[field.name, "description"]}>
                              <Input maxLength={200} placeholder={kind === "entertainment" ? "e.g. business dinner" : "e.g. souvenir, sample, voucher"} />
                            </Form.Item>
                          </Col>
                          <Col xs={12} sm={6}>
                            <Form.Item label="Amount (Rp)" name={[field.name, "amount"]} rules={[{ required: true, message: "Amount" }]}>
                              <InputNumber<number> min={1} style={{ width: "100%" }} formatter={(value) => (value ? Number(value).toLocaleString("id-ID") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
                            </Form.Item>
                          </Col>
                          <Col xs={12} sm={6}>
                            <Form.Item label="Tax withheld (Rp)" name={[field.name, "tax_withheld"]}>
                              <InputNumber<number> min={0} style={{ width: "100%" }} formatter={(value) => (value ? Number(value).toLocaleString("id-ID") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
                            </Form.Item>
                          </Col>
                        </Row>
                      </div>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={() => add(blank())}>
                      Add a recipient
                    </Button>
                    {fields.length ? (
                      <Typography.Text type={Math.abs(listed - expenseAmount) > 1 && expense.currency === "IDR" ? "warning" : "secondary"} style={{ display: "block", marginTop: 10 }}>
                        Listed {idr(listed)}
                        {expense.currency === "IDR" ? ` of ${idr(expenseAmount)}${Math.abs(listed - expenseAmount) > 1 ? " — the list should add up to the cost" : ""}` : ""}.
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="warning" style={{ display: "block", marginTop: 10 }}>
                        No recipients yet: this cost is added back on the annual return.
                      </Typography.Text>
                    )}
                  </>
                )}
              </Form.List>
            </>
          ) : null}
        </Form>
      )}
    </Modal>
  );
}
