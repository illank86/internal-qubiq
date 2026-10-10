import { createElement } from "react";
import { supabase } from "@/lib/supabase";
import { company } from "./exports";
import { longDateId } from "./ledger-book";
import type { PayrollLine, PayrollRun } from "./payroll-api";

/** Payslips as one PDF blob, one page per line (react-pdf and the template load on demand). */
export async function payslipPdf(run: PayrollRun, lines: PayrollLine[]): Promise<Blob> {
  const ids = lines.map((line) => line.employee_id);
  const [{ pdf }, { PayslipDocument }, who, { data: employees, error }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./payslip-pdf"),
    company(),
    supabase.from("employees").select("*").in("id", ids),
  ]);
  if (error) throw error;
  return pdf(createElement(PayslipDocument, { company: who, run, lines, employees: employees ?? [], printed: longDateId(new Date().toISOString()) }) as Parameters<typeof pdf>[0]).toBlob();
}
