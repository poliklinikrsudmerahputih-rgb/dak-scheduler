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

async function safeQuery(name, sql, args) {
  try {
    const result = await turso.execute({ sql, args });
    return result.rows[0] || {};
  } catch (error) {
    console.warn(`AI Advisor: tabel/metrik ${name} tidak tersedia; memakai nilai 0.`, error.message);
    return {};
  }
}

async function getMetrics(ruangan, range, clinic) {
  const clinicPredicate = clinic ? " AND UPPER(TRIM(l.klinik)) = ?" : "";
  const clinicArgs = clinic ? [clinic.toUpperCase()] : [];
  const patientClinicPredicate = clinic ? " AND UPPER(TRIM(p.klinik)) = ?" : "";
  const patientClinicArgs = clinic ? [clinic.toUpperCase()] : [];
  const queries = [
    safeQuery(
      "IMUT waktu tunggu",
      `SELECT AVG(CASE WHEN date(l.tanggal) BETWEEN date(?) AND date(?)
                       THEN CAST(l.waktu_tunggu_menit AS REAL) END) AS average,
              COUNT(CASE WHEN date(l.tanggal) BETWEEN date(?) AND date(?)
                         THEN l.waktu_tunggu_menit END) AS samples,
              AVG(CAST(l.waktu_tunggu_menit AS REAL)) AS historical_average,
              COUNT(l.waktu_tunggu_menit) AS historical_samples,
              MIN(date(l.tanggal)) AS first_date,
              MAX(date(l.tanggal)) AS last_date
       FROM log_imut_pasien l
       LEFT JOIN master_dokter d ON CAST(d.id AS TEXT) = CAST(l.dokter_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(d.ruangan, 'POLIKLINIK'))) = ?${clinicPredicate}`,
      [range.start, range.end, range.start, range.end, ruangan, ...clinicArgs],
    ),
    safeQuery(
      "NASA-TLX",
      `SELECT AVG(CASE WHEN date(n.tanggal_isi) BETWEEN date(?) AND date(?) THEN (
                CAST(n.mental_demand AS REAL) +
                CAST(n.physical_demand AS REAL) +
                CAST(n.temporal_demand AS REAL) +
                CAST(n.performance AS REAL) +
                CAST(n.effort AS REAL) +
                CAST(n.frustration AS REAL)
              ) / 6.0 END) AS average,
              COUNT(CASE WHEN date(n.tanggal_isi) BETWEEN date(?) AND date(?) THEN n.id END) AS samples,
              AVG((
                CAST(n.mental_demand AS REAL) +
                CAST(n.physical_demand AS REAL) +
                CAST(n.temporal_demand AS REAL) +
                CAST(n.performance AS REAL) +
                CAST(n.effort AS REAL) +
                CAST(n.frustration AS REAL)
              ) / 6.0) AS historical_average,
              COUNT(n.id) AS historical_samples,
              MIN(date(n.tanggal_isi)) AS first_date,
              MAX(date(n.tanggal_isi)) AS last_date
       FROM log_nasa_tlx n
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(n.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?`,
      [range.start, range.end, range.start, range.end, ruangan],
    ),
    safeQuery(
      "observasi Time-Motion",
      `SELECT AVG(CASE
                WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                 AND UPPER(TRIM(o.blok_kategori)) IN ('ASESMEN', 'ASSESSMENT')
                THEN CAST(o.durasi_menit AS REAL)
              END) AS assessment,
              AVG(CASE
                WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                 AND UPPER(TRIM(o.blok_kategori)) IN ('PEMERIKSAAN', 'PEMERIKSAAN DOKTER', 'EXAMINATION')
                THEN CAST(o.durasi_menit AS REAL)
              END) AS examination,
              AVG(CASE
                WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                 AND UPPER(TRIM(o.blok_kategori)) IN ('EDUKASI', 'EDUCATION')
                THEN CAST(o.durasi_menit AS REAL)
              END) AS education,
              AVG(CASE
                WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                 AND UPPER(TRIM(o.blok_kategori)) IN ('TINDAKAN', 'ACTION')
                THEN CAST(o.durasi_menit AS REAL)
              END) AS action,
              COUNT(CASE WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?) THEN o.id END) AS samples,
              COUNT(CASE WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                           AND UPPER(TRIM(o.blok_kategori)) IN ('ASESMEN', 'ASSESSMENT') THEN o.id END) AS assessment_samples,
              COUNT(CASE WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                           AND UPPER(TRIM(o.blok_kategori)) IN ('EDUKASI', 'EDUCATION') THEN o.id END) AS education_samples,
              COUNT(CASE WHEN date(o.tanggal_input) BETWEEN date(?) AND date(?)
                           AND UPPER(TRIM(o.blok_kategori)) IN ('TINDAKAN', 'ACTION') THEN o.id END) AS action_samples,
              AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('ASESMEN', 'ASSESSMENT') THEN CAST(o.durasi_menit AS REAL) END) AS historical_assessment,
              AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('EDUKASI', 'EDUCATION') THEN CAST(o.durasi_menit AS REAL) END) AS historical_education,
              AVG(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('TINDAKAN', 'ACTION') THEN CAST(o.durasi_menit AS REAL) END) AS historical_action,
              COUNT(o.id) AS historical_samples,
              COUNT(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('ASESMEN', 'ASSESSMENT') THEN o.id END) AS historical_assessment_samples,
              COUNT(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('EDUKASI', 'EDUCATION') THEN o.id END) AS historical_education_samples,
              COUNT(CASE WHEN UPPER(TRIM(o.blok_kategori)) IN ('TINDAKAN', 'ACTION') THEN o.id END) AS historical_action_samples,
              MIN(date(o.tanggal_input)) AS first_date,
              MAX(date(o.tanggal_input)) AS last_date
       FROM log_observasi_kerja o
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(o.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?`,
      [
        range.start, range.end, range.start, range.end, range.start, range.end, range.start, range.end,
        range.start, range.end, range.start, range.end, range.start, range.end, range.start, range.end,
        range.start, range.end, ruangan,
      ],
    ),
    safeQuery(
      "volume pasien",
      `SELECT COALESCE(SUM(CAST(p.jumlah AS INTEGER)), 0) AS total,
              COUNT(*) AS samples
       FROM jumlah_pasien_poli p
       JOIN master_dokter d
         ON UPPER(TRIM(d.nama_dokter)) = UPPER(TRIM(p.nama_dokter))
        AND UPPER(TRIM(d.klinik)) = UPPER(TRIM(p.klinik))
       WHERE UPPER(TRIM(COALESCE(d.ruangan, 'POLIKLINIK'))) = ?
         AND printf('%04d-%02d-%02d', CAST(p.tahun AS INTEGER), CAST(p.bulan AS INTEGER), CAST(p.tanggal AS INTEGER))
             BETWEEN ? AND ?${patientClinicPredicate}`,
      [ruangan, range.start, range.end, ...patientClinicArgs],
    ),
    safeQuery(
      "cakupan SDM dan dokter",
      `SELECT
         (SELECT COUNT(*) FROM sdm
          WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)
            AND COALESCE(is_aktif, 1) = 1
            AND UPPER(COALESCE(status_kerja, '')) NOT IN ('RESIGN', 'NON_AKTIF')) AS active_staff,
         (SELECT COUNT(*) FROM master_dokter
          WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)) AS doctors`,
      [ruangan, ruangan],
    ),
    safeQuery(
      "jadwal dinas",
      `SELECT COUNT(j.id) AS samples
       FROM jadwal_dinas j
       JOIN sdm s ON CAST(s.id AS TEXT) = CAST(j.sdm_id AS TEXT)
       WHERE UPPER(TRIM(COALESCE(s.ruangan, ''))) = ?
         AND printf('%04d-%02d-%02d', CAST(j.tahun AS INTEGER), CAST(j.bulan AS INTEGER), CAST(j.tanggal AS INTEGER))
             BETWEEN ? AND ?`,
      [ruangan, range.start, range.end],
    ),
    safeQuery(
      "absensi",
      `SELECT COUNT(*) AS samples,
              SUM(CASE WHEN UPPER(TRIM(status_kedisiplinan)) = 'TEPAT WAKTU' THEN 1 ELSE 0 END) AS on_time
       FROM absensi
       WHERE UPPER(TRIM(COALESCE(ruangan, ''))) = ?
         AND date(tanggal) BETWEEN date(?) AND date(?)`,
      [ruangan, range.start, range.end],
    ),
    safeQuery(
      "cuti SDM",
      `SELECT COUNT(*) AS samples
       FROM cuti_sdm
       WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)
         AND UPPER(TRIM(COALESCE(status_acc, ''))) = 'DISETUJUI'
         AND date(tgl_mulai) <= date(?) AND date(tgl_selesai) >= date(?)`,
      [ruangan, range.end, range.start],
    ),
    safeQuery(
      "cuti dokter",
      `SELECT COUNT(*) AS samples
       FROM cuti_dokter
       WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = ?)
         AND date(tgl_mulai) <= date(?) AND date(tgl_selesai) >= date(?)`,
      [ruangan, range.end, range.start],
    ),
    safeQuery(
      "kepatuhan praktik dokter",
      `SELECT COUNT(*) AS samples,
              COUNT(jam_mulai_aktual) AS practice_starts
       FROM indikator_mutu_praktik
       WHERE UPPER(TRIM(COALESCE(ruangan, ''))) = ?
         AND date(tanggal) BETWEEN date(?) AND date(?)`,
      [ruangan, range.start, range.end],
    ),
  ];

  const settled = await Promise.allSettled(queries);
  const rows = settled.map((result) => result.status === "fulfilled" ? result.value : {});
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
    activeStaff: number(staffing.active_staff),
    doctors: number(staffing.doctors),
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
    history: {
      averageWaitMinutes: number(imut.historical_average),
      averageTlxScore: number(tlx.historical_average),
      averageAssessmentMinutes: number(observation.historical_assessment),
      averageEducationMinutes: number(observation.historical_education),
      averageActionMinutes: number(observation.historical_action),
      sampleCounts: {
        imut: number(imut.historical_samples),
        nasaTlx: number(tlx.historical_samples),
        observations: number(observation.historical_samples),
        assessment: number(observation.historical_assessment_samples),
        education: number(observation.historical_education_samples),
        action: number(observation.historical_action_samples),
      },
      firstDate: [
        imut.first_date,
        tlx.first_date,
        observation.first_date,
      ].filter(Boolean).sort()[0] || null,
      lastDate: [
        imut.last_date,
        tlx.last_date,
        observation.last_date,
      ].filter(Boolean).sort().at(-1) || null,
    },
  };
}

function valueOrHistory(metrics, valueKey, countKey) {
  if (metrics.sampleCounts[countKey] > 0) return metrics[valueKey];
  if (metrics.history.sampleCounts[countKey] > 0) return metrics.history[valueKey];
  return 0;
}

async function getRequestScope(request) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) return { error: "Unauthorized", status: 401 };
  const params = new URL(request.url).searchParams;
  const range = getRange(params.get("start"), params.get("end"));
  if (!range) return { error: "Rentang tanggal tidak valid (maksimal 366 hari).", status: 400 };
  const clinic = String(params.get("clinic") || "").trim();
  if (clinic.length > 120) return { error: "Filter poliklinik tidak valid.", status: 400 };
  return { ruangan, range, clinic };
}

export async function GET(request) {
  const scope = await getRequestScope(request);
  if (scope.error) {
    return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });
  }
  const metrics = await getMetrics(scope.ruangan, scope.range, scope.clinic);
  return NextResponse.json({
    success: true,
    ruangan: scope.ruangan,
    range: scope.range,
    clinic: scope.clinic || "Semua poliklinik",
    metrics,
  });
}

export async function POST(request) {
  const scope = await getRequestScope(request);
  if (scope.error) {
    return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "GROQ_API_KEY belum dikonfigurasi pada environment server." },
      { status: 503 },
    );
  }

  const metrics = await getMetrics(scope.ruangan, scope.range, scope.clinic);
  const analysisMetrics = {
    averageWaitMinutes: valueOrHistory(metrics, "averageWaitMinutes", "imut"),
    averageTlxScore: valueOrHistory(metrics, "averageTlxScore", "nasaTlx"),
    averageAssessmentMinutes: valueOrHistory(metrics, "averageAssessmentMinutes", "assessment"),
    averageEducationMinutes: valueOrHistory(metrics, "averageEducationMinutes", "education"),
    averageActionMinutes: valueOrHistory(metrics, "averageActionMinutes", "action"),
  };
  const historicalRange = metrics.history.firstDate && metrics.history.lastDate
    ? `Data historis tersedia ${metrics.history.firstDate} sampai ${metrics.history.lastDate}`
    : "Data historis tambahan tidak tersedia";
  const systemPrompt = `Anda adalah AI Executive Advisor untuk manajemen rumah sakit. Analisis agregat operasional Instalasi Rawat Jalan ruangan ${scope.ruangan}, periode ${scope.range.start} sampai ${scope.range.end}, poliklinik ${scope.clinic || "semua"}.

DATA TERSEDIA:
- IMUT waktu tunggu: rata-rata ${analysisMetrics.averageWaitMinutes.toFixed(2)} menit dari ${metrics.sampleCounts.imut || metrics.history.sampleCounts.imut} sampel.
- Volume pasien tercatat: ${metrics.totalPatients} pasien pada ${metrics.patientSamples} rekap.
- Beban NASA-TLX: rata-rata ${analysisMetrics.averageTlxScore.toFixed(2)}/100 dari ${metrics.sampleCounts.nasaTlx || metrics.history.sampleCounts.nasaTlx} kuesioner.
- Time-Motion perawat: asesmen ${analysisMetrics.averageAssessmentMinutes.toFixed(2)} menit, edukasi ${analysisMetrics.averageEducationMinutes.toFixed(2)} menit, tindakan ${analysisMetrics.averageActionMinutes.toFixed(2)} menit; ${metrics.sampleCounts.observations || metrics.history.sampleCounts.observations} kejadian.
- ${historicalRange}. Bila sampel periode laporan kosong, nilai di atas memakai data historis dan bukan nilai periode terpilih.
- Pemeriksaan dokter: ${metrics.averageExaminationMinutes.toFixed(2)} menit (0 berarti belum ada kategori pemeriksaan pada data yang terhubung).
- Cakupan sumber daya: ${metrics.activeStaff} SDM aktif, ${metrics.doctors} dokter, ${metrics.scheduledShifts} shift terjadwal.
- Absensi: ${metrics.onTimeAttendance} tepat waktu dari ${metrics.attendanceRecords} catatan.
- Cuti pada periode: ${metrics.approvedStaffLeave} cuti SDM disetujui, ${metrics.doctorLeaveRecords} catatan cuti dokter.
- Praktik dokter: ${metrics.practiceStarts} pencatatan mulai praktik.

TUGAS:
1. Identifikasi paling banyak 3 temuan penting yang menghubungkan volume pasien, waktu tunggu, beban SDM, jadwal, mutu, dan ketidakhadiran bila datanya mendukung.
2. Berikan tepat 3 langkah strategis yang konkret, realistis, terukur, dan dapat ditindaklanjuti.
3. Bedakan fakta data dan hipotesis; jangan menyatakan korelasi sebagai sebab-akibat.
4. Jika sampel suatu sumber 0 atau nilainya fallback 0, nyatakan sebagai data tidak tersedia, bukan kondisi operasional normal.
Gunakan bahasa Indonesia yang jelas, ringkas, dan berbentuk poin. Jangan tampilkan atau menebak identitas pasien maupun pegawai.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
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
    return NextResponse.json({ success: true, analysis, range: scope.range, metrics: { ...metrics, analysis: analysisMetrics } });
  } catch (error) {
    console.error("Groq AI Advisor gagal diakses:", error);
    return NextResponse.json(
      { success: false, error: "Layanan AI sedang tidak dapat diakses. Coba kembali nanti." },
      { status: 502 },
    );
  }
}
