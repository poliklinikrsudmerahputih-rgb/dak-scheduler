import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { addWorkloadScores, buildScheduleAssignments } from "@/lib/schedule-assignments";

export const dynamic = "force-dynamic";

const normalize = (value) => String(value || "").trim().toUpperCase();

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getRange(searchParams) {
  const type = searchParams.get("tipe");
  if (type === "harian") {
    const date = searchParams.get("tanggal") || "";
    return isValidDate(date) ? { start: date, end: date, days: 1 } : null;
  }
  if (type === "tahunan") {
    const year = Number(searchParams.get("tahun"));
    if (!Number.isInteger(year) || year < 2000 || year > 9999) return null;
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const days = (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000 + 1;
    return { start, end, days };
  }

  let start = searchParams.get("start") || "";
  let end = searchParams.get("end") || "";

  if (!start && !end) {
    const month = Number(searchParams.get("bulan"));
    const year = Number(searchParams.get("tahun"));
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) {
      return null;
    }
    start = `${year}-${String(month).padStart(2, "0")}-01`;
    end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  }

  if (!isValidDate(start) || !isValidDate(end) || start > end) return null;
  const days = (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000 + 1;
  if (days > 366) return null;
  return { start, end, days };
}

function getTodayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getTimeMinutes(value) {
  const match = String(value || "").match(/(\d{1,2})[:.](\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function buildInsight(rekap) {
  if (!rekap.length) return "Belum ada data IMUT untuk poliklinik pada periode ini.";

  const lateLeader = [...rekap].sort((first, second) => second.terlambat - first.terlambat)[0];
  const withWait = rekap.filter((row) => row.sampelWaktuTunggu > 0);
  const bestWait = withWait.sort((first, second) => first.rataRataWaktuTunggu - second.rataRataWaktuTunggu)[0];
  const lateText = lateLeader?.terlambat > 0
    ? `${lateLeader.klinik} mencatat keterlambatan praktik terbanyak (${lateLeader.terlambat} kasus).`
    : "Tidak ada keterlambatan praktik yang tercatat pada periode ini.";
  const waitText = bestWait
    ? ` Rata-rata waktu tunggu terendah tercatat di ${bestWait.klinik} (${bestWait.rataRataWaktuTunggu} menit).`
    : " Belum ada sampel waktu tunggu untuk dibandingkan.";
  return `${lateText}${waitText}`;
}

export async function GET(request) {
  try {
    const session = (await cookies()).get("session_dak_pro");
    let sessionRuangan = null;
    if (session) {
      try {
        const sessionData = JSON.parse(session.value);
        sessionRuangan = String(sessionData?.ruangan || "POLIKLINIK").trim().toUpperCase();
      } catch {
        return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const range = getRange(searchParams);
    if (!range) {
      return NextResponse.json({ error: "Periode tidak valid (maksimal 366 hari)." }, { status: 400 });
    }

    const roomFilter = sessionRuangan
      ? "WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?"
      : "";
    const doctorResult = await turso.execute({
      sql: `SELECT id, nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik, bobot_jaspel FROM master_dokter ${roomFilter}`,
      args: sessionRuangan ? [sessionRuangan] : []
    });
    const doctors = doctorResult.rows || [];
    const requestedClinic = normalize(searchParams.get("clinic"));
    const allClinics = [...new Map(doctors
      .filter((doctor) => String(doctor.klinik || "").trim())
      .map((doctor) => [normalize(doctor.klinik), String(doctor.klinik).trim()])).values()].sort();
    if (requestedClinic && requestedClinic !== "ALL" && !allClinics.some((clinic) => normalize(clinic) === requestedClinic)) {
      return NextResponse.json({ error: "Poliklinik tidak tersedia pada cakupan laporan ini." }, { status: 400 });
    }

    const visibleDoctors = requestedClinic && requestedClinic !== "ALL"
      ? doctors.filter((doctor) => normalize(doctor.klinik) === requestedClinic)
      : doctors;
    const scheduleRoomFilter = sessionRuangan
      ? `AND (j.ruangan IS NULL OR TRIM(j.ruangan) = '' OR UPPER(TRIM(j.ruangan)) = ?)
         AND (s.ruangan IS NULL OR TRIM(s.ruangan) = '' OR UPPER(TRIM(s.ruangan)) = ?)`
      : "";
    const activeStaffRoomFilter = sessionRuangan
      ? "AND (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)"
      : "";
    const nasaRoomFilter = sessionRuangan
      ? "AND UPPER(TRIM(n.ruangan)) = ? AND (s.ruangan IS NULL OR TRIM(s.ruangan) = '' OR UPPER(TRIM(s.ruangan)) = ?)"
      : "";
    const [scheduleResult, activeStaffResult, nasaResult] = await Promise.all([
      turso.execute({
        sql: `SELECT j.sdm_id, j.tanggal, j.bulan, j.tahun, j.simbol, s.nama
              , s.jabatan, s.jenis_jabatan
            FROM jadwal_dinas j
            JOIN sdm s ON s.id = j.sdm_id
            WHERE printf('%04d-%02d-%02d', CAST(j.tahun AS INTEGER), CAST(j.bulan AS INTEGER), CAST(j.tanggal AS INTEGER)) BETWEEN ? AND ?
              AND COALESCE(s.is_aktif, 1) = 1
              AND UPPER(COALESCE(s.status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')
              ${scheduleRoomFilter}`,
        args: sessionRuangan
          ? [range.start, range.end, sessionRuangan, sessionRuangan]
          : [range.start, range.end]
      }),
      turso.execute({
        sql: `SELECT COALESCE(NULLIF(TRIM(jabatan), ''), NULLIF(TRIM(jenis_jabatan), ''), 'Jabatan belum diisi') AS jabatan,
                COUNT(*) AS total
              FROM sdm
              WHERE COALESCE(is_aktif, 1) = 1
                AND UPPER(COALESCE(status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')
                ${activeStaffRoomFilter}
              GROUP BY UPPER(COALESCE(NULLIF(TRIM(jabatan), ''), NULLIF(TRIM(jenis_jabatan), ''), 'Jabatan belum diisi'))`,
        args: sessionRuangan ? [sessionRuangan] : []
      }),
      turso.execute({
        sql: `SELECT n.sdm_id,
                COALESCE(NULLIF(TRIM(s.jabatan), ''), NULLIF(TRIM(s.jenis_jabatan), ''), 'Jabatan belum diisi') AS jabatan,
                AVG((CAST(n.mental_demand AS REAL) + CAST(n.physical_demand AS REAL) +
                     CAST(n.temporal_demand AS REAL) + CAST(n.performance AS REAL) +
                     CAST(n.effort AS REAL) + CAST(n.frustration AS REAL)) / 6.0) AS skor_nasa_tlx
              FROM log_nasa_tlx n
              JOIN sdm s ON s.id = n.sdm_id
              WHERE date(n.tanggal_isi) BETWEEN date(?) AND date(?)
                AND COALESCE(s.is_aktif, 1) = 1
                AND UPPER(COALESCE(s.status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')
                ${nasaRoomFilter}
              GROUP BY n.sdm_id`,
        args: sessionRuangan
          ? [range.start, range.end, sessionRuangan, sessionRuangan]
          : [range.start, range.end]
      })
    ]);
    let scheduleAssignments = buildScheduleAssignments(scheduleResult.rows || [], visibleDoctors);
    const activeStaffByProfession = (activeStaffResult.rows || []).map((row) => ({
      jabatan: String(row.jabatan || "Jabatan belum diisi").trim(),
      totalSdmAktif: Number(row.total) || 0
    }));
    const professionMetricsMap = new Map(activeStaffByProfession.map((row) => [
      row.jabatan.toUpperCase(),
      {
        ...row,
        dokterIds: new Set(),
        nasaScoreByStaff: new Map()
      }
    ]));
    for (const assignment of scheduleAssignments) {
      const profession = String(assignment.jabatan || "Jabatan belum diisi").toUpperCase();
      professionMetricsMap.get(profession)?.dokterIds.add(String(assignment.dokterId));
    }
    for (const row of nasaResult.rows || []) {
      const profession = String(row.jabatan || "Jabatan belum diisi").toUpperCase();
      const metric = professionMetricsMap.get(profession);
      const score = Number(row.skor_nasa_tlx);
      if (metric && Number.isFinite(score)) metric.nasaScoreByStaff.set(String(row.sdm_id), score);
    }
    const professionMetrics = [...professionMetricsMap.values()].map((metric) => {
      const scores = [...metric.nasaScoreByStaff.values()];
      return {
        jabatan: metric.jabatan,
        totalSdmAktif: metric.totalSdmAktif,
        totalDokterDitangani: metric.dokterIds.size,
        rataRataSkorNasaTlx: scores.length
          ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length * 10) / 10
          : null,
        rasioKepadatan: metric.totalSdmAktif
          ? Math.round(metric.dokterIds.size / metric.totalSdmAktif * 100) / 100
          : null
      };
    }).sort((first, second) => first.jabatan.localeCompare(second.jabatan, "id"));
    const clinics = [...new Map(visibleDoctors
      .filter((doctor) => String(doctor.klinik || "").trim())
      .map((doctor) => [normalize(doctor.klinik), String(doctor.klinik).trim()])).values()];
    const doctorIds = [...new Set(visibleDoctors.map((doctor) => String(doctor.id)))];
    const clinicKeys = new Set(clinics.map(normalize));
    const doctorKeys = new Set(visibleDoctors.map((doctor) => `${normalize(doctor.nama_dokter)}|${normalize(doctor.klinik)}`));

    let lateRows = [];
    let imutRows = [];
    let complianceRows = [];
    if (doctorIds.length) {
      const placeholders = doctorIds.map(() => "?").join(",");
      const [lateResult, imutResult, complianceResult] = await Promise.all([
        turso.execute({
          sql: `SELECT UPPER(TRIM(klinik)) AS clinic_key,
                  SUM(CASE WHEN CAST(is_terlambat AS INTEGER) = 1 THEN 1 ELSE 0 END) AS terlambat,
                  SUM(CASE WHEN CAST(is_terlambat AS INTEGER) = 0 THEN 1 ELSE 0 END) AS tepat_waktu
                FROM log_imut_keterlambatan
                WHERE dokter_id IN (${placeholders}) AND tanggal BETWEEN ? AND ?
                GROUP BY UPPER(TRIM(klinik))`,
          args: [...doctorIds, range.start, range.end]
        }),
        turso.execute({
          sql: `SELECT UPPER(TRIM(klinik)) AS clinic_key,
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
          args: [...doctorIds, range.start, range.end]
        }),
        turso.execute({
          sql: `SELECT dokter_id, nama_dokter, klinik, jam_hadir_aktual, is_terlambat, menit_terlambat
                FROM log_imut_keterlambatan
                WHERE dokter_id IN (${placeholders}) AND tanggal BETWEEN ? AND ?
                ORDER BY tanggal, id`,
          args: [...doctorIds, range.start, range.end]
        })
      ]);
      lateRows = lateResult.rows || [];
      imutRows = imutResult.rows || [];
      complianceRows = complianceResult.rows || [];
    }

    const lateByClinic = new Map(lateRows.map((row) => [row.clinic_key, row]));
    const imutByClinic = new Map(imutRows.map((row) => [row.clinic_key, row]));
    const rekap = clinics.map((klinik) => {
      const key = normalize(klinik);
      const late = lateByClinic.get(key) || {};
      const imut = imutByClinic.get(key) || {};
      const sampleCount = Number(imut.total_sampel) || 0;
      return {
        klinik,
        tepatWaktu: Number(late.tepat_waktu) || 0,
        terlambat: Number(late.terlambat) || 0,
        identifikasiYa: Number(imut.identifikasi_ya) || 0,
        identifikasiTidak: Number(imut.identifikasi_tidak) || 0,
        waktuKurang60: Number(imut.waktu_kurang_60) || 0,
        waktuTepat60: Number(imut.waktu_tepat_60) || 0,
        waktuLebih60: Number(imut.waktu_lebih_60) || 0,
        sampelWaktuTunggu: sampleCount,
        rataRataWaktuTunggu: sampleCount
          ? Math.round((Number(imut.total_waktu_tunggu) || 0) / sampleCount)
          : null
      };
    }).sort((first, second) => first.klinik.localeCompare(second.klinik, "id"));

    const patientResult = clinics.length
      ? await turso.execute({
          sql: `SELECT nama_dokter, klinik, printf('%04d-%02d-%02d', CAST(tahun AS INTEGER), CAST(bulan AS INTEGER), CAST(tanggal AS INTEGER)) AS tanggal_key,
                  SUM(CAST(jumlah AS INTEGER)) AS jumlah
                FROM jumlah_pasien_poli
                WHERE printf('%04d-%02d-%02d', CAST(tahun AS INTEGER), CAST(bulan AS INTEGER), CAST(tanggal AS INTEGER)) BETWEEN ? AND ?
                GROUP BY UPPER(TRIM(nama_dokter)), UPPER(TRIM(klinik)), CAST(tahun AS INTEGER), CAST(bulan AS INTEGER), CAST(tanggal AS INTEGER)`,
          args: [range.start, range.end]
        })
      : { rows: [] };
    const patientByDay = new Map();
    const patientsByClinic = new Map();
    const workloadPatientRows = [];
    let totalPatients = 0;
    for (const row of patientResult.rows || []) {
      if (!clinicKeys.has(normalize(row.klinik))) continue;
      if (!doctorKeys.has(`${normalize(row.nama_dokter)}|${normalize(row.klinik)}`)) continue;
      const patients = Number(row.jumlah) || 0;
      workloadPatientRows.push({
        nama_dokter: row.nama_dokter,
        klinik: row.klinik,
        tanggal_key: row.tanggal_key,
        jumlah: patients
      });
      patientByDay.set(row.tanggal_key, (patientByDay.get(row.tanggal_key) || 0) + patients);
      const clinicName = clinics.find((clinic) => normalize(clinic) === normalize(row.klinik));
      if (clinicName) {
        patientsByClinic.set(clinicName, (patientsByClinic.get(clinicName) || 0) + patients);
      }
      totalPatients += patients;
    }
    scheduleAssignments = addWorkloadScores(scheduleAssignments, workloadPatientRows, visibleDoctors);
    const clinicVisits = [...patientsByClinic.entries()]
      .map(([klinik, pasien]) => ({ klinik, pasien }))
      .sort((first, second) => second.pasien - first.pasien)
      .slice(0, 10);

    const dailyTrend = [];
    const monthlyTrend = new Map();
    for (
      let timestamp = Date.parse(`${range.start}T00:00:00Z`);
      timestamp <= Date.parse(`${range.end}T00:00:00Z`);
      timestamp += 86400000
    ) {
      const dateKey = new Date(timestamp).toISOString().slice(0, 10);
      const patients = patientByDay.get(dateKey) || 0;
      const monthKey = dateKey.slice(0, 7);
      monthlyTrend.set(monthKey, (monthlyTrend.get(monthKey) || 0) + patients);
      if (range.days <= 62) dailyTrend.push({ label: dateKey.slice(5), tanggal: dateKey, pasien: patients });
    }
    const trend = range.days <= 62
      ? dailyTrend
      : [...monthlyTrend.entries()].map(([label, pasien]) => ({ label, pasien }));

    const doctorById = new Map(visibleDoctors.map((doctor) => [String(doctor.id), doctor]));
    const complianceByDoctor = new Map();
    let totalArrivalMinutes = 0;
    let arrivalCount = 0;
    let longestDelay = null;
    let complianceOnTime = 0;
    let complianceLate = 0;
    for (const row of complianceRows) {
      const doctor = doctorById.get(String(row.dokter_id));
      const actualMinutes = getTimeMinutes(row.jam_hadir_aktual);
      if (!doctor || actualMinutes === null) continue;

      const isLate = Number(row.is_terlambat) === 1;
      const delayMinutes = Math.max(0, Number(row.menit_terlambat) || 0);
      totalArrivalMinutes += actualMinutes;
      arrivalCount += 1;
      if (isLate) complianceLate += 1;
      else complianceOnTime += 1;

      const current = complianceByDoctor.get(String(row.dokter_id)) || {
        namaDokter: doctor.nama_dokter,
        klinik: doctor.klinik,
        totalSesi: 0,
        totalKedatanganMenit: 0,
        jumlahKedatangan: 0,
        keterlambatanTerparah: 0,
        terlambat: 0
      };
      current.totalSesi += 1;
      current.totalKedatanganMenit += actualMinutes;
      current.jumlahKedatangan += 1;
      if (isLate) current.terlambat += 1;
      current.keterlambatanTerparah = Math.max(current.keterlambatanTerparah, isLate ? delayMinutes : 0);
      complianceByDoctor.set(String(row.dokter_id), current);

      if (isLate && (!longestDelay || delayMinutes > longestDelay.menit)) {
        longestDelay = {
          namaDokter: doctor.nama_dokter,
          klinik: doctor.klinik,
          menit: delayMinutes
        };
      }
    }
    const formatTime = (minutes) => {
      if (!Number.isFinite(minutes)) return null;
      const rounded = Math.round(minutes);
      return `${String(Math.floor(rounded / 60) % 24).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
    };
    const doctorCompliance = [...complianceByDoctor.values()]
      .map((doctor) => ({
        namaDokter: doctor.namaDokter,
        klinik: doctor.klinik,
        totalSesiPraktik: doctor.totalSesi,
        rataRataKedatangan: formatTime(doctor.totalKedatanganMenit / doctor.jumlahKedatangan),
        keterlambatanTerparah: doctor.keterlambatanTerparah,
        statusDisiplin: doctor.terlambat > 0 ? "Terlambat" : "Tepat Waktu"
      }))
      .sort((first, second) => first.namaDokter.localeCompare(second.namaDokter, "id"));

    const today = getTodayJakarta();
    const doctorPlaceholders = doctorIds.map(() => "?").join(",");
    let todayLateRows = [];
    let todayImutRows = [];
    if (doctorIds.length) {
      const [todayLateResult, todayImutResult] = await Promise.all([
        turso.execute({
          sql: `SELECT UPPER(TRIM(klinik)) AS clinic_key, COUNT(*) AS total
                FROM log_imut_keterlambatan
                WHERE dokter_id IN (${doctorPlaceholders}) AND tanggal = ?
                GROUP BY UPPER(TRIM(klinik))`,
          args: [...doctorIds, today]
        }),
        turso.execute({
          sql: `SELECT UPPER(TRIM(klinik)) AS clinic_key, COUNT(*) AS total
                FROM log_imut_pasien
                WHERE dokter_id IN (${doctorPlaceholders}) AND tanggal = ?
                GROUP BY UPPER(TRIM(klinik))`,
          args: [...doctorIds, today]
        })
      ]);
      todayLateRows = todayLateResult.rows || [];
      todayImutRows = todayImutResult.rows || [];
    }
    const lateToday = new Map(todayLateRows.map((row) => [row.clinic_key, Number(row.total) || 0]));
    const imutToday = new Map(todayImutRows.map((row) => [row.clinic_key, Number(row.total) || 0]));
    const statusHariIni = clinics.map((klinik) => ({
      klinik,
      imut1: lateToday.get(normalize(klinik)) || 0,
      imut23: imutToday.get(normalize(klinik)) || 0
    }));
    const poliTanpaTerlambat = rekap.filter((row) => row.tepatWaktu > 0 && row.terlambat === 0).length;
    const totalOnTimeRecords = complianceOnTime + complianceLate;

    return NextResponse.json({
      range,
      filters: { clinic: requestedClinic || "all", clinics },
      professionMetrics,
      summary: {
        totalPatients,
        punctuality: totalOnTimeRecords ? Math.round(complianceOnTime / totalOnTimeRecords * 100) : null,
        onTime: complianceOnTime,
        late: complianceLate,
        poliTanpaTerlambat,
        rataRataKedatangan: arrivalCount ? formatTime(totalArrivalMinutes / arrivalCount) : null,
        keterlambatanTerparah: longestDelay,
        totalSesiPraktik: complianceOnTime + complianceLate
      },
      trend,
      clinicVisits,
      scheduleAssignments,
      rekap,
      doctorCompliance,
      statusHariIni,
      aiInsight: buildInsight(rekap)
    });
  } catch (error) {
    console.error("Gagal memuat laporan manajemen:", error);
    return NextResponse.json({ error: "Laporan manajemen belum dapat dimuat." }, { status: 500 });
  }
}
