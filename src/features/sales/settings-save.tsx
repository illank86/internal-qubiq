import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Flex } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import type { Database } from "@/lib/database.types";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";

type Settings = Database["public"]["Tables"]["invoice_settings"]["Row"];

/** Saves one tab's own fields only. */
export function useSettingsSave() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (changes: Partial<Settings>, done: string) => {
    setPending(true);
    setError(null);
    const { error: saveError } = await supabase.from("invoice_settings").update(changes).eq("id", true);
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The settings could not be saved."));
    await Promise.all(["sales-settings", "sales-catalog", "sends-directly", "sales-money"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success(done);
  };
  return { save, pending, error };
}

export function SaveBar({ pending, error, onSave }: { pending: boolean; error: string | null; onSave: () => void }) {
  return (
    <Flex vertical gap={12}>
      {error ? <Alert type="error" showIcon title={error} /> : null}
      <Button type="primary" icon={<SaveOutlined />} loading={pending} onClick={onSave} style={{ alignSelf: "flex-start" }}>
        Save
      </Button>
    </Flex>
  );
}

