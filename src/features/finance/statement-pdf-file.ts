import { createElement } from "react";
import type { StatementBook } from "./statement-book";

/** The financial statements as a PDF blob (react-pdf and the template load on demand). */
export async function statementPdf(book: StatementBook): Promise<Blob> {
  const [{ pdf }, { StatementDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./statement-pdf")]);
  return pdf(createElement(StatementDocument, { book }) as Parameters<typeof pdf>[0]).toBlob();
}
