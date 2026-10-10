import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flex, Segmented, Select, Tag, Typography } from "antd";
import { ToolOutlined, UserOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";

/**
 * Who an order came through: the customer directly, or one of our approved
 * integrators (partners). Set on the quotation; its invoice, delivery orders
 * and licences follow it.
 */

export type IntegratorOption = { id: string; company_name: string; country: string; tier: string };

export function useIntegrators() {
  return useQuery({
    queryKey: ["integrators-approved"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("integrators").select("id, company_name, country, tier").eq("status", "approved").order("company_name");
      if (error) throw error;
      return (data ?? []) as IntegratorOption[];
    },
  });
}

/** "Direct customer" or "Integrator" + which one. `value` null is direct. */
export function IntegratorField({ value, onChange, disabled }: { value?: string | null; onChange?: (value: string | null) => void; disabled?: boolean }) {
  const { data: integrators, isLoading } = useIntegrators();
  // Remembers "Integrator" while none is chosen yet.
  const [via, setVia] = useState<"direct" | "integrator">(value ? "integrator" : "direct");
  const mode = value ? "integrator" : via;
  return (
    <Flex vertical gap={8}>
      <Segmented<"direct" | "integrator">
        value={mode}
        disabled={disabled}
        onChange={(next) => {
          setVia(next);
          if (next === "direct") onChange?.(null);
        }}
        options={[
          { value: "direct", label: "Direct customer", icon: <UserOutlined /> },
          { value: "integrator", label: "Through an integrator", icon: <ToolOutlined /> },
        ]}
      />
      {mode === "integrator" ? (
        <Select
          showSearch
          allowClear
          disabled={disabled}
          loading={isLoading}
          placeholder="Choose the integrator"
          value={value ?? undefined}
          onChange={(next) => onChange?.(next ?? null)}
          optionFilterProp="label"
          notFoundContent={isLoading ? "Loading…" : "No approved integrators. Approve them in Community → Integrators."}
          options={(integrators ?? []).map((item) => ({ value: item.id, label: `${item.company_name} · ${item.country}` }))}
        />
      ) : null}
    </Flex>
  );
}

/** A small "via" tag: the integrator's name, or Direct. */
export function ChannelTag({ name }: { name?: string | null }) {
  return name ? (
    <Tag icon={<ToolOutlined />} color="geekblue" style={{ marginInlineEnd: 0 }}>
      {name}
    </Tag>
  ) : (
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      <UserOutlined /> Direct
    </Typography.Text>
  );
}
