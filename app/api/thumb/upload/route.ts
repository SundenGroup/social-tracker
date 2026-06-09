import { NextResponse } from "next/server";
import { writeCached } from "@/lib/thumbnails";

// POST /api/thumb/upload — accept thumbnail bytes captured from a
// residential IP (the Mac backfill) and persist them permanently. Used
// for Instagram, whose CDN 403s the droplet so the proxy can't fetch
// directly. Auth: same bearer token as /api/sync/ingest.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET_TOKEN || token !== process.env.CRON_SECRET_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
    if (!id || !dataBase64) {
      return NextResponse.json({ error: "id and dataBase64 required" }, { status: 400 });
    }
    const buf = Buffer.from(dataBase64, "base64");
    if (buf.length === 0) {
      return NextResponse.json({ error: "empty image" }, { status: 400 });
    }
    await writeCached(id, buf);
    return NextResponse.json({ status: "ok", id, bytes: buf.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to store thumbnail: ${err instanceof Error ? err.message : err}` },
      { status: 500 }
    );
  }
}
