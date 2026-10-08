import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Checkbox, Descriptions, Drawer, Empty, Flex, Form, Input, Popconfirm, Segmented, Select, Space, Spin, Table, Tag, Tooltip, Typography, Upload, theme } from "antd";
import type { TableColumnsType } from "antd";
import {
  AppstoreOutlined,
  BarsOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileZipOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  SoundOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { formatBytes } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { deleteMedia, uploadMedia, type MediaAsset } from "./media";
import { siteAsset } from "@/lib/env";

type Sort = "newest" | "oldest" | "largest" | "name";
type View = "grid" | "list";

/** A light checkerboard, so transparent images read as transparent. */
const CHECKER = "repeating-conic-gradient(rgba(127,127,127,0.12) 0% 25%, transparent 0% 50%) 50% / 16px 16px";

function extension(asset: Pick<MediaAsset, "file_name" | "url">) {
  const name = asset.file_name ?? asset.url;
  const match = /\.([a-z0-9]{1,5})(?:\?|$)/i.exec(name);
  return match ? match[1].toUpperCase() : "FILE";
}

function KindIcon({ asset, size }: { asset: MediaAsset; size: number }) {
  const style = { fontSize: size };
  if (asset.kind === "video") return <PlayCircleOutlined style={style} />;
  if (asset.kind === "audio") return <SoundOutlined style={style} />;
  if (asset.kind === "archive") return <FileZipOutlined style={style} />;
  if (asset.mime_type === "application/pdf") return <FilePdfOutlined style={style} />;
  if (asset.kind === "image") return <FileImageOutlined style={style} />;
  return <FileOutlined style={style} />;
}

/** A square preview: the image cropped to fill, or the file type, large. */
function Tile({ asset, selected, onOpen, onToggle }: { asset: MediaAsset; selected: boolean; onOpen: () => void; onToggle: (checked: boolean) => void }) {
  const { token } = theme.useToken();
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
      aria-label={asset.title || asset.file_name || "Media file"}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: token.borderRadiusLG,
        overflow: "hidden",
        cursor: "pointer",
        background: asset.kind === "image" ? CHECKER : token.colorFillQuaternary,
        outline: selected ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorderSecondary}`,
        outlineOffset: selected ? 2 : -1,
        transition: "outline-color .15s",
      }}
    >
      {asset.kind === "image" ? (
        <img src={siteAsset(asset.url)} alt={asset.alt ?? ""} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <Flex vertical align="center" justify="center" gap={8} style={{ height: "100%", color: token.colorTextTertiary }}>
          <KindIcon asset={asset} size={40} />
          <Tag style={{ marginInlineEnd: 0 }}>{extension(asset)}</Tag>
        </Flex>
      )}
      {/* Name and size on hover, so the grid stays calm. */}
      <div
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          padding: "20px 10px 8px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.72))",
          color: "#fff",
          opacity: hover || selected ? 1 : 0,
          transition: "opacity .15s",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.title || asset.file_name}</div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>
          {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
          {formatBytes(asset.size_bytes)}
        </div>
      </div>
      <div onClick={(event) => event.stopPropagation()} style={{ position: "absolute", top: 8, left: 8, opacity: hover || selected ? 1 : 0, transition: "opacity .15s" }}>
        <Checkbox checked={selected} onChange={(event) => onToggle(event.target.checked)} aria-label="Select" />
      </div>
    </div>
  );
}

/**
 * Every image and file the website uses. Drop files anywhere here to upload;
 * open one to set its title and alt text, copy its address or delete it.
 */
export function MediaLibraryPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<View>("grid");
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<MediaAsset | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("media_assets").select("*").order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const asset of data ?? []) result[asset.kind] = (result[asset.kind] ?? 0) + 1;
    return result;
  }, [data]);

  const assets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (data ?? []).filter(
      (asset) => (kind === "all" || asset.kind === kind || (kind === "file" && !["image", "video", "document"].includes(asset.kind))) && (!query || `${asset.title ?? ""} ${asset.file_name ?? ""} ${asset.alt ?? ""} ${asset.tags.join(" ")}`.toLowerCase().includes(query)),
    );
    const by: Record<Sort, (a: MediaAsset, b: MediaAsset) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      largest: (a, b) => Number(b.size_bytes ?? 0) - Number(a.size_bytes ?? 0),
      name: (a, b) => (a.title || a.file_name || "").localeCompare(b.title || b.file_name || ""),
    };
    return [...list].sort(by[sort]);
  }, [data, kind, search, sort]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(files.length);
    const { uploaded, failures } = await uploadMedia(files);
    setUploading(0);
    if (failures.length) message.error(`Could not upload: ${failures.join("; ")}`);
    if (uploaded.length) {
      message.success(`${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded.`);
      await queryClient.invalidateQueries({ queryKey: ["media"] });
    }
  };

  const removeSelected = async () => {
    const chosen = (data ?? []).filter((asset) => selected.includes(asset.id));
    try {
      for (const asset of chosen) await deleteMedia(asset);
      message.success(`${chosen.length} deleted.`);
    } catch {
      message.error("Some files could not be deleted.");
    }
    setSelected([]);
    await queryClient.invalidateQueries({ queryKey: ["media"] });
  };

  const toggle = (id: string, checked: boolean) => setSelected((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));

  const columns: TableColumnsType<MediaAsset> = [
    {
      title: "File",
      key: "file",
      render: (_, asset) => (
        <Flex gap={12} align="center">
          <Flex align="center" justify="center" style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", background: asset.kind === "image" ? CHECKER : token.colorFillQuaternary, flexShrink: 0, color: token.colorTextTertiary }}>
            {asset.kind === "image" ? <img src={siteAsset(asset.url)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <KindIcon asset={asset} size={20} />}
          </Flex>
          <Flex vertical style={{ minWidth: 0 }}>
            <Typography.Text strong ellipsis style={{ maxWidth: 360 }}>
              {asset.title || asset.file_name}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 360 }}>
              {asset.file_name}
            </Typography.Text>
          </Flex>
        </Flex>
      ),
    },
    { title: "Type", key: "type", render: (_, asset) => <Tag>{extension(asset)}</Tag>, responsive: ["md"] },
    { title: "Dimensions", key: "dims", render: (_, asset) => (asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"), responsive: ["lg"] },
    { title: "Size", dataIndex: "size_bytes", align: "right", render: (value: number | null) => formatBytes(value) },
    { title: "Added", dataIndex: "created_at", render: (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), responsive: ["md"] },
  ];

  return (
    <>
      <PageTitle
        title="Media library"
        description="Images and files used across the website. Drop files anywhere here to upload."
        actions={
          <Upload
            multiple
            showUploadList={false}
            beforeUpload={(file, list) => {
              if (file === list[0]) void upload(list as unknown as File[]);
              return false;
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading > 0}>
              {uploading ? `Uploading ${uploading}…` : "Upload"}
            </Button>
          </Upload>
        }
      />

      <Flex wrap gap={12} justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Segmented
          value={kind}
          onChange={(value) => setKind(String(value))}
          options={[
            { value: "all", label: `All ${data ? data.length : ""}` },
            { value: "image", label: `Images ${counts.image ?? 0}` },
            { value: "video", label: `Videos ${counts.video ?? 0}` },
            { value: "document", label: `Documents ${counts.document ?? 0}` },
            { value: "file", label: "Other" },
          ]}
        />
        <Space wrap>
          {selected.length ? (
            <Popconfirm title={`Delete ${selected.length} file${selected.length === 1 ? "" : "s"}?`} description="Pages that use them will show a broken image." okText="Delete" okButtonProps={{ danger: true }} onConfirm={removeSelected}>
              <Button danger icon={<DeleteOutlined />}>
                Delete {selected.length}
              </Button>
            </Popconfirm>
          ) : null}
          <Input.Search allowClear placeholder="Search title, file, alt or tag" onChange={(event) => setSearch(event.target.value)} style={{ width: 260 }} />
          <Select<Sort>
            value={sort}
            onChange={setSort}
            style={{ width: 130 }}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "largest", label: "Largest" },
              { value: "name", label: "Name" },
            ]}
          />
          <Segmented<View> value={view} onChange={setView} options={[{ value: "grid", icon: <AppstoreOutlined />, title: "Grid" }, { value: "list", icon: <BarsOutlined />, title: "List" }]} />
        </Space>
      </Flex>

      {/* The whole library is a drop zone. */}
      <div
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(Array.from(event.dataTransfer.files));
        }}
        style={{
          position: "relative",
          minHeight: 320,
          borderRadius: token.borderRadiusLG,
          outline: dragging ? `2px dashed ${token.colorPrimary}` : "none",
          outlineOffset: 6,
        }}
      >
        {dragging ? (
          <Flex vertical align="center" justify="center" gap={8} style={{ position: "absolute", inset: 0, zIndex: 3, borderRadius: token.borderRadiusLG, background: `${token.colorBgContainer}e6`, color: token.colorPrimary }}>
            <CloudUploadOutlined style={{ fontSize: 40 }} />
            <Typography.Text strong>Drop to upload</Typography.Text>
          </Flex>
        ) : null}

        {isLoading ? (
          <Flex justify="center" style={{ padding: 64 }}>
            <Spin size="large" />
          </Flex>
        ) : assets.length === 0 ? (
          <Flex vertical align="center" justify="center" style={{ padding: 64, border: `1px dashed ${token.colorBorder}`, borderRadius: token.borderRadiusLG }}>
            <Empty
              image={<CloudUploadOutlined style={{ fontSize: 48, color: token.colorTextQuaternary }} />}
              description={data?.length ? "Nothing matches." : "No files yet. Drop images or files here, or use Upload."}
            />
          </Flex>
        ) : view === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
            {assets.map((asset) => (
              <Tile key={asset.id} asset={asset} selected={selected.includes(asset.id)} onOpen={() => setOpen(asset)} onToggle={(checked) => toggle(asset.id, checked)} />
            ))}
          </div>
        ) : (
          <Table<MediaAsset>
            rowKey="id"
            columns={columns}
            dataSource={assets}
            rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
            onRow={(record) => ({ onClick: () => setOpen(record), style: { cursor: "pointer" } })}
            pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
            scroll={{ x: 640 }}
          />
        )}
      </div>

      {open ? <AssetDrawer asset={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function AssetDrawer({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const [form] = Form.useForm<{ title: string; alt: string; tags: string[] }>();
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const done = async (text: string) => {
    message.success(text);
    await queryClient.invalidateQueries({ queryKey: ["media"] });
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={asset.title || asset.file_name}
      size={600}
      destroyOnHidden
      extra={
        <Button type="primary" icon={<SaveOutlined />} loading={busy === "save"} onClick={() => form.submit()}>
          Save
        </Button>
      }
      footer={
        <Flex justify="space-between">
          <Popconfirm
            title="Delete this file?"
            description="Pages that use its address will show a broken image."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              setBusy("delete");
              try {
                await deleteMedia(asset);
                await done("Deleted.");
              } catch {
                message.error("It could not be deleted.");
              } finally {
                setBusy(null);
              }
            }}
          >
            <Button danger icon={<DeleteOutlined />} loading={busy === "delete"}>
              Delete
            </Button>
          </Popconfirm>
          <Button icon={<ExportOutlined />} href={asset.url} target="_blank" rel="noreferrer">
            Open in a new tab
          </Button>
        </Flex>
      }
    >
      <Flex align="center" justify="center" style={{ borderRadius: token.borderRadiusLG, overflow: "hidden", marginBottom: 16, minHeight: 200, maxHeight: 360, background: asset.kind === "image" ? CHECKER : token.colorFillQuaternary, color: token.colorTextTertiary }}>
        {asset.kind === "image" ? (
          <img src={siteAsset(asset.url)} alt={asset.alt ?? ""} style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
        ) : asset.kind === "video" ? (
          <video src={siteAsset(asset.url)} controls style={{ width: "100%", maxHeight: 360, background: "#000" }} />
        ) : (
          <Flex vertical align="center" gap={8}>
            <KindIcon asset={asset} size={56} />
            <Tag>{extension(asset)}</Tag>
          </Flex>
        )}
      </Flex>

      <Flex gap={8} style={{ marginBottom: 20 }}>
        <Input value={asset.url} readOnly style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }} />
        <Tooltip title="Copy the address">
          <Button
            icon={<CopyOutlined />}
            onClick={async () => {
              await navigator.clipboard.writeText(asset.url);
              message.success("Address copied.");
            }}
          />
        </Tooltip>
      </Flex>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ title: asset.title ?? "", alt: asset.alt ?? "", tags: asset.tags }}
        onFinish={async (values) => {
          setBusy("save");
          const { error } = await supabase.from("media_assets").update({ title: values.title || null, alt: values.alt, tags: values.tags }).eq("id", asset.id);
          setBusy(null);
          if (error) message.error("It could not be saved.");
          else await done("Saved.");
        }}
      >
        <Form.Item label="Title" name="title">
          <Input />
        </Form.Item>
        {asset.kind === "image" ? (
          <Form.Item label="Alt text" name="alt" extra="Describes the image for screen readers and search engines.">
            <Input.TextArea rows={2} />
          </Form.Item>
        ) : null}
        <Form.Item label="Tags" name="tags">
          <Select mode="tags" tokenSeparators={[","]} open={false} suffixIcon={null} placeholder="Type and press Enter" />
        </Form.Item>
      </Form>

      <Descriptions column={2} size="small" colon={false} styles={{ label: { color: token.colorTextSecondary } }}>
        <Descriptions.Item label="File" span={2}>
          {asset.file_name}
        </Descriptions.Item>
        <Descriptions.Item label="Type">{asset.mime_type ?? asset.kind}</Descriptions.Item>
        <Descriptions.Item label="Size">{formatBytes(asset.size_bytes)}</Descriptions.Item>
        {asset.width && asset.height ? <Descriptions.Item label="Dimensions">{`${asset.width} × ${asset.height}`}</Descriptions.Item> : null}
        <Descriptions.Item label="Added">{new Date(asset.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
}
