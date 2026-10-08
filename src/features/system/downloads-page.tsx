import { useQuery } from "@tanstack/react-query";
import { Card, Col, Row, Statistic, Table, Tabs, Tag, Typography } from "antd";
import { PageTitle } from "@/components/app-shell";
import { DownloadTrend, DownloadsByPlatform, DownloadsByRelease } from "./download-charts";
import { supabase } from "@/lib/supabase";

const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Who downloads what, from where — the website's download counter, read
 * from its reporting views. Bots are counted but never ranked.
 */
export function DownloadsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["downloads"],
    queryFn: async () => {
      const [totals, byRelease, byArtifact, visitors, recent, daily] = await Promise.all([
        supabase.from("download_stats_totals").select("*").maybeSingle(),
        supabase.from("download_stats_by_release").select("*").order("downloads", { ascending: false, nullsFirst: false }).limit(20),
        supabase.from("download_stats_by_artifact").select("*").order("downloads", { ascending: false, nullsFirst: false }).order("platform").limit(60),
        supabase.from("download_stats_by_visitor").select("*").gt("downloads", 0).order("downloads", { ascending: false }).order("last_seen_at", { ascending: false }).limit(50),
        supabase
          .from("download_events")
          .select("id, version, platform, arch, label, ip_address, country, city, browser, os, device_type, is_bot, page_path, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("download_stats_daily").select("*").order("day", { ascending: true }),
      ]);
      return {
        totals: totals.data,
        byRelease: byRelease.data ?? [],
        byArtifact: byArtifact.data ?? [],
        visitors: visitors.data ?? [],
        recent: recent.data ?? [],
        daily: (daily.data ?? []) as { day: string; downloads: number; unique_visitors: number }[],
      };
    },
  });

  const totals = data?.totals;

  return (
    <>
      <PageTitle title="Download analytics" description="Who downloads what, from where. Bots are recorded but never ranked." />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          ["Downloads", totals?.downloads],
          ["Unique visitors", totals?.unique_visitors],
          ["Last 30 days", totals?.downloads_30d],
          ["Visitors, 30 days", totals?.unique_visitors_30d],
          ["Countries", totals?.countries],
          ["Bot hits", totals?.bot_hits],
        ].map(([label, value]) => (
          <Col key={String(label)} xs={12} md={8} xl={4}>
            <Card loading={isLoading} size="small">
              <Statistic title={String(label)} value={Number(value ?? 0)} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card title="Downloads over time" extra={<span style={{ fontSize: 12, opacity: 0.6 }}>Last 90 days</span>} style={{ marginBottom: 16 }}>
        {isLoading ? null : <DownloadTrend days={data?.daily ?? []} />}
      </Card>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="By release" style={{ height: "100%" }}>
            {isLoading ? null : <DownloadsByRelease rows={data?.byRelease ?? []} />}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="By platform" style={{ height: "100%" }}>
            {isLoading ? null : <DownloadsByPlatform rows={data?.byArtifact ?? []} />}
          </Card>
        </Col>
      </Row>
      <Card>
        <Tabs
          items={[
            {
              key: "releases",
              label: "By release",
              children: (
                <Table size="small" rowKey={(row) => String(row.release_id ?? row.version)} loading={isLoading} dataSource={data?.byRelease ?? []} pagination={false} columns={[
                  { title: "Version", dataIndex: "version" },
                  { title: "Downloads", dataIndex: "downloads", align: "right" },
                  { title: "Visitors", dataIndex: "unique_visitors", align: "right" },
                  { title: "Countries", dataIndex: "countries", align: "right" },
                  { title: "Last", dataIndex: "last_download_at", render: when },
                ]} />
              ),
            },
            {
              key: "files",
              label: "By file",
              children: (
                <Table size="small" rowKey="artifact_id" loading={isLoading} dataSource={data?.byArtifact ?? []} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 720 }} columns={[
                  { title: "File", key: "file", render: (_, row) => <><Typography.Text>{row.label ?? row.file_name}</Typography.Text> <Typography.Text type="secondary" style={{ fontSize: 12 }}>{[row.version, row.platform, row.arch, row.channel].filter(Boolean).join(" · ")}</Typography.Text></> },
                  { title: "Downloads", dataIndex: "downloads", align: "right" },
                  { title: "30 days", dataIndex: "downloads_30d", align: "right" },
                  { title: "Visitors", dataIndex: "unique_visitors", align: "right" },
                  { title: "Last", dataIndex: "last_download_at", render: when },
                ]} />
              ),
            },
            {
              key: "visitors",
              label: "Top visitors",
              children: (
                <Table size="small" rowKey="ip_hash" loading={isLoading} dataSource={data?.visitors ?? []} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 720 }} columns={[
                  { title: "Where", key: "where", render: (_, row) => [row.city, row.country].filter(Boolean).join(", ") || "—" },
                  { title: "IP", dataIndex: "ip_address", render: (value: string | null) => value ?? "—" },
                  { title: "Downloads", dataIndex: "downloads", align: "right" },
                  { title: "Versions", dataIndex: "version_list", render: (value: string[] | null) => (value ?? []).map((version) => <Tag key={version}>{version}</Tag>) },
                  { title: "Last seen", dataIndex: "last_seen_at", render: when },
                ]} />
              ),
            },
            {
              key: "recent",
              label: "Recent downloads",
              children: (
                <Table size="small" rowKey="id" loading={isLoading} dataSource={data?.recent ?? []} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 860 }} columns={[
                  { title: "When", dataIndex: "created_at", render: when },
                  { title: "File", key: "file", render: (_, row) => [row.version, row.platform, row.arch].filter(Boolean).join(" · ") || row.label },
                  { title: "Where", key: "where", render: (_, row) => [row.city, row.country].filter(Boolean).join(", ") || "—" },
                  { title: "Browser", key: "browser", render: (_, row) => [row.browser, row.os, row.device_type].filter(Boolean).join(" · ") },
                  { title: "", dataIndex: "is_bot", render: (value: boolean) => (value ? <Tag>bot</Tag> : null) },
                ]} />
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
