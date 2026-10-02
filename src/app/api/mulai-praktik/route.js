import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const getTanggalJakarta = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getJamJakarta = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.hour}:${values.minute}`;
};

const getJamJadwalMaster = (jamPraktik) => {
  const match = String(jamPraktik || "").match(/(?:^|\D)(\d{1,2})[:.](\d{2})/);
  if (!match) return "08:00";

  const jam = Number(match[1]);
  const menit = Number(match[2]);
  if (jam > 23 || menit > 59) return "08:00";
  return `${String(jam).padStart(2, "0")}:${String(menit).padStart(2, "0")}`;
};

const ensureLogImutTable = async () => {
  await turso.execute(`CREATE TABLE IF NOT EXISTS log_imut_keterlambatan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT,
    dokter_id TEXT,
    nama_dokter TEXT,
    klinik TEXT,
    jam_jadwal_master TEXT,
    jam_hadir_aktual TEXT,
    is_terlambat BOOLEAN,
    menit_terlambat INTEGER
  )`);
  await turso.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_log_imut_keterlambatan_tanggal_dokter
    ON log_imut_keterlambatan (tanggal, dokter_id)`);
};

const insertLogImutKeterlambatan = async (transaction, { tanggal, dokter, jamJadwalMaster, jamHadirAktual }) => {
  const [jadwalJam, jadwalMenit] = jamJadwalMaster.split(":").map(Number);
  const [aktualJam, aktualMenit] = jamHadirAktual.split(":").map(Number);
  const selisihMenit = (aktualJam * 60 + aktualMenit) - (jadwalJam * 60 + jadwalMenit);

  await transaction.execute({
    sql: `INSERT INTO log_imut_keterlambatan
          (tanggal, dokter_id, nama_dokter, klinik, jam_jadwal_master, jam_hadir_aktual, is_terlambat, menit_terlambat)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tanggal, dokter_id) DO UPDATE SET
            nama_dokter = excluded.nama_dokter,
            klinik = excluded.klinik,
            jam_jadwal_master = excluded.jam_jadwal_master,
            jam_hadir_aktual = excluded.jam_hadir_aktual,
            is_terlambat = excluded.is_terlambat,
            menit_terlambat = excluded.menit_terlambat`,
    args: [
      tanggal,
      String(dokter.id),
      dokter.nama_dokter,
      dokter.klinik,
      jamJadwalMaster,
      jamHadirAktual,
      selisihMenit > 15 ? 1 : 0,
      Math.max(0, selisihMenit)
    ]
  });
};

export async function POST(request) {
  try {
    const body = await request.json();
    const dokterId = Number(body?.dokter_id);
    const tanggal = String(body?.tanggal || "").trim();
    const jamMulaiManual = String(body?.jam_mulai_manual || "").trim();

    if (!Number.isSafeInteger(dokterId) || dokterId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return NextResponse.json({ error: "Data dokter atau tanggal tidak valid." }, { status: 400 });
    }
    if (jamMulaiManual && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jamMulaiManual)) {
      return NextResponse.json({ error: "Format jam manual harus HH:mm." }, { status: 400 });
    }

    const now = new Date();
    if (tanggal !== getTanggalJakarta(now)) {
      return NextResponse.json({ error: "Waktu mulai hanya dapat dicatat untuk tanggal hari ini." }, { status: 400 });
    }
    const waktuMulai = jamMulaiManual
      ? new Date(`${tanggal}T${jamMulaiManual}:00+07:00`)
      : now;
    if (Number.isNaN(waktuMulai.getTime()) || waktuMulai.getTime() > now.getTime()) {
      return NextResponse.json({ error: "Jam mulai manual tidak valid atau berada di masa depan." }, { status: 400 });
    }
    const jamMulaiAktual = waktuMulai.toISOString();

    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    let sessionRuangan = null;
    if (session) {
      try {
        const sessionData = JSON.parse(session.value);
        sessionRuangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();
      } catch {
        return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
      }
    }

    const dokterResult = await turso.execute({
      sql: "SELECT id, nama_dokter, klinik, jam_praktik, ruangan FROM master_dokter WHERE id = ? LIMIT 1",
      args: [dokterId]
    });
    const dokter = dokterResult.rows[0];
    if (!dokter) {
      return NextResponse.json({ error: "Dokter tidak ditemukan." }, { status: 404 });
    }

    const ruanganDokter = String(dokter.ruangan || sessionRuangan || "POLIKLINIK").trim().toUpperCase();
    if (ruanganDokter !== "POLIKLINIK") {
      return NextResponse.json({ error: "Indikator mulai praktik hanya tersedia untuk Poliklinik." }, { status: 403 });
    }
    if (sessionRuangan && dokter.ruangan && ruanganDokter !== sessionRuangan) {
      return NextResponse.json({ error: "Dokter berada di ruangan yang berbeda." }, { status: 403 });
    }

    const jamJadwalMaster = getJamJadwalMaster(dokter.jam_praktik);
    await ensureLogImutTable();
    const transaction = await turso.transaction("write");
    let savedJamMulaiAktual = jamMulaiAktual;
    try {
      const insertResult = await transaction.execute({
        sql: `INSERT OR IGNORE INTO indikator_mutu_praktik
              (dokter_id, tanggal, ruangan, jam_mulai_aktual, jam_praktik)
              VALUES (?, ?, ?, ?, ?)`,
        args: [dokterId, tanggal, ruanganDokter, jamMulaiAktual, jamJadwalMaster]
      });

      const savedResult = await transaction.execute({
        sql: `SELECT jam_mulai_aktual FROM indikator_mutu_praktik
              WHERE dokter_id = ? AND tanggal = ? LIMIT 1`,
        args: [dokterId, tanggal]
      });
      savedJamMulaiAktual = savedResult.rows[0]?.jam_mulai_aktual || jamMulaiAktual;

      if (Number(insertResult.rowsAffected) > 0) {
        await insertLogImutKeterlambatan(transaction, {
          tanggal,
          dokter,
          jamJadwalMaster,
          jamHadirAktual: getJamJakarta(new Date(savedJamMulaiAktual))
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return NextResponse.json({
      success: true,
      jam_mulai_aktual: savedJamMulaiAktual
    });
  } catch (error) {
    console.error("Gagal mencatat mulai praktik:", error);
    return NextResponse.json({ error: "Gagal menyimpan waktu mulai praktik." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const dokterId = Number(body?.dokter_id);
    const tanggal = String(body?.tanggal || "").trim();
    const jamMulaiManual = String(body?.jam_mulai_manual || "").trim();

    if (!Number.isSafeInteger(dokterId) || dokterId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return NextResponse.json({ error: "Data dokter atau tanggal tidak valid." }, { status: 400 });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(jamMulaiManual)) {
      return NextResponse.json({ error: "Format jam manual harus HH:mm." }, { status: 400 });
    }

    const waktuMulai = new Date(`${tanggal}T${jamMulaiManual}:00+07:00`);
    if (Number.isNaN(waktuMulai.getTime()) || getTanggalJakarta(waktuMulai) !== tanggal) {
      return NextResponse.json({ error: "Tanggal atau jam praktik tidak valid." }, { status: 400 });
    }
    if (waktuMulai.getTime() > Date.now()) {
      return NextResponse.json({ error: "Jam praktik tidak boleh berada di masa depan." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    let sessionRuangan = null;
    if (session) {
      try {
        const sessionData = JSON.parse(session.value);
        sessionRuangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();
      } catch {
        return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
      }
    }

    const dokterResult = await turso.execute({
      sql: "SELECT id, nama_dokter, klinik, jam_praktik, ruangan FROM master_dokter WHERE id = ? LIMIT 1",
      args: [dokterId]
    });
    const dokter = dokterResult.rows[0];
    if (!dokter) {
      return NextResponse.json({ error: "Dokter tidak ditemukan." }, { status: 404 });
    }

    const ruanganDokter = String(dokter.ruangan || sessionRuangan || "POLIKLINIK").trim().toUpperCase();
    if (ruanganDokter !== "POLIKLINIK") {
      return NextResponse.json({ error: "Jam praktik manual hanya tersedia untuk Poliklinik." }, { status: 403 });
    }
    if (sessionRuangan && dokter.ruangan && ruanganDokter !== sessionRuangan) {
      return NextResponse.json({ error: "Dokter berada di ruangan yang berbeda." }, { status: 403 });
    }

    const jamMulaiAktual = waktuMulai.toISOString();
    const jamJadwalMaster = getJamJadwalMaster(dokter.jam_praktik);
    await ensureLogImutTable();
    const transaction = await turso.transaction("write");
    try {
      await transaction.execute({
        sql: `INSERT INTO indikator_mutu_praktik
              (dokter_id, tanggal, ruangan, jam_mulai_aktual, jam_praktik)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(dokter_id, tanggal) DO UPDATE SET
                ruangan = excluded.ruangan,
                jam_mulai_aktual = excluded.jam_mulai_aktual,
                jam_praktik = excluded.jam_praktik`,
        args: [dokterId, tanggal, ruanganDokter, jamMulaiAktual, jamJadwalMaster]
      });

      await insertLogImutKeterlambatan(transaction, {
        tanggal,
        dokter,
        jamJadwalMaster,
        jamHadirAktual: jamMulaiManual
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return NextResponse.json({
      success: true,
      jam_mulai_aktual: jamMulaiAktual,
      jam_jadwal_master: jamJadwalMaster,
      is_terlambat: (Number(jamMulaiManual.slice(0, 2)) * 60 + Number(jamMulaiManual.slice(3, 5)))
        - (Number(jamJadwalMaster.slice(0, 2)) * 60 + Number(jamJadwalMaster.slice(3, 5))) > 15
    });
  } catch (error) {
    console.error("Gagal memperbarui jam praktik:", error);
    return NextResponse.json({ error: "Gagal menyimpan jam praktik." }, { status: 500 });
  }
}