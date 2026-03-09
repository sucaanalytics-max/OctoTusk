import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const DRIVE_ID =
  process.env.GRAPH_DRIVE_ID ||
  "b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH";

async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.GRAPH_CLIENT_ID!,
        client_secret: process.env.GRAPH_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${data.error_description || data.error}`);
  return data.access_token;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await getGraphToken();

    // 1. Try resolving the sharing link
    const shareUrl = "https://tuskinvest-my.sharepoint.com/:f:/p/tuskinvest/IgARh8PXhipmTLpVqgdV1l8dAeOejexWiVL1xWoNNokBPfg?e=JGNrx6";
    const encoded = "u!" + Buffer.from(shareUrl).toString("base64url");
    const shareRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,name,parentReference,webUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const shareData = await shareRes.json();

    // 2. List root folders of the drive
    const rootRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root/children?$top=50&$select=id,name,folder,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rootData = await rootRes.json();

    // 3. If share resolved, try listing its children
    let folderChildren = null;
    if (shareData.id) {
      const driveId = shareData.parentReference?.driveId || DRIVE_ID;
      const childRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${shareData.id}/children?$top=10&$select=id,name,file,size`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      folderChildren = await childRes.json();
    }

    return NextResponse.json({
      share_resolution: shareData,
      drive_root_items: rootData.value?.map((i: Record<string, unknown>) => ({
        id: i.id,
        name: i.name,
        isFolder: !!i.folder,
      })) || rootData,
      folder_children_sample: folderChildren?.value?.slice(0, 5)?.map((i: Record<string, unknown>) => ({
        id: i.id,
        name: i.name,
      })) || folderChildren,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
