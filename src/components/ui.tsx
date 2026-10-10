import { Button, Card, Flex, Spin, Tooltip, Typography, theme } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useThemeMode } from "@/theme-mode";
import { QubiqMark, QubiqWordmark } from "./brand";

/** The logo and the app's name, for the sidebar and the header on small screens. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Flex align="center" gap={10}>
      {/* The logo draws in the text colour, so it follows the theme. */}
      <Typography.Text style={{ lineHeight: 0 }}>{compact ? <QubiqMark style={{ height: 28, width: "auto" }} /> : <Logo height={18} />}</Typography.Text>
      {compact ? null : (
        <Typography.Text type="secondary" style={{ fontSize: 13, whiteSpace: "nowrap", borderLeft: "1px solid rgba(127,127,127,0.35)", paddingLeft: 10 }}>
          Admin
        </Typography.Text>
      )}
    </Flex>
  );
}

/** The QUBIQ logo, drawn in the current text colour so it suits light and dark. */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <Flex align="center" gap={height * 0.2} aria-label="QUBIQ" role="img">
      <QubiqMark style={{ height: height * 1.43, width: "auto" }} />
      <QubiqWordmark style={{ height, width: "auto" }} />
    </Flex>
  );
}

const YEAR = new Date().getFullYear();

/** The frame every signed-out screen shares: sign in, forgot, set password. */
export function AuthCard({ title, intro, children }: { title?: string; intro: React.ReactNode; children: React.ReactNode }) {
  const { dark, toggle } = useThemeMode();
  const { token } = theme.useToken();
  return (
    <div className="auth-frame" style={{ background: token.colorBgLayout }}>
      {/* The brand side (hidden on narrow screens). */}
      <aside className="auth-brand" aria-hidden>
        <Flex align="center" gap={10} style={{ color: "#fafafa" }}>
          <Logo height={22} />
          <span style={{ fontSize: 13, opacity: 0.7, borderLeft: "1px solid rgba(255,255,255,0.3)", paddingLeft: 10 }}>Admin</span>
        </Flex>
        <div style={{ maxWidth: 440 }}>
          <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "#fdba74", fontWeight: 600 }}>The QUBIQ team workspace</div>
          <h1 style={{ margin: "14px 0 16px", fontSize: 38, lineHeight: 1.15, fontWeight: 650, color: "#fafafa", letterSpacing: -0.5 }}>
            Quotations, invoices and licences — in one place.
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(244,244,245,0.72)" }}>
            Prepare and approve quotations, send invoices and get paid, issue licences, and keep goqubiq.com up to date.
          </p>
          <Flex vertical gap={10} style={{ marginTop: 28 }}>
            {["Approvals with a second pair of eyes", "Signed copies, materai and e-Meterai", "Every change recorded"].map((line) => (
              <Flex key={line} align="center" gap={10} style={{ fontSize: 14, color: "rgba(244,244,245,0.85)" }}>
                <span style={{ width: 18, height: 18, borderRadius: 999, background: "rgba(240,138,75,0.22)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fdba74", fontSize: 11 }}>
                  ✓
                </span>
                {line}
              </Flex>
            ))}
          </Flex>
        </div>
        <div style={{ fontSize: 12, color: "rgba(244,244,245,0.5)" }}>For the QUBIQ team. Customers sign in at goqubiq.com.</div>
      </aside>

      {/* The form side. */}
      <main className="auth-side">
        <Tooltip title={dark ? "Light theme" : "Dark theme"}>
          <Button className="auth-toggle" shape="circle" icon={dark ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label={dark ? "Use the light theme" : "Use the dark theme"} />
        </Tooltip>
        <Flex vertical gap={24} style={{ width: "100%", maxWidth: 400 }}>
          <Flex vertical align="center" gap={14} style={{ textAlign: "center" }}>
            <Typography.Text style={{ lineHeight: 0 }}>
              <Logo height={28} />
            </Typography.Text>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {title ?? "Welcome back"}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                {intro}
              </Typography.Text>
            </div>
          </Flex>
          <Card
            style={{ boxShadow: dark ? "0 10px 40px rgba(0,0,0,0.45)" : "0 10px 40px rgba(24,24,27,0.08)", borderColor: token.colorBorderSecondary }}
            styles={{ body: { padding: 28 } }}
          >
            {children}
          </Card>
          <Typography.Text type="secondary" style={{ textAlign: "center", fontSize: 12 }}>
            © {YEAR} QUBIQ · <Typography.Link href="https://goqubiq.com" target="_blank" style={{ fontSize: 12 }}>goqubiq.com</Typography.Link>
          </Typography.Text>
        </Flex>
      </main>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: "100dvh" }}>
      <Spin size="large" />
    </Flex>
  );
}
