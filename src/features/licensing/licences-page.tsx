import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Dropdown, Flex, Input, Popconfirm, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import { DownloadOutlined, FileAddOutlined, KeyOutlined, MoreOutlined, StopOutlined, UploadOutlined, WarningOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { formatInvoiceDate, isOverdue } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";

type License = Database["public"]["Tables"]["licenses"]["Row"] & {
  owner: { full_name: string | null; email: string | null; company: string | null } | null;
};
type InvoiceRow = {
  id: string;
  number: string | null;
  license_id: string | null;
  status: "unpaid" | "paid" | "void";
  due_date: string;
  licensee_name: string | null;
  groups: { quotation_group_id: string | null }[];
};
type OrderLine = { id: string; label: string; quantity: number; quotation: { number: string | null; customer_id: string | null; status: string; valid_until: string } | null };
type Filter = "all" | "pending" | "issued" | "revoked";
type Stage = "requested" | "awaiting_payment" | "payment_overdue" | "preparing" | "active" | "revoked";

const BUCKET = "licenses";
const MAX_LICENSE_BYTES = 5 * 1024 * 1024;
const STAGE: Record<Stage, { label: string; color: string }> = {
  requested: { label: "Request received", color: "processing" },
  awaiting_payment: { label: "Awaiting payment", color: "warning" },
  payment_overdue: { label: "Payment overdue", color: "error" },
  preparing: { label: "Preparing licence", color: "orange" },
  active: { label: "Active", color: "success" },
  revoked: { label: "Revoked", color: "default" },
};

/** Where a licence stands, from the licence and its invoices — as the website shows the customer. */
function stageOf(license: License, invoices: InvoiceRow[]): Stage {
  if (license.status === "revoked") return "revoked";
  const live = invoices.filter((invoice) => invoice.status !== "void");
  const unpaid = live.filter((invoice) => invoice.status === "unpaid");
  if (unpaid.length > 0) return unpaid.some((invoice) => isOverdue(invoice)) ? "payment_overdue" : "awaiting_payment";
  if (license.status === "issued") return "active";
  return live.some((invoice) => invoice.status === "paid") ? "preparing" : "requested";
}

/** Same name, give or take case, spacing and punctuation ("PT. Abc" = "pt abc"). */
const sameName = (a: string, b: string) => {
  const key = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return key(a) === key(b);
};

const today = () => new Date().toISOString().slice(0, 10);
const isLive = (quotation: NonNullable<OrderLine["quotation"]>) => quotation.status === "accepted" || (quotation.status === "sent" && quotation.valid_until >= today());

/** Download a private licence file through a short-lived signed link. */
async function download(path: string, name: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, { download: name });
  if (error || !data) throw error ?? new Error("No link");
  window.location.assign(data.signedUrl);
}

/**
 * The licensing queue: fingerprints waiting for a licence file, pending first.
 * Issuing uploads the .qlf straight to the private bucket, then the database
 * checks it is there before marking the licence issued (which emails the customer).
 */
export function LicencesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const { run, busy } = useAction([["licences"]]);
  const fileInput = useRef<HTMLInputElement>(null);
  const issuing = useRef<License | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["licences"],
    queryFn: async () => {
      const { data: licences, error } = await supabase
        .from("licenses")
        .select("*, owner:profiles!licenses_owner_id_fkey(full_name, email, company)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (licences ?? []) as unknown as License[];
      const owners = [...new Set(rows.map((row) => row.owner_id))];
      const [{ data: invoices }, { data: lines }] = await Promise.all([
        supabase.from("invoices").select("id, number, license_id, status, due_date, licensee_name, groups:invoice_groups(quotation_group_id)"),
        owners.length
          ? supabase.from("quotation_groups").select("id, label, quantity, quotation:quotations!inner(number, customer_id, status, valid_until)").in("quotation.customer_id", owners).order("position")
          : Promise.resolve({ data: [] }),
      ]);
      return { rows, invoices: (invoices ?? []) as unknown as InvoiceRow[], lines: (lines ?? []) as unknown as OrderLine[] };
    },
  });

  // Linked directly, or through the order line the licence was requested on.
  const invoicesFor = (row: License) =>
    (data?.invoices ?? []).filter(
      (invoice) =>
        invoice.id === row.invoice_id ||
        invoice.license_id === row.id ||
        (row.quotation_group_id !== null && invoice.groups.some((group) => group.quotation_group_id === row.quotation_group_id)),
    );
  // The invoice names someone else as the licensee: one of them is wrong.
  const nameMismatch = (row: License) =>
    invoicesFor(row).find((invoice) => invoice.status !== "void" && invoice.licensee_name && !sameName(invoice.licensee_name, row.label));
  const lineById = useMemo(() => new Map((data?.lines ?? []).map((line) => [line.id, line])), [data]);
  const used = (lineId: string) => (data?.rows ?? []).filter((row) => row.quotation_group_id === lineId && row.status !== "revoked").length;

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!query || [row.label, row.owner?.full_name, row.owner?.email, row.owner?.company].some((value) => (value ?? "").toLowerCase().includes(query))),
    );
  }, [data, filter, search]);
  const pending = (data?.rows ?? []).filter((row) => row.status === "pending").length;

  const issue = (file: File) => {
    const license = issuing.current;
    if (!license) return;
    if (!/\.qlf$/i.test(file.name)) return void message.error("Pick a .qlf licence file.");
    if (file.size === 0 || file.size > MAX_LICENSE_BYTES) return void message.error("Licence files must be between 1 byte and 5 MB.");
    void run(
      `issue:${license.id}`,
      async () => {
        // Re-issuing replaces the file in place.
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(`${license.owner_id}/${license.id}/license.qlf`, file, { contentType: "application/octet-stream", upsert: true });
        if (uploadError) throw { code: "22023", message: "Upload failed. Try again." };
        const { error } = await supabase.rpc("issue_license", { p_license_id: license.id, p_file_name: file.name, p_file_size: file.size });
        if (error) throw error;
      },
      "Issued. The customer has been emailed.",
    );
  };

  const columns: TableColumnsType<License> = [
    {
      title: "Licensed to",
      key: "label",
      render: (_, row) => (
        <Flex vertical>
          <Tooltip title={row.customer_address ?? undefined}>
            <Typography.Text strong>{row.label}</Typography.Text>
          </Tooltip>
          {(() => {
            const other = nameMismatch(row);
            return other ? (
              <Tooltip
                title={`Invoice ${other.number ?? ""} is for “${other.licensee_name}”. Correct the invoice's “Licensed to” (Invoices → open it), or check the licence name before issuing.`}
              >
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  <WarningOutlined /> Invoice says “{other.licensee_name}”
                </Typography.Text>
              </Tooltip>
            ) : null;
          })()}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.owner?.full_name ?? "unknown"}
            {row.owner?.company ? ` · ${row.owner.company}` : ""}
            {row.owner?.email ? (
              <>
                {" · "}
                <a href={`mailto:${row.owner.email}`}>{row.owner.email}</a>
              </>
            ) : null}
          </Typography.Text>
          {row.note ? (
            <Typography.Text type="secondary" italic style={{ fontSize: 12 }} ellipsis={{ tooltip: row.note }}>
              “{row.note}”
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Stage",
      key: "stage",
      render: (_, row) => {
        const stage = STAGE[stageOf(row, invoicesFor(row))];
        return <Tag color={stage.color}>{stage.label}</Tag>;
      },
    },
    {
      title: "Order",
      key: "order",
      render: (_, row) => {
        const line = row.quotation_group_id ? lineById.get(row.quotation_group_id) : undefined;
        if (line) {
          return (
            <Typography.Text style={{ fontSize: 12 }}>
              {line.quotation?.number} · {line.label}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {" "}
                ({used(line.id)} of {line.quantity})
              </Typography.Text>
            </Typography.Text>
          );
        }
        const options = (data?.lines ?? []).filter(
          (candidate) => candidate.quotation?.customer_id === row.owner_id && candidate.quotation && isLive(candidate.quotation) && used(candidate.id) < candidate.quantity,
        );
        if (options.length === 0) return <Typography.Text type="secondary" style={{ fontSize: 12 }}>Not on an order</Typography.Text>;
        return (
          <Select
            size="small"
            placeholder="Link to order…"
            style={{ minWidth: 200 }}
            loading={busy === `link:${row.id}`}
            options={options.map((option) => ({ value: option.id, label: `${option.quotation?.number} · ${option.label} (${option.quantity - used(option.id)} left)` }))}
            onChange={(lineId: string) =>
              run(`link:${row.id}`, async () => {
                const { error } = await supabase.from("licenses").update({ quotation_group_id: lineId }).eq("id", row.id);
                if (error) throw error;
              }, "Linked to the order.")
            }
          />
        );
      },
    },
    {
      title: "Invoices",
      key: "invoices",
      render: (_, row) => (
        <Space size={4} wrap>
          {invoicesFor(row).map((invoice) => (
            <Tag key={invoice.id} color={invoice.status === "paid" ? "success" : invoice.status === "void" ? "default" : isOverdue(invoice) ? "error" : "warning"}>
              {invoice.number}
            </Tag>
          ))}
        </Space>
      ),
      responsive: ["lg"],
    },
    { title: "Requested", dataIndex: "created_at", render: (value: string) => formatInvoiceDate(value), responsive: ["md"] },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => {
        const more: MenuProps["items"] = [
          { key: "fp", icon: <DownloadOutlined />, label: `Fingerprint (${row.fingerprint_name})`, onClick: () => run(`fp:${row.id}`, () => download(row.fingerprint_path, row.fingerprint_name)) },
          ...(row.license_path
            ? [{ key: "qlf", icon: <KeyOutlined />, label: `Licence file (${row.license_name ?? "license.qlf"})`, onClick: () => run(`qlf:${row.id}`, () => download(row.license_path!, row.license_name ?? "license.qlf")) }]
            : []),
          ...(!row.quotation_group_id && invoicesFor(row).length === 0
            ? [{ key: "quote", icon: <FileAddOutlined />, label: "Create quotation", onClick: () => navigate(`/sales/quotations/new?license=${row.id}`) }]
            : []),
        ];
        return (
          <Flex gap={4} justify="flex-end" align="center" wrap={false}>
            {row.status !== "revoked" ? (
              <Button
                size="small"
                type={row.license_path ? "default" : "primary"}
                icon={<UploadOutlined />}
                loading={busy === `issue:${row.id}`}
                onClick={() => {
                  issuing.current = row;
                  fileInput.current?.click();
                }}
              >
                {row.license_path ? "Replace .qlf" : "Upload .qlf & issue"}
              </Button>
            ) : null}
            {row.status === "issued" ? (
              <Popconfirm
                title="Revoke this licence?"
                description="The files stay, for the record."
                okText="Revoke"
                okButtonProps={{ danger: true }}
                onConfirm={() =>
                  run(`revoke:${row.id}`, async () => {
                    const { error } = await supabase.from("licenses").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", row.id);
                    if (error) throw error;
                  }, "Licence revoked.")
                }
              >
                <Tooltip title="Revoke">
                  <Button size="small" type="text" danger icon={<StopOutlined />} loading={busy === `revoke:${row.id}`} aria-label="Revoke licence" />
                </Tooltip>
              </Popconfirm>
            ) : null}
            <Dropdown menu={{ items: more }} trigger={["click"]} placement="bottomRight">
              <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More for ${row.label}`} />
            </Dropdown>
          </Flex>
        );
      },
    },
  ];

  return (
    <>
      <PageTitle
        title="Licences"
        description={pending > 0 ? `${pending} ${pending === 1 ? "request is" : "requests are"} waiting for a licence file.` : "Customer fingerprints and the licence files issued for them."}
      />
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: `Waiting (${pending})` },
            { value: "issued", label: "Issued" },
            { value: "revoked", label: "Revoked" },
            { value: "all", label: "All" },
          ]}
        />
        <Input.Search allowClear placeholder="Search name, customer or email" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
      </Flex>
      <Table<License>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 980 }}
        locale={{ emptyText: filter === "pending" ? "Nothing waiting. Customers request licences from My licences." : "No licences here." }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".qlf"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) issue(file);
        }}
      />
    </>
  );
}
