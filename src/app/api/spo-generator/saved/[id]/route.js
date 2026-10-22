import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { getSopRuangan } from "@/lib/sop";
import { ensureSpoGeneratorStorage, getSavedSopDocument } from "@/lib/spo-generator-storage";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    const { id } = await params;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "ID arsip SPO tidak valid." }, { status: 400 });
    }
    const document = await getSavedSopDocument(id, ruangan);
    if (!document) {
      return NextResponse.json({ error: "Arsip SPO tidak ditemukan di ruangan Anda." }, { status: 404 });
    }
    return NextResponse.json({ success: true, document });
  } catch (error) {
    console.error("SPO Generator document load failed:", error);
    return NextResponse.json({ error: "Gagal memuat SPO dari arsip Turso." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    const { id } = await params;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "ID arsip SPO tidak valid." }, { status: 400 });
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

    await ensureSpoGeneratorStorage();
    const result = await turso.execute({
      sql: `UPDATE spo_generator_documents
            SET no_sop = ?, judul_sop = ?, content_json = ?, html_content = ?
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [no_sop, judul_sop, JSON.stringify(data), html_content, id, ruangan],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Arsip SPO tidak ditemukan di ruangan Anda." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SPO Generator document update failed:", error);
    return NextResponse.json({ error: "Gagal menyimpan perubahan SPO ke Turso." }, { status: 500 });
  }
}
