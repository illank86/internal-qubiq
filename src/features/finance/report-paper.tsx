import { Flex, Input, Segmented, Typography } from "antd";
import { INVOICE_LOGO_DATA_URI } from "@/lib/invoice-logo";
import { npwpLine } from "./ledger-book";
import type { Company } from "./exports";
import { PAPER, PRESET_OPTIONS, type Preset } from "./report-period";

/** Pieces shared by the report previews: the period picker and the "paper" a report is drawn on. */

export function PeriodPicker({ preset, custom, from, to, onPreset, onCustom }: {
  preset: Preset;
  custom: [string, string];
  from: string;
  to: string;
  onPreset: (preset: Preset) => void;
  onCustom: (range: [string, string]) => void;
}) {
  return (
    <Flex gap={8} align="center" wrap>
      <Segmented<Preset>
        value={preset}
        onChange={(value) => {
          if (value === "custom") onCustom([from, to]);
          onPreset(value);
        }}
        options={PRESET_OPTIONS}
      />
      {preset === "custom" ? (
        <Flex gap={6} align="center">
          <Input type="date" value={custom[0]} max={custom[1]} onChange={(event) => onCustom([event.target.value, custom[1]])} style={{ width: 150 }} aria-label="From" />
          <Typography.Text type="secondary">to</Typography.Text>
          <Input type="date" value={custom[1]} min={custom[0]} onChange={(event) => onCustom([custom[0], event.target.value])} style={{ width: 150 }} aria-label="To" />
        </Flex>
      ) : null}
    </Flex>
  );
}

export function PaperSheet({ company, title, subtitle, printed, children }: { company: Company; title: string; subtitle: string; printed: string; children: React.ReactNode }) {
  return (
    <div style={{ maxHeight: "58vh", overflow: "auto", background: "#e9e9ec", borderRadius: 8, padding: 16 }}>
      <div style={{ background: "#fff", color: PAPER.body, maxWidth: 900, margin: "0 auto", padding: "0 28px 24px", boxShadow: "0 2px 10px rgba(0,0,0,.12)", borderTop: `4px solid ${PAPER.brand}`, fontSize: 12 }}>
        <Flex justify="space-between" align="flex-end" style={{ padding: "20px 0 12px", borderBottom: `1px solid ${PAPER.line}`, marginBottom: 12 }} gap={16} wrap>
          <div>
            <img src={INVOICE_LOGO_DATA_URI} alt="" style={{ height: 22, marginBottom: 6, display: "block" }} />
            <div style={{ fontWeight: 700, color: PAPER.ink, fontSize: 13 }}>{company.name}</div>
            <div style={{ color: PAPER.muted }}>{npwpLine(company.npwp)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, color: PAPER.ink, fontSize: 18, letterSpacing: 1 }}>{title.toUpperCase()}</div>
            <div style={{ color: PAPER.muted }}>{subtitle}</div>
            <div style={{ color: PAPER.muted }}>Dalam Rupiah</div>
          </div>
        </Flex>
        {children}
        <div style={{ marginTop: 16, paddingTop: 6, borderTop: `1px solid ${PAPER.line}`, color: "#a1a1aa", fontSize: 10 }}>
          {company.name} · dicetak {printed}
        </div>
      </div>
    </div>
  );
}

export function CheckLine({ ok, text }: { ok: boolean; text: string }) {
  return <div style={{ marginTop: 8, fontWeight: 600, color: ok ? PAPER.good : PAPER.bad }}>{`${ok ? "✓" : "✗"} ${text}`}</div>;
}

export const PaperEmpty = ({ text }: { text: string }) => <div style={{ padding: "24px 0", color: PAPER.muted, textAlign: "center" }}>{text}</div>;
