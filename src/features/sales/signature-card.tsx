import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Descriptions, Flex, Form, Input, Popconfirm, Row, Typography, Upload } from "antd";
import { DeleteOutlined, LockOutlined, UploadOutlined } from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { formatInvoiceDate } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { loadSignatureInfo } from "./api";

const MAX_BYTES = 280 * 1024;
const TYPES = ["image/png", "image/jpeg"];

type Values = { name: string; title: string; place: string };

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * The one company signature on approved quotations and invoices.
 *
 * It is stored where no screen can read it back: once saved, it only ever
 * appears inside the PDF of an approved document. Only Users & roles can
 * change it; replacing it does not change documents already approved.
 */
export function SignatureCard() {
  const can = useCan();
  const canChange = can("users.manage");
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [image, setImage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: info, isLoading } = useQuery({ queryKey: ["signature-info"], queryFn: loadSignatureInfo });

  const pick = async (file: File) => {
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Use a PNG (ideally with a transparent background) or a JPEG.");
    if (file.size > MAX_BYTES) return setError("That image is too large. Use one under 280 KB — a cropped signature is usually 20–80 KB.");
    setImage(await readAsDataUrl(file));
  };

  const save = async (values: Values) => {
    if (!image) return setError("Choose the signature image first.");
    setPending(true);
    setError(null);
    const { error: saveError } = await supabase.rpc("set_document_signature", {
      p_image: image,
      p_signatory_name: values.name.trim(),
      p_signatory_title: values.title?.trim() ?? "",
      p_place: values.place?.trim() ?? "",
    });
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The signature could not be saved."));
    setImage(null);
    form.resetFields();
    await queryClient.invalidateQueries({ queryKey: ["signature-info"] });
    message.success("Signature saved. Documents approved from now on carry it.");
  };

  const remove = async () => {
    const { error: removeError } = await supabase.rpc("remove_document_signature");
    if (removeError) return message.error(errorText(removeError, "The signature could not be removed."));
    await queryClient.invalidateQueries({ queryKey: ["signature-info"] });
    message.success("Signature removed. Quotations go back to the QR code.");
  };

  return (
    <Card
      title={
        <Flex gap={8} align="center">
          <LockOutlined /> Signature
        </Flex>
      }
      style={{ marginTop: 16 }}
      loading={isLoading}
      extra={
        canChange && info ? (
          <Popconfirm title="Remove the signature?" description="New approvals go out unsigned (quotations show the QR code). Documents already approved keep theirs." okText="Remove" okButtonProps={{ danger: true }} onConfirm={remove}>
            <Button danger size="small" icon={<DeleteOutlined />}>
              Remove
            </Button>
          </Popconfirm>
        ) : null
      }
    >
      <Typography.Paragraph type="secondary">
        One company signature, printed on every quotation and invoice once it is approved — whoever prepared it. It is stored so that no one can view or download it: it only appears inside an approved document&rsquo;s PDF. Previews show where it will go.
      </Typography.Paragraph>
      {info ? (
        <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Signed by">
            {info.signatory_name}
            {info.signatory_title ? `, ${info.signatory_title}` : ""}
          </Descriptions.Item>
          {info.place ? <Descriptions.Item label="Place">{info.place}</Descriptions.Item> : null}
          <Descriptions.Item label="In use since">
            {formatInvoiceDate(info.created_at)}
            {info.created_by ? ` · set by ${info.created_by}` : ""}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} title="No signature on file" description="Quotations show the QR code that verifies them; invoices go out without a signature." />
      )}

      {canChange ? (
        <Form<Values> form={form} layout="vertical" requiredMark="optional" onFinish={save} disabled={pending}>
          <Typography.Text strong>{info ? "Replace it" : "Add one"}</Typography.Text>
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24} md={10}>
              <Form.Item label="Signature image" required extra="PNG with a transparent background works best. Under 280 KB.">
                <Flex vertical gap={8}>
                  <Upload
                    accept={TYPES.join(",")}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void pick(file);
                      return false;
                    }}
                  >
                    <Button icon={<UploadOutlined />}>{image ? "Choose another" : "Choose image"}</Button>
                  </Upload>
                  {image ? (
                    <div style={{ border: "1px dashed rgba(127,127,127,0.4)", borderRadius: 8, padding: 8, background: "#fff", width: "fit-content" }}>
                      <img src={image} alt="The signature you chose" style={{ height: 64, maxWidth: 220, objectFit: "contain", display: "block" }} />
                    </div>
                  ) : null}
                </Flex>
              </Form.Item>
            </Col>
            <Col xs={24} md={14}>
              <Form.Item label="Signatory's name" name="name" rules={[{ required: true, whitespace: true, message: "Whose signature it is" }, { max: 120 }]}>
                <Input placeholder="e.g. Nur Ilham" />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={14}>
                  <Form.Item label="Position" name="title" rules={[{ max: 120 }]}>
                    <Input placeholder="e.g. Director" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={10}>
                  <Form.Item label="Place" name="place" extra="Printed before the date." rules={[{ max: 80 }]}>
                    <Input placeholder="e.g. Jakarta" />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>
          {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}
          <Button type="primary" htmlType="submit" loading={pending}>
            Save signature
          </Button>
        </Form>
      ) : (
        <Typography.Text type="secondary">Only someone with Users &amp; roles can change it.</Typography.Text>
      )}
    </Card>
  );
}
