import { useMemo } from "react";
import { Divider, Form, Row, Tabs } from "antd";
import type { FormInstance } from "antd";
import type { Field, Resource } from "./resources";
import { FieldCol, type Lookups } from "./field-input";

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The fields of one resource, grouped as the config groups them (and in tabs
 * when it has tabs). Every tab stays mounted, so one Save keeps them all.
 */
export function ResourceForm({
  resource,
  form,
  initialValues,
  lookups,
  isNew,
  onFinish,
  disabled,
}: {
  resource: Resource;
  form: FormInstance;
  initialValues: Record<string, unknown>;
  lookups: Lookups;
  isNew: boolean;
  onFinish: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Field[]>();
    for (const field of resource.fields) {
      const group = field.group ?? "Content";
      map.set(group, [...(map.get(group) ?? []), field]);
    }
    return map;
  }, [resource]);

  const slugField = resource.fields.find((field) => field.type === "slug");
  const sourceField = resource.fields.find((field) => ["title", "name", "company_name", "label"].includes(field.name));

  const renderGroups = (names: string[]) =>
    names
      .filter((name) => groups.has(name))
      .map((name, index) => (
        <div key={name}>
          {names.length > 1 || name !== "Content" ? (
            <Divider titlePlacement="start" style={{ marginTop: index === 0 ? 0 : undefined }}>
              {name}
            </Divider>
          ) : null}
          <Row gutter={16}>
            {groups.get(name)!.map((field) => (
              <FieldCol key={field.name} field={field} lookups={lookups} />
            ))}
          </Row>
        </div>
      ));

  const tabbed = resource.tabs?.length
    ? [...resource.tabs, ...(() => {
        const covered = new Set(resource.tabs!.flatMap((tab) => tab.groups));
        const rest = [...groups.keys()].filter((name) => !covered.has(name));
        return rest.length ? [{ label: "More", groups: rest }] : [];
      })()]
    : null;

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark="optional"
      initialValues={initialValues}
      onFinish={onFinish}
      disabled={disabled}
      onValuesChange={(changed) => {
        // A new row's slug follows its title until someone edits the slug.
        if (isNew && slugField && sourceField && sourceField.name in changed && !form.isFieldTouched(slugField.name)) {
          form.setFieldValue(slugField.name, slugify(String(changed[sourceField.name] ?? "")));
        }
      }}
    >
      {tabbed ? (
        <Tabs items={tabbed.map((tab) => ({ key: tab.label, label: tab.label, forceRender: true, children: renderGroups(tab.groups) }))} />
      ) : (
        renderGroups([...groups.keys()])
      )}
    </Form>
  );
}
