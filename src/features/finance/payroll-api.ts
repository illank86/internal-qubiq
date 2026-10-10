import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";

/**
 * Payroll: employees, monthly runs and their lines. The amounts (BPJS, PPh 21,
 * net pay) are worked out in the database — these calls only ask for it.
 */

export type Employee = Database["public"]["Tables"]["employees"]["Row"];
export type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
export type PayrollLine = Database["public"]["Tables"]["payroll_lines"]["Row"];
export type PayrollSettings = Database["public"]["Tables"]["payroll_settings"]["Row"];
/** The December (or leaving-month) working, stored on the line. */
export type AnnualWorking = { months: number; gross: number; job_expense: number; pension_fees: number; net: number; ptkp: number; taxable: number; tax: number; withheld_before: number };

export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;
export const PTKP_LABEL: Record<string, string> = {
  "TK/0": "TK/0 — single, no dependants",
  "TK/1": "TK/1 — single, 1 dependant",
  "TK/2": "TK/2 — single, 2 dependants",
  "TK/3": "TK/3 — single, 3 dependants",
  "K/0": "K/0 — married, no dependants",
  "K/1": "K/1 — married, 1 dependant",
  "K/2": "K/2 — married, 2 dependants",
  "K/3": "K/3 — married, 3 dependants",
};

/** 2026-03-01 → "March 2026"; Indonesian for documents. */
export const periodLabel = (period: string) => new Date(`${period.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const periodLabelId = (period: string) => new Date(`${period.slice(0, 10)}T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

/** What the employer pays on top of the salary (BPJS shares). */
export const employerCost = (line: PayrollLine) => Number(line.kes_employer) + Number(line.jht_employer) + Number(line.jp_employer) + Number(line.jkk) + Number(line.jkm);
/** What is taken from the employee for BPJS. */
export const employeeBpjs = (line: PayrollLine) => Number(line.kes_employee) + Number(line.jht_employee) + Number(line.jp_employee);
/** Salary, allowance and other income — before anything is taken off. */
export const earnings = (line: PayrollLine) => Number(line.base_salary) + Number(line.allowance) + Number(line.other_income);

/** Due dates for a month's payroll: PPh 21 by the 15th and BPJS by the 10th of the next month. */
export function dueDates(period: string) {
  const [y, m] = period.slice(0, 7).split("-").map(Number);
  const next = (day: number) => new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
  return { pph21: next(15), bpjs: next(10), masa: period.slice(0, 7) };
}

const call = async <T>(name: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
};

export const createPayrollRun = (period: string) => call<string>("create_payroll_run", { p_period: period });
export const refreshPayrollRun = (run: string) => call<void>("refresh_payroll_run", { p_run: run });
export const updatePayrollLine = (line: string, p: Record<string, unknown>) => call<void>("update_payroll_line", { p_line: line, p: p as Json });
export const deletePayrollRun = (run: string) => call<void>("delete_payroll_run", { p_run: run });
export const postPayrollRun = (run: string, paidOn: string, bank: string) => call<string>("post_payroll_run", { p_run: run, p_paid_on: paidOn, p_bank: bank });
export const payPayrollBpjs = (run: string, paidOn: string, bank: string) => call<string>("pay_payroll_bpjs", { p_run: run, p_paid_on: paidOn, p_bank: bank });
export const voidPayrollRun = (run: string, reason: string) => call<void>("void_payroll_run", { p_run: run, p_reason: reason });

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePayrollSettings() {
  return useQuery({
    queryKey: ["payroll-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Runs with their totals, newest month first. */
export function usePayrollRuns() {
  return useQuery({
    queryKey: ["payroll-runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_runs").select("*, lines:payroll_lines(base_salary, allowance, other_income, net_pay, pph21, kes_employer, kes_employee, jht_employer, jht_employee, jp_employer, jp_employee, jkk, jkm)").order("period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (PayrollRun & { lines: Pick<PayrollLine, "base_salary" | "allowance" | "other_income" | "net_pay" | "pph21" | "kes_employer" | "kes_employee" | "jht_employer" | "jht_employee" | "jp_employer" | "jp_employee" | "jkk" | "jkm">[] })[];
    },
  });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery({
    queryKey: ["payroll-run", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [{ data: run, error }, { data: lines, error: linesError }] = await Promise.all([
        supabase.from("payroll_runs").select("*").eq("id", id!).maybeSingle(),
        supabase.from("payroll_lines").select("*").eq("run_id", id!).order("employee_name"),
      ]);
      if (error) throw error;
      if (linesError) throw linesError;
      return run ? { run, lines: lines ?? [] } : null;
    },
  });
}

/** Totals for a run's lines. */
export function totals(lines: Pick<PayrollLine, "base_salary" | "allowance" | "other_income" | "net_pay" | "pph21" | "kes_employer" | "kes_employee" | "jht_employer" | "jht_employee" | "jp_employer" | "jp_employee" | "jkk" | "jkm">[]) {
  const sum = (pick: (line: (typeof lines)[number]) => number) => lines.reduce((total, line) => total + pick(line), 0);
  const employer = sum((l) => Number(l.kes_employer) + Number(l.jht_employer) + Number(l.jp_employer) + Number(l.jkk) + Number(l.jkm));
  const employee = sum((l) => Number(l.kes_employee) + Number(l.jht_employee) + Number(l.jp_employee));
  const wages = sum((l) => Number(l.base_salary) + Number(l.allowance) + Number(l.other_income));
  return { wages, net: sum((l) => Number(l.net_pay)), pph21: sum((l) => Number(l.pph21)), employer, bpjs: employer + employee, cost: wages + employer, people: lines.length };
}
