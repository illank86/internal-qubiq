import { useRef, useState } from "react";
import { Input, InputNumber } from "antd";
import type { InputNumberProps, InputProps } from "antd";
import type { TextAreaProps } from "antd/es/input";

/**
 * Keeps what is typed locally and hands it on when leaving the field — or,
 * with a `delay`, also after that pause — so typing never re-renders the whole
 * quotation builder. Text changes no price, so text waits for the blur;
 * numbers (which move the totals) use a delay.
 */
function useLazy<T>(value: T, onCommit: (next: T) => void, delay: number | null = null) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const sent = useRef(value);
  // A change from outside (another group copied, a draft loaded) replaces what is shown —
  // unless it is what this field just sent.
  if (value !== seen) {
    setSeen(value);
    if (value !== sent.current) setLocal(value);
  }
  const send = (next: T) => {
    window.clearTimeout(timer.current);
    sent.current = next;
    if (next !== value) onCommit(next);
  };
  const change = (next: T) => {
    setLocal(next);
    window.clearTimeout(timer.current);
    if (delay !== null) timer.current = window.setTimeout(() => send(next), delay);
  };
  return { local, setLocal, change, flush: () => send(local), cancel: () => window.clearTimeout(timer.current) };
}

type LazyInputProps = Omit<InputProps, "value" | "onChange"> & {
  value: string;
  onCommit: (next: string) => void;
  maxLength?: number;
  /** Never sent empty: it can be cleared to type anew; left empty, it goes back to what it was. */
  required?: boolean;
};

export function LazyInput({ value, onCommit, onBlur, maxLength, required = false, ...rest }: LazyInputProps) {
  const { local, setLocal, change, flush, cancel } = useLazy(value, onCommit);
  return (
    <Input
      {...rest}
      value={local}
      onChange={(event) => {
        const next = maxLength ? event.target.value.slice(0, maxLength) : event.target.value;
        if (required && !next.trim()) {
          cancel();
          setLocal(next);
        } else change(next);
      }}
      onBlur={(event) => {
        if (required && !local.trim()) setLocal(value);
        else flush();
        onBlur?.(event);
      }}
    />
  );
}

type LazyNumberProps = Omit<InputNumberProps<number>, "value" | "onChange"> & { value: number; onCommit: (next: number) => void };

export function LazyNumber({ value, onCommit, onBlur, ...rest }: LazyNumberProps) {
  const { local, setLocal, change, flush } = useLazy<number | null>(value, (next) => onCommit(Number(next) || 0), 500);
  return (
    <InputNumber<number>
      {...rest}
      value={local}
      // Emptied to type a new number: wait for it rather than sending 0.
      onChange={(next) => (next === null ? setLocal(null) : change(next))}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}

type LazyTextAreaProps = Omit<TextAreaProps, "value" | "onChange"> & { value: string; onCommit: (next: string) => void; maxLength?: number };

export function LazyTextArea({ value, onCommit, onBlur, maxLength, ...rest }: LazyTextAreaProps) {
  const { local, change, flush } = useLazy(value, onCommit);
  return (
    <Input.TextArea
      {...rest}
      value={local}
      onChange={(event) => change(maxLength ? event.target.value.slice(0, maxLength) : event.target.value)}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}
