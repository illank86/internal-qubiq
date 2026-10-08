import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Empty, Flex, Input, Modal, Segmented, Spin, Typography, Upload } from "antd";
import { FileOutlined, PlayCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { formatBytes } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { uploadMedia, type MediaAsset } from "./media";
import { siteAsset } from "@/lib/env";

type Accept = "image" | "video" | "any";

export function MediaThumb({ asset, size = 120 }: { asset: Pick<MediaAsset, "url" | "kind" | "file_name" | "alt">; size?: number }) {
  if (asset.kind === "image") return <img src={siteAsset(asset.url)} alt={asset.alt ?? ""} style={{ width: "100%", height: size, objectFit: "cover", display: "block" }} loading="lazy" />;
  return (
    <Flex align="center" justify="center" style={{ height: size, background: "rgba(127,127,127,0.08)" }}>
      {asset.kind === "video" ? <PlayCircleOutlined style={{ fontSize: 32 }} /> : <FileOutlined style={{ fontSize: 32 }} />}
    </Flex>
  );
}

/**
 * Pick a file from the media library, or upload a new one. Used by every
 * image, video and file field, and by the rich-text editor's image button.
 */
export function MediaPicker({ open, accept = "any", onClose, onPick }: { open: boolean; accept?: Accept; onClose: () => void; onPick: (asset: MediaAsset) => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>(accept === "any" ? "all" : accept);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["media"],
    enabled: open,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("media_assets").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const assets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((asset) => (kind === "all" || asset.kind === kind) && (!query || `${asset.title ?? ""} ${asset.file_name ?? ""} ${asset.alt ?? ""}`.toLowerCase().includes(query)));
  }, [data, kind, search]);

  const upload = async (files: File[]) => {
    setUploading(true);
    const { uploaded, failures } = await uploadMedia(files, { imagesOnly: accept === "image" });
    setUploading(false);
    if (failures.length) message.error(`Could not upload: ${failures.join("; ")}`);
    if (uploaded.length) {
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      if (uploaded.length === 1) {
        onPick(uploaded[0]);
        onClose();
      } else message.success(`${uploaded.length} files uploaded.`);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width="min(1000px, 94vw)" title="Media library" destroyOnHidden>
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Flex gap={8} wrap>
          {accept === "any" ? (
            <Segmented
              value={kind}
              onChange={(value) => setKind(String(value))}
              options={[
                { value: "all", label: "All" },
                { value: "image", label: "Images" },
                { value: "video", label: "Videos" },
                { value: "document", label: "Documents" },
                { value: "file", label: "Other" },
              ]}
            />
          ) : null}
          <Input.Search allowClear placeholder="Search" onChange={(event) => setSearch(event.target.value)} style={{ width: 220 }} />
        </Flex>
        <Upload multiple showUploadList={false} accept={accept === "image" ? "image/*" : accept === "video" ? "video/*" : undefined} beforeUpload={(file, list) => {
            // Called once per file with the whole selection: upload it once, on the first.
            if (file === list[0]) void upload(list as unknown as File[]);
            return false;
          }}>
          <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
            Upload
          </Button>
        </Upload>
      </Flex>
      {isLoading ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : assets.length === 0 ? (
        <Empty description="Nothing here yet. Upload a file." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, maxHeight: "60vh", overflowY: "auto" }}>
          {assets.map((asset) => (
            <Card
              key={asset.id}
              hoverable
              size="small"
              cover={<MediaThumb asset={asset} />}
              onClick={() => {
                onPick(asset);
                onClose();
              }}
              styles={{ body: { padding: 8 } }}
            >
              <Typography.Text ellipsis style={{ display: "block", fontSize: 12 }}>
                {asset.title || asset.file_name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
                {formatBytes(asset.size_bytes)}
              </Typography.Text>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** A URL field with the media library attached: browse, upload, or paste. */
export function MediaInput({ value, onChange, accept = "any" }: { value?: string | null; onChange?: (value: string | null) => void; accept?: Accept }) {
  const [open, setOpen] = useState(false);
  return (
    <Flex vertical gap={8}>
      <Flex gap={8}>
        <Input value={value ?? ""} onChange={(event) => onChange?.(event.target.value || null)} placeholder="https://… or choose from the library" allowClear />
        <Button onClick={() => setOpen(true)}>Choose…</Button>
      </Flex>
      {value && accept === "image" ? <img src={siteAsset(value)} alt="" style={{ maxWidth: 240, maxHeight: 140, objectFit: "contain", borderRadius: 8, border: "1px solid rgba(127,127,127,0.2)" }} /> : null}
      <MediaPicker open={open} accept={accept} onClose={() => setOpen(false)} onPick={(asset) => onChange?.(asset.url)} />
    </Flex>
  );
}
