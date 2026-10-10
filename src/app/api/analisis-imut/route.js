import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { buildImutIndicators, sumImutCounts } from "@/lib/imut-indicators";

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
    const { searchParams } = new URL(request.url);
    let ruangan = "POLIKLINIK";
    if (session) {
      let sessionData;
      try {
        sessionData = JSON.parse(session.value);
      } catch {
        return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
      }
      ruangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();
    }

    const bulan = Number(searchParams.get("bulan"));
    const tahun = Number(searchParams.get("tahun"));
    const tanggalHariIni = String(searchParams.get("tanggal_hari_ini") || "");
    const requestedType = searchParams.get("tipe");
    const reportType = requestedType || "bulanan";
    const reportQuarter = Number(searchParams.get("triwulan"));
    let reportMonth = bulan;
    let reportYear = tahun;
    let reportDate = String(searchParams.get("tanggal") || "");
    let reportFilter;
    let reportFilterArgs;

    if (!validDate(tanggalHariIni)) {
      return NextResponse.json({ error: "Tanggal monitoring tidak valid." }, { status: 400 });
    }
    if (reportType === "harian") {
      if (!validDate(reportDate)) {
        return NextResponse.json({ error: "Tanggal laporan tidak valid." }, { status: 400 });
      }
      reportMonth = Number(reportDate.slice(5, 7));
      reportYear = Number(reportDate.slice(0, 4));
      reportFilter = "tanggal = ?";
      reportFilterArgs = [reportDate];
    } else if (reportType === "bulanan") {
      if (
        !Number.isInteger(reportMonth) || reportMonth < 1 || reportMonth > 12 ||
        !Number.isInteger(reportYear) || reportYear < 2000 || reportYear > 9999
      ) {
        return NextResponse.json({ error: "Parameter bulan atau tahun tidak valid." }, { status: 400 });
      }
      reportFilter = "strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?";
      reportFilterArgs = [String(reportMonth).padStart(2, "0"), String(reportYear)];
    } else if (reportType === "triwulan") {
      reportYear = Number(searchParams.get("tahun"));
      const quarterMonths = {
        1: ["01", "02", "03"],
        2: ["04", "05", "06"],
        3: ["07", "08", "09"],
        4: ["10", "11", "12"]
      }[reportQuarter];
      if (!quarterMonths || !Number.isInteger(reportYear) || reportYear < 2000 || reportYear > 9999) {
        return NextResponse.json({ error: "Parameter triwulan atau tahun tidak valid." }, { status: 400 });
      }
      reportFilter = `strftime('%m', tanggal) IN ('${quarterMonths.join("','")}') AND strftime('%Y', tanggal) = ?`;
      reportFilterArgs = [String(reportYear)];
    } else if (reportType === "tahunan") {
      reportYear = Number(searchParams.get("tahun"));
      if (!Number.isInteger(reportYear) || reportYear < 2000 || reportYear > 9999) {
        return NextResponse.json({ error: "Parameter tahun tidak valid." }, { status: 400 });
      }
      reportFilter = "strftime('%Y', tanggal) = ?";
      reportFilterArgs = [String(reportYear)];
    } else {
      return NextResponse.json({ error: "Tipe periode tidak valid." }, { status: 400 });
    }

    const doctorResult = await turso.execute({
      sql: `SELECT id, nama_dokter, klinik, jadwal_hari, simbol_praktik FROM master_dokter
            WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?`,
      args: [ruangan]
    });
    const doctors = doctorResult.rows || [];
    const doctorIds = [...new Set(doctors.map((doctor) => String(doctor.id)))];
    const clinics = [...new Map(doctors
      .map((doctor) => [normalizeClinic(doctor.klinik), String(doctor.klinik || "").trim()])
      .filter(([key, name]) => key && name)).values()].sort((a, b) => a.localeCompare(b, "id"));

    if (!doctorIds.length) {
      return NextResponse.json({
        rekap: [],
        belumInputHariIni: [],
        statusHariIni: [],
        tanggalHariIni,
        jumlahDokterTerjadwal: 0,
        indikatorMutu: buildImutIndicators(),
        aiInsight: "Belum ada klinik pada ruangan ini."
      });
    }

    const placeholders = doctorIds.map(() => "?").join(", ");
    const argsRekap = [...doctorIds, ...reportFilterArgs];
    const argsHariIni = [...doctorIds, tanggalHariIni];
    const visitFilter = reportType === "harian"
      ? "CAST(tanggal AS INTEGER) = ? AND CAST(bulan AS INTEGER) = ? AND CAST(tahun AS INTEGER) = ?"
      : reportType === "bulanan"
        ? "CAST(bulan AS INTEGER) = ? AND CAST(tahun AS INTEGER) = ?"
        : reportType === "triwulan"
          ? "CAST(bulan AS INTEGER) IN (?, ?, ?) AND CAST(tahun AS INTEGER) = ?"
          : "CAST(tahun AS INTEGER) = ?";
    const visitFilterArgs = reportType === "harian"
      ? [
          Number(reportDate.slice(8, 10)),
          Number(reportDate.slice(5, 7)),
          Number(reportDate.slice(0, 4))
        ]
      : reportType === "bulanan"
        ? [reportMonth, reportYear]
        : reportType === "triwulan"
          ? [(reportQuarter - 1) * 3 + 1, (reportQuarter - 1) * 3 + 2, (reportQuarter - 1) * 3 + 3, reportYear]
          : [reportYear];
    const [latePeriod, patientPeriod, visitsPeriod, lateToday, patientToday, scheduleToday] = await Promise.all([
      turso.execute({
        sql: `SELECT UPPER(TRIM(klinik)) AS klinik_key,
                  COUNT(*) AS total_sampling,
                  SUM(CASE WHEN CAST(is_terlambat AS INTEGER) = 1 THEN 1 ELSE 0 END) AS terlambat,
                SUM(CASE WHEN CAST(is_terlambat AS INTEGER) = 0 THEN 1 ELSE 0 END) AS tepat_waktu
              FROM log_imut_keterlambatan
              WHERE dokter_id IN (${placeholders}) AND ${reportFilter}
              GROUP BY UPPER(TRIM(klinik))`,
        args: argsRekap
      }),
      turso.execute({
        sql: `SELECT UPPER(TRIM(klinik)) AS klinik_key,
                SUM(CASE
                  WHEN identifikasi_pra_tindakan IS NULL
                    OR TRIM(CAST(identifikasi_pra_tindakan AS TEXT)) = ''
                    OR UPPER(TRIM(CAST(identifikasi_pra_tindakan AS TEXT))) IN ('YA', '1', '0', 'TRUE', 'FALSE')
                  THEN 1 ELSE 0
                END) AS identifikasi_ya,
                SUM(CASE
                  WHEN UPPER(TRIM(CAST(identifikasi_pra_tindakan AS TEXT))) = 'TIDAK'
                  THEN 1 ELSE 0
                END) AS identifikasi_tidak,
                SUM(CASE WHEN waktu_tunggu_menit < 60 THEN 1 ELSE 0 END) AS waktu_kurang_60,
                SUM(CASE
                  WHEN waktu_tunggu_menit < 60
                    AND EXISTS (
                      SELECT 1 FROM log_imut_keterlambatan kehadiran
                      WHERE kehadiran.dokter_id = log_imut_pasien.dokter_id
                        AND kehadiran.tanggal = log_imut_pasien.tanggal
                        AND CAST(kehadiran.is_terlambat AS INTEGER) = 0
                    )
                  THEN 1 ELSE 0
                END) AS waktu_kurang_60_tercapai,
                SUM(CASE WHEN waktu_tunggu_menit = 60 THEN 1 ELSE 0 END) AS waktu_tepat_60,
                SUM(CASE WHEN waktu_tunggu_menit > 60 THEN 1 ELSE 0 END) AS waktu_lebih_60,
                COUNT(*) AS total_sampel,
                COALESCE(SUM(waktu_tunggu_menit), 0) AS total_waktu_tunggu
              FROM log_imut_pasien
              WHERE dokter_id IN (${placeholders}) AND ${reportFilter}
              GROUP BY UPPER(TRIM(klinik))`,
        args: argsRekap
      }),
      turso.execute({
        sql: `SELECT UPPER(TRIM(nama_dokter)) AS dokter_key, UPPER(TRIM(klinik)) AS klinik_key,
                SUM(CAST(jumlah AS INTEGER)) AS total_kunjungan
              FROM jumlah_pasien_poli
              WHERE ${visitFilter}
              GROUP BY UPPER(TRIM(nama_dokter)), UPPER(TRIM(klinik))`,
        args: visitFilterArgs
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
      }),
      turso.execute({
        sql: `SELECT j.simbol, j.sdm_id, s.nama
              FROM jadwal_dinas j
              LEFT JOIN sdm s ON s.id = j.sdm_id
              WHERE CAST(j.tanggal AS INTEGER) = ?
                AND CAST(j.bulan AS INTEGER) = ?
                AND CAST(j.tahun AS INTEGER) = ?
                AND (j.ruangan IS NULL OR TRIM(j.ruangan) = '' OR UPPER(TRIM(j.ruangan)) = ?)
                AND (s.ruangan IS NULL OR TRIM(s.ruangan) = '' OR UPPER(TRIM(s.ruangan)) = ?)`,
        args: [
          Number(tanggalHariIni.slice(8, 10)),
          Number(tanggalHariIni.slice(5, 7)),
          Number(tanggalHariIni.slice(0, 4)),
          ruangan,
          ruangan
        ]
      })
    ]);

    const lateByClinic = new Map((latePeriod.rows || []).map((row) => [row.klinik_key, row]));
    const patientsByClinic = new Map((patientPeriod.rows || []).map((row) => [row.klinik_key, row]));
    const visibleDoctorKeys = new Set(doctors.map((doctor) =>
      `${normalizeClinic(doctor.nama_dokter)}|${normalizeClinic(doctor.klinik)}`
    ));
    const visitsByClinic = new Map();
    for (const row of visitsPeriod.rows || []) {
      if (!visibleDoctorKeys.has(`${row.dokter_key}|${row.klinik_key}`)) continue;
      visitsByClinic.set(
        row.klinik_key,
        (visitsByClinic.get(row.klinik_key) || 0) + (Number(row.total_kunjungan) || 0)
      );
    }
    const lateTodayByClinic = new Map((lateToday.rows || []).map((row) => [row.klinik_key, Number(row.total) || 0]));
    const patientTodayByClinic = new Map((patientToday.rows || []).map((row) => [row.klinik_key, Number(row.total) || 0]));

    const normalizeSymbol = (value) => String(value || "")
      .trim()
      .replace(/[^A-Za-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .toUpperCase();
    const symbolKey = (value) => {
      const normalized = normalizeSymbol(value);
      const ners = normalized.match(/NERS\s*\d+/);
      if (ners) return ners[0].replace(/\s+/g, " ");
      const poli = normalized.match(/POLI\s*[A-Z0-9]+/);
      if (poli) return poli[0].replace(/\s+/g, " ");
      return normalized;
    };
    const symbolsMatch = (first, second) => {
      const firstKey = symbolKey(first);
      const secondKey = symbolKey(second);
      if (!firstKey || !secondKey) return false;
      if (firstKey === secondKey) return true;
      const firstNers = firstKey.match(/^NERS\s*(\d+)$/)?.[1];
      const secondNers = secondKey.match(/^NERS\s*(\d+)$/)?.[1];
      const firstPoli = firstKey.match(/^POLI\s*(.+)$/)?.[1];
      const secondPoli = secondKey.match(/^POLI\s*(.+)$/)?.[1];
      const firstNumber = firstKey.match(/^(\d+)$/)?.[1];
      const secondNumber = secondKey.match(/^(\d+)$/)?.[1];
      return (firstNers && secondNers && firstNers === secondNers)
        || (firstPoli && secondPoli && firstPoli === secondPoli)
        || (firstNumber && secondNumber && firstNumber === secondNumber)
        || (firstNers && secondNumber && firstNers === secondNumber)
        || (secondNers && firstNumber && secondNers === firstNumber);
    };
    const hariTarget = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      timeZone: "UTC"
    }).format(new Date(`${tanggalHariIni}T00:00:00.000Z`)).toUpperCase();
    const doctorsToday = doctors.filter((doctor) => String(doctor.jadwal_hari || "")
      .split(/[,;/|]+/)
      .map((day) => day.trim().toUpperCase())
      .includes(hariTarget));
    const scheduledStaff = scheduleToday.rows || [];

    let visitRowsToday = [];
    if (doctorIds.length) {
      const visitsToday = await turso.execute({
        sql: `SELECT nama_dokter, klinik
              FROM jumlah_pasien_poli
              WHERE CAST(tanggal AS INTEGER) = ?
                AND CAST(bulan AS INTEGER) = ?
                AND CAST(tahun AS INTEGER) = ?`,
        args: [
          Number(tanggalHariIni.slice(8, 10)),
          Number(tanggalHariIni.slice(5, 7)),
          Number(tanggalHariIni.slice(0, 4))
        ]
      });
      visitRowsToday = visitsToday.rows || [];
    }
    const visitedDoctorKeys = new Set(visitRowsToday.map((row) =>
      `${normalizeClinic(row.nama_dokter)}|${normalizeClinic(row.klinik)}`
    ));
    const lateDoctorIds = new Set((await turso.execute({
      sql: `SELECT dokter_id FROM log_imut_keterlambatan
            WHERE dokter_id IN (${placeholders}) AND tanggal = ?`,
      args: argsHariIni
    })).rows.map((row) => String(row.dokter_id)));
    const imutDoctorIds = new Set((await turso.execute({
      sql: `SELECT dokter_id FROM log_imut_pasien
            WHERE dokter_id IN (${placeholders}) AND tanggal = ?`,
      args: argsHariIni
    })).rows.map((row) => String(row.dokter_id)));

    const belumInputHariIni = doctorsToday.map((doctor) => {
      const doctorId = String(doctor.id);
      const doctorName = String(doctor.nama_dokter || "").trim();
      const clinicName = String(doctor.klinik || "").trim();
      const assistants = scheduledStaff
        .filter((staff) => symbolsMatch(staff.simbol, doctor.simbol_praktik))
        .map((staff) => String(staff.nama || "").trim())
        .filter(Boolean);
      const tunggakan = [];
      if (!lateDoctorIds.has(doctorId)) tunggakan.push("IMUT 1");
      if (!imutDoctorIds.has(doctorId)) tunggakan.push("IMUT 2/3");
      if (!visitedDoctorKeys.has(`${normalizeClinic(doctorName)}|${normalizeClinic(clinicName)}`)) {
        tunggakan.push("Kunjungan Pasien");
      }
      return {
        poli: clinicName,
        dokter: doctorName,
        asisten: assistants.length ? [...new Set(assistants)].join(", ") : "Belum ada asisten terjadwal",
        tunggakan
      };
    }).filter((entry) => entry.tunggakan.length > 0);

    const rekap = clinics.map((klinik) => {
      const clinicKey = normalizeClinic(klinik);
      const late = lateByClinic.get(clinicKey) || {};
      const patient = patientsByClinic.get(clinicKey) || {};
      const sampleCount = Number(patient.total_sampel) || 0;
      const totalWait = Number(patient.total_waktu_tunggu) || 0;
      const counts = {
        tepatWaktu: Number(late.tepat_waktu) || 0,
        terlambat: Number(late.terlambat) || 0,
        sampelKehadiran: Number(late.total_sampling) || 0,
        identifikasiYa: Number(patient.identifikasi_ya) || 0,
        identifikasiTidak: Number(patient.identifikasi_tidak) || 0,
        waktuKurang60: Number(patient.waktu_kurang_60) || 0,
        waktuKurang60Tercapai: Number(patient.waktu_kurang_60_tercapai) || 0,
        waktuTepat60: Number(patient.waktu_tepat_60) || 0,
        waktuLebih60: Number(patient.waktu_lebih_60) || 0,
        sampelWaktuTunggu: sampleCount
      };
      return {
        klinik,
        kunjungan: visitsByClinic.get(clinicKey) || 0,
        ...counts,
        indikatorMutu: buildImutIndicators(counts),
        rataRataWaktuTunggu: sampleCount ? Math.round(totalWait / sampleCount) : null
      };
    });
    const indikatorMutu = buildImutIndicators(sumImutCounts(rekap));

    const statusHariIni = clinics.map((klinik) => {
      const clinicKey = normalizeClinic(klinik);
      const imut1 = lateTodayByClinic.get(clinicKey) || 0;
      const imut23 = patientTodayByClinic.get(clinicKey) || 0;
      return { klinik, imut1, imut23 };
    });
    const poliBelumInputHariIni = statusHariIni
      .filter((status) => status.imut1 === 0 || status.imut23 === 0)
      .map((status) => status.klinik);

    return NextResponse.json({
      rekap,
      belumInputHariIni,
      poliBelumInputHariIni,
      statusHariIni,
      tanggalHariIni,
      jumlahDokterTerjadwal: doctorsToday.length,
      indikatorMutu,
      aiInsight: createInsight(rekap)
    });
  } catch (error) {
    console.error("Gagal memuat rekap IMUT:", error);
    return NextResponse.json({ error: "Gagal memuat rekap indikator mutu." }, { status: 500 });
  }
}