import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const ensureLogImutPasienTable = async () => {
  await turso.execute(`CREATE TABLE IF NOT EXISTS log_imut_pasien (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT,
    dokter_id TEXT,
    nama_dokter TEXT,
    klinik TEXT,
    no_rm TEXT,
    jam_asesmen TEXT,
    jam_selesai TEXT,
    waktu_tunggu_menit INTEGER,
    identifikasi_pra_tindakan BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const tableInfo = await turso.execute("PRAGMA table_info('log_imut_pasien')");
  const columns = new Set(tableInfo.rows.map((column) => column.name));
  if (!columns.has("jam_asesmen")) {
    await turso.execute("ALTER TABLE log_imut_pasien ADD COLUMN jam_asesmen TEXT");
  }
  if (!columns.has("jam_selesai")) {
    await turso.execute("ALTER TABLE log_imut_pasien ADD COLUMN jam_selesai TEXT");
  }
};

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    if (!session) {
      return NextResponse.json({ success: false, error: "Sesi tidak ditemukan." }, { status: 401 });
    }

    let sessionRuangan;
    try {
      const sessionData = JSON.parse(session.value);
      sessionRuangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();
    } catch {
      return NextResponse.json({ success: false, error: "Sesi tidak valid." }, { status: 401 });
    }

    const body = await request.json();
    const dokterId = Number(body?.dokter_id);
    const tanggal = String(body?.tanggal || "").trim();
    const noRM = String(body?.no_rm || "").trim();
    const jamAsesmen = String(body?.jam_asesmen || "").trim();
    const jamSelesai = String(body?.jam_selesai || "").trim();
    const waktuTunggu = Number(body?.waktu_tunggu_menit);
    const identifikasiPraTindakan = body?.identifikasi;
    const formatJamValid = /^([01]\d|2[0-3]):[0-5]\d$/;
    const menitDariJam = (jam) => {
      const [hours, minutes] = jam.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const tanggalDate = /^\d{4}-\d{2}-\d{2}$/.test(tanggal)
      ? new Date(`${tanggal}T00:00:00.000Z`)
      : null;
    const durasiTerhitung = formatJamValid.test(jamAsesmen) && formatJamValid.test(jamSelesai)
      ? menitDariJam(jamSelesai) - menitDariJam(jamAsesmen)
      : null;
    if (
      !Number.isSafeInteger(dokterId) || dokterId <= 0 ||
      !tanggalDate || Number.isNaN(tanggalDate.getTime()) || tanggalDate.toISOString().slice(0, 10) !== tanggal ||
      !noRM || noRM.length > 64 ||
      durasiTerhitung === null || durasiTerhitung < 0 ||
      !Number.isSafeInteger(waktuTunggu) || waktuTunggu !== durasiTerhitung ||
      typeof identifikasiPraTindakan !== "boolean"
    ) {
      return NextResponse.json({ success: false, error: "Data sampel IMUT tidak valid." }, { status: 400 });
    }

    const doctorResult = await turso.execute({
      sql: "SELECT id, nama_dokter, klinik, ruangan FROM master_dokter WHERE id = ? LIMIT 1",
      args: [dokterId]
    });
    const dokter = doctorResult.rows[0];
    if (!dokter) {
      return NextResponse.json({ success: false, error: "Dokter tidak ditemukan." }, { status: 404 });
    }

    const dokterRuangan = String(dokter.ruangan || "POLIKLINIK").trim().toUpperCase();
    if (dokterRuangan !== sessionRuangan) {
      return NextResponse.json({ success: false, error: "Dokter berada di ruangan yang berbeda." }, { status: 403 });
    }

    await ensureLogImutPasienTable();

    const result = await turso.execute({
      sql: `INSERT INTO log_imut_pasien
            (tanggal, dokter_id, nama_dokter, klinik, no_rm, jam_asesmen, jam_selesai, waktu_tunggu_menit, identifikasi_pra_tindakan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        tanggal,
        String(dokter.id),
        dokter.nama_dokter,
        dokter.klinik,
        noRM,
        jamAsesmen,
        jamSelesai,
        identifikasiPraTindakan ? 1 : 0,
        waktuTunggu
      ]
    });

    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid) }, { status: 200 });
  } catch (error) {
    console.error("Gagal menyimpan sampel IMUT pasien:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan sampel IMUT pasien." }, { status: 500 });
  }
}