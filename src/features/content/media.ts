import type { Database } from "@/lib/database.types";
import { MAX_UPLOAD_BYTES, MEDIA_BUCKET, buildStoragePath, formatBytes, isBlocked, kindOf } from "@/lib/media";
import { supabase } from "@/lib/supabase";

export type MediaAsset = Database["public"]["Tables"]["media_assets"]["Row"];

function measureImage(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    image.src = url;
  });
}

/**
 * Uploads files to the media library, the same way the website's admin does:
 * the bytes go straight to the public `media` bucket under a dated path, then
 * a media_assets row records them. If the row cannot be written the object is
 * taken back out, so nothing is left that no screen lists.
 */
export async function uploadMedia(files: File[], { imagesOnly = false } = {}) {
  const uploaded: MediaAsset[] = [];
  const failures: string[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      failures.push(`${file.name} is ${formatBytes(file.size)}`);
      continue;
    }
    if (isBlocked(file.type)) {
      failures.push(`${file.name} is not an allowed type`);
      continue;
    }
    if (imagesOnly && !file.type.startsWith("image/")) {
      failures.push(`${file.name} is not an image`);
      continue;
    }

    const path = buildStoragePath(file.name, new Date(), crypto.randomUUID().slice(0, 8));
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
    if (uploadError) {
      failures.push(/row-level security|Unauthorized/i.test(uploadError.message) ? "you do not have permission to upload media" : `${file.name}: ${uploadError.message}`);
      continue;
    }

    const { width, height } = await measureImage(file);
    const { data: publicUrl } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const { data, error } = await supabase
      .from("media_assets")
      .insert({
        url: publicUrl.publicUrl,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        width: width ?? null,
        height: height ?? null,
        kind: kindOf(file.type, file.name),
        alt: "",
        title: file.name.replace(/\.[a-z0-9]+$/i, ""),
      })
      .select()
      .single();
    if (error || !data) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      failures.push(`${file.name}: ${error?.code === "42501" ? "you do not have permission to add media" : "it could not be recorded"}`);
      continue;
    }
    uploaded.push(data);
  }

  return { uploaded, failures };
}

/** Deletes an asset and its bytes. */
export async function deleteMedia(asset: Pick<MediaAsset, "id" | "storage_path">) {
  const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
  if (error) throw error;
  if (asset.storage_path) await supabase.storage.from(MEDIA_BUCKET).remove([asset.storage_path]);
}

/** "4:12", "252" and "1:02:03" all mean what they look like; anything else is empty. */
export function parseDuration(input: string | null | undefined): number | null {
  const text = input?.trim();
  if (!text) return null;
  const parts = text.split(":").map((part) => part.trim());
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0) || null;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
