import { useState } from "react";
import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { errorText } from "@/lib/sales";

/**
 * Runs a write, shows how it went, and refreshes the listed data. One busy
 * key at a time, so the clicked button can spin.
 */
export function useAction(invalidate: string[][]) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await work();
      if (success) message.success(success);
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      return true;
    } catch (error) {
      console.error(`[${key}]`, error);
      message.error(errorText(error as { code?: string; message?: string }, "That did not work. Please try again."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { run, busy };
}
