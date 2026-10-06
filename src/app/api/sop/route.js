import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { getSopRuangan } from "@/lib/sop";
import { daftarKlinikSop } from "@/lib/sop-constants";

export const dynamic = "force-dynamic";

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateLink(value) {
  const link_gdrive = typeof value === "string" ? value.trim() : "";
  if (!link_gdrive) return { value: "" };

  try {
    const url = new URL(link_gdrive);
    if (url.protocol !== "https:") throw new Error("Invalid protocol");
  } catch {
    return { error: "Link dokumen harus berupa URL HTTPS yang valid." };
  }
  return { value: link_gdrive };
}

async function createGeneratedSop(body, ruangan) {
  const judul_sop = typeof body?.judul_sop === "string" ? body.judul_sop.trim() : "";
  const requestedRuangan = typeof body?.ruangan === "string"
    ? body.ruangan.trim().toUpperCase()
    : "";
  const klinik = typeof body?.klinik === "string" ? body.klinik.trim() : "";
  const tanggal_pembuatan = body?.tanggal_pembuatan;
  const tanggal_pengesahan = body?.tanggal_pengesahan;
  const link = validateLink(body?.link_gdrive);

  if (!judul_sop || judul_sop.length > 255) {
    return { error: "Judul SOP wajib diisi dan maksimal 255 karakter.", status: 400 };
  }
  if (!requestedRuangan || requestedRuangan !== ruangan) {
    return { error: "Ruangan SOP harus sesuai dengan ruangan pada sesi Anda.", status: 403 };
  }
  if (!daftarKlinikSop.includes(klinik)) {
    return { error: "Klinik SOP harus dipilih dari daftar yang tersedia.", status: 400 };
  }
  if (!isValidDate(tanggal_pembuatan) || !isValidDate(tanggal_pengesahan)) {
    return { error: "Tanggal pembuatan dan pengesahan harus valid.", status: 400 };
  }
  if (tanggal_pengesahan < tanggal_pembuatan) {
    return { error: "Tanggal pengesahan tidak boleh sebelum tanggal pembuatan.", status: 400 };
  }
  if (link.error) return { error: link.error, status: 400 };

  const tahun = tanggal_pembuatan.slice(0, 4);
  const transaction = await turso.transaction("write");
  try {
    const existing = await transaction.execute({
      sql: `SELECT no_sop FROM sop
            WHERE UPPER(TRIM(ruangan)) = ? AND no_sop LIKE ?`,
      args: [ruangan, `%/${tahun}`],
    });

    const nomorUrutTerakhir = existing.rows.reduce((max, row) => {
      const match = String(row.no_sop || "").match(new RegExp(`^IRJA/(\\d+)/${tahun}$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const nomor_sop = `IRJA/${String(nomorUrutTerakhir + 1).padStart(2, "0")}/${tahun}`;

    await transaction.execute({
      sql: `INSERT INTO sop
              (no_sop, judul_prosedur, link_gdrive, ruangan, klinik, tanggal_pembuatan, tanggal_pengesahan)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nomor_sop,
        judul_sop,
        link.value,
        ruangan,
        klinik,
        tanggal_pembuatan,
        tanggal_pengesahan,
      ],
    });
    await transaction.commit();
    return {
      success: true,
      message: "SOP Berhasil didaftarkan",
      data: { nomor_sop },
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function GET() {
  try {
    const ruangan = await getSopRuangan(true);
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    const result = await turso.execute({
      sql: `SELECT id, no_sop, judul_prosedur, link_gdrive, ruangan, klinik,
                   tanggal_pembuatan, tanggal_pengesahan
            FROM sop
            WHERE UPPER(TRIM(ruangan)) = ?
            ORDER BY no_sop COLLATE NOCASE ASC, id ASC`,
      args: [ruangan],
    });
    return NextResponse.json(result.rows || []);
  } catch (error) {
    console.error("Gagal mengambil daftar SOP:", error);
    return NextResponse.json({ error: "Gagal mengambil daftar SOP." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const ruangan = await getSopRuangan();
    if (!ruangan) {
      return NextResponse.json({ error: "Sesi tidak ditemukan atau tidak valid." }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
    }

    if (body?.judul_sop !== undefined) {
      const result = await createGeneratedSop(body, ruangan);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json(result, { status: 201 });
    }

    const no_sop = typeof body?.no_sop === "string" ? body.no_sop.trim() : "";
    const judul_prosedur = typeof body?.judul_prosedur === "string"
      ? body.judul_prosedur.trim()
      : "";
    const link = validateLink(body?.link_gdrive);
    if (!no_sop || no_sop.length > 100) {
      return NextResponse.json({ error: "No. SOP wajib diisi dan maksimal 100 karakter." }, { status: 400 });
    }
    if (!judul_prosedur || judul_prosedur.length > 255) {
      return NextResponse.json({ error: "Judul prosedur wajib diisi dan maksimal 255 karakter." }, { status: 400 });
    }
    if (link.error) {
      return NextResponse.json({ error: link.error }, { status: 400 });
    }
    const result = await turso.execute({
      sql: `INSERT INTO sop (no_sop, judul_prosedur, link_gdrive, ruangan, klinik)
            VALUES (?, ?, ?, ?, ?)`,
      args: [no_sop, judul_prosedur, link.value, ruangan, body?.klinik || null],
    });
    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid) }, { status: 201 });
  } catch (error) {
    console.error("Gagal menambahkan SOP:", error);
    return NextResponse.json({ error: "Gagal menambahkan data SOP." }, { status: 500 });
  }
}
