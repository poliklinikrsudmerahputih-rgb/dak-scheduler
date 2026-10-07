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
    identifikasi_pra_tindakan TEXT DEFAULT 'Ya',
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
  if (!columns.has("identifikasi_pra_tindakan")) {
    await turso.execute("ALTER TABLE log_imut_pasien ADD COLUMN identifikasi_pra_tindakan TEXT DEFAULT 'Ya'");
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
    const {
      dokter_id: dokterIdPayload,
      tanggal: tanggalPayload,
      no_rm: noRMpayload,
      jam_asesmen: jamAsesmenPayload,
      jam_selesai: jamSelesaiPayload,
      waktu_tunggu_menit: waktuTungguPayload,
      identifikasi_pra_tindakan: identifikasiPraTindakanPayload
    } = body || {};
    const dokterId = Number(dokterIdPayload);
    const tanggal = String(tanggalPayload || "").trim();
    const noRM = String(noRMpayload || "").trim();
    const jamAsesmen = String(jamAsesmenPayload || "").trim();
    const jamSelesai = String(jamSelesaiPayload || "").trim();
    const waktuTunggu = Number(waktuTungguPayload);
    const identifikasiPraTindakan = identifikasiPraTindakanPayload
      ?? (typeof body?.identifikasi === "boolean" ? (body.identifikasi ? "Ya" : "Tidak") : null);
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
      !["Ya", "Tidak"].includes(identifikasiPraTindakan)
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
        waktuTunggu,
        identifikasiPraTindakan
      ]
    });

    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid) }, { status: 200 });
  } catch (error) {
    console.error("Gagal menyimpan sampel IMUT pasien:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan sampel IMUT pasien." }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    if (!session) {
      return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 401 });
    }

    let sessionRuangan;
    try {
      const sessionData = JSON.parse(session.value);
      sessionRuangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();
    } catch {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }

    const tanggal = String(request.nextUrl.searchParams.get("tanggal") || "").trim();
    const dokterId = String(request.nextUrl.searchParams.get("dokter_id") || "").trim();
    const dokterIdNumber = Number(dokterId);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(tanggal) ||
      !Number.isSafeInteger(dokterIdNumber) ||
      dokterIdNumber <= 0
    ) {
      return NextResponse.json({ error: "Tanggal atau dokter tidak valid." }, { status: 400 });
    }

    const doctorResult = await turso.execute({
      sql: "SELECT ruangan FROM master_dokter WHERE id = ? LIMIT 1",
      args: [dokterIdNumber]
    });
    const dokter = doctorResult.rows[0];
    if (!dokter) {
      return NextResponse.json({ error: "Dokter tidak ditemukan." }, { status: 404 });
    }

    const dokterRuangan = String(dokter.ruangan || "POLIKLINIK").trim().toUpperCase();
    if (dokterRuangan !== sessionRuangan) {
      return NextResponse.json({ error: "Dokter berada di ruangan yang berbeda." }, { status: 403 });
    }

    await ensureLogImutPasienTable();
    const result = await turso.execute({
      sql: "SELECT * FROM log_imut_pasien WHERE tanggal = ? AND dokter_id = ? ORDER BY created_at DESC",
      args: [tanggal, dokterId]
    });

    return NextResponse.json({ data: result.rows }, { status: 200 });
  } catch (error) {
    console.error("Gagal mengambil riwayat sampel IMUT pasien:", error);
    return NextResponse.json({ error: "Gagal mengambil riwayat sampel IMUT pasien." }, { status: 500 });
  }
}

export async function DELETE(request) {
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
    const id = Number(body?.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID sampel tidak valid." }, { status: 400 });
    }

    await ensureLogImutPasienTable();
    const result = await turso.execute({
      sql: `DELETE FROM log_imut_pasien
            WHERE id = ?
              AND EXISTS (
                SELECT 1
                FROM master_dokter
                WHERE CAST(master_dokter.id AS TEXT) = log_imut_pasien.dokter_id
                  AND UPPER(COALESCE(NULLIF(TRIM(master_dokter.ruangan), ''), 'POLIKLINIK')) = ?
              )`,
      args: [id, sessionRuangan]
    });

    if (Number(result.rowsAffected) === 0) {
      return NextResponse.json(
        { success: false, error: "Sampel tidak ditemukan atau tidak dapat dihapus." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Gagal menghapus sampel IMUT pasien:", error);
    return NextResponse.json({ success: false, error: "Gagal menghapus sampel IMUT pasien." }, { status: 500 });
  }
}