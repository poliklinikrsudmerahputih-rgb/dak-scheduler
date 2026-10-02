import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const normalizeClinic = (value) => String(value || "").trim().toUpperCase();

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function createInsight(rows) {
  if (!rows.length) return "Belum ada data IMUT untuk klinik pada periode ini.";

  const lateLeader = [...rows].sort((a, b) => b.terlambat - a.terlambat)[0];
  const rowsWithWait = rows.filter((row) => row.sampelWaktuTunggu > 0);
  const bestWait = rowsWithWait.sort((a, b) => a.rataRataWaktuTunggu - b.rataRataWaktuTunggu)[0];
  const lateText = lateLeader?.terlambat > 0
    ? `${lateLeader.klinik} memiliki angka keterlambatan tertinggi (${lateLeader.terlambat} kasus).`
    : "Tidak ada keterlambatan dokter yang tercatat pada periode ini.";
  const waitText = bestWait
    ? ` Rata-rata waktu tunggu terendah tercatat di ${bestWait.klinik} (${bestWait.rataRataWaktuTunggu} menit).`
    : " Belum ada sampel waktu tunggu yang cukup untuk dibandingkan.";

  return `${lateText}${waitText}`;
}

export async function GET(request) {
  try {
    const session = (await cookies()).get("session_dak_pro");
    if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 401 });

    let sessionData;
    try {
      sessionData = JSON.parse(session.value);
    } catch {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    const ruangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();

    const { searchParams } = new URL(request.url);
    const bulan = Number(searchParams.get("bulan"));
    const tahun = Number(searchParams.get("tahun"));
    const tanggalHariIni = String(searchParams.get("tanggal_hari_ini") || "");
    if (
      !Number.isInteger(bulan) || bulan < 1 || bulan > 12 ||
      !Number.isInteger(tahun) || tahun < 2000 || tahun > 9999 ||
      !validDate(tanggalHariIni)
    ) {
      return NextResponse.json({ error: "Parameter bulan, tahun, atau tanggal tidak valid." }, { status: 400 });
    }

    const tanggalAwal = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
    const tanggalAkhir = `${tahun}-${String(bulan).padStart(2, "0")}-${String(new Date(tahun, bulan, 0).getDate()).padStart(2, "0")}`;
    const doctorResult = await turso.execute({
      sql: `SELECT id, klinik FROM master_dokter
            WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?`,
      args: [ruangan]
    });
    const doctors = doctorResult.rows || [];
    const doctorIds = [...new Set(doctors.map((doctor) => String(doctor.id)))];
    const clinics = [...new Map(doctors
      .map((doctor) => [normalizeClinic(doctor.klinik), String(doctor.klinik || "").trim()])
      .filter(([key, name]) => key && name)).values()].sort((a, b) => a.localeCompare(b, "id"));

    if (!doctorIds.length) {
      return NextResponse.json({ rekap: [], belumInputHariIni: [], statusHariIni: [], aiInsight: "Belum ada klinik pada ruangan ini." });
    }

    const placeholders = doctorIds.map(() => "?").join(", ");
    const argsRekap = [...doctorIds, tanggalAwal, tanggalAkhir];
    const argsHariIni = [...doctorIds, tanggalHariIni];
    const [lateMonthly, patientMonthly, lateToday, patientToday] = await Promise.all([
      turso.execute({
        sql: `SELECT UPPER(TRIM(klinik)) AS klinik_key,
                SUM(CASE WHEN CAST(is_terlambat AS INTEGER) = 1 THEN 1 ELSE 0 END) AS terlambat,
                SUM(CASE WHEN CAST(is_terlambat AS INTEGER) = 0 THEN 1 ELSE 0 END) AS tepat_waktu
              FROM log_imut_keterlambatan
              WHERE dokter_id IN (${placeholders}) AND tanggal BETWEEN ? AND ?
              GROUP BY UPPER(TRIM(klinik))`,
        args: argsRekap
      }),
      turso.execute({
        sql: `SELECT UPPER(TRIM(klinik)) AS klinik_key,
                SUM(CASE WHEN CAST(identifikasi_pra_tindakan AS INTEGER) = 1 THEN 1 ELSE 0 END) AS identifikasi_ya,
                SUM(CASE WHEN CAST(identifikasi_pra_tindakan AS INTEGER) = 0 THEN 1 ELSE 0 END) AS identifikasi_tidak,
                SUM(CASE WHEN waktu_tunggu_menit < 60 THEN 1 ELSE 0 END) AS waktu_kurang_60,
                SUM(CASE WHEN waktu_tunggu_menit = 60 THEN 1 ELSE 0 END) AS waktu_tepat_60,
                SUM(CASE WHEN waktu_tunggu_menit > 60 THEN 1 ELSE 0 END) AS waktu_lebih_60,
                COUNT(waktu_tunggu_menit) AS total_sampel,
                COALESCE(SUM(waktu_tunggu_menit), 0) AS total_waktu_tunggu
              FROM log_imut_pasien
              WHERE dokter_id IN (${placeholders}) AND tanggal BETWEEN ? AND ?
              GROUP BY UPPER(TRIM(klinik))`,
        args: argsRekap
      }),
      turso.execute({
        sql: `SELECT UPPER(TRIM(klinik)) AS klinik_key, COUNT(*) AS total
              FROM log_imut_keterlambatan
              WHERE dokter_id IN (${placeholders}) AND tanggal = ?
              GROUP BY UPPER(TRIM(klinik))`,
        args: argsHariIni
      }),
      turso.execute({
        sql: `SELECT UPPER(TRIM(klinik)) AS klinik_key, COUNT(*) AS total
              FROM log_imut_pasien
              WHERE dokter_id IN (${placeholders}) AND tanggal = ?
              GROUP BY UPPER(TRIM(klinik))`,
        args: argsHariIni
      })
    ]);

    const lateByClinic = new Map((lateMonthly.rows || []).map((row) => [row.klinik_key, row]));
    const patientsByClinic = new Map((patientMonthly.rows || []).map((row) => [row.klinik_key, row]));
    const lateTodayByClinic = new Map((lateToday.rows || []).map((row) => [row.klinik_key, Number(row.total) || 0]));
    const patientTodayByClinic = new Map((patientToday.rows || []).map((row) => [row.klinik_key, Number(row.total) || 0]));

    const rekap = clinics.map((klinik) => {
      const clinicKey = normalizeClinic(klinik);
      const late = lateByClinic.get(clinicKey) || {};
      const patient = patientsByClinic.get(clinicKey) || {};
      const sampleCount = Number(patient.total_sampel) || 0;
      const totalWait = Number(patient.total_waktu_tunggu) || 0;
      return {
        klinik,
        tepatWaktu: Number(late.tepat_waktu) || 0,
        terlambat: Number(late.terlambat) || 0,
        identifikasiYa: Number(patient.identifikasi_ya) || 0,
        identifikasiTidak: Number(patient.identifikasi_tidak) || 0,
        waktuKurang60: Number(patient.waktu_kurang_60) || 0,
        waktuTepat60: Number(patient.waktu_tepat_60) || 0,
        waktuLebih60: Number(patient.waktu_lebih_60) || 0,
        sampelWaktuTunggu: sampleCount,
        rataRataWaktuTunggu: sampleCount ? Math.round(totalWait / sampleCount) : null
      };
    });

    const statusHariIni = clinics.map((klinik) => {
      const clinicKey = normalizeClinic(klinik);
      const imut1 = lateTodayByClinic.get(clinicKey) || 0;
      const imut23 = patientTodayByClinic.get(clinicKey) || 0;
      return { klinik, imut1, imut23 };
    });
    const belumInputHariIni = statusHariIni
      .filter((status) => status.imut1 === 0 || status.imut23 === 0)
      .map((status) => status.klinik);

    return NextResponse.json({
      rekap,
      belumInputHariIni,
      statusHariIni,
      aiInsight: createInsight(rekap)
    });
  } catch (error) {
    console.error("Gagal memuat rekap IMUT:", error);
    return NextResponse.json({ error: "Gagal memuat rekap indikator mutu." }, { status: 500 });
  }
}