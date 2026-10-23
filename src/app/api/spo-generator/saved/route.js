import { NextResponse } from "next/server";
import { getSopRuangan } from "@/lib/sop";
import {
  listSavedSopDocuments,
  saveSopArchive,
  syncArchivedSopDocuments,
} from "@/lib/spo-generator-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    await syncArchivedSopDocuments(ruangan);
    const documents = await listSavedSopDocuments(ruangan);
    return NextResponse.json({ success: true, documents });
  } catch (error) {
    console.error("SPO Generator saved documents load failed:", error);
    return NextResponse.json(
      { error: "Gagal memuat arsip SPO dari database." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    const body = await request.json();
    const judul_sop = typeof body?.judul_sop === "string" ? body.judul_sop.trim() : "";
    const no_sop = typeof body?.no_sop === "string" ? body.no_sop.trim() : "";
    const html_content = typeof body?.html_content === "string" ? body.html_content : "";
    const data = body?.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data
      : {};
    if (!judul_sop || judul_sop.length > 255 || no_sop.length > 100 || !html_content.trim()) {
      return NextResponse.json({ error: "Judul dan isi SPO wajib diisi sebelum disimpan." }, { status: 400 });
    }
    if (html_content.length > 1_500_000) {
      return NextResponse.json({ error: "Ukuran isi dokumen terlalu besar untuk disimpan." }, { status: 413 });
    }

    const saved = await saveSopArchive({
      ruangan,
      no_sop,
      judul_sop,
      source_type: "manual",
      data,
      html_content,
      klinik: body?.klinik,
    });
    return NextResponse.json(
      { success: true, id: saved.id, no_sop: saved.no_sop },
      { status: 201 }
    );
  } catch (error) {
    console.error("SPO Generator manual document save failed:", error);
    return NextResponse.json({ error: "Gagal menyimpan SPO ke arsip Turso." }, { status: 500 });
  }
}
