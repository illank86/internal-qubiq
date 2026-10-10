import { useQuery } from "@tanstack/react-query";
import type { Database, Json } from "@/lib/database.types";
import { formatMoney } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";

/**
 * Finance: books kept by the database (journal entries are posted by the
 * functions below, never written directly). Amounts in the ledger are Rupiah;
 * receipts and expenses keep their own currency too.
 */

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type BankAccount = Database["public"]["Tables"]["bank_accounts"]["Row"];
export type Receipt = Database["public"]["Tables"]["receipts"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type TaxPayment = Database["public"]["Tables"]["tax_payments"]["Row"];
export type AccountingSettings = Database["public"]["Tables"]["accounting_settings"]["Row"];

export const idr = (amount: number | string | null | undefined) => formatMoney(Number(amount ?? 0), "IDR", 0);
export const money = (amount: number | string | null | undefined, currency: string) => formatMoney(Number(amount ?? 0), currency, currency === "IDR" ? 0 : 2);

/** Today in Jakarta, YYYY-MM-DD. */
export const jakartaToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export const WITHHOLDING: Record<string, string> = {
  pph23_2: "PPh 23 — 2% (services)",
  pph23_15: "PPh 23 — 15% (royalty)",
  pph42: "PPh 4(2) — final",
  foreign: "Foreign withholding tax",
  other: "Other",
};
export const TAX_TYPES: Record<string, string> = {
  pph25: "PPh 25 (monthly instalment)",
  pph29: "PPh 29 (annual corporate tax)",
  pph_final: "PPh final 0.5% (PP 55)",
  pph21: "PPh 21 (employees)",
  pph23: "PPh 23 (withheld from vendors)",
  pph42: "PPh 4(2) (withheld from vendors)",
  ppn: "PPN (VAT)",
  other: "Other",
};

const fail = (error: { message?: string } | null) => {
  if (error) throw error;
};
const call = async <T>(name: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  fail(error);
  return data as T;
};

export const recordReceipt = (p: Record<string, unknown>) => call<string>("record_receipt", { p: p as Json });
export const voidReceipt = (id: string, reason: string) => call<void>("void_receipt", { p_id: id, p_reason: reason });
export const recordExpense = (p: Record<string, unknown>) => call<string>("record_expense", { p: p as Json });
export const payExpense = (id: string, paidOn: string, bank: string, idrPaid?: number | null) =>
  call<void>("pay_expense", { p_id: id, p_paid_on: paidOn, p_bank: bank, ...(idrPaid ? { p_idr_paid: idrPaid } : {}) });
export const voidExpense = (id: string, reason: string) => call<void>("void_expense", { p_id: id, p_reason: reason });
export const recordTaxPayment = (p: Record<string, unknown>) => call<string>("record_tax_payment", { p: p as Json });
export const voidTaxPayment = (id: string, reason: string) => call<void>("void_tax_payment", { p_id: id, p_reason: reason });
export const postManualJournal = (date: string, memo: string, lines: { account_id: string; debit: number; credit: number; description?: string }[]) =>
  call<string>("post_manual_journal", { p_date: date, p_memo: memo, p_lines: lines as unknown as Json });
export const reverseManualJournal = (id: string, reason: string) => call<string>("reverse_manual_journal", { p_entry: id, p_reason: reason });
export const invoiceOpenBalance = (invoiceId: string) => call<number>("invoice_open_balance", { p_invoice: invoiceId });

export function useBankAccounts() {
  return useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").order("name");
      fail(error);
      return (data ?? []) as BankAccount[];
    },
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("code");
      fail(error);
      return (data ?? []) as Account[];
    },
  });
}

export function useAccountingSettings() {
  return useQuery({
    queryKey: ["accounting-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounting_settings").select("*").eq("id", true).maybeSingle();
      fail(error);
      return data as AccountingSettings | null;
    },
  });
}

const DOC_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** A bukti potong or an expense receipt, kept in accounting-documents (per customer or vendor). */
export async function uploadAccountingFile(folder: string, prefix: string, file: File) {
  if (!DOC_TYPES[file.type]) throw { code: "22023", message: "Use a PDF, JPG or PNG." };
  if (file.size === 0 || file.size > 15 * 1024 * 1024) throw { code: "22023", message: "Use a file under 15 MB." };
  const path = `${folder}/${prefix}-${Date.now()}.${DOC_TYPES[file.type]}`;
  const { error } = await supabase.storage.from("accounting-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw { code: "22023", message: "The file could not be uploaded. Please try again." };
  return { path, name: file.name.slice(0, 200) };
}

export async function accountingFileBlob(path: string) {
  const { data, error } = await supabase.storage.from("accounting-documents").download(path);
  fail(error);
  if (!data) throw new Error("The file could not be loaded");
  return data;
}

/** "PT Vendor Jaya" → "pt-vendor-jaya": the vendor's folder. */
export const vendorFolder = (vendor: string) =>
  `vendor/${vendor.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "unknown"}`;

/** Rows to a CSV file download (for Coretax input or the accountant). */
export function downloadCsv(fileName: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
