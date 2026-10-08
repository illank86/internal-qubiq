import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Flex, Input, Segmented, Select, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type Entry = Database["public"]["Tables"]["audit_log"]["Row"];
const ACTION_COLOR: Record<string, string> = { create: "success", update: "blue", delete: "error" };
const when = (value: string) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Who changed what, and when — recorded by the database for every staff
 * change, from either app. Open a row for exactly what changed.
 */
export function ActivityPage() {
  const [action, setAction] = useState("all");
  const [resource, setResource] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const resources = useMemo(() => [...new Set((data ?? []).map((entry) => entry.resource))].sort(), [data]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter(
      (entry) =>
        (action === "all" || entry.action === action) &&
        (!resource || entry.resource === resource) &&
        (!query || `${entry.summary ?? ""} ${entry.actor_email ?? ""}`.toLowerCase().includes(query)),
    );
  }, [data, action, resource, search]);

  const columns: TableColumnsType<Entry> = [
    { title: "When", dataIndex: "created_at", render: (value: string) => when(value), width: 180 },
    { title: "Action", dataIndex: "action", render: (value: string) => <Tag color={ACTION_COLOR[value]}>{value}</Tag>, width: 90 },
    { title: "Area", dataIndex: "resource", render: (value: string) => <Tag>{value.replace(/_/g, " ")}</Tag>, width: 160 },
    { title: "What", dataIndex: "summary", render: (value: string | null) => value ?? "—" },
    { title: "Who", dataIndex: "actor_email", render: (value: string | null) => value ?? <Typography.Text type="secondary">system</Typography.Text>, responsive: ["md"] },
  ];

  return (
    <>
      <PageTitle title="Activity log" description="Every create, update and delete made by the team, from either app, newest first." />
      <Card>
        <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
          <Flex gap={8} wrap>
            <Segmented value={action} onChange={(value) => setAction(String(value))} options={["all", "create", "update", "delete"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
            <Select allowClear placeholder="Any area" value={resource} onChange={setResource} options={resources.map((value) => ({ value, label: value.replace(/_/g, " ") }))} style={{ width: 200 }} />
          </Flex>
          <Input.Search allowClear placeholder="Search what or who" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 280 }} />
        </Flex>
        <Table<Entry>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          expandable={{
            rowExpandable: (entry) => Object.keys((entry.changes as Record<string, unknown>) ?? {}).length > 0,
            expandedRowRender: (entry) => (
              <pre style={{ margin: 0, fontSize: 12, fontFamily: "Geist Mono, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(entry.changes, null, 2)}</pre>
            ),
          }}
          pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 760 }}
        />
      </Card>
    </>
  );
}
