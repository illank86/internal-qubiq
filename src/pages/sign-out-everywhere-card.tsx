import { useState } from "react";
import { App, Button, Card, Flex, Popconfirm, Typography } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useAuth, useStaff } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";

/** Ends every sign-in of your account — this computer, and any other you forgot. */
export function SignOutEverywhereCard() {
  const staff = useStaff();
  const { signOut } = useAuth();
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);

  const signOutEverywhere = async () => {
    setPending(true);
    const { error } = await supabase.rpc("sign_out_everywhere", { p_user: staff.id });
    setPending(false);
    if (error) return message.error(errorText(error, "That did not work. Please try again."));
    await signOut("Signed out of all devices. Sign in again on this one.");
  };

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <LogoutOutlined />
          Signed-in devices
        </Flex>
      }
      style={{ marginTop: 16 }}
    >
      <Typography.Paragraph type="secondary">
        Signed in on another computer and forgot to sign out? This ends every sign-in of your account, everywhere — including this one. Other devices are
        signed out within a few minutes.
      </Typography.Paragraph>
      <Popconfirm
        title="Sign out of all devices?"
        description="You will need to sign in again here too."
        okText="Sign out everywhere"
        okButtonProps={{ danger: true }}
        onConfirm={signOutEverywhere}
      >
        <Button danger icon={<LogoutOutlined />} loading={pending}>
          Sign out of all devices
        </Button>
      </Popconfirm>
    </Card>
  );
}
