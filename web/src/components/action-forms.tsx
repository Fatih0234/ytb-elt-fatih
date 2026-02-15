"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActionResult } from "@/app/(authed)/actions";

export function InlineResult({
  result,
  okText = "Saved.",
}: {
  result: ActionResult | null;
  okText?: string;
}) {
  if (!result) return null;
  if (result.ok) {
    return (
      <div className="mt-2 text-xs" style={{ color: "rgba(16, 185, 129, 0.92)" }}>
        {okText}
      </div>
    );
  }
  return (
    <div className="mt-2 text-xs" style={{ color: "rgba(248, 113, 113, 0.92)" }}>
      {result.message}
    </div>
  );
}

export function TrackHandleForm({
  action,
  placeholder = "@MrBeast",
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  placeholder?: string;
}) {
  const [result, formAction] = useActionState<ActionResult, FormData>(action, {
    ok: true,
  });
  const [value, setValue] = useState("");

  // Reset transient state after a short delay, but only after successful submit.
  useEffect(() => {
    if (!result.ok) return;
    const t = setTimeout(() => setValue(""), 600);
    return () => clearTimeout(t);
  }, [result.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          name="handle"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
          style={{
            borderColor: "var(--line)",
            background: "color-mix(in oklab, var(--panel) 85%, transparent)",
          }}
        />
        <button className="btn btn--primary whitespace-nowrap" type="submit">
          Add
        </button>
      </div>
      <InlineResult
        result={result.ok ? null : result}
        okText="Added."
      />
    </form>
  );
}

export function SmallActionForm({
  action,
  children,
  okText,
  className,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  okText: string;
  className?: string;
}) {
  const [result, formAction] = useActionState<ActionResult, FormData>(action, {
    ok: true,
  });
  const [submitted, setSubmitted] = useState(false);

  // Hide success quickly (so it doesn't linger in layouts).
  useEffect(() => {
    if (!submitted) return;
    if (!result.ok) return;
    const t = setTimeout(() => setSubmitted(false), 1400);
    return () => clearTimeout(t);
  }, [submitted, result.ok]);

  return (
    <div className={className}>
      <form
        action={formAction}
        onSubmitCapture={() => setSubmitted(true)}
      >
        {children}
      </form>
      {submitted ? <InlineResult result={result} okText={okText} /> : null}
    </div>
  );
}
