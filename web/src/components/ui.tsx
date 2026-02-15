import Link from "next/link";

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-3xl border px-5 py-5 sm:px-6 sm:py-6"
      style={{ borderColor: "var(--line)", background: "var(--panel)" }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-[color:var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const style =
    tone === "good"
      ? {
          background: "rgba(16, 185, 129, 0.12)",
          borderColor: "rgba(16, 185, 129, 0.25)",
          color: "color-mix(in oklab, var(--fg) 92%, #10b981)",
        }
      : tone === "warn"
        ? {
            background: "rgba(245, 158, 11, 0.12)",
            borderColor: "rgba(245, 158, 11, 0.25)",
            color: "color-mix(in oklab, var(--fg) 92%, #f59e0b)",
          }
        : {
            background: "color-mix(in oklab, var(--panel) 92%, transparent)",
            borderColor: "var(--line)",
            color: "var(--muted)",
          };

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={style}
    >
      {children}
    </span>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12px]">{children}</span>;
}

export function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-sm transition"
      style={{
        background: active
          ? "color-mix(in oklab, var(--accent) 15%, transparent)"
          : "transparent",
        border: active ? `1px solid ${"color-mix(in oklab, var(--accent) 30%, var(--line))"}` : "1px solid transparent",
        color: active ? "var(--fg)" : "var(--muted)",
      }}
    >
      {children}
    </Link>
  );
}
