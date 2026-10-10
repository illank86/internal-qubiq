import { useState } from "react";
import { Button, Empty, Flex, InputNumber, Skeleton, Typography, theme } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";
import { useIntegratorTiers } from "@/features/community/integrator-tiers-page";
import { useAction } from "./use-action";

/**
 * The partner discount per integrator tier (tiers themselves are managed under
 * Integrators → Integrator tiers). A quotation through an integrator takes its
 * tier's discount when it is priced.
 */
export function TierDiscounts() {
  const { token } = theme.useToken();
  const { data: tiers, isLoading } = useIntegratorTiers();
  const { run, busy } = useAction([["integrator-tiers"], ["integrator-tier"]]);
  // Edits not yet saved, by tier.
  const [edits, setEdits] = useState<Record<string, number>>({});
  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!tiers?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tiers yet. Add them under Integrators → Integrator tiers." />;

  const changed = tiers.filter((tier) => tier.slug in edits && edits[tier.slug] !== Number(tier.discount_percent));
  const save = () =>
    run(
      "tier-discounts",
      async () => {
        for (const tier of changed) {
          const { error } = await supabase.from("integrator_tiers").update({ discount_percent: edits[tier.slug] }).eq("slug", tier.slug);
          if (error) throw error;
        }
      },
      "Tier discounts saved. New and re-saved quotations use them.",
    ).then((ok) => ok && setEdits({}));

  return (
    <Flex vertical gap={12}>
      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}>
        {tiers.map((tier, index) => (
          <Flex
            key={tier.slug}
            justify="space-between"
            align="center"
            gap={16}
            style={{ padding: "10px 16px", borderTop: index ? `1px solid ${token.colorBorderSecondary}` : undefined }}
          >
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong>{tier.name}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                {tier.count} integrator{tier.count === 1 ? "" : "s"}
                {tier.description ? ` · ${tier.description}` : ""}
              </Typography.Text>
            </div>
            <InputNumber
              min={0}
              max={100}
              step={0.5}
              suffix="%"
              style={{ width: 120, flexShrink: 0 }}
              aria-label={`Partner discount for ${tier.name}`}
              value={edits[tier.slug] ?? Number(tier.discount_percent)}
              onChange={(value) => setEdits({ ...edits, [tier.slug]: Math.min(100, Math.max(0, Number(value) || 0)) })}
            />
          </Flex>
        ))}
      </div>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Off the quotation subtotal, before tax; 0 for none. Quotations already priced keep the discount they were given.
        </Typography.Text>
        <Button icon={<SaveOutlined />} disabled={!changed.length} loading={busy === "tier-discounts"} onClick={save}>
          Save tier discounts
        </Button>
      </Flex>
    </Flex>
  );
}
