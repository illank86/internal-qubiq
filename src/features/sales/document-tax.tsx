import { useQuery } from "@tanstack/react-query";
import { Form, Tag, Typography } from "antd";
import { supabase } from "@/lib/supabase";

/**
 * The tax on quotations and invoices is Finance's: PPN at the PKP rate once
 * PKP, none before. Documents take it from Finance settings — it is not typed
 * in per document. (Same query key as the settings pages, so a save there refreshes it.)
 */
export function useDocumentTax() {
  const { data } = useQuery({
    queryKey: ["sales-settings"],
    queryFn: async () => {
      const { data: row, error } = await supabase.from("invoice_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return row;
    },
  });
  return data ? { label: data.tax_label, rate: Number(data.tax_rate) || 0 } : null;
}

/** Read-only: what tax this document charges, and where it is set. */
export function TaxReadout({ label, rate }: { label: string; rate: number }) {
  return (
    <Form.Item label="Tax" extra="Set by Finance (PKP status) — not per document.">
      {rate > 0 ? (
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          {label} {rate}%
        </Tag>
      ) : (
        <Typography.Text type="secondary">No {label || "PPN"} — not PKP yet</Typography.Text>
      )}
    </Form.Item>
  );
}
