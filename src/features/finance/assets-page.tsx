import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Drawer, Empty, Flex, Form, Input, InputNumber, Modal, Result, Row, Segmented, Select, Skeleton, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { CalculatorOutlined, PlusOutlined, RollbackOutlined, StopOutlined, SwapOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { useCan } from "@/auth/use-auth";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday, useBankAccounts } from "./api";
import { DateInput } from "@/components/date-input";

/**
 * Fixed assets (aset tetap): what the company owns that lasts more than a
 * year, depreciated by the tax groups so the books and the tax return agree.
 */

type Asset = {
  id: string;
  number: string;
  name: string;
  description: string | null;
  group_code: string;
  group_name: string;
  years: number;
  method: "straight_line" | "declining";
  rate: number;
  acquired_on: string;
  cost: number;
  funding: string;
  status: "active" | "disposed" | "void";
  disposed_on: string | null;
  disposal_proceeds: number | null;
  posted: number;
  book_value: number;
  void_reason: string | null;
};
type Group = { code: string; name: string; name_id: string; years: number; straight_rate: number; declining_rate: number | null; examples: string | null };
type Schedule = { year: number; opening: number; depreciation: number; closing: number }[];

const call = async <T,>(name: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
};
const monthLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const nextMonth = (iso: string) => {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
};

export function AssetsPage() {
  const can = useCan();
  const { run, busy } = useAction([["fixed-assets"], ["depreciation-runs"], ["finance-dashboard"]]);
  const [adding, setAdding] = useState(false);
  const [disposing, setDisposing] = useState<Asset | null>(null);
  const [voiding, setVoiding] = useState<Asset | null>(null);
  const [reason, setReason] = useState("");
  const allowed = can("accounting.manage");
  const { data: assets, isLoading } = useQuery({ queryKey: ["fixed-assets"], enabled: allowed, queryFn: () => call<Asset[]>("fixed_asset_list") });
  const { data: runs } = useQuery({
    queryKey: ["depreciation-runs"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("depreciation_runs").select("month, total").order("month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!allowed) return <Result status="403" title="Finance only" />;

  const live = (assets ?? []).filter((asset) => asset.status !== "void");
  const active = live.filter((asset) => asset.status === "active");
  const last = runs?.[0]?.month ?? null;
  const first = live.length ? live.map((asset) => asset.acquired_on.slice(0, 7) + "-01").sort()[0] : null;
  const next = last ? nextMonth(last) : first;
  const thisMonth = `${jakartaToday().slice(0, 7)}-01`;
  const behind = next && next <= thisMonth ? next : null;

  const postNext = () => behind && run("post", () => call("post_depreciation", { p_month: behind }), `Depreciation for ${monthLabel(behind)} posted.`);
  const postAll = () =>
    run("post-all", async () => {
      let month = behind;
      // Up to last month: the current month is posted once it ends (or by hand).
      const lastMonth = `${new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)}-01`;
      while (month && month <= lastMonth) {
        await call("post_depreciation", { p_month: month });
        month = nextMonth(month);
      }
    }, "Depreciation posted up to last month.");

  const columns: TableColumnsType<Asset> = [
    {
      title: "Asset",
      key: "name",
      render: (_, asset) => (
        <Flex vertical>
          <Typography.Text strong delete={asset.status === "void"}>{asset.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {asset.number} · {formatInvoiceDate(asset.acquired_on)}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "Group",
      key: "group",
      render: (_, asset) => (
        <Flex vertical>
          <span>{asset.group_name}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {asset.years} years · {asset.method === "declining" ? "declining" : "straight-line"} {Number(asset.rate)}%
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Cost", key: "cost", align: "right", render: (_, asset) => idr(asset.cost) },
    { title: "Depreciated", key: "posted", align: "right", render: (_, asset) => idr(asset.posted) },
    { title: "Book value", key: "book", align: "right", render: (_, asset) => <Typography.Text strong>{asset.status === "active" ? idr(asset.book_value) : "—"}</Typography.Text> },
    {
      title: "Status",
      key: "status",
      render: (_, asset) =>
        asset.status === "active" ? (
          <Tag color="success">In use</Tag>
        ) : asset.status === "disposed" ? (
          <Tooltip title={`Proceeds ${idr(asset.disposal_proceeds)}`}>
            <Tag>Disposed {asset.disposed_on ? formatInvoiceDate(asset.disposed_on) : ""}</Tag>
          </Tooltip>
        ) : (
          <Tooltip title={asset.void_reason ?? undefined}>
            <Tag color="error">Void</Tag>
          </Tooltip>
        ),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, asset) =>
        asset.status === "active" ? (
          <Flex gap={4} justify="flex-end">
            <Tooltip title="Sell or write off">
              <Button size="small" icon={<SwapOutlined />} onClick={() => setDisposing(asset)} aria-label={`Dispose of ${asset.name}`} />
            </Tooltip>
            {Number(asset.posted) === 0 ? (
              <Tooltip title="Entered by mistake">
                <Button size="small" type="text" danger icon={<StopOutlined />} onClick={() => setVoiding(asset)} aria-label={`Void ${asset.name}`} />
              </Tooltip>
            ) : null}
          </Flex>
        ) : null,
    },
  ];

  return (
    <>
      <PageTitle
        title="Fixed assets"
        description="Equipment, vehicles, buildings and licences that last more than a year: depreciated monthly by the tax groups (PMK 72/2023)."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
            Add asset
          </Button>
        }
      />
      <Flex vertical gap={16}>
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6}><Card size="small"><Statistic title="Assets in use" value={active.length} /></Card></Col>
          <Col xs={12} lg={6}><Card size="small"><Statistic title="Cost" value={idr(active.reduce((sum, asset) => sum + Number(asset.cost), 0))} /></Card></Col>
          <Col xs={12} lg={6}><Card size="small"><Statistic title="Book value" value={idr(active.reduce((sum, asset) => sum + Number(asset.book_value), 0))} /></Card></Col>
          <Col xs={12} lg={6}>
            <Card size="small">
              <Statistic title="Depreciation posted through" value={last ? monthLabel(last) : "—"} />
            </Card>
          </Col>
        </Row>
        {live.length ? (
          <Card size="small">
            <Flex justify="space-between" align="center" gap={8} wrap>
              <Typography.Text>
                {behind ? (
                  <>
                    Next to post: <Typography.Text strong>{monthLabel(behind)}</Typography.Text>. Depreciation is posted month by month, in order; an asset entered late catches up in the next month posted.
                  </>
                ) : (
                  "Depreciation is up to date."
                )}
              </Typography.Text>
              <Flex gap={8}>
                {last ? (
                  <Tooltip title={`Undo ${monthLabel(last)}`}>
                    <Button icon={<RollbackOutlined />} loading={busy === "undo"} onClick={() => run("undo", () => call("undo_depreciation"), `Depreciation for ${monthLabel(last)} undone.`)}>
                      Undo last
                    </Button>
                  </Tooltip>
                ) : null}
                <Button icon={<CalculatorOutlined />} disabled={!behind} loading={busy === "post"} onClick={postNext}>
                  Post {behind ? monthLabel(behind) : ""}
                </Button>
                <Button type="primary" disabled={!behind || behind >= thisMonth} loading={busy === "post-all"} onClick={postAll}>
                  Post up to last month
                </Button>
              </Flex>
            </Flex>
          </Card>
        ) : null}
        <Card>
          <Table<Asset>
            rowKey="id"
            loading={isLoading}
            columns={columns}
            dataSource={assets ?? []}
            pagination={{ pageSize: 25, hideOnSinglePage: true }}
            scroll={{ x: 880 }}
            expandable={{ expandedRowRender: (asset) => <ScheduleTable asset={asset} />, rowExpandable: (asset) => asset.status !== "void" }}
            locale={{ emptyText: <Empty description="No fixed assets yet" /> }}
          />
        </Card>
      </Flex>
      {adding ? <AssetDrawer onClose={() => setAdding(false)} /> : null}
      {disposing ? <DisposeModal asset={disposing} onClose={() => setDisposing(null)} run={run} busy={busy === "dispose"} /> : null}
      <Modal
        open={Boolean(voiding)}
        title={`Void ${voiding?.name ?? ""}?`}
        okText="Void"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        confirmLoading={busy === "void"}
        onCancel={() => setVoiding(null)}
        onOk={() => voiding && run("void", () => call("void_fixed_asset", { p_id: voiding.id, p_reason: reason.trim() }), "Asset voided.").then((ok) => {
            if (ok) {
              setVoiding(null);
              setReason("");
            }
          })}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">For an asset entered by mistake: its purchase is reversed in the journal.</Typography.Paragraph>
        <Input.TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Why" />
      </Modal>
    </>
  );
}

function ScheduleTable({ asset }: { asset: Asset }) {
  const { data, isLoading } = useQuery({ queryKey: ["asset-schedule", asset.id], queryFn: () => call<Schedule>("fixed_asset_schedule", { p_asset: asset.id }) });
  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  return (
    <Flex vertical gap={8} style={{ maxWidth: 640 }}>
      {asset.description ? <Typography.Text type="secondary">{asset.description}</Typography.Text> : null}
      <Table
        size="small"
        rowKey="year"
        pagination={false}
        dataSource={data ?? []}
        columns={[
          { title: "Year", dataIndex: "year", key: "year" },
          { title: "Book value at start", key: "opening", align: "right", render: (_, row) => idr(row.opening) },
          { title: "Depreciation", key: "dep", align: "right", render: (_, row) => idr(row.depreciation) },
          { title: "Book value at end", key: "closing", align: "right", render: (_, row) => idr(row.closing) },
        ]}
      />
    </Flex>
  );
}

type AssetValues = { name: string; description: string; group_code: string; method: "straight_line" | "declining"; acquired_on: string; cost: number; funding: "bank" | "payable" | "capital"; bank_account_id: string };

function AssetDrawer({ onClose }: { onClose: () => void }) {
  const [form] = Form.useForm<AssetValues>();
  const { run, busy } = useAction([["fixed-assets"], ["finance-dashboard"]]);
  const { data: banks } = useBankAccounts();
  const { data: groups } = useQuery({
    queryKey: ["asset-groups"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("asset_groups").select("*").order("years");
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });
  const groupCode = Form.useWatch("group_code", form);
  const funding = Form.useWatch("funding", form) ?? "bank";
  const group = (groups ?? []).find((item) => item.code === groupCode);
  const save = (values: AssetValues) =>
    run("add", () => call("create_fixed_asset", { p: { ...values, method: group?.declining_rate === null ? "straight_line" : values.method } }), "Asset added.").then((ok) => ok && onClose());
  return (
    <Drawer
      open
      onClose={onClose}
      title="Add fixed asset"
      size={560}
      destroyOnHidden
      extra={
        <Button type="primary" loading={busy === "add"} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<AssetValues> form={form} layout="vertical" requiredMark="optional" onFinish={save}
        initialValues={{ acquired_on: jakartaToday(), group_code: "k1", method: "straight_line", funding: "bank", bank_account_id: (banks ?? []).find((item) => item.active)?.id }}>
        <Form.Item label="What it is" name="name" rules={[{ required: true, min: 2, max: 160 }]}>
          <Input placeholder="e.g. MacBook Pro 14 — engineering" />
        </Form.Item>
        <Form.Item label="Details" name="description" rules={[{ max: 500 }]}>
          <Input.TextArea autoSize={{ minRows: 2 }} placeholder="Serial number, who uses it, supplier…" />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item label="Bought on" name="acquired_on" rules={[{ required: true }]} extra="Depreciation starts this month.">
              <DateInput max={jakartaToday()} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Cost (Rp)" name="cost" rules={[{ required: true, type: "number", min: 1 }]} extra="Price plus delivery and installation, without “PPN masukan” you can credit.">
              <InputNumber<number> min={0} style={{ width: "100%" }} formatter={(value) => (value ? Number(value).toLocaleString("id-ID") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Tax group" name="group_code" rules={[{ required: true }]} extra={group?.examples ?? undefined}>
          <Select options={(groups ?? []).map((item) => ({ value: item.code, label: `${item.name_id} — ${item.years} years` }))} />
        </Form.Item>
        {group && group.declining_rate !== null ? (
          <Form.Item label="Method" name="method">
            <Segmented
              options={[
                { value: "straight_line", label: `Straight-line ${Number(group.straight_rate)}%` },
                { value: "declining", label: `Declining balance ${Number(group.declining_rate)}%` },
              ]}
            />
          </Form.Item>
        ) : null}
        <Form.Item label="Paid" name="funding">
          <Segmented
            options={[
              { value: "bank", label: "From the bank" },
              { value: "payable", label: "Owed to the supplier" },
              { value: "capital", label: "Brought in by a shareholder" },
            ]}
          />
        </Form.Item>
        {funding === "bank" ? (
          <Form.Item label="Bank account" name="bank_account_id" rules={[{ required: true }]}>
            <Select options={(banks ?? []).filter((item) => item.active).map((item) => ({ value: item.id, label: `${item.name} (${item.currency})` }))} />
          </Form.Item>
        ) : null}
        {funding === "payable" ? <Alert type="info" showIcon title="Booked as owed (“Utang usaha”). When you pay it, post a manual journal entry: debit “Utang usaha”, credit the bank." /> : null}
      </Form>
    </Drawer>
  );
}

function DisposeModal({ asset, onClose, run, busy }: { asset: Asset; onClose: () => void; run: ReturnType<typeof useAction>["run"]; busy: boolean }) {
  const { data: banks } = useBankAccounts();
  const active = (banks ?? []).filter((bank) => bank.active);
  const [date, setDate] = useState(jakartaToday());
  const [proceeds, setProceeds] = useState<number | null>(null);
  const [bankId, setBankId] = useState<string | undefined>();
  const bank = bankId ?? active[0]?.id;
  const result = Number(proceeds ?? 0) - Number(asset.book_value);
  return (
    <Modal
      open
      title={`Sell or write off ${asset.name}`}
      okText="Record"
      confirmLoading={busy}
      okButtonProps={{ disabled: !date || (Number(proceeds ?? 0) > 0 && !bank) }}
      onCancel={onClose}
      onOk={() => run("dispose", () => call("dispose_fixed_asset", { p_id: asset.id, p_on: date, p_proceeds: proceeds ?? 0, p_bank: Number(proceeds ?? 0) > 0 ? bank : null }), "Asset disposed of.").then((ok) => ok && onClose())}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Depreciation must be posted up to the month before. Book value now {idr(asset.book_value)}; leave the price empty to write it off.
      </Typography.Paragraph>
      <Flex vertical gap={10}>
        <DateInput value={date} min={asset.acquired_on} max={jakartaToday()} onChange={(value) => setDate(value)} />
        <InputNumber value={proceeds} onChange={(value) => setProceeds(value === null ? null : Number(value))} min={0} style={{ width: "100%" }} placeholder="Sold for (Rp)" />
        {Number(proceeds ?? 0) > 0 ? <Select value={bank} onChange={setBankId} options={active.map((item) => ({ value: item.id, label: `${item.name} (${item.currency})` }))} placeholder="Paid into" /> : null}
        <Typography.Text type={result >= 0 ? "success" : "warning"}>
          {result >= 0 ? `Gain of ${idr(result)}` : `Loss of ${idr(-result)}`} (booked as other income or expense).
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
