import { Flex, Input, Segmented, Typography } from "antd";
import { INVOICE_LOGO_DATA_URI } from "@/lib/invoice-logo";
import { npwpLine, signoffOf } from "./ledger-book";
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

export function PaperSheet({ company, title, subtitle, printed, children, scroll = true }: { company: Company; title: string; subtitle: string; printed: string; children: React.ReactNode; scroll?: boolean }) {
  // In a dialog the paper scrolls inside it; on a page it runs the full length.
  return (
    <div style={{ ...(scroll ? { maxHeight: "58vh", overflow: "auto" } : { overflowX: "auto" }), background: "#e9e9ec", borderRadius: 8, padding: 16 }}>
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

/** Place and date, then the preparer and approver with a line to sign on. */
export function SignBlock({ company }: { company: Company }) {
  const { place, people } = signoffOf(company);
  return (
    <div style={{ marginTop: 28, color: PAPER.body }}>
      <div style={{ textAlign: "right", paddingRight: 24 }}>{place}</div>
      <Flex justify="space-around" style={{ marginTop: 8 }}>
        {people.map((person) => (
          <div key={person.label} style={{ width: 220, textAlign: "center" }}>
            <div style={{ color: PAPER.muted }}>{person.label},</div>
            <div style={{ marginTop: 56, borderTop: `1px solid ${PAPER.ink}` }} />
            {person.name ? <div style={{ marginTop: 4, fontWeight: 700, color: PAPER.ink }}>{person.name}</div> : <div style={{ marginTop: 4, fontSize: 10, color: PAPER.muted }}>Nama</div>}
            {person.title ? <div style={{ fontSize: 11, color: PAPER.muted }}>{person.title}</div> : null}
          </div>
        ))}
      </Flex>
    </div>
  );
}
