import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const timeTable = "log_observasi_kerja";
const tlxTable = "log_nasa_tlx";
const tlxDimensions = [
  ["mental", "mental_demand", "mental"],
  ["fisik", "physical_demand", "fisik"],
  ["waktu", "temporal_demand", "waktu"],
  ["performa", "performance", "performa"],
  ["usaha", "effort", "usaha"],
  ["frustrasi", "frustration", "frustrasi"],
];

async function getSessionRuangan() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session_dak_pro");
    if (!sessionCookie) return null;
    const session = JSON.parse(sessionCookie.value);
    return typeof session?.ruangan === "string" && session.ruangan.trim()
      ? session.ruangan.trim()
      : null;
  } catch {
    return null;
  }
}

function normalized(value) {
  return String(value ?? "").trim().toUpperCase();
}

function findValue(row, names) {
  const entries = Object.entries(row || {});
  const wantedNames = names.map((name) => name.toLowerCase());
  const entry = entries.find(([key]) => wantedNames.includes(key.toLowerCase()));
  return entry?.[1];
}

function average(values) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) return 0;
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
}

function getDuration(row) {
  const rawDuration = findValue(row, ["durasi_menit", "durasi", "duration_minutes", "duration"]);
  const duration = Number(rawDuration);
  if (rawDuration != null && rawDuration !== "" && Number.isFinite(duration)) return duration;

  const start = findValue(row, ["waktu_mulai", "start_time"]);
  const end = findValue(row, ["waktu_selesai", "end_time"]);
  if (!start || !end) return null;
  const [startHour, startMinute] = String(start).split(":").map(Number);
  const [endHour, endMinute] = String(end).split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return null;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

function rowMatchesDepartment(row, ruangan, departmentByStaffId) {
  const staffId = findValue(row, ["sdm_id", "staff_id", "employee_id"]);
  if (staffId != null && staffId !== "") {
    const staffDepartment = departmentByStaffId.get(String(staffId));
    if (staffDepartment != null) {
      return normalized(staffDepartment) === normalized(ruangan);
    }
  }
  const room = findValue(row, ["ruangan", "room", "department"]);
  return room != null && normalized(room) === normalized(ruangan);
}

async function selectAll(table) {
  try {
    const result = await turso.execute(`SELECT * FROM ${table}`);
    return { rows: result.rows, warning: null };
  } catch (error) {
    console.warn(`Gagal membaca ${table}:`, error.message);
    return { rows: [], warning: `${table} belum dapat dibaca` };
  }
}

export async function GET() {
  const ruangan = await getSessionRuangan();
  if (!ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const [timeResult, tlxResult] = await Promise.all([
    selectAll(timeTable),
    selectAll(tlxTable),
  ]);
  const staffResult = await turso.execute("SELECT id, ruangan FROM sdm");
  const departmentByStaffId = new Map(
    staffResult.rows.map((row) => [String(row.id), row.ruangan])
  );
  const historyTimeMotion = timeResult.rows.filter((row) =>
    rowMatchesDepartment(row, ruangan, departmentByStaffId)
  );
  const historyNasaTlx = tlxResult.rows.filter((row) =>
    rowMatchesDepartment(row, ruangan, departmentByStaffId)
  );

  const blockRows = (blockAliases) => historyTimeMotion.filter((row) => {
    const block = normalized(findValue(row, ["blok_kategori", "kategori_blok", "kategori"]));
    return blockAliases.some((alias) => alias.length === 1
      ? block === alias
      : block === alias || block.includes(alias));
  });
  const durationsFor = (rows) => rows.map(getDuration).filter((value) => value != null);
  const allScores = historyNasaTlx.flatMap((row) =>
    tlxDimensions.map(([, ...aliases]) => findValue(row, aliases))
  );

  return NextResponse.json({
    success: true,
    summary: {
      averageAssessmentMinutes: average(durationsFor(blockRows(["A", "ASESMEN", "ASSESSMENT"]))),
      averageEducationMinutes: average(durationsFor(blockRows(["B", "EDUKASI", "EDUCATION"]))),
      averageActionMinutes: average(durationsFor(blockRows(["C", "TINDAKAN", "ACTION"]))),
      averageTlxScore: average(allScores),
    },
    historyTimeMotion,
    historyNasaTlx,
    warnings: [timeResult.warning, tlxResult.warning].filter(Boolean),
  });
}

async function getTableColumns(table) {
  const result = await turso.execute(`PRAGMA table_info('${table}')`);
  return result.rows.map((row) => String(row.name).toLowerCase());
}

function addMappedValue(columns, values, candidates, value) {
  const column = candidates.find((candidate) => columns.includes(candidate.toLowerCase()));
  if (column && !Object.hasOwn(values, column)) values[column] = value;
  return Boolean(column);
}

async function insertMapped(table, values) {
  const columns = Object.keys(values);
  if (!columns.length) throw new Error(`Tidak ada kolom yang dapat disimpan pada ${table}.`);
  const placeholders = columns.map(() => "?").join(", ");
  await turso.execute({
    sql: `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`,
    args: columns.map((column) => values[column]),
  });
}

function validScore(value) {
  if (value == null || value === "") return false;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100;
}

export async function POST(request) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, tanggal, stasiun, inisialPerawat, shift } = body;
    if (!["time-motion", "nasa-tlx"].includes(type)) {
      return NextResponse.json({ success: false, error: "Jenis input tidak valid." }, { status: 400 });
    }
    if (![tanggal, stasiun, inisialPerawat, shift].every((value) => typeof value === "string" && value.trim())) {
      return NextResponse.json({ success: false, error: "Tanggal, stasiun, inisial perawat, dan shift wajib diisi." }, { status: 400 });
    }
    if (!["NERS 3", "NERS 4"].includes(stasiun) || !/^Midel [1-4]$/.test(shift)) {
      return NextResponse.json({ success: false, error: "Stasiun atau shift tidak valid." }, { status: 400 });
    }
    const parsedDate = new Date(`${tanggal}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== tanggal) {
      return NextResponse.json({ success: false, error: "Tanggal tidak valid." }, { status: 400 });
    }

    if (type === "time-motion") {
      const { kategoriBlok, waktuMulai, waktuSelesai, durasiMenit, detail } = body;
      const duration = Number(durasiMenit);
      const validTime = (value) => {
        if (!/^\d{2}:\d{2}$/.test(value || "")) return false;
        const [hour, minute] = value.split(":").map(Number);
        return hour < 24 && minute < 60;
      };
      if (!["A", "B", "C", "D"].includes(kategoriBlok)
        || !validTime(waktuMulai)
        || !validTime(waktuSelesai)
        || !Number.isFinite(duration) || duration <= 0) {
        return NextResponse.json({ success: false, error: "Data kejadian atau durasi tidak valid." }, { status: 400 });
      }
      const columns = await getTableColumns(timeTable);
      const values = {};
      const stored = [
        addMappedValue(columns, values, ["sdm_id", "inisial_perawat", "inisial"], inisialPerawat.trim()),
        addMappedValue(columns, values, ["ruangan"], ruangan),
        addMappedValue(columns, values, ["stasiun", "nama_stasiun"], stasiun),
        addMappedValue(columns, values, ["tanggal_input", "tanggal", "date"], tanggal),
        addMappedValue(columns, values, ["shift", "shift_kerja"], shift),
        addMappedValue(columns, values, ["blok_kategori", "kategori_blok", "kategori"], kategoriBlok),
        addMappedValue(columns, values, ["detail_tindakan", "detail", "aktivitas"], detail?.trim() || `Blok ${kategoriBlok}`),
        addMappedValue(columns, values, ["waktu_mulai", "start_time"], waktuMulai),
        addMappedValue(columns, values, ["waktu_selesai", "end_time"], waktuSelesai),
        addMappedValue(columns, values, ["durasi_menit", "durasi", "duration_minutes"], Math.round(duration * 100) / 100),
        addMappedValue(columns, values, ["no_kejadian", "event_number"], 1),
      ];
      if (!stored[0] || !stored[5] || !stored[7] || !stored[8] || !stored[9]) {
        return NextResponse.json({ success: false, error: "Skema tabel observasi tidak memiliki kolom wajib untuk menyimpan kejadian." }, { status: 500 });
      }
      await insertMapped(timeTable, values);
      return NextResponse.json({
        success: true,
        message: "Data Time & Motion berhasil disimpan.",
        metadataNotStored: ["stasiun", "shift"].filter((field) => !stored[field === "stasiun" ? 2 : 4]),
      });
    }

    const scores = {
      mental: body.mental,
      fisik: body.fisik,
      waktu: body.waktu,
      performa: body.performa,
      usaha: body.usaha,
      frustrasi: body.frustrasi,
    };
    if (!Object.values(scores).every(validScore)) {
      return NextResponse.json({ success: false, error: "Seluruh skor NASA-TLX harus berupa bilangan bulat 0-100." }, { status: 400 });
    }
    const columns = await getTableColumns(tlxTable);
    const values = {};
    const stored = [
      addMappedValue(columns, values, ["sdm_id", "inisial_perawat", "inisial"], inisialPerawat.trim()),
      addMappedValue(columns, values, ["ruangan"], ruangan),
      addMappedValue(columns, values, ["stasiun", "nama_stasiun"], stasiun),
      addMappedValue(columns, values, ["tanggal_isi", "tanggal_input", "tanggal", "date"], tanggal),
      addMappedValue(columns, values, ["shift", "shift_kerja"], shift),
      ...tlxDimensions.map(([key, column]) => addMappedValue(columns, values, [column, key], scores[key])),
    ];
    if (!stored[0] || !stored.slice(5).every(Boolean)) {
      return NextResponse.json({ success: false, error: "Skema tabel NASA-TLX tidak memiliki kolom wajib untuk menyimpan keenam skor." }, { status: 500 });
    }
    await insertMapped(tlxTable, values);
    return NextResponse.json({
      success: true,
      message: "Kuesioner NASA-TLX berhasil disimpan.",
      metadataNotStored: ["stasiun", "shift"].filter((field) => !stored[field === "stasiun" ? 2 : 4]),
    });
  } catch (error) {
    console.error("Observasi & TLX API Error:", error);
    return NextResponse.json({ success: false, error: "Gagal memproses data observasi." }, { status: 500 });
  }
}
