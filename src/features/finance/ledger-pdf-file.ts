import { createElement } from "react";
import type { LedgerBook } from "./ledger-book";

/** The ledger book as a PDF blob (react-pdf and the template load on demand). */
export async function ledgerPdf(book: LedgerBook): Promise<Blob> {
  const [{ pdf }, { LedgerDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./ledger-pdf")]);
  return pdf(createElement(LedgerDocument, { book }) as Parameters<typeof pdf>[0]).toBlob();
}
