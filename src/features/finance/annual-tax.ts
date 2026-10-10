/** The annual corporate tax worksheet (annual_tax_worksheet). */
export type Worksheet = {
  year: number;
  regime: "general" | "pp55";
  corporate_rate: number;
  threshold: number;
  income: number;
  expenses: number;
  gross_revenue: number;
  commercial_profit: number;
  positive: { non_deductible_accounts: number; non_deductible_expenses: number; manual: number; total: number };
  negative: { manual: number; total: number };
  adjustments: { id: string; kind: "positive" | "negative"; description: string; amount: number }[];
  non_deductible_detail: { account: string; amount: number }[];
  net_fiscal: number;
  loss_carryforward: number;
  taxable: number;
  facility_share: number | null;
  tax: number;
  credits: { pph23: number; pph25: number; other: number; total: number };
  pph29: number;
  next_pph25: number;
  current_pph25: number;
  due: string;
  note: string | null;
  posted: boolean;
  posted_at: string | null;
  loss: number;
};

/** The worksheet as labelled rows, shared by the page, the Excel and the PDF. */
export function worksheetRows(w: Worksheet) {
  const rows: { key: string; section: "fiscal" | "tax"; label: string; amount: number; strong?: boolean; indent?: boolean }[] = [
    { key: "income", section: "fiscal", label: "Pendapatan (income)", amount: w.income },
    { key: "expenses", section: "fiscal", label: "Beban, sebelum PPh badan (costs)", amount: -w.expenses },
    { key: "commercial", section: "fiscal", label: "Laba komersial sebelum pajak", amount: w.commercial_profit, strong: true },
    { key: "pos-acc", section: "fiscal", label: "Koreksi positif: akun tidak dapat dibiayakan", amount: w.positive.non_deductible_accounts, indent: true },
    { key: "pos-exp", section: "fiscal", label: "Koreksi positif: pengeluaran tidak dapat dibiayakan", amount: w.positive.non_deductible_expenses, indent: true },
    { key: "pos-man", section: "fiscal", label: "Koreksi positif lainnya", amount: w.positive.manual, indent: true },
    { key: "neg-man", section: "fiscal", label: "Koreksi negatif", amount: -w.negative.total, indent: true },
    { key: "net", section: "fiscal", label: "Penghasilan neto fiskal", amount: w.net_fiscal, strong: true },
    { key: "loss", section: "fiscal", label: "Kompensasi kerugian", amount: -w.loss_carryforward, indent: true },
    { key: "pkp", section: "fiscal", label: "Penghasilan kena pajak (dibulatkan ke ribuan)", amount: w.taxable, strong: true },
    { key: "tax", section: "tax", label: "PPh badan terutang", amount: w.tax, strong: true },
    { key: "c23", section: "tax", label: "Kredit PPh 23 (dipotong pelanggan)", amount: -w.credits.pph23, indent: true },
    { key: "c25", section: "tax", label: "Kredit PPh 25 (angsuran dibayar)", amount: -w.credits.pph25, indent: true },
    { key: "c22", section: "tax", label: "Kredit PPh 22 / 24", amount: -w.credits.other, indent: true },
    { key: "29", section: "tax", label: w.pph29 >= 0 ? "PPh 29 kurang bayar" : "PPh lebih bayar", amount: w.pph29, strong: true },
    { key: "next25", section: "tax", label: "Angsuran PPh 25 tahun berikutnya (per bulan)", amount: w.next_pph25 },
  ];
  return rows;
}
