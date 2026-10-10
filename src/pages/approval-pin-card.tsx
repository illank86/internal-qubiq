import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Flex, Input, Tag, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";
import { useIsApprover } from "@/features/sales/approvals";

/**
 * An approver's approval PIN: the 6 digits that confirm an approval from the
 * approval email, without signing in. Never the password; stored hashed;
 * five wrong tries lock it for 15 minutes. Setting it again replaces it.
 */
export function ApprovalPinCard() {
  const isApprover = useIsApprover();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { data: hasPin, isLoading } = useQuery({
    queryKey: ["approval-pin"],
    enabled: isApprover,
    queryFn: async () => {
      const { data, error: loadError } = await supabase.rpc("has_approval_pin");
      if (loadError) throw loadError;
      return Boolean(data);
    },
  });
  if (!isApprover) return null;

  const save = async () => {
    if (!/^\d{6}$/.test(pin)) return setError("Use exactly 6 digits.");
    if (pin !== confirm) return setError("The two PINs do not match.");
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.rpc("set_approval_pin", { p_pin: pin });
    setSaving(false);
    if (saveError) return setError(errorText(saveError, "The PIN could not be saved."));
    setPin("");
    setConfirm("");
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: ["approval-pin"] });
    message.success("Approval PIN saved. Use it to approve from the approval emails.");
  };

  const showForm = editing || hasPin === false;
  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <SafetyCertificateOutlined />
          Approval PIN
        </Flex>
      }
      extra={isLoading ? null : hasPin ? <Tag color="success">Set</Tag> : <Tag color="warning">Not set</Tag>}
      style={{ marginTop: 16 }}
    >
      <Typography.Paragraph type="secondary">
        6 digits to approve or reject quotations and invoices straight from the approval email, without signing in. It is not your password — choose something
        different. Five wrong tries lock it for 15 minutes.
      </Typography.Paragraph>
      {showForm ? (
        <Flex vertical gap={12}>
          <div>
            <Typography.Text>{hasPin ? "New PIN" : "Choose a PIN"}</Typography.Text>
            <div style={{ marginTop: 6 }}>
              <Input.OTP length={6} mask="•" value={pin} onChange={setPin} formatter={(value) => value.replace(/\D/g, "")} />
            </div>
          </div>
          <div>
            <Typography.Text>Repeat it</Typography.Text>
            <div style={{ marginTop: 6 }}>
              <Input.OTP length={6} mask="•" value={confirm} onChange={setConfirm} formatter={(value) => value.replace(/\D/g, "")} />
            </div>
          </div>
          {error ? <Alert type="error" showIcon title={error} /> : null}
          <Flex gap={8}>
            <Button type="primary" loading={saving} disabled={pin.length !== 6 || confirm.length !== 6} onClick={save}>
              Save PIN
            </Button>
            {hasPin ? (
              <Button
                onClick={() => {
                  setEditing(false);
                  setPin("");
                  setConfirm("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </Flex>
        </Flex>
      ) : (
        <Button onClick={() => setEditing(true)}>Change PIN</Button>
      )}
    </Card>
  );
}
