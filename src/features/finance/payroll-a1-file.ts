import { createElement } from "react";
import { company } from "./exports";
import { longDateId } from "./ledger-book";
import type { Form1721A1 } from "./payroll-a1";

/** The 1721-A1 workings as one PDF blob (react-pdf and the template load on demand). */
export async function a1Pdf(forms: Form1721A1[]): Promise<Blob> {
  const [{ pdf }, { A1Document }, who] = await Promise.all([import("@react-pdf/renderer"), import("./payroll-a1-pdf"), company()]);
  return pdf(createElement(A1Document, { company: who, forms, printed: longDateId(new Date().toISOString()) }) as Parameters<typeof pdf>[0]).toBlob();
}
