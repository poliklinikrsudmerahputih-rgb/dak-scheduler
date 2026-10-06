import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { getSopRuangan } from "@/lib/sop";
import { daftarKlinikSop } from "@/lib/sop-constants";

export const dynamic = "force-dynamic";

function validateSop(body) {
  const no_sop = typeof body?.no_sop === "string" ? body.no_sop.trim() : "";
  const judul_prosedur = typeof body?.judul_prosedur === "string"
    ? body.judul_prosedur.trim()
    : "";
  const link_gdrive = typeof body?.link_gdrive === "string" ? body.link_gdrive.trim() : "";
  const klinik = typeof body?.klinik === "string" ? body.klinik.trim() : "";
  const tanggal_pembuatan = typeof body?.tanggal_pembuatan === "string"
    ? body.tanggal_pembuatan.trim()
    : "";
  const tanggal_pengesahan = typeof body?.tanggal_pengesahan === "string"
    ? body.tanggal_pengesahan.trim()
    : "";

  if (!no_sop || no_sop.length > 100) {
    return { error: "No. SOP wajib diisi dan maksimal 100 karakter." };
  }
  if (!judul_prosedur || judul_prosedur.length > 255) {
    return { error: "Judul prosedur wajib diisi dan maksimal 255 karakter." };
  }
  if (!daftarKlinikSop.includes(klinik)) {
    return { error: "Klinik SOP harus dipilih dari daftar yang tersedia." };
  }
  const isValidDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (tanggal_pembuatan && !isValidDate(tanggal_pembuatan)) {
    return { error: "Tanggal pembuatan harus valid." };
  }
  if (tanggal_pengesahan && !isValidDate(tanggal_pengesahan)) {
    return { error: "Tanggal pengesahan harus valid." };
  }
  if (tanggal_pembuatan && tanggal_pengesahan && tanggal_pengesahan < tanggal_pembuatan) {
    return { error: "Tanggal pengesahan tidak boleh sebelum tanggal pembuatan." };
  }

  if (link_gdrive) {
    try {
      const url = new URL(link_gdrive);
      if (url.protocol !== "https:") throw new Error("Invalid protocol");
    } catch {
      return { error: "Link dokumen harus berupa URL HTTPS yang valid." };
    }
  }

  return {
    value: {
      no_sop,
      judul_prosedur,
      link_gdrive,
      klinik,
      tanggal_pembuatan,
      tanggal_pengesahan,
    },
  };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request, { params }) {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak ditemukan atau tidak valid." }, { status: 401 });
    }

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (!id) return NextResponse.json({ error: "ID SOP tidak valid." }, { status: 400 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
    }

    const validated = validateSop(body);
    if (validated.error) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const {
      no_sop,
      judul_prosedur,
      link_gdrive,
      klinik,
      tanggal_pembuatan,
      tanggal_pengesahan,
    } = validated.value;
    const result = await turso.execute({
      sql: `UPDATE sop
            SET no_sop = ?, judul_prosedur = ?, link_gdrive = ?, klinik = ?,
                tanggal_pembuatan = NULLIF(?, ''),
                tanggal_pengesahan = NULLIF(?, ''),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [
        no_sop,
        judul_prosedur,
        link_gdrive,
        klinik,
        tanggal_pembuatan,
        tanggal_pengesahan,
        id,
        ruangan,
      ],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "SOP tidak ditemukan di ruangan Anda." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gagal memperbarui SOP:", error);
    return NextResponse.json({ error: "Gagal memperbarui data SOP." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak ditemukan atau tidak valid." }, { status: 401 });
    }

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (!id) return NextResponse.json({ error: "ID SOP tidak valid." }, { status: 400 });

    const result = await turso.execute({
      sql: "DELETE FROM sop WHERE id = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [id, ruangan],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "SOP tidak ditemukan di ruangan Anda." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gagal menghapus SOP:", error);
    return NextResponse.json(
      {
        error: "Gagal menghapus data SOP.",
        details: error instanceof Error ? error.message : "Terjadi kesalahan database yang tidak diketahui.",
      },
      { status: 500 }
    );
  }
}
