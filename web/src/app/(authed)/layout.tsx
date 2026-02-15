import { ensureUserSetup } from "@/lib/core";
import { redirect } from "next/navigation";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await ensureUserSetup();
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : String(e);
    if (msg === "not_authenticated") {
      redirect("/");
    }
    throw e;
  }

  return <>{children}</>;
}
