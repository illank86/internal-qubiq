import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Form, Input, Result, Row, Skeleton, Typography } from "antd";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";

type Values = {
  report_city: string;
  prepared_by_name: string;
  prepared_by_title: string;
  approved_by_name: string;
  approved_by_title: string;
};

const FIELDS = "report_city, prepared_by_name, prepared_by_title, approved_by_name, approved_by_title";

/**
 * Who signs the reports — the Neraca Saldo and the financial statements end
 * with "Disiapkan oleh" and "Disetujui oleh". The date is picked in the report
 * preview (today unless changed).
 */
export function ReportSettings() {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-report-settings"],
    queryFn: async () => {
      const { data: row, error: loadError } = await supabase.from("accounting_settings").select(FIELDS).eq("id", true).maybeSingle();
      if (loadError) throw loadError;
      return row;
    },
  });
  if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!data) return <Result status="warning" title="The report settings could not be loaded." />;

  const save = async (values: Values) => {
    setPending(true);
    setError(null);
    const clean = (value: string | undefined) => value?.trim() || null;
    const { error: saveError } = await supabase
      .from("accounting_settings")
      .update({
        report_city: clean(values.report_city),
        prepared_by_name: clean(values.prepared_by_name),
        prepared_by_title: clean(values.prepared_by_title),
        approved_by_name: clean(values.approved_by_name),
        approved_by_title: clean(values.approved_by_title),
      })
      .eq("id", true);
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The report settings could not be saved."));
    await Promise.all(["finance-report-settings", "ledger-book", "statement-book"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success("Saved. Reports made from now on carry these names.");
  };

  const signer = (who: "prepared" | "approved", title: string, hint: string) => (
    <Col xs={24} md={12}>
      <Card size="small" title={title}>
        <Form.Item label="Name" name={`${who}_by_name`} extra={hint}>
          <Input maxLength={80} placeholder={who === "prepared" ? "e.g. Siti Rahma" : "e.g. Budi Santoso"} />
        </Form.Item>
        <Form.Item label="Title" name={`${who}_by_title`} style={{ marginBottom: 0 }}>
          <Input maxLength={80} placeholder={who === "prepared" ? "e.g. Staf Keuangan" : "e.g. Direktur"} />
        </Form.Item>
      </Card>
    </Col>
  );

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        report_city: data.report_city ?? "",
        prepared_by_name: data.prepared_by_name ?? "",
        prepared_by_title: data.prepared_by_title ?? "",
        approved_by_name: data.approved_by_name ?? "",
        approved_by_title: data.approved_by_title ?? "",
      }}
      onFinish={save}
      style={{ maxWidth: 820 }}
    >
      <Typography.Paragraph type="secondary">
        The Neraca Saldo and the financial statements end with a sign-off: the place and date, then who prepared and who approved them. Names left empty print as a blank line to fill in by hand. The date is chosen in the report preview.
      </Typography.Paragraph>
      <Form.Item label="Signed in (city)" name="report_city" extra='Printed before the date, e.g. "Jakarta, 10 Oktober 2026".' style={{ maxWidth: 360 }}>
        <Input maxLength={60} placeholder="e.g. Jakarta" />
      </Form.Item>
      <Row gutter={[16, 16]}>
        {signer("prepared", "Disiapkan oleh (prepared by)", "Usually the person keeping the books.")}
        {signer("approved", "Disetujui oleh (approved by)", "Usually a director.")}
      </Row>
      {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} /> : null}
      <Button type="primary" htmlType="submit" loading={pending} style={{ marginTop: 16 }}>
        Save
      </Button>
    </Form>
  );
}
