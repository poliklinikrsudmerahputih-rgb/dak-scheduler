import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { addWorkloadScores, buildScheduleAssignments } from "@/lib/schedule-assignments";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const toDateKey = (year, month, day) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const normalize = (value) => String(value || "").trim().toUpperCase();

function validDate(value) {
  if (!datePattern.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getDateRange(searchParams) {
  const type = searchParams.get("tipe");
  if (type === "harian") {
    const date = searchParams.get("tanggal") || "";
    return validDate(date) ? { start: date, end: date, days: 1 } : null;
  }
  if (type === "bulanan") {
    const month = Number(searchParams.get("bulan"));
    const year = Number(searchParams.get("tahun"));
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) {
      return null;
    }
    const monthKey = String(month).padStart(2, "0");
    const start = `${year}-${monthKey}-01`;
    const end = `${year}-${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
    return { start, end, days };
  }
  if (type === "tahunan") {
    const year = Number(searchParams.get("tahun"));
    if (!Number.isInteger(year) || year < 2000 || year > 9999) return null;
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
    return { start, end, days };
  }
  if (type) return null;

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const preset = searchParams.get("preset") || "month";
  let start;
  let end = todayKey;

  if (preset === "year") {
    start = `${today.getFullYear()}-01-01`;
  } else if (preset === "custom") {
    start = searchParams.get("start") || "";
    end = searchParams.get("end") || "";
  } else if (preset === "month") {
    start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  } else {
    return null;
  }

  if (!validDate(start) || !validDate(end) || start > end) return null;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
  if (days > 366) return null;
  return { start, end, days };
}

function rowsToCounts(rows, field, labelMap = {}) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(row[field] || "Lainnya").trim() || "Lainnya";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name: labelMap[normalize(name)] || name, value }))
    .sort((first, second) => second.value - first.value);
}

function weekdayName(dateKey) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${dateKey}T00:00:00.000Z`)).toUpperCase();
}

function timeMinutes(value) {
  const match = String(value || "").match(/(\d{1,2})[:.](\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function actualJakartaMinutes(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const time = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return Number(time.hour) * 60 + Number(time.minute);
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
    if (!ruangan) return NextResponse.json({ error: "Ruangan sesi tidak valid." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const range = getDateRange(searchParams);
    if (!range) return NextResponse.json({ error: "Rentang tanggal tidak valid (maksimal 366 hari)." }, { status: 400 });

    const roomMatch = `(ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)`;
    const [doctorResult, staffResult, scheduleResult, staffLeaveResult, doctorLeaveResult, practiceResult, attendanceResult, nasaResult] = await Promise.all([
      turso.execute({
        sql: `SELECT id, nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik, bobot_jaspel, ruangan
              FROM master_dokter WHERE ${roomMatch}`,
        args: [ruangan]
      }),
      turso.execute({
        sql: `SELECT id, nama, jabatan, jenis_jabatan FROM sdm
              WHERE ${roomMatch}
                AND COALESCE(is_aktif, 1) = 1
                AND UPPER(COALESCE(status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')
              ORDER BY nama`,
        args: [ruangan]
      }),
      turso.execute({
        sql: `SELECT j.sdm_id, j.tanggal, j.bulan, j.tahun, j.simbol, s.nama, s.jabatan, s.jenis_jabatan
              FROM jadwal_dinas j JOIN sdm s ON s.id = j.sdm_id
                AND (s.ruangan IS NULL OR TRIM(s.ruangan) = '' OR UPPER(TRIM(s.ruangan)) = ?)
                AND COALESCE(s.is_aktif, 1) = 1
                AND UPPER(COALESCE(s.status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')
              WHERE (j.ruangan IS NULL OR TRIM(j.ruangan) = '' OR UPPER(TRIM(j.ruangan)) = ?)
                AND printf('%04d-%02d-%02d', CAST(j.tahun AS INTEGER), CAST(j.bulan AS INTEGER), CAST(j.tanggal AS INTEGER)) BETWEEN ? AND ?`,
        args: [ruangan, ruangan, range.start, range.end]
      }),
      turso.execute({
        sql: `SELECT nama_sdm, jenis_cuti, tgl_mulai, tgl_selesai, status_acc
              FROM cuti_sdm WHERE ${roomMatch} AND NOT (tgl_selesai < ? OR tgl_mulai > ?)`,
        args: [ruangan, range.start, range.end]
      }),
      turso.execute({
        sql: `SELECT nama_dokter, jenis_cuti, tgl_mulai, tgl_selesai
              FROM cuti_dokter WHERE ${roomMatch} AND NOT (tgl_selesai < ? OR tgl_mulai > ?)`,
        args: [ruangan, range.start, range.end]
      }),
      turso.execute({
        sql: `SELECT dokter_id, tanggal, jam_mulai_aktual FROM indikator_mutu_praktik
              WHERE UPPER(TRIM(ruangan)) = ? AND tanggal BETWEEN ? AND ?`,
        args: [ruangan, range.start, range.end]
      }).catch(() => ({ rows: [] })),
      turso.execute({
        sql: `SELECT status_kedisiplinan FROM absensi
              WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)
                AND tanggal BETWEEN ? AND ?`,
        args: [ruangan, range.start, range.end]
      }),
      turso.execute({
        sql: `SELECT n.sdm_id,
                COALESCE(NULLIF(TRIM(s.jabatan), ''), NULLIF(TRIM(s.jenis_jabatan), ''), 'Jabatan belum diisi') AS jabatan,
                AVG((CAST(n.mental_demand AS REAL) + CAST(n.physical_demand AS REAL) +
                     CAST(n.temporal_demand AS REAL) + CAST(n.performance AS REAL) +
                     CAST(n.effort AS REAL) + CAST(n.frustration AS REAL)) / 6.0) AS skor_nasa_tlx
              FROM log_nasa_tlx n
              JOIN sdm s ON s.id = n.sdm_id
              WHERE UPPER(TRIM(n.ruangan)) = ?
                AND (s.ruangan IS NULL OR TRIM(s.ruangan) = '' OR UPPER(TRIM(s.ruangan)) = ?)
                AND COALESCE(s.is_aktif, 1) = 1
                AND UPPER(COALESCE(s.status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')
                AND date(n.tanggal_isi) BETWEEN date(?) AND date(?)
              GROUP BY n.sdm_id`,
        args: [ruangan, ruangan, range.start, range.end]
      })
    ]);

    const doctors = doctorResult.rows || [];
    const staff = staffResult.rows || [];
    const nasaScores = nasaResult.rows || [];
    const requestedClinic = normalize(searchParams.get("clinic"));
    const selectedClinic = requestedClinic === "ALL" ? "" : requestedClinic;
    const clinics = [...new Map(doctors
      .filter((doctor) => String(doctor.klinik || "").trim())
      .map((doctor) => [normalize(doctor.klinik), String(doctor.klinik).trim()])).values()].sort();
    if (selectedClinic && !clinics.some((clinic) => normalize(clinic) === selectedClinic)) {
      return NextResponse.json({ error: "Poliklinik tidak tersedia untuk ruangan Anda." }, { status: 400 });
    }
    const visibleDoctors = selectedClinic
      ? doctors.filter((doctor) => normalize(doctor.klinik) === selectedClinic)
      : doctors;
    let scheduleAssignments = buildScheduleAssignments(scheduleResult.rows || [], visibleDoctors);
    const professionMetricsMap = new Map();
    for (const person of staff) {
      const profession = String(person.jabatan || person.jenis_jabatan || "Jabatan belum diisi").trim();
      const key = profession.toUpperCase();
      if (!professionMetricsMap.has(key)) {
        professionMetricsMap.set(key, {
          jabatan: profession,
          totalSdmAktif: 0,
          dokterIds: new Set(),
          scoreByStaff: new Map()
        });
      }
      professionMetricsMap.get(key).totalSdmAktif += 1;
    }
    const staffById = new Map(staff.map((person) => [String(person.id), person]));
    for (const assignment of scheduleAssignments) {
      const person = staffById.get(String(assignment.sdmId));
      const profession = String(person?.jabatan || person?.jenis_jabatan || "Jabatan belum diisi").trim();
      const group = professionMetricsMap.get(profession.toUpperCase());
      if (group) group.dokterIds.add(String(assignment.dokterId));
    }
    for (const row of nasaScores) {
      const person = staffById.get(String(row.sdm_id));
      const profession = String(row.jabatan || person?.jabatan || person?.jenis_jabatan || "Jabatan belum diisi").trim();
      const group = professionMetricsMap.get(profession.toUpperCase());
      const score = Number(row.skor_nasa_tlx);
      if (group && Number.isFinite(score)) group.scoreByStaff.set(String(row.sdm_id), score);
    }
    const professionMetrics = [...professionMetricsMap.values()].map((group) => {
      const scores = [...group.scoreByStaff.values()];
      const averageWorkload = scores.length
        ? scores.reduce((total, score) => total + score, 0) / scores.length
        : null;
      return {
        jabatan: group.jabatan,
        totalSdmAktif: group.totalSdmAktif,
        totalDokterDitangani: group.dokterIds.size,
        rataRataSkorNasaTlx: averageWorkload === null ? null : Math.round(averageWorkload * 10) / 10,
        rasioKepadatan: group.totalSdmAktif
          ? Math.round(group.dokterIds.size / group.totalSdmAktif * 100) / 100
          : null
      };
    }).sort((first, second) => first.jabatan.localeCompare(second.jabatan, "id"));
    const visibleClinicKeys = [...new Set(visibleDoctors.map((doctor) => normalize(doctor.klinik)).filter(Boolean))];

    let patientRows = [];
    if (visibleClinicKeys.length) {
      const placeholders = visibleClinicKeys.map(() => "?").join(",");
      const patientResult = await turso.execute({
        sql: `SELECT nama_dokter, klinik, tanggal, bulan, tahun, SUM(CAST(jumlah AS INTEGER)) AS jumlah
              FROM jumlah_pasien_poli
              WHERE printf('%04d-%02d-%02d', CAST(tahun AS INTEGER), CAST(bulan AS INTEGER), CAST(tanggal AS INTEGER)) BETWEEN ? AND ?
                AND UPPER(TRIM(klinik)) IN (${placeholders})
              GROUP BY UPPER(TRIM(nama_dokter)), UPPER(TRIM(klinik)), CAST(tanggal AS INTEGER), CAST(bulan AS INTEGER), CAST(tahun AS INTEGER)`,
        args: [range.start, range.end, ...visibleClinicKeys]
      });
      patientRows = (patientResult.rows || []).filter((row) => !selectedClinic || normalize(row.klinik) === selectedClinic);
    }
    scheduleAssignments = addWorkloadScores(scheduleAssignments, patientRows, visibleDoctors);

    const visitByDay = new Map();
    const visitByDoctor = new Map();
    let totalPatients = 0;
    for (const row of patientRows) {
      const date = toDateKey(Number(row.tahun), Number(row.bulan), Number(row.tanggal));
      const count = Number(row.jumlah) || 0;
      const doctorKey = `${normalize(row.nama_dokter)}|${normalize(row.klinik)}`;
      visitByDay.set(date, (visitByDay.get(date) || 0) + count);
      visitByDoctor.set(doctorKey, (visitByDoctor.get(doctorKey) || 0) + count);
      totalPatients += count;
    }

    const dailyTrend = [];
    const monthlyTrend = new Map();
    for (let timestamp = Date.parse(`${range.start}T00:00:00Z`); timestamp <= Date.parse(`${range.end}T00:00:00Z`); timestamp += 86400000) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const visits = visitByDay.get(date) || 0;
      const monthKey = date.slice(0, 7);
      monthlyTrend.set(monthKey, (monthlyTrend.get(monthKey) || 0) + visits);
      if (range.days <= 62) dailyTrend.push({ label: date.slice(5), tanggal: date, pasien: visits });
    }
    const trend = range.days <= 62
      ? dailyTrend
      : [...monthlyTrend.entries()].map(([label, pasien]) => ({ label, pasien }));

    const expectedByDoctor = new Map();
    let expectedSessions = 0;
    for (const doctor of visibleDoctors) expectedByDoctor.set(Number(doctor.id), 0);
    for (let timestamp = Date.parse(`${range.start}T00:00:00Z`); timestamp <= Date.parse(`${range.end}T00:00:00Z`); timestamp += 86400000) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const weekday = weekdayName(date);
      for (const doctor of visibleDoctors) {
        const scheduledDays = String(doctor.jadwal_hari || "").toUpperCase().split(/[,;/|]+/).map((day) => day.trim());
        if (scheduledDays.includes(weekday)) {
          expectedByDoctor.set(Number(doctor.id), (expectedByDoctor.get(Number(doctor.id)) || 0) + 1);
          expectedSessions += 1;
        }
      }
    }
    const doctorWorkload = visibleDoctors.map((doctor) => ({
      name: doctor.nama_dokter,
      clinic: doctor.klinik,
      pasien: visitByDoctor.get(`${normalize(doctor.nama_dokter)}|${normalize(doctor.klinik)}`) || 0,
      sesi: expectedByDoctor.get(Number(doctor.id)) || 0
    })).sort((first, second) => second.pasien - first.pasien).slice(0, 10);

    const staffWorkloadMap = new Map();
    for (const row of scheduleResult.rows || []) {
      const name = String(row.nama || `SDM ${row.sdm_id}`);
      staffWorkloadMap.set(name, (staffWorkloadMap.get(name) || 0) + 1);
    }
    const staffWorkload = [...staffWorkloadMap.entries()]
      .map(([name, shifts]) => ({ name, shifts }))
      .sort((first, second) => second.shifts - first.shifts).slice(0, 8);

    const approvedStaffLeaves = (staffLeaveResult.rows || []).filter((leave) => normalize(leave.status_acc) === "DISETUJUI");
    const doctorLeaveRecords = doctorLeaveResult.rows || [];
    const leaveTypes = rowsToCounts([...approvedStaffLeaves, ...doctorLeaveRecords], "jenis_cuti", {
      CS: "Sakit", CT: "Cuti tahunan", CM: "Cuti melahirkan", DL: "Dinas luar", L: "Libur"
    });
    const activeStaffNames = new Set(approvedStaffLeaves
      .filter((leave) => leave.tgl_mulai <= range.end && leave.tgl_selesai >= range.start)
      .map((leave) => normalize(leave.nama_sdm)));

    const doctorsById = new Map(visibleDoctors.map((doctor) => [Number(doctor.id), doctor]));
    let onTime = 0;
    let late = 0;
    let practiceStarts = 0;
    for (const record of practiceResult.rows || []) {
      const doctor = doctorsById.get(Number(record.dokter_id));
      if (doctor && record.jam_mulai_aktual) practiceStarts += 1;
      const scheduled = timeMinutes(doctor?.jam_praktik);
      const actual = actualJakartaMinutes(record.jam_mulai_aktual);
      if (scheduled === null || actual === null) continue;
      if (actual - scheduled <= 15) onTime += 1;
      else late += 1;
    }
    const attendanceRows = attendanceResult.rows || [];
    const attendanceOnTime = attendanceRows.filter((row) => normalize(row.status_kedisiplinan) === "TEPAT WAKTU").length;

    const daySlots = ["07-09", "09-11", "11-13", "13-15", "15-17"];
    const weekdayLabels = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU"];
    const heatmap = weekdayLabels.map((day) => ({
      day,
      slots: daySlots.map((slot) => {
        const [startHour, endHour] = slot.split("-").map(Number);
        const count = visibleDoctors.filter((doctor) => {
          const scheduledDays = String(doctor.jadwal_hari || "").toUpperCase().split(/[,;/|]+/).map((value) => value.trim());
          const minutes = timeMinutes(doctor.jam_praktik);
          return scheduledDays.includes(day) && minutes !== null && minutes >= startHour * 60 && minutes < endHour * 60;
        }).length;
        return { label: slot, value: count };
      })
    }));

    const insights = [];
    const topClinic = new Map();
    for (const row of patientRows) topClinic.set(String(row.klinik || "Lainnya"), (topClinic.get(String(row.klinik || "Lainnya")) || 0) + (Number(row.jumlah) || 0));
    const busiestClinic = [...topClinic.entries()].sort((first, second) => second[1] - first[1])[0];
    if (busiestClinic && totalPatients > 0) {
      insights.push(`${busiestClinic[0]} mencatat volume tertinggi: ${busiestClinic[1].toLocaleString("id-ID")} pasien (${Math.round(busiestClinic[1] / totalPatients * 100)}% dari kunjungan terdata).`);
    }
    const latestWeekStart = Date.parse(`${range.end}T00:00:00Z`) - 6 * 86400000;
    const priorWeekStart = latestWeekStart - 7 * 86400000;
    let latestWeekPatients = 0;
    let priorWeekPatients = 0;
    for (const [date, count] of visitByDay) {
      const timestamp = Date.parse(`${date}T00:00:00Z`);
      if (timestamp >= latestWeekStart && timestamp <= Date.parse(`${range.end}T00:00:00Z`)) latestWeekPatients += count;
      else if (timestamp >= priorWeekStart && timestamp < latestWeekStart) priorWeekPatients += count;
    }
    if (range.days >= 14 && priorWeekPatients > 0) {
      const change = Math.round((latestWeekPatients - priorWeekPatients) / priorWeekPatients * 100);
      insights.push(`Volume kunjungan 7 hari terakhir ${change >= 0 ? "naik" : "turun"} ${Math.abs(change)}% dibanding 7 hari sebelumnya (${latestWeekPatients.toLocaleString("id-ID")} vs ${priorWeekPatients.toLocaleString("id-ID")} pasien).`);
    }
    if (approvedStaffLeaves.length || doctorLeaveRecords.length) {
      insights.push(`${approvedStaffLeaves.length} cuti SDM disetujui dan ${doctorLeaveRecords.length} catatan berhalangan dokter tercatat pada rentang laporan; periksa cakupan jadwal poli terkait.`);
    }
    const recordedStarts = onTime + late;
    if (recordedStarts) {
      insights.push(`Ketepatan waktu praktik tercatat ${Math.round(onTime / recordedStarts * 100)}% (${onTime} tepat waktu dari ${recordedStarts} pencatatan; toleransi 15 menit).`);
    }
    if (!insights.length) insights.push("Data periode ini belum cukup untuk membentuk wawasan. Periksa kembali rentang tanggal dan pencatatan operasional.");

    return NextResponse.json({
      range: { ...range, preset: searchParams.get("preset") || "month" },
      filters: { ruangan, clinic: selectedClinic || "all", clinics },
      summary: {
        totalPatients,
        totalDoctors: visibleDoctors.length,
        totalStaff: staff.length,
        approvedLeaves: approvedStaffLeaves.length + doctorLeaveRecords.length,
        absentStaff: activeStaffNames.size,
        absenceRate: staff.length ? Math.round(activeStaffNames.size / staff.length * 100) : 0,
        attendanceCount: attendanceRows.length,
        attendanceOnTime,
        onTime,
        late,
        practiceStarts,
        expectedSessions,
        practiceCoverage: expectedSessions ? Math.min(100, Math.round(practiceStarts / expectedSessions * 100)) : null,
        punctuality: recordedStarts ? Math.round(onTime / recordedStarts * 100) : null
      },
      trend,
      doctorWorkload,
      staffWorkload,
      scheduleAssignments,
      professionMetrics,
      leaveTypes,
      heatmap,
      insights
    });
  } catch (error) {
    console.error("Gagal memuat analitik operasional:", error);
    return NextResponse.json({ error: "Data analisis belum dapat dimuat." }, { status: 500 });
  }
}