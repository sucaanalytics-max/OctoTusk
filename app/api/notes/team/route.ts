import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTeamEmails } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/notes/team — the @tuskinvest.com team allowlist for the "share with" picker.
 * Auth-gated. Returns only emails already seeded in user_roles (same allowlist that
 * @mention resolution uses), so this exposes nothing a signed-in user can't already infer.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const emails = Array.from(await getTeamEmails()).sort();
    return NextResponse.json({ emails });
  } catch (error: unknown) {
    console.error("[/api/notes/team]", error instanceof Error ? error.message : error);
    return NextResponse.json({ emails: [] }, { status: 500 });
  }
}
