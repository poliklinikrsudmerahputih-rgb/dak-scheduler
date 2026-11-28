import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "session_dak_pro";

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getRequestSession() {
  const cookie = (await cookies()).get(SESSION_COOKIE);
  if (!cookie) return { cookie: null, user: null };
  return { cookie, user: parseSessionValue(cookie) };
}

function getSessionRoom(user) {
  return typeof user?.ruangan === "string" ? user.ruangan.trim().toUpperCase() : "";
}

function getMonthRange(searchParams) {
  const date = searchParams.get("tanggal");
  if (date) {
    if (!isValidDate(date)) return null;
    return { start: date, end: date };
  }

  const month = Number(searchParams.get("bulan"));
  const year = Number(searchParams.get("tahun"));
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) {
    return null;
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

export async function GET(request) {
  try {
    const { cookie, user } = await getRequestSession();
    const sessionRoom = getSessionRoom(user);
    if (cookie && !sessionRoom) {
      return NextResponse.json({ success: false, error: "Sesi tidak valid." }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const ruangan = sessionRoom || String(params.get("ruangan") || "").trim().toUpperCase();
    const range = getMonthRange(params);
    if (!ruangan || !range) {
      return NextResponse.json({ success: false, error: "Ruangan dan tanggal/periode yang valid wajib diisi." }, { status: 400 });
    }

    const includePending = Boolean(sessionRoom) && params.get("includePending") === "true";
    const status = includePending ? "Menunggu" : "Disetujui";
    const result = await turso.execute({
      sql: `SELECT
              p.id, p.ruangan, p.tanggal, p.sdm_a_id, p.sdm_a_nama,
              p.sdm_b_id, p.sdm_b_nama, p.simbol_a, p.simbol_b,
              p.keterangan, p.status, p.created_at,
              a.nama AS nama_sdm_a_terkini, b.nama AS nama_sdm_b_terkini
            FROM permohonan_tukar_jadwal p
            LEFT JOIN sdm a ON a.id = p.sdm_a_id
              AND UPPER(TRIM(a.ruangan)) = UPPER(TRIM(?))
            LEFT JOIN sdm b ON b.id = p.sdm_b_id
              AND UPPER(TRIM(b.ruangan)) = UPPER(TRIM(?))
            WHERE UPPER(TRIM(p.ruangan)) = UPPER(TRIM(?))
              AND p.tanggal BETWEEN ? AND ?
              AND p.status = ?
            ORDER BY p.tanggal DESC, p.created_at DESC`,
      args: [ruangan, ruangan, ruangan, range.start, range.end, status],
    });

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Gagal memuat permohonan tukar jadwal:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat informasi tukar jadwal." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { cookie, user } = await getRequestSession();
    if (cookie && !getSessionRoom(user)) {
      return NextResponse.json({ success: false, error: "Sesi tidak valid." }, { status: 401 });
    }

    const body = await request.json();
    const sdmAId = Number(body?.sdmA);
    const sdmBId = Number(body?.sdmB);
    const tanggal = typeof body?.tanggal === "string" ? body.tanggal.trim() : "";
    const keterangan = typeof body?.keterangan === "string" ? body.keterangan.trim() : "";
    const ruangan = getSessionRoom(user)
      || String(request.nextUrl.searchParams.get("ruangan") || "").trim().toUpperCase();

    if (!ruangan) {
      return NextResponse.json({ success: false, error: "Ruangan jadwal tidak ditemukan." }, { status: 400 });
    }
    if (!Number.isSafeInteger(sdmAId) || !Number.isSafeInteger(sdmBId) || sdmAId === sdmBId) {
      return NextResponse.json({ success: false, error: "Pilih dua SDM yang berbeda." }, { status: 400 });
    }
    if (!isValidDate(tanggal)) {
      return NextResponse.json({ success: false, error: "Tanggal jadwal tidak valid." }, { status: 400 });
    }
    if (!keterangan || keterangan.length > 500) {
      return NextResponse.json({ success: false, error: "Keterangan wajib diisi, maksimal 500 karakter." }, { status: 400 });
    }

    const [year, month, day] = tanggal.split("-").map(Number);
    const staffResult = await turso.execute({
      sql: `SELECT id, nama FROM sdm
            WHERE id IN (?, ?)
              AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND is_aktif = 1`,
      args: [sdmAId, sdmBId, ruangan],
    });
    if (staffResult.rows.length !== 2) {
      return NextResponse.json({ success: false, error: "Kedua SDM harus aktif dan berasal dari ruangan yang sama." }, { status: 400 });
    }

    const scheduleResult = await turso.execute({
      sql: `SELECT sdm_id, simbol, jumlah_pasien FROM jadwal_dinas
            WHERE sdm_id IN (?, ?)
              AND tanggal = ? AND bulan = ? AND tahun = ?
              AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
      args: [sdmAId, sdmBId, day, month, year, ruangan],
    });
    if (scheduleResult.rows.length !== 2) {
      return NextResponse.json({ success: false, error: "Kedua SDM harus memiliki jadwal pada tanggal yang dipilih." }, { status: 400 });
    }

    const staffById = new Map(staffResult.rows.map((row) => [Number(row.id), row]));
    const scheduleById = new Map(scheduleResult.rows.map((row) => [Number(row.sdm_id), row]));
    const staffA = staffById.get(sdmAId);
    const staffB = staffById.get(sdmBId);
    const scheduleA = scheduleById.get(sdmAId);
    const scheduleB = scheduleById.get(sdmBId);
    if (!staffA || !staffB || !scheduleA || !scheduleB) {
      return NextResponse.json({ success: false, error: "Data jadwal kedua SDM tidak lengkap." }, { status: 400 });
    }

    const pending = await turso.execute({
      sql: `SELECT id FROM permohonan_tukar_jadwal
            WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND tanggal = ? AND status = 'Menunggu'
              AND ((sdm_a_id = ? AND sdm_b_id = ?) OR (sdm_a_id = ? AND sdm_b_id = ?))
            LIMIT 1`,
      args: [ruangan, tanggal, sdmAId, sdmBId, sdmBId, sdmAId],
    });
    if (pending.rows.length) {
      return NextResponse.json({ success: false, error: "Permohonan untuk pasangan SDM dan tanggal ini masih menunggu persetujuan." }, { status: 409 });
    }

    const inserted = await turso.execute({
      sql: `INSERT INTO permohonan_tukar_jadwal
              (ruangan, tanggal, sdm_a_id, sdm_a_nama, sdm_b_id, sdm_b_nama,
               simbol_a, simbol_b, keterangan, dimohon_oleh_sdm_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ruangan,
        tanggal,
        sdmAId,
        staffA.nama,
        sdmBId,
        staffB.nama,
        scheduleA.simbol,
        scheduleB.simbol,
        keterangan,
        sdmAId,
      ],
    });

    return NextResponse.json({
      success: true,
      message: "Permohonan tukar jadwal dikirim dan menunggu persetujuan koordinator.",
      data: { id: Number(inserted.lastInsertRowid), status: "Menunggu" },
    }, { status: 201 });
  } catch (error) {
    console.error("Gagal mengajukan tukar jadwal:", error);
    if (String(error?.message || "").toLowerCase().includes("unique constraint")) {
      return NextResponse.json({
        success: false,
        error: "Permohonan untuk pasangan SDM dan tanggal ini masih menunggu persetujuan.",
      }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Permohonan tukar jadwal gagal disimpan." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { cookie, user } = await getRequestSession();
  const ruangan = getSessionRoom(user);
  if (!cookie || !ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const decision = body?.decision;
  if (!Number.isSafeInteger(id) || id < 1 || !["approve", "reject"].includes(decision)) {
    return NextResponse.json({ success: false, error: "Permintaan keputusan tidak valid." }, { status: 400 });
  }

  const transaction = await turso.transaction("write");
  try {
    const requestResult = await transaction.execute({
      sql: `SELECT * FROM permohonan_tukar_jadwal
            WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND status = 'Menunggu'`,
      args: [id, ruangan],
    });
    const swapRequest = requestResult.rows[0];
    if (!swapRequest) {
      await transaction.rollback();
      return NextResponse.json({ success: false, error: "Permohonan tidak ditemukan atau sudah diproses." }, { status: 404 });
    }

    if (decision === "reject") {
      await transaction.execute({
        sql: `UPDATE permohonan_tukar_jadwal
              SET status = 'Ditolak', diproses_oleh = ?, diproses_pada = CURRENT_TIMESTAMP
              WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
                AND status = 'Menunggu'`,
        args: [user.id || null, id, ruangan],
      });
      await transaction.commit();
      return NextResponse.json({ success: true, message: "Permohonan tukar jadwal ditolak." });
    }

    const [year, month, day] = String(swapRequest.tanggal).split("-").map(Number);
    const scheduleResult = await transaction.execute({
      sql: `SELECT sdm_id, simbol, jumlah_pasien FROM jadwal_dinas
            WHERE sdm_id IN (?, ?)
              AND tanggal = ? AND bulan = ? AND tahun = ?
              AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
      args: [swapRequest.sdm_a_id, swapRequest.sdm_b_id, day, month, year, ruangan],
    });
    const currentSchedule = new Map(scheduleResult.rows.map((row) => [Number(row.sdm_id), row]));
    const currentA = currentSchedule.get(Number(swapRequest.sdm_a_id));
    const currentB = currentSchedule.get(Number(swapRequest.sdm_b_id));
    if (
      scheduleResult.rows.length !== 2
      || !currentA
      || !currentB
      || String(currentA.simbol ?? "") !== String(swapRequest.simbol_a ?? "")
      || String(currentB.simbol ?? "") !== String(swapRequest.simbol_b ?? "")
    ) {
      await transaction.rollback();
      return NextResponse.json({
        success: false,
        error: "Jadwal telah berubah sejak permohonan dibuat. Muat ulang jadwal dan periksa sebelum menyetujui.",
      }, { status: 409 });
    }

    await transaction.execute({
      sql: `UPDATE jadwal_dinas
            SET simbol = ?, jumlah_pasien = ?
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?
              AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND simbol IS ?`,
      args: [currentB.simbol, currentB.jumlah_pasien, swapRequest.sdm_a_id, day, month, year, ruangan, currentA.simbol],
    });
    await transaction.execute({
      sql: `UPDATE jadwal_dinas
            SET simbol = ?, jumlah_pasien = ?
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?
              AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND simbol IS ?`,
      args: [currentA.simbol, currentA.jumlah_pasien, swapRequest.sdm_b_id, day, month, year, ruangan, currentB.simbol],
    });
    await transaction.execute({
      sql: `UPDATE permohonan_tukar_jadwal
            SET status = 'Disetujui', diproses_oleh = ?, diproses_pada = CURRENT_TIMESTAMP
            WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND status = 'Menunggu'`,
      args: [user.id || null, id, ruangan],
    });
    await transaction.commit();

    return NextResponse.json({ success: true, message: "Permohonan disetujui dan jadwal kedua SDM telah ditukar." });
  } catch (error) {
    await transaction.rollback();
    console.error("Gagal memproses permohonan tukar jadwal:", error);
    return NextResponse.json({ success: false, error: "Gagal memproses permohonan tukar jadwal." }, { status: 500 });
  }
}
