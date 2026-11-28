import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const ALASAN_PERGANTIAN = new Set([
  "Sakit",
  "Izin Kedukaan",
  "Cuti Mendadak",
  "Tugas Luar",
  "Lainnya",
]);

const getSessionUser = async () => {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_dak_pro");
  const user = parseSessionValue(session);
  const ruangan = String(user?.ruangan || "").trim();
  return user && ruangan ? { ...user, ruangan } : null;
};

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const getRange = (searchParams) => {
  const tanggal = String(searchParams.get("tanggal") || "").trim();
  if (tanggal && isValidDate(tanggal)) return [tanggal, tanggal];

  const bulan = Number(searchParams.get("bulan"));
  const tahun = Number(searchParams.get("tahun"));
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun)) {
    return null;
  }

  const start = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(tahun, bulan, 0)).toISOString().slice(0, 10);
  return [start, end];
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await getSessionUser();
    const ruangan = user?.ruangan || String(searchParams.get("ruangan") || "POLIKLINIK").trim();
    const range = getRange(searchParams);
    if (!range || !ruangan) {
      return NextResponse.json({ error: "Filter tanggal dan ruangan tidak valid." }, { status: 400 });
    }

    const result = await turso.execute({
      sql: `SELECT id, ruangan, tanggal, dokter_id, nama_dokter, klinik,
                   asisten_awal_id, asisten_awal_nama, asisten_pengganti_id,
                   asisten_pengganti_nama, alasan_pergantian, catatan_pergantian
            FROM pergantian_asisten_dokter
            WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND tanggal BETWEEN ? AND ?
            ORDER BY tanggal, klinik, nama_dokter`,
      args: [ruangan, range[0], range[1]],
    });

    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/pergantian-asisten gagal:", error);
    return NextResponse.json({ error: "Data pergantian asisten gagal dimuat." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const tanggal = String(body.tanggal || "").trim();
    const dokterId = Number(body.dokter_id);
    const asistenAwalId = Number(body.asisten_awal_id);
    const asistenPenggantiId = Number(body.asisten_pengganti_id);
    const alasan = String(body.alasan_pergantian || "").trim();
    const catatan = String(body.catatan_pergantian || "").trim();

    if (
      !isValidDate(tanggal)
      || !Number.isInteger(dokterId)
      || !Number.isInteger(asistenAwalId)
      || !Number.isInteger(asistenPenggantiId)
      || asistenAwalId === asistenPenggantiId
      || !ALASAN_PERGANTIAN.has(alasan)
    ) {
      return NextResponse.json({ error: "Data pergantian asisten tidak valid." }, { status: 400 });
    }

    const [doctorResult, originalResult, replacementResult] = await Promise.all([
      turso.execute({
        sql: `SELECT id, nama_dokter, klinik, simbol_praktik
              FROM master_dokter
              WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
        args: [dokterId, user.ruangan],
      }),
      turso.execute({
        sql: `SELECT id, nama FROM sdm
              WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
        args: [asistenAwalId, user.ruangan],
      }),
      turso.execute({
        sql: `SELECT id, nama, is_aktif FROM sdm
              WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
        args: [asistenPenggantiId, user.ruangan],
      }),
    ]);

    const doctor = doctorResult.rows[0];
    const original = originalResult.rows[0];
    const replacement = replacementResult.rows[0];
    if (!doctor || !original || !replacement) {
      return NextResponse.json({ error: "Dokter atau SDM tidak ditemukan pada ruangan sesi." }, { status: 400 });
    }
    const replacementIsActive = replacement.is_aktif === 1
      || replacement.is_aktif === "1"
      || replacement.is_aktif === true;
    if (!replacementIsActive) {
      return NextResponse.json({ error: "Asisten pengganti harus merupakan SDM aktif." }, { status: 400 });
    }

    const [year, month, day] = tanggal.split("-").map(Number);
    const scheduledOriginal = await turso.execute({
      sql: `SELECT id FROM jadwal_dinas
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?
              AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
            LIMIT 1`,
      args: [asistenAwalId, day, month, year, user.ruangan],
    });
    if (scheduledOriginal.rows.length === 0) {
      return NextResponse.json({ error: "Asisten awal tidak memiliki catatan jadwal pada tanggal tersebut." }, { status: 400 });
    }

    const result = {
      ruangan: user.ruangan,
      tanggal,
      dokter_id: doctor.id,
      nama_dokter: doctor.nama_dokter,
      klinik: doctor.klinik,
      asisten_awal_id: original.id,
      asisten_awal_nama: original.nama,
      asisten_pengganti_id: replacement.id,
      asisten_pengganti_nama: replacement.nama,
      alasan_pergantian: alasan,
      catatan_pergantian: catatan || null,
    };

    await turso.batch([
      {
        sql: `DELETE FROM pergantian_asisten_dokter
              WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
                AND tanggal = ? AND dokter_id = ?`,
        args: [user.ruangan, tanggal, dokter.id],
      },
      {
        sql: `INSERT INTO pergantian_asisten_dokter (
                ruangan, tanggal, dokter_id, nama_dokter, klinik,
                asisten_awal_id, asisten_awal_nama, asisten_pengganti_id,
                asisten_pengganti_nama, alasan_pergantian, catatan_pergantian, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          result.ruangan,
          result.tanggal,
          result.dokter_id,
          result.nama_dokter,
          result.klinik,
          result.asisten_awal_id,
          result.asisten_awal_nama,
          result.asisten_pengganti_id,
          result.asisten_pengganti_nama,
          result.alasan_pergantian,
          result.catatan_pergantian,
          user.id || null,
        ],
      },
    ], "write");

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("POST /api/pergantian-asisten gagal:", error);
    return NextResponse.json({ error: "Pergantian asisten gagal disimpan." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const tanggal = String(body.tanggal || "").trim();
    const dokterId = Number(body.dokter_id);
    if (!isValidDate(tanggal) || !Number.isInteger(dokterId)) {
      return NextResponse.json({ error: "Tanggal atau dokter tidak valid." }, { status: 400 });
    }

    await turso.execute({
      sql: `DELETE FROM pergantian_asisten_dokter
            WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND tanggal = ? AND dokter_id = ?`,
      args: [user.ruangan, tanggal, dokterId],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/pergantian-asisten gagal:", error);
    return NextResponse.json({ error: "Pergantian asisten gagal dihapus." }, { status: 500 });
  }
}
