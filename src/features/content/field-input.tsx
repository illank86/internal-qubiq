import { Col, Form, Input, InputNumber, Select, Switch } from "antd";
import type { Field } from "./resources";
import { GeoField } from "./geo-field";
import { ListInput } from "./list-input";
import { ReleaseNotesInput } from "./release-notes-input";
import { MediaInput } from "./media-picker";
import { RichTextField } from "./rich-text-field";

export type Lookups = Record<string, { value: string; label: string }[]>;

/** Long-form fields take the full width; the rest can sit two to a row. */
function fieldSpan(field: Field) {
  if (field.span) return field.span === 1 ? 12 : 24;
  return ["textarea", "markdown", "json", "tags", "list", "release-notes", "geo", "image", "file", "video"].includes(field.type) ? 24 : 12;
}

/** One field of a generic resource form, as an Ant Design control. */
export function FieldInput({ field, lookups }: { field: Field; lookups: Lookups }) {
  if (field.hidden) {
    return (
      <Form.Item name={field.name} hidden>
        <Input />
      </Form.Item>
    );
  }

  const rules = field.required && field.type !== "boolean" ? [{ required: true, message: `${field.label} is required` }] : undefined;
  const common = { label: field.label, extra: field.hint, rules };

  const control = (() => {
    switch (field.type) {
      case "textarea":
        return <Input.TextArea rows={field.rows ?? 4} placeholder={field.placeholder} />;
      case "markdown":
        return <RichTextField rows={field.rows ?? 12} />;
      case "json":
        return <Input.TextArea rows={field.rows ?? 6} style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }} placeholder="JSON" />;
      case "number":
        return <InputNumber style={{ width: "100%" }} placeholder={field.placeholder} />;
      case "select":
        return <Select allowClear={!field.required} options={field.options} placeholder={field.placeholder} />;
      case "relation":
        return <Select allowClear showSearch optionFilterProp="label" options={lookups[field.name] ?? []} placeholder="Choose…" />;
      case "tags":
        return <Select mode="tags" tokenSeparators={[","]} placeholder="Type and press Enter" suffixIcon={null} notFoundContent={null} />;
      case "release-notes":
        return <ReleaseNotesInput />;
      case "list":
        return <ListInput placeholder={field.placeholder} addLabel={`Add ${field.label.toLowerCase().replace(/s$/, "")}`} />;
      case "image":
        return <MediaInput accept="image" />;
      case "video":
        return <MediaInput accept="video" />;
      case "file":
        return <MediaInput accept="any" />;
      case "duration":
        return <Input placeholder="m:ss, e.g. 3:42" style={{ maxWidth: 160 }} />;
      case "date":
        return <Input type="date" style={{ maxWidth: 220 }} />;
      case "datetime":
        return <Input type="datetime-local" style={{ maxWidth: 260 }} />;
      case "url":
        return <Input placeholder={field.placeholder ?? "https://…"} />;
      default:
        return <Input placeholder={field.placeholder} />;
    }
  })();

  if (field.type === "boolean") {
    return (
      <Form.Item {...common} name={field.name} valuePropName="checked">
        <Switch />
      </Form.Item>
    );
  }

  if (field.type === "geo" && field.geo) {
    return (
      <Form.Item label={field.label} extra={field.hint}>
        <GeoField latitudeName={field.name} longitudeName={field.geo.longitudeField} fill={field.geo.fill} />
      </Form.Item>
    );
  }

  return (
    <Form.Item {...common} name={field.name}>
      {control}
    </Form.Item>
  );
}

export function FieldCol({ field, lookups }: { field: Field; lookups: Lookups }) {
  if (field.hidden) return <FieldInput field={field} lookups={lookups} />;
  return (
    <Col xs={24} md={fieldSpan(field)}>
      <FieldInput field={field} lookups={lookups} />
    </Col>
  );
}
