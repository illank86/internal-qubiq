import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Form, Input, Result, Row, Select, Skeleton, Typography } from "antd";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";
import { DateInput } from "@/components/date-input";

type Values = {
  reporting_framework: "SAK EMKM" | "SAK EP";
  established_on: string;
  establishment_deed: string;
  business_activity: string;
  management: string;
  notes_extra: string;
  report_city: string;
  prepared_by_name: string;
  prepared_by_title: string;
  approved_by_name: string;
  approved_by_title: string;
};

const FIELDS = "report_city, prepared_by_name, prepared_by_title, approved_by_name, approved_by_title, reporting_framework, established_on, establishment_deed, business_activity, management, notes_extra";

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
        reporting_framework: values.reporting_framework,
        established_on: values.established_on || null,
        establishment_deed: clean(values.establishment_deed),
        business_activity: clean(values.business_activity),
        management: clean(values.management),
        notes_extra: clean(values.notes_extra),
      })
      .eq("id", true);
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The report settings could not be saved."));
    await Promise.all(["finance-report-settings", "ledger-book", "statement-book", "accounting-settings"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success("Saved. Reports made from now on carry these names.");
  };

  const signer = (who: "prepared" | "approved", title: string, hint: string) => (
    <Col xs={24} md={12}>
      <Card size="small" title={title}>
        <Form.Item label="Name" name={`${who}_by_name`} extra={hint}>
          <Input maxLength={80} placeholder={who === "prepared" ? "e.g. Siti Rahma" : "e.g. Budi Santoso"} />
        </Form.Item>
        <Form.Item label="Title" name={`${who}_by_title`} style={{ marginBottom: 0 }}>
          <Input maxLength={80} placeholder={who === "prepared" ? "e.g. “Staf Keuangan”" : "e.g. “Direktur”"} />
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
        reporting_framework: (data.reporting_framework as Values["reporting_framework"]) ?? "SAK EMKM",
        established_on: data.established_on ?? "",
        establishment_deed: data.establishment_deed ?? "",
        business_activity: data.business_activity ?? "",
        management: data.management ?? "",
        notes_extra: data.notes_extra ?? "",
      }}
      onFinish={save}
      style={{ maxWidth: 820 }}
    >
      <Typography.Paragraph type="secondary">
        The “Neraca Saldo” and the financial statements end with a sign-off: the place and date, then who prepared and who approved them. Names left empty print as a blank line to fill in by hand. The date is chosen in the report preview.
      </Typography.Paragraph>
      <Form.Item label="Signed in (city)" name="report_city" extra='Printed before the date, e.g. "Jakarta, 10 Oktober 2026".' style={{ maxWidth: 360 }}>
        <Input maxLength={60} placeholder="e.g. Jakarta" />
      </Form.Item>
      <Row gutter={[16, 16]}>
        {signer("prepared", "“Disiapkan oleh” (prepared by)", "Usually the person keeping the books.")}
        {signer("approved", "“Disetujui oleh” (approved by)", "Usually a director.")}
      </Row>
      <Card size="small" title="Notes to the financial statements (CALK)" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          Printed in the first notes with the statements. The figures (cash, receivables, assets, taxes, equity, income and costs) come from the books.
        </Typography.Paragraph>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Accounting standard" name="reporting_framework" extra="SAK EMKM for micro, small and medium businesses; SAK EP for other private companies.">
              <Select options={[{ value: "SAK EMKM", label: "SAK EMKM" }, { value: "SAK EP", label: "SAK EP (Entitas Privat)" }]} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Established on" name="established_on">
              <DateInput />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Deed of establishment" name="establishment_deed" extra='e.g. "Akta Notaris Budi, S.H. No. 12 tanggal 2 Januari 2026, disahkan Menteri Hukum dengan Keputusan No. AHU-0001234.AH.01.01 Tahun 2026"'>
          <Input.TextArea autoSize={{ minRows: 2 }} maxLength={600} />
        </Form.Item>
        <Form.Item label="Business activity" name="business_activity" extra="As in the deed or KBLI, e.g. aktivitas pemrograman komputer (KBLI 62019) dan penyediaan lisensi perangkat lunak.">
          <Input.TextArea autoSize={{ minRows: 2 }} maxLength={600} />
        </Form.Item>
        <Form.Item label="Management" name="management" extra="e.g. “Direktur: Budi Santoso; Komisaris: Siti Rahma”.">
          <Input.TextArea autoSize={{ minRows: 1 }} maxLength={600} />
        </Form.Item>
        <Form.Item label="Other information" name="notes_extra" extra="Anything else the notes should say (commitments, events after the period, related parties). Blank lines start a new paragraph." style={{ marginBottom: 0 }}>
          <Input.TextArea autoSize={{ minRows: 3 }} maxLength={4000} />
        </Form.Item>
      </Card>
      {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} /> : null}
      <Button type="primary" htmlType="submit" loading={pending} style={{ marginTop: 16 }}>
        Save
      </Button>
    </Form>
  );
}
