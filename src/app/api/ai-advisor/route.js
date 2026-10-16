import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value) {
  if (!datePattern.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function defaultRange() {
  const today = new Date();
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  return { start: `${end.slice(0, 7)}-01`, end };
}

function getRange(start, end) {
  const fallback = defaultRange();
  const range = { start: start || fallback.start, end: end || fallback.end };
  if (!isDateKey(range.start) || !isDateKey(range.end) || range.start > range.end) return null;
  if ((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86400000 > 365) return null;
  return range;
}

async function getSessionRuangan() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  if (!sessionCookie) return null;
  try {
    const session = JSON.parse(sessionCookie.value);
    const ruangan = String(session?.ruangan || "POLIKLINIK").trim().toUpperCase();
    return ruangan || null;
  } catch {
    return null;
  }
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

async function executeMetricQuery(sql, args) {
  const result = await turso.execute({ sql, args });
  return result.rows[0] || {};
}

function staffClinicFilter(alias, clinic) {
  return clinic
    ? {
        sql: ` AND instr(',' || REPLACE(REPLACE(UPPER(COALESCE(${alias}.daftar_klinik, '')), ', ', ','), ' ', '') || ',', ',' || REPLACE(UPPER(?), ' ', '') || ',') > 0`,
        args: [clinic],
      }
    : { sql: "", args: [] };
}

async function getMetrics(ruangan, range, clinic) {
  const staffClinic = staffClinicFilter("s", clinic);
  const imutClinic = clinic ? " AND UPPER(TRIM(l.klinik)) = ?" : "";
  const doctorClinic = clinic ? " AND UPPER(TRIM(d.klinik)) = ?" : "";
  const patientClinic = clinic ? " AND UPPER(TRIM(p.klinik)) = ?" : "";
  const clinicArgs = clinic ? [clinic.toUpperCase()] : [];
  const queries = [
    executeMetricQuery(
      `SELECT AVG(CAST(l.waktu_tunggu_menit AS REAL)) AS average,
              COUNT(l.waktu_tunggu_menit) AS samples
       FROM log_imut_pasien l
       LEFT JOIN master_dokter d ON CAST(d.id AS TEXT) = CAST(l.dokter_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(d.ruangan, 'POLIKLINIK'))) = ?
         AND date(l.tanggal) BETWEEN date(?) AND date(?)${imutClinic}`,
      [ruangan, range.start, range.end, ...clinicArgs],
    ),
    executeMetricQuery(
      `SELECT AVG((
                CAST(n.mental_demand AS REAL) + CAST(n.physical_demand AS REAL) +
                CAST(n.temporal_demand AS REAL) + CAST(n.performance AS REAL) +
                CAST(n.effort AS REAL) + CAST(n.frustration AS REAL)
              ) / 6.0) AS average,
              COUNT(n.id) AS samples
       FROM log_nasa_tlx n
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(n.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?
         AND date(n.tanggal_isi) BETWEEN date(?) AND date(?)${staffClinic.sql}`,
      [ruangan, range.start, range.end, ...staffClinic.args],
    ),
    executeMetricQuery(
      `SELECT AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('ASESMEN', 'ASSESSMENT')
                       THEN CAST(o.durasi_menit AS REAL) END) AS assessment,
              AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('PEMERIKSAAN', 'PEMERIKSAAN DOKTER', 'EXAMINATION')
                       THEN CAST(o.durasi_menit AS REAL) END) AS examination,
              AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('EDUKASI', 'EDUCATION')
                       THEN CAST(o.durasi_menit AS REAL) END) AS education,
              AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('TINDAKAN', 'ACTION')
                       THEN CAST(o.durasi_menit AS REAL) END) AS action,
              COUNT(o.id) AS samples,
              COUNT(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('ASESMEN', 'ASSESSMENT') THEN o.id END) AS assessment_samples,
              COUNT(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('EDUKASI', 'EDUCATION') THEN o.id END) AS education_samples,
              COUNT(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('TINDAKAN', 'ACTION') THEN o.id END) AS action_samples
       FROM log_observasi_kerja o
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(o.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?
         AND date(o.tanggal_input) BETWEEN date(?) AND date(?)${staffClinic.sql}`,
      [ruangan, range.start, range.end, ...staffClinic.args],
    ),
    executeMetricQuery(
      `SELECT COALESCE(SUM(CAST(p.jumlah AS INTEGER)), 0) AS total,
              COUNT(*) AS samples
       FROM jumlah_pasien_poli p
       JOIN master_dokter d
         ON UPPER(TRIM(d.nama_dokter)) = UPPER(TRIM(p.nama_dokter))
        AND UPPER(TRIM(d.klinik)) = UPPER(TRIM(p.klinik))
       WHERE UPPER(TRIM(COALESCE(d.ruangan, 'POLIKLINIK'))) = ?
         AND printf('%04d-%02d-%02d', CAST(p.tahun AS INTEGER), CAST(p.bulan AS INTEGER), CAST(p.tanggal AS INTEGER))
             BETWEEN ? AND ?${patientClinic}`,
      [ruangan, range.start, range.end, ...clinicArgs],
    ),
    executeMetricQuery(
      `SELECT
         (SELECT COUNT(DISTINCT s.id)
          FROM sdm s
          JOIN jadwal_dinas j ON CAST(j.sdm_id AS TEXT) = CAST(s.id AS TEXT)
          WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?
            AND printf('%04d-%02d-%02d', CAST(j.tahun AS INTEGER), CAST(j.bulan AS INTEGER), CAST(j.tanggal AS INTEGER))
                BETWEEN ? AND ?${staffClinic.sql}) AS scheduled_staff,
         (SELECT COUNT(DISTINCT d.id)
          FROM master_dokter d
          JOIN indikator_mutu_praktik ip ON CAST(ip.dokter_id AS TEXT) = CAST(d.id AS TEXT)
          WHERE UPPER(TRIM(COALESCE(ip.ruangan, ''))) = ?
            AND date(ip.tanggal) BETWEEN date(?) AND date(?)${doctorClinic}) AS practice_doctors`,
      [
        ruangan, range.start, range.end, ...staffClinic.args,
        ruangan, range.start, range.end, ...clinicArgs,
      ],
    ),
    executeMetricQuery(
      `SELECT COUNT(j.id) AS samples
       FROM jadwal_dinas j
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(j.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?
         AND printf('%04d-%02d-%02d', CAST(j.tahun AS INTEGER), CAST(j.bulan AS INTEGER), CAST(j.tanggal AS INTEGER))
             BETWEEN ? AND ?${staffClinic.sql}`,
      [ruangan, range.start, range.end, ...staffClinic.args],
    ),
    executeMetricQuery(
      `SELECT COUNT(*) AS samples,
              SUM(CASE WHEN UPPER(TRIM(a.status_kedisiplinan)) = 'TEPAT WAKTU' THEN 1 ELSE 0 END) AS on_time
       FROM absensi a
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(a.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(a.ruangan, ''))) = ?
         AND date(a.tanggal) BETWEEN date(?) AND date(?)${staffClinic.sql}`,
      [ruangan, range.start, range.end, ...staffClinic.args],
    ),
    executeMetricQuery(
      `SELECT COUNT(DISTINCT c.id) AS samples
       FROM cuti_sdm c
       LEFT JOIN sdm s ON UPPER(TRIM(s.nama)) = UPPER(TRIM(c.nama_sdm))
       WHERE (c.ruangan IS NULL OR TRIM(c.ruangan) = '' OR UPPER(TRIM(c.ruangan)) = ?)
         AND UPPER(TRIM(COALESCE(c.status_acc, ''))) = 'DISETUJUI'
         AND date(c.tgl_mulai) <= date(?) AND date(c.tgl_selesai) >= date(?)
         ${staffClinic.sql}`,
      [ruangan, range.end, range.start, ...staffClinic.args],
    ),
    executeMetricQuery(
      `SELECT COUNT(DISTINCT c.id) AS samples
       FROM cuti_dokter c
       LEFT JOIN master_dokter d ON UPPER(TRIM(d.nama_dokter)) = UPPER(TRIM(c.nama_dokter))
       WHERE (c.ruangan IS NULL OR TRIM(c.ruangan) = '' OR UPPER(TRIM(c.ruangan)) = ?)
         AND date(c.tgl_mulai) <= date(?) AND date(c.tgl_selesai) >= date(?)${doctorClinic}`,
      [ruangan, range.end, range.start, ...clinicArgs],
    ),
    executeMetricQuery(
      `SELECT COUNT(*) AS samples,
              COUNT(ip.jam_mulai_aktual) AS practice_starts
       FROM indikator_mutu_praktik ip
       LEFT JOIN master_dokter d ON CAST(d.id AS TEXT) = CAST(ip.dokter_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(ip.ruangan, ''))) = ?
         AND date(ip.tanggal) BETWEEN date(?) AND date(?)${doctorClinic}`,
      [ruangan, range.start, range.end, ...clinicArgs],
    ),
  ];

  const rows = await Promise.all(queries);
  const [imut = {}, tlx = {}, observation = {}, patients = {}, staffing = {}, schedule = {}, attendance = {}, staffLeave = {}, doctorLeave = {}, practice = {}] = rows;
  return {
    averageWaitMinutes: number(imut.average),
    averageTlxScore: number(tlx.average),
    averageAssessmentMinutes: number(observation.assessment),
    averageExaminationMinutes: number(observation.examination),
    averageEducationMinutes: number(observation.education),
    averageActionMinutes: number(observation.action),
    totalPatients: number(patients.total),
    patientSamples: number(patients.samples),
    activeStaff: number(staffing.scheduled_staff),
    doctors: number(staffing.practice_doctors),
    scheduledShifts: number(schedule.samples),
    attendanceRecords: number(attendance.samples),
    onTimeAttendance: number(attendance.on_time),
    approvedStaffLeave: number(staffLeave.samples),
    doctorLeaveRecords: number(doctorLeave.samples),
    practiceStarts: number(practice.practice_starts),
    sampleCounts: {
      imut: number(imut.samples),
      nasaTlx: number(tlx.samples),
      observations: number(observation.samples),
      assessment: number(observation.assessment_samples),
      education: number(observation.education_samples),
      action: number(observation.action_samples),
      attendance: number(attendance.samples),
      schedules: number(schedule.samples),
    },
  };
}

async function getRequestScope(request, body = {}) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) return { error: "Unauthorized", status: 401 };
  const params = request.nextUrl.searchParams;
  const read = (...keys) => {
    for (const key of keys) {
      const value = body[key] ?? params.get(key);
      if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };
  const periodType = read("periode", "period", "tipe");
  const month = read("bulan", "month");
  const year = read("tahun", "year");
  const quarter = read("triwulan", "quarter");
  let start = read("start");
  let end = read("end");
  if (periodType) {
    const numericYear = Number(year);
    if (periodType === "harian") {
      start = read("tanggal");
      end = start;
    } else if (periodType === "bulanan") {
      const numericMonth = Number(month);
      if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 9999
        || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
        return { error: "Filter bulan/tahun tidak valid.", status: 400 };
      }
      start = `${numericYear}-${String(numericMonth).padStart(2, "0")}-01`;
      end = `${numericYear}-${String(numericMonth).padStart(2, "0")}-${String(new Date(numericYear, numericMonth, 0).getDate()).padStart(2, "0")}`;
    } else if (periodType === "triwulan") {
      const numericQuarter = Number(quarter);
      if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 9999
        || !Number.isInteger(numericQuarter) || numericQuarter < 1 || numericQuarter > 4) {
        return { error: "Filter triwulan/tahun tidak valid.", status: 400 };
      }
      const firstMonth = (numericQuarter - 1) * 3 + 1;
      const lastMonth = firstMonth + 2;
      start = `${numericYear}-${String(firstMonth).padStart(2, "0")}-01`;
      end = `${numericYear}-${String(lastMonth).padStart(2, "0")}-${String(new Date(numericYear, lastMonth, 0).getDate()).padStart(2, "0")}`;
    } else if (periodType === "tahunan") {
      if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 9999) {
        return { error: "Filter tahun tidak valid.", status: 400 };
      }
      start = `${numericYear}-01-01`;
      end = `${numericYear}-12-31`;
    }
  }
  const range = start || end ? getRange(start, end) : getRange("", "");
  if (!range) return { error: "Rentang tanggal tidak valid (maksimal 366 hari).", status: 400 };
  if (periodType && !["harian", "bulanan", "triwulan", "tahunan"].includes(periodType)) {
    return { error: "Jenis periode tidak valid.", status: 400 };
  }
  const requestedClinic = read("poli", "clinic");
  const clinic = ["all", "semua", "semua poliklinik"].includes(requestedClinic.toLowerCase())
    ? ""
    : requestedClinic;
  if (clinic.length > 120) return { error: "Filter poliklinik tidak valid.", status: 400 };
  return { ruangan, range, clinic, periodType, month, year, quarter };
}

function getPeriodLabel(scope) {
  const year = Number(scope.year);
  const month = Number(scope.month);
  if (scope.periodType === "bulanan" && month >= 1 && month <= 12 && Number.isInteger(year)) {
    const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
    return `${monthName} ${year}`;
  }
  if (scope.periodType === "triwulan" && Number(scope.quarter) >= 1 && Number(scope.quarter) <= 4) {
    return `Triwulan ${scope.quarter} ${scope.year}`;
  }
  if (scope.periodType === "tahunan" && Number.isInteger(year)) return String(year);
  if (scope.periodType === "harian") return scope.range.start;
  return `${scope.range.start} sampai ${scope.range.end}`;
}

export async function GET(request) {
  const scope = await getRequestScope(request);
  if (scope.error) {
    return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });
  }
  let metrics;
  try {
    metrics = await getMetrics(scope.ruangan, scope.range, scope.clinic);
  } catch (error) {
    console.error("AI Advisor gagal memuat metrik:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat metrik analisis." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    ruangan: scope.ruangan,
    range: scope.range,
    periode: scope.periodType,
    clinic: scope.clinic || "Semua poliklinik",
    metrics,
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Isi permintaan analisis tidak valid." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Isi permintaan analisis tidak valid." }, { status: 400 });
  }
  const scope = await getRequestScope(request, body);
  if (scope.error) {
    return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });
  }
  const allowedTabs = ["Ringkasan Manajemen", "Operasional & SDM", "Laporan Mutu (IMUT)"];
  const activeTab = allowedTabs.includes(body.activeTab) ? body.activeTab : null;
  if (!activeTab) {
    return NextResponse.json({ success: false, error: "Konteks tab analisis tidak valid." }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "GROQ_API_KEY belum dikonfigurasi pada environment server." },
      { status: 503 },
    );
  }

  let metrics;
  try {
    metrics = await getMetrics(scope.ruangan, scope.range, scope.clinic);
  } catch (error) {
    console.error("AI Advisor gagal memuat metrik:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat metrik analisis." }, { status: 500 });
  }
  const periodLabel = getPeriodLabel(scope);
  const tabFocus = {
    "Operasional & SDM": "Fokuskan analisis pada korelasi Skor NASA-TLX, jumlah shift, dan kehadiran dokter. Berikan strategi SDM operasional.",
    "Laporan Mutu (IMUT)": "Fokuskan analisis pada indikator mutu: Waktu Tunggu, Asesmen, Edukasi, dan Tindakan. Berikan langkah klinis out-of-the-box.",
    "Ringkasan Manajemen": "Berikan ringkasan analisis tingkat dewan direksi (Executive Summary) mencakup efisiensi waktu dan beban staf.",
  }[activeTab];
  const systemPrompt = `Anda adalah AI Executive Advisor untuk manajemen rumah sakit. Berikut adalah data untuk periode ${periodLabel} di ${scope.clinic || "Semua poliklinik"} (ruangan ${scope.ruangan}, ${scope.range.start} sampai ${scope.range.end}). Analisis hanya data dalam rentang dan poliklinik tersebut. Konteks tab aktif: ${activeTab}.

ARAHAN KONTEKS TAB:
${tabFocus}

DATA TERSEDIA:
- IMUT waktu tunggu: rata-rata ${metrics.averageWaitMinutes.toFixed(2)} menit dari ${metrics.sampleCounts.imut} sampel.
- Volume pasien tercatat: ${metrics.totalPatients} pasien pada ${metrics.patientSamples} rekap.
- Beban NASA-TLX: rata-rata ${metrics.averageTlxScore.toFixed(2)}/100 dari ${metrics.sampleCounts.nasaTlx} kuesioner.
- Time-Motion perawat: asesmen ${metrics.averageAssessmentMinutes.toFixed(2)} menit, edukasi ${metrics.averageEducationMinutes.toFixed(2)} menit, tindakan ${metrics.averageActionMinutes.toFixed(2)} menit; ${metrics.sampleCounts.observations} kejadian.
- Pemeriksaan dokter: ${metrics.averageExaminationMinutes.toFixed(2)} menit.
- Cakupan pada periode terpilih: ${metrics.activeStaff} SDM dengan shift, ${metrics.doctors} dokter dengan catatan praktik, ${metrics.scheduledShifts} shift terjadwal.
- Absensi: ${metrics.onTimeAttendance} tepat waktu dari ${metrics.attendanceRecords} catatan.
- Cuti pada periode: ${metrics.approvedStaffLeave} cuti SDM disetujui, ${metrics.doctorLeaveRecords} catatan cuti dokter.
- Praktik dokter: ${metrics.practiceStarts} pencatatan mulai praktik.

TUGAS:
1. Identifikasi paling banyak 3 temuan penting yang menghubungkan volume pasien, waktu tunggu, beban SDM, jadwal, mutu, dan ketidakhadiran bila datanya mendukung.
2. Berikan tepat 3 langkah strategis yang konkret, realistis, terukur, dan dapat ditindaklanjuti.
3. Bedakan fakta data dan hipotesis; jangan menyatakan korelasi sebagai sebab-akibat.
4. Jika sampel suatu sumber 0, nyatakan sebagai data tidak tersedia, bukan kondisi operasional normal. Jangan menggunakan atau mengasumsikan data di luar rentang periode dan poliklinik yang dipilih.
Gunakan bahasa Indonesia yang jelas, ringkas, dan berbentuk poin. Jangan tampilkan atau menebak identitas pasien maupun pegawai.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.35,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Groq AI Advisor request gagal:", response.status, result.error?.message || "Unknown error");
      const errorByStatus = {
        401: "API key Groq tidak valid atau sudah dicabut. Perbarui GROQ_API_KEY pada environment server, lalu restart aplikasi.",
        403: "Akun Groq tidak memiliki akses ke model AI yang dipilih.",
        404: "Model AI tidak ditemukan. Pastikan model yang dipakai tersedia pada akun Groq.",
        429: "Batas penggunaan Groq tercapai. Periksa kuota atau coba kembali nanti.",
      };
      return NextResponse.json(
        {
          success: false,
          error: errorByStatus[response.status]
            || `Groq gagal memproses analisis (HTTP ${response.status}). Coba kembali nanti.`,
        },
        { status: 502 },
      );
    }
    const analysis = result.choices?.[0]?.message?.content;
    if (typeof analysis !== "string" || !analysis.trim()) {
      console.error("Groq AI Advisor mengembalikan respons kosong.");
      return NextResponse.json(
        { success: false, error: "Layanan AI mengembalikan analisis kosong." },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, analysis, range: scope.range, activeTab, metrics });
  } catch (error) {
    console.error("Groq AI Advisor gagal diakses:", error);
    return NextResponse.json(
      { success: false, error: "Layanan AI sedang tidak dapat diakses. Coba kembali nanti." },
      { status: 502 },
    );
  }
}
