import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isWebPushConfigured, sendPushToUser } from "@/lib/webpush";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/test — send a test push to the authenticated user's own devices.
 * Used to verify the end-to-end push pipeline on a real device.
 */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isWebPushConfigured()) {
    return NextResponse.json({ ok: false, error: "Web push not configured" }, { status: 503 });
  }

  const result = await sendPushToUser(email, {
    title: "OctoTusk",
    body: "Push notifications are working ✔",
    url: "/dashboard",
    tag: "octotusk-test",
  });
  return NextResponse.json({ ok: true, ...result });
}
