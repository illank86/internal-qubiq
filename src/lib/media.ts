/**
 * Shared media rules — imported by the browser uploader, the picker, the
 * library and the server action that records uploads, so none of them can
 * disagree about what is allowed or how a file is classified.
 */

export const MEDIA_BUCKET = "media";

/** Matches the bucket's `file_size_limit`; the server rejects beyond this too. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
];

/**
 * Types refused outright.
 *
 * The bucket is on a different origin to the site, so a stored HTML page cannot
 * reach this site's cookies — but it could still be dressed up as a phishing
 * page on a domain that looks adjacent to ours, and nothing in a marketing site
 * needs to host one.
 */
const BLOCKED_MIME_TYPES = ["text/html", "application/xhtml+xml"];

export const MEDIA_KINDS = ["image", "video", "audio", "document", "archive", "file"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Wording for each kind. Icons live with the components, in `media-thumb`. */
export const MEDIA_KIND_META: Record<MediaKind, { label: string; plural: string }> = {
  image: { label: "Image", plural: "Images" },
  video: { label: "Video", plural: "Video" },
  audio: { label: "Audio", plural: "Audio" },
  document: { label: "Document", plural: "Documents" },
  archive: { label: "Archive", plural: "Archives" },
  file: { label: "File", plural: "Other files" },
};

const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
];

const ARCHIVE_MIME_TYPES = [
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-bzip2",
  "application/x-xz",
];

/** File extensions that give a better answer than the browser's MIME guess. */
const EXTENSION_KINDS: Record<string, MediaKind> = {
  exe: "file",
  msi: "file",
  dmg: "file",
  deb: "file",
  rpm: "file",
  appimage: "file",
  tgz: "archive",
  gz: "archive",
  xz: "archive",
  zip: "archive",
  "7z": "archive",
  rar: "archive",
  tar: "archive",
  pdf: "document",
  doc: "document",
  docx: "document",
  xls: "document",
  xlsx: "document",
  ppt: "document",
  pptx: "document",
  csv: "document",
  txt: "document",
  md: "document",
  sha256: "document",
  sig: "file",
};

/**
 * Classifies an upload.
 *
 * MIME type first, extension as a fallback: browsers report
 * `application/octet-stream` for plenty of real things — installers especially —
 * and a library where every build shows up as "Other" is not much of a library.
 */
export function kindOf(mimeType: string | null | undefined, fileName?: string | null): MediaKind {
  const mime = (mimeType ?? "").toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (DOCUMENT_MIME_TYPES.includes(mime)) return "document";
  if (ARCHIVE_MIME_TYPES.includes(mime)) return "archive";
  if (mime.startsWith("text/")) return "document";
  if (mime.includes("officedocument") || mime.includes("ms-excel") || mime.includes("ms-powerpoint")) {
    return "document";
  }

  const extension = fileName?.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_KINDS[extension] ?? "file";
}

export function isBlocked(mimeType: string | null | undefined) {
  return Boolean(mimeType && BLOCKED_MIME_TYPES.includes(mimeType.toLowerCase()));
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Builds the object path for an upload.
 *
 * Namespaced by month so the bucket stays browsable, and suffixed with a random
 * token so two people uploading `logo.png` in the same month do not collide — an
 * overwrite would silently change an image already live on a page.
 */
export function buildStoragePath(fileName: string, now: Date, token: string) {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);

  const stamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${stamp}/${token}-${safe || "file"}`;
}
