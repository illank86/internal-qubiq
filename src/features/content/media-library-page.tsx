import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Descriptions, Drawer, Empty, Flex, Form, Input, Popconfirm, Segmented, Select, Spin, Typography, Upload } from "antd";
import { DeleteOutlined, InboxOutlined, SaveOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { formatBytes } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { deleteMedia, uploadMedia, type MediaAsset } from "./media";
import { MediaThumb } from "./media-picker";

/**
 * Every image and file the website uses. Drop files to upload; open one to
 * set its title and alt text, copy its address, or delete it (and its bytes).
 */
export function MediaLibraryPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<MediaAsset | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("media_assets").select("*").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const assets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((asset) => (kind === "all" || asset.kind === kind) && (!query || `${asset.title ?? ""} ${asset.file_name ?? ""} ${asset.alt ?? ""} ${asset.tags.join(" ")}`.toLowerCase().includes(query)));
  }, [data, kind, search]);

  const upload = async (files: File[]) => {
    setUploading(true);
    const { uploaded, failures } = await uploadMedia(files);
    setUploading(false);
    if (failures.length) message.error(`Could not upload: ${failures.join("; ")}`);
    if (uploaded.length) {
      message.success(`${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded.`);
      await queryClient.invalidateQueries({ queryKey: ["media"] });
    }
  };

  return (
    <>
      <PageTitle title="Media library" description="Images and files used across the website." />
      <Upload.Dragger
        multiple
        showUploadList={false}
        disabled={uploading}
        beforeUpload={(file, list) => {
          if (file === list[0]) void upload(list as unknown as File[]);
          return false;
        }}
        style={{ marginBottom: 16 }}
      >
        <p className="ant-upload-drag-icon">{uploading ? <Spin /> : <InboxOutlined />}</p>
        <p className="ant-upload-text">{uploading ? "Uploading…" : "Drop files here, or click to choose"}</p>
        <p className="ant-upload-hint">Images, videos, PDFs and downloads, up to 200 MB each.</p>
      </Upload.Dragger>
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented
          value={kind}
          onChange={(value) => setKind(String(value))}
          options={[
            { value: "all", label: `All (${data?.length ?? 0})` },
            { value: "image", label: "Images" },
            { value: "video", label: "Videos" },
            { value: "document", label: "Documents" },
            { value: "archive", label: "Archives" },
            { value: "file", label: "Other" },
          ]}
        />
        <Input.Search allowClear placeholder="Search title, file, alt or tag" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 300 }} />
      </Flex>
      {isLoading ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : assets.length === 0 ? (
        <Empty description="Nothing here." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {assets.map((asset) => (
            <Card key={asset.id} hoverable size="small" cover={<MediaThumb asset={asset} size={140} />} onClick={() => setOpen(asset)} styles={{ body: { padding: 10 } }}>
              <Typography.Text ellipsis style={{ display: "block" }}>
                {asset.title || asset.file_name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
                {formatBytes(asset.size_bytes)}
              </Typography.Text>
            </Card>
          ))}
        </div>
      )}
      {open ? <AssetDrawer asset={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function AssetDrawer({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
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
      size={560}
      destroyOnHidden
      extra={
        <Flex gap={8}>
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
            <Button danger icon={<DeleteOutlined />} loading={busy === "delete"} />
          </Popconfirm>
          <Button type="primary" icon={<SaveOutlined />} loading={busy === "save"} onClick={() => form.submit()}>
            Save
          </Button>
        </Flex>
      }
    >
      <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        {asset.kind === "video" ? <video src={asset.url} controls style={{ width: "100%" }} /> : <MediaThumb asset={asset} size={260} />}
      </div>
      <Typography.Paragraph copyable={{ text: asset.url }} style={{ wordBreak: "break-all", fontSize: 12 }}>
        {asset.url}
      </Typography.Paragraph>
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
        <Form.Item label="Alt text" name="alt" extra="Describes the image for screen readers and search engines.">
          <Input />
        </Form.Item>
        <Form.Item label="Tags" name="tags">
          <Select mode="tags" tokenSeparators={[","]} open={false} suffixIcon={null} />
        </Form.Item>
      </Form>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="File">{asset.file_name}</Descriptions.Item>
        <Descriptions.Item label="Type">{asset.mime_type ?? asset.kind}</Descriptions.Item>
        <Descriptions.Item label="Size">{formatBytes(asset.size_bytes)}</Descriptions.Item>
        {asset.width && asset.height ? <Descriptions.Item label="Dimensions">{`${asset.width} × ${asset.height}`}</Descriptions.Item> : null}
      </Descriptions>
    </Drawer>
  );
}
