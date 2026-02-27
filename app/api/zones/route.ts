import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── OneDrive coordinates (same as sync route) ──
const DRIVE_ID =
  "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";
const VF_FOLDER_ID = "01XUUXNQYRQ7B5PBRKMZGLUVNKA5K5MXY5";
const ZONE_FILE_NAME = "octotusk_zone_snapshot.json";

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Graph API credentials");
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Graph token error: ${data.error_description || data.error || "unknown"}`);
  }
  return data.access_token;
}

/**
 * GET /api/zones — Read zone snapshot from OneDrive
 */
export async function GET() {
  try {
    const token = await getGraphToken();

    // Try to read the zone snapshot file
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID}:/${ZONE_FILE_NAME}:/content`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // File doesn't exist yet — return empty
      return NextResponse.json({ zones: {}, updatedAt: null });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/zones GET] Error:", message);
    return NextResponse.json({ zones: {}, updatedAt: null, error: message });
  }
}

/**
 * POST /api/zones — Save zone snapshot to OneDrive
 */
export async function POST(request: Request) {
  try {
    const token = await getGraphToken();
    const body = await request.json();

    const snapshot = {
      zones: body.zones || {},
      updatedAt: new Date().toISOString(),
    };

    // Write zone snapshot file to OneDrive (create or overwrite)
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VF_FOLDER_ID}:/${ZONE_FILE_NAME}:/content`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to save zone snapshot: ${res.status} ${err}`);
    }

    return NextResponse.json({ ok: true, updatedAt: snapshot.updatedAt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/zones POST] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
