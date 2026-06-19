import { auth } from "@/auth";
import { redirect } from "next/navigation";
import MShell from "./MShell";
import "./m.css";

export const dynamic = "force-dynamic";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Self-gate: the middleware matcher does NOT enforce page auth (see CLAUDE.md).
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect("/");
  }
  if (!session?.user) redirect("/");

  // OLED-dark default for the mobile app, set SERVER-SIDE (no inline script → CSP stays
  // strict, no FOUC). `[data-theme="dark"]` is a bare attribute selector in globals.css,
  // so the dark tokens cascade to this subtree without touching the root <html>/desktop.
  return (
    <div data-mroot data-theme="dark" className="m-root">
      <MShell>{children}</MShell>
    </div>
  );
}
