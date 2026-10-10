import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Flex, Modal, Progress, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";

/**
 * How long a sign-in lasts (Users → Sign-in security):
 *  - signed out after N minutes without activity, with a minute's warning;
 *  - asked to sign in again after M hours, whatever happens;
 *  - signed out when the session was ended on the server ("Sign out of all
 *    devices", or by an administrator), checked every few minutes.
 * Activity in any tab counts for all of them: the times live in local storage.
 */

const ACTIVITY_KEY = "qubiq-internal-activity";
const SIGNED_IN_KEY = "qubiq-internal-signed-in-at";
const WARN_MS = 60_000;
const SERVER_CHECK_MS = 3 * 60_000;

const read = (key: string) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage blocked: the limits then hold for this tab only
  }
};

/** Call right after a sign-in: the session's clock starts now. */
export function markSignedIn() {
  const now = Date.now();
  write(SIGNED_IN_KEY, now);
  write(ACTIVITY_KEY, now);
}

export function SessionGuard() {
  const { signOut } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const lastServerCheck = useRef(0);

  const { data: limits } = useQuery({
    queryKey: ["session-settings"],
    queryFn: async () => (await supabase.from("staff_session_settings").select("idle_minutes, max_session_hours").maybeSingle()).data,
    staleTime: 10 * 60_000,
  });
  const idleMinutes = limits?.idle_minutes ?? 30;
  const maxHours = limits?.max_session_hours ?? 12;

  const end = useCallback(
    async (notice: string) => {
      try {
        localStorage.removeItem(SIGNED_IN_KEY);
      } catch {
        // ignore
      }
      await signOut(notice);
    },
    [signOut],
  );

  const stillHere = useCallback(() => {
    write(ACTIVITY_KEY, Date.now());
    setSecondsLeft(null);
  }, []);

  // Activity: mouse, keyboard, touch, scrolling (written at most every 5 s).
  useEffect(() => {
    const seen = () => {
      const now = Date.now();
      if (now - lastWrite.current < 5_000) return;
      lastWrite.current = now;
      write(ACTIVITY_KEY, now);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const name of events) window.addEventListener(name, seen, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, seen);
    };
  }, []);

  // The clock: every few seconds, and as soon as the tab is looked at again.
  useEffect(() => {
    if (!read(SIGNED_IN_KEY)) markSignedIn();
    const tick = async () => {
      const now = Date.now();
      const signedIn = read(SIGNED_IN_KEY) ?? now;
      const active = read(ACTIVITY_KEY) ?? now;
      if (now - signedIn > maxHours * 3_600_000) {
        await end(`For security, a sign-in lasts ${maxHours} hours. Please sign in again.`);
        return;
      }
      const left = idleMinutes * 60_000 - (now - active);
      if (left <= 0) {
        await end(`Signed out after ${idleMinutes} minutes without activity.`);
        return;
      }
      setSecondsLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null);
      // Ended elsewhere (all devices, or by an administrator)?
      if (now - lastServerCheck.current > SERVER_CHECK_MS) {
        lastServerCheck.current = now;
        const { error } = await supabase.auth.getUser();
        if (error && /session|jwt|token|not found|expired/i.test(error.message)) {
          await end("You were signed out of this device (all devices were signed out, or an administrator ended the session).");
        }
      }
    };
    const timer = window.setInterval(() => void tick(), 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [end, idleMinutes, maxHours]);

  return (
    <Modal
      open={secondsLeft !== null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      title={
        <Flex align="center" gap={8}>
          <ClockCircleOutlined />
          Still there?
        </Flex>
      }
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={() => void end("Signed out.")}>Sign out now</Button>
          <Button type="primary" onClick={stillHere}>
            Stay signed in
          </Button>
        </Flex>
      }
    >
      <Typography.Paragraph>
        For security you will be signed out in <Typography.Text strong>{secondsLeft ?? 0} seconds</Typography.Text> after {idleMinutes} minutes without
        activity. Anything not saved on the page may be lost.
      </Typography.Paragraph>
      <Progress percent={Math.round(((secondsLeft ?? 0) / 60) * 100)} showInfo={false} status="active" />
    </Modal>
  );
}
