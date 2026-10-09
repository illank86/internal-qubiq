import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * A document with another one after it, as one PDF: the invoice, then the
 * customer's purchase order. A PDF attachment adds its pages; a JPEG or PNG
 * (a photographed or scanned PO) gets an A4 page of its own, captioned.
 *
 * If the attachment cannot be read (damaged, or a protected PDF that will not
 * copy), the document comes back unchanged rather than failing the download.
 */
export async function appendAttachment(
  document: Uint8Array | ArrayBuffer,
  attachment: { bytes: Uint8Array | ArrayBuffer; type: string },
  caption: string,
): Promise<Uint8Array> {
  const out = await PDFDocument.load(document, { updateMetadata: false });
  try {
    const bytes = new Uint8Array(attachment.bytes);
    const isPdf = attachment.type === "application/pdf" || new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
    if (isPdf) {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(source, source.getPageIndices());
      for (const page of pages) out.addPage(page);
    } else {
      const image = attachment.type === "image/png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const page = out.addPage([595.28, 841.89]);
      const margin = 40;
      const font = await out.embedFont(StandardFonts.HelveticaBold);
      page.drawText(caption.toUpperCase(), { x: margin, y: 841.89 - margin - 7, size: 7, font, color: rgb(0.45, 0.45, 0.48) });
      const room = { width: 595.28 - margin * 2, height: 841.89 - margin * 2 - 22 };
      const scale = Math.min(room.width / image.width, room.height / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: margin + (room.width - width) / 2, y: margin + room.height - height, width, height });
    }
  } catch (error) {
    console.error("[append-attachment] not added:", error instanceof Error ? error.message : error);
    return new Uint8Array(document);
  }
  return out.save();
}
