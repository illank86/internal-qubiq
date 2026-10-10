import { createElement } from "react";
import type { Worksheet } from "./annual-tax";
import { company } from "./exports";
import { longDateId } from "./ledger-book";

/** The annual tax worksheet as a PDF blob (react-pdf and the template load on demand). */
export async function annualTaxPdf(worksheet: Worksheet): Promise<Blob> {
  const [{ pdf }, { AnnualTaxDocument }, who] = await Promise.all([import("@react-pdf/renderer"), import("./annual-tax-pdf"), company()]);
  const book = { company: who, period: `Tahun pajak ${worksheet.year}`, printed: longDateId(new Date().toISOString()) };
  return pdf(createElement(AnnualTaxDocument, { book, worksheet }) as Parameters<typeof pdf>[0]).toBlob();
}
