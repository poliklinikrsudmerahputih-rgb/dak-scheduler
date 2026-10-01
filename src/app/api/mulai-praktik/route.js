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
      sql: "SELECT id, ruangan FROM master_dokter WHERE id = ? LIMIT 1",
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

    await turso.execute({
      sql: `INSERT OR IGNORE INTO indikator_mutu_praktik
            (dokter_id, tanggal, ruangan, jam_mulai_aktual)
            VALUES (?, ?, ?, ?)`,
      args: [dokterId, tanggal, ruanganDokter, jamMulaiAktual]
    });

    const savedResult = await turso.execute({
      sql: `SELECT jam_mulai_aktual FROM indikator_mutu_praktik
            WHERE dokter_id = ? AND tanggal = ? LIMIT 1`,
      args: [dokterId, tanggal]
    });

    return NextResponse.json({
      success: true,
      jam_mulai_aktual: savedResult.rows[0]?.jam_mulai_aktual || jamMulaiAktual
    });
  } catch (error) {
    console.error("Gagal mencatat mulai praktik:", error);
    return NextResponse.json({ error: "Gagal menyimpan waktu mulai praktik." }, { status: 500 });
  }
}