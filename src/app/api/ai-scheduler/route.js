import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const weekdayNames = [
  "MINGGU",
  "SENIN",
  "SELASA",
  "RABU",
  "KAMIS",
  "JUMAT",
  "SABTU",
];
const weekdays = new Set(weekdayNames);
const absenceSymbols = new Set(["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"]);

async function hasSession() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  if (!sessionCookie) return false;
  try {
    const session = JSON.parse(sessionCookie.value);
    return Boolean(String(session?.ruangan || "").trim());
  } catch {
    return false;
  }
}

function cleanString(value, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isMidelSymbol(value) {
  return /^(?:M|MIDEL)\s*[12]$/.test(normalizeSymbol(value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWeekday(value) {
  const cleaned = String(value ?? "").trim().toUpperCase("id-ID");
  return cleaned.replace(/\s+/g, "");
}

async function getSessionRuangan() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  if (!sessionCookie) return null;
  try {
    const session = JSON.parse(sessionCookie.value);
    return String(session?.ruangan || "").trim() || null;
  } catch {
    return null;
  }
}

async function getDbDraftContext(ruangan, bulan, tahun) {
  if (!ruangan || !bulan || !tahun) return { doctorSymbols: [], previousRows: [], experienceRows: [] };

  const previousMonthDate = new Date(Number(tahun), Number(bulan) - 2, 1);
  const previousMonth = previousMonthDate.getMonth() + 1;
  const previousYear = previousMonthDate.getFullYear();
  const historyStartDate = new Date(Number(tahun), Number(bulan) - 7, 1);
  const historyStartPeriod = historyStartDate.getFullYear() * 100 + historyStartDate.getMonth() + 1;
  const historyEndPeriod = previousYear * 100 + previousMonth;

  const [doctorResult, previousResult, experienceResult] = await Promise.all([
    turso.execute({
      sql: `SELECT id, nama_dokter, klinik, jadwal_hari, simbol_praktik, ruangan
            FROM master_dokter
            WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
      args: [ruangan],
    }),
    turso.execute({
      sql: `SELECT sdm_id, tanggal, bulan, tahun, simbol, ruangan
            FROM jadwal_dinas
            WHERE bulan = ? AND tahun = ? AND (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?)))`,
      args: [previousMonth, previousYear, ruangan],
    }),
    turso.execute({
      sql: `SELECT sdm_id, UPPER(TRIM(simbol)) AS simbol, COUNT(*) AS jumlah
            FROM jadwal_dinas
            WHERE (CAST(tahun AS INTEGER) * 100 + CAST(bulan AS INTEGER)) BETWEEN ? AND ?
              AND (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?)))
            GROUP BY sdm_id, UPPER(TRIM(simbol))`,
      args: [historyStartPeriod, historyEndPeriod, ruangan],
    }),
  ]);

  const doctorSymbols = (doctorResult.rows || []).map((row) => ({
    simbol_praktik: normalizeSymbol(row.simbol_praktik),
    jadwal_hari: String(row.jadwal_hari || "").trim(),
    nama_dokter: String(row.nama_dokter || "").trim(),
    klinik: String(row.klinik || "").trim(),
  }));

  const previousRows = (previousResult.rows || []).map((row) => ({
    ...row,
    simbol: normalizeSymbol(row.simbol),
  }));
  const experienceRows = (experienceResult.rows || []).map((row) => ({
    sdm_id: String(row.sdm_id || ""),
    simbol: normalizeSymbol(row.simbol),
    jumlah: Number(row.jumlah || 0),
  })).filter((row) => row.simbol && !absenceSymbols.has(row.simbol));

  return { doctorSymbols, previousRows, experienceRows };
}

function logDebug(label, payload) {
  const message = {
    timestamp: new Date().toISOString(),
    label,
    payload,
  };
  console.log("[AI_SCHEDULER_DEBUG]", JSON.stringify(message, null, 2));
}

function unwrapDraftPayload(value) {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    const firstAssignmentList = value.find((item) => item && typeof item === "object" && Array.isArray(item.assignments));
    if (firstAssignmentList) return unwrapDraftPayload(firstAssignmentList);
    if (value.every((item) => item && typeof item === "object" && (item.weekday || item.person || item.symbol))) {
      return { assignments: value };
    }
    return null;
  }

  if (Array.isArray(value.assignments)) return value;
  if (Array.isArray(value.draft?.assignments)) return value.draft;
  if (Array.isArray(value.data?.assignments)) return value.data;
  if (Array.isArray(value.result?.assignments)) return value.result;

  if (value.draft && typeof value.draft === "object") return unwrapDraftPayload(value.draft);
  if (value.data && typeof value.data === "object") return unwrapDraftPayload(value.data);
  if (value.result && typeof value.result === "object") return unwrapDraftPayload(value.result);

  return null;
}

function parseLooseJson(candidate) {
  let normalized = String(candidate || "").trim();
  if (!normalized) return null;

  normalized = normalized
    .replace(/^```(?:json)?\s*/gi, "")
    .replace(/\s*```$/gi, "")
    .replace(/([{,]\s*)'([A-Za-z0-9_]+)'\s*:/g, '$1"$2":')
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')
    .replace(/,\s*([}\]])/g, "$1");

  const parsed = JSON.parse(normalized);
  return parsed;
}

function parseJsonContent(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;

  const candidates = new Set();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/gi, "")
    .replace(/\s*```$/gi, "")
    .trim();

  if (cleaned) candidates.add(cleaned);

  const patterns = [
    /\{[\s\S]*"assignments"[\s\S]*\}/i,
    /\{[\s\S]*'assignments'[\s\S]*\}/i,
    /\{[\s\S]*"draft"[\s\S]*\}/i,
    /\{[\s\S]*"data"[\s\S]*\}/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[0]) candidates.add(match[0]);
  }

  const firstObjectIndex = cleaned.indexOf("{");
  const lastObjectIndex = cleaned.lastIndexOf("}");
  if (firstObjectIndex >= 0 && lastObjectIndex > firstObjectIndex) {
    candidates.add(cleaned.slice(firstObjectIndex, lastObjectIndex + 1));
  }

  for (const candidate of candidates) {
    for (const parser of [JSON.parse, parseLooseJson]) {
      try {
        const parsed = parser(candidate);
        const unwrapped = unwrapDraftPayload(parsed);
        if (unwrapped) return unwrapped;
      } catch {
        // continue to next parser/candidate
      }
    }
  }

  return null;
}

export async function POST(request) {
  if (!(await hasSession())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Data generator jadwal tidak valid." }, { status: 400 });
  }

  const people = Array.isArray(body?.people) ? body.people : [];
  const weekdaysInput = Array.isArray(body?.weekdays) ? body.weekdays : [];
  const previousPatternsInput = Array.isArray(body?.previousPatterns) ? body.previousPatterns : [];
  const targetBulan = Number(body?.bulan || new Date().getMonth() + 1);
  const targetTahun = Number(body?.tahun || new Date().getFullYear());
  const requestRuangan = body?.ruangan ? String(body.ruangan).trim().toUpperCase() : null;
  const additionalInstructions = cleanString(body?.additionalInstructions, 2000);

  let normalizedWeekdaysInput = weekdaysInput
    .map((day) => ({
      weekday: normalizeWeekday(day?.weekday),
      symbols: Array.isArray(day?.symbols)
        ? [...new Set(day.symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))]
        : [],
      days: Array.isArray(day?.days)
        ? [...new Set(day.days.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 31))].sort((a, b) => a - b)
        : [],
      calendar: Array.isArray(day?.calendar)
        ? day.calendar.map((entry) => ({
          day: Number(entry?.day),
          symbols: Array.isArray(entry?.symbols)
            ? [...new Set(entry.symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))]
            : [],
        })).filter((entry) => Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 31)
        : [],
    }))
    .filter((day) => day.weekday && weekdays.has(day.weekday));

  logDebug("request-start", {
    ruangan: requestRuangan,
    bulan: targetBulan,
    tahun: targetTahun,
    peopleCount: people.length,
    weekdayCount: weekdaysInput.length,
    previousPatternsCount: previousPatternsInput.length,
  });

  const sessionRuangan = (await getSessionRuangan()) || requestRuangan;
  const dbContext = sessionRuangan && targetBulan && targetTahun
    ? await getDbDraftContext(sessionRuangan, targetBulan, targetTahun)
    : { doctorSymbols: [], previousRows: [], experienceRows: [] };

  logDebug("db-context", {
    ruangan: sessionRuangan,
    doctorSymbolsCount: dbContext.doctorSymbols.length,
    previousRowsCount: dbContext.previousRows.length,
    uniqueDoctorSymbols: [...new Set(dbContext.doctorSymbols.map((row) => row.simbol_praktik).filter(Boolean))].slice(0, 20),
  });

  const masterSymbolsByWeekday = new Map(weekdayNames.map((weekday) => [weekday, new Set()]));
  for (const doctor of dbContext.doctorSymbols) {
    const symbol = normalizeSymbol(doctor.simbol_praktik);
    if (!symbol) continue;
    const doctorWeekdays = String(doctor.jadwal_hari || "")
      .split(/[,;/|&]+|\s+dan\s+/i)
      .map(normalizeWeekday);
    for (const weekday of doctorWeekdays) {
      masterSymbolsByWeekday.get(weekday)?.add(symbol);
    }
  }

  normalizedWeekdaysInput = normalizedWeekdaysInput.map((weekdayInput) => {
    const calendarInput = weekdayInput.calendar.length
      ? weekdayInput.calendar
      : weekdayInput.days.map((day) => ({ day, symbols: weekdayInput.symbols }));
    const calendar = calendarInput.map((entry) => {
      const actualWeekday = weekdayNames[new Date(targetTahun, targetBulan - 1, entry.day).getDay()];
      const masterSymbols = masterSymbolsByWeekday.get(actualWeekday) || new Set();
      return {
        day: entry.day,
        symbols: actualWeekday === weekdayInput.weekday
          ? entry.symbols.filter((symbol) => masterSymbols.has(symbol))
          : [],
      };
    }).filter((entry) => entry.symbols.length > 0);
    return {
      ...weekdayInput,
      symbols: [...new Set(calendar.flatMap((entry) => entry.symbols))],
      days: calendar.map((entry) => entry.day),
      calendar,
    };
  }).filter((weekdayInput) => weekdayInput.symbols.length > 0);

  if (
    people.length === 0 || people.length > 200 ||
    normalizedWeekdaysInput.length === 0 || normalizedWeekdaysInput.length > 7 ||
    previousPatternsInput.length > 7
  ) {
    return NextResponse.json({ success: false, error: "Data SDM atau hari praktik tidak lengkap." }, { status: 400 });
  }

  const personCodes = new Set();
  const safePeople = [];
  for (const person of people) {
    const code = cleanString(person?.code, 12);
    if (!/^P\d{1,3}$/.test(code) || personCodes.has(code)) {
      return NextResponse.json({ success: false, error: "Daftar SDM tidak valid." }, { status: 400 });
    }
    personCodes.add(code);
    const leaveDays = [...new Set((Array.isArray(person?.leaveDays) ? person.leaveDays : [])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31))].sort((a, b) => a - b);
    const leaveDetails = (Array.isArray(person?.leaveDetails) ? person.leaveDetails : [])
      .map((leave) => ({
        day: Number(leave?.day),
        symbol: normalizeSymbol(leave?.symbol),
      }))
      .filter((leave) => Number.isInteger(leave.day) && leave.day >= 1 && leave.day <= 31 && leave.symbol);
    safePeople.push({
      code,
      name: cleanString(person?.name, 120),
      role: cleanString(person?.role, 60) || "Tidak diketahui",
      sdmId: String(person?.sdmId || "").trim(),
      leaveDays: [...new Set([...leaveDays, ...leaveDetails.map((leave) => leave.day)])].sort((a, b) => a - b),
      leaveDetails,
      experience: [],
    });
  }

  const experienceBySdmId = new Map();
  for (const row of dbContext.experienceRows) {
    const symbols = experienceBySdmId.get(row.sdm_id) || [];
    symbols.push({ symbol: row.simbol, shifts: row.jumlah });
    experienceBySdmId.set(row.sdm_id, symbols);
  }
  for (const person of safePeople) {
    person.experience = (experienceBySdmId.get(person.sdmId) || [])
      .sort((a, b) => b.shifts - a.shifts)
      .slice(0, 12);
  }

  const peopleByCode = new Map(safePeople.map((person) => [person.code, person]));
  const safeExistingAssignments = (Array.isArray(body?.existingAssignments) ? body.existingAssignments : [])
    .map((assignment) => ({
      person: cleanString(assignment?.person, 12),
      day: Number(assignment?.day),
      symbol: cleanString(assignment?.symbol, 80),
    }))
    .filter((assignment) => peopleByCode.has(assignment.person)
      && Number.isInteger(assignment.day)
      && assignment.day >= 1
      && assignment.day <= 31
      && assignment.symbol);
  const safePreviousDayAssignments = (Array.isArray(body?.previousDayAssignments) ? body.previousDayAssignments : [])
    .map((assignment) => ({
      person: cleanString(assignment?.person, 12),
      symbol: cleanString(assignment?.symbol, 80),
    }))
    .filter((assignment) => peopleByCode.has(assignment.person) && assignment.symbol);

  const allowedByWeekday = new Map();
  for (const day of normalizedWeekdaysInput) {
    const weekday = day.weekday;
    const symbols = day.symbols.filter(Boolean).slice(0, 30);
    if (!weekdays.has(weekday) || symbols.length === 0) {
      continue;
    }
    allowedByWeekday.set(weekday, symbols);
  }

  if (allowedByWeekday.size === 0) {
    return NextResponse.json({ success: false, error: "Daftar hari atau simbol praktik tidak valid." }, { status: 400 });
  }

  const previousPatterns = [];
  for (const pattern of previousPatternsInput) {
    const weekday = normalizeWeekday(pattern?.weekday);
    if (!weekdays.has(weekday) || !allowedByWeekday.has(weekday)) continue;
    const assignments = [];
    for (const assignment of Array.isArray(pattern?.assignments) ? pattern.assignments : []) {
      const person = cleanString(assignment?.person, 12);
      const symbol = cleanString(assignment?.symbol, 80);
      if (personCodes.has(person) && symbol) assignments.push({ person, symbol });
    }
    previousPatterns.push({ weekday, assignments });
  }

  const payload = {
    periode: cleanString(body?.periode, 40) || "periode terpilih",
    people: safePeople.map(({ sdmId, name, ...person }) => person),
    weekdays: [...allowedByWeekday].map(([weekday, symbols]) => ({
      weekday,
      symbols,
      days: normalizedWeekdaysInput.find((day) => day.weekday === weekday)?.days || [],
      calendar: normalizedWeekdaysInput.find((day) => day.weekday === weekday)?.calendar || [],
    })),
    previousPatterns,
  };
  if (additionalInstructions) {
    let anonymizedInstructions = additionalInstructions;
    const replacements = [
      ...dbContext.doctorSymbols
        .filter((doctor) => doctor.nama_dokter)
        .map((doctor) => ({
          name: doctor.nama_dokter,
          replacement: `simbol ${doctor.simbol_praktik}${doctor.klinik ? ` di klinik ${doctor.klinik}` : ""}`,
        })),
      ...safePeople
        .filter((person) => person.name)
        .map((person) => ({ name: person.name, replacement: person.code })),
    ].sort((first, second) => second.name.length - first.name.length);
    for (const { name, replacement } of replacements) {
      anonymizedInstructions = anonymizedInstructions.replace(
        new RegExp(escapeRegExp(name), "gi"),
        replacement,
      );
    }
    payload.additionalInstructions = anonymizedInstructions;
  }
  if (JSON.stringify(payload).length > 24000) {
    return NextResponse.json({ success: false, error: "Data pola jadwal terlalu besar untuk diproses." }, { status: 413 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logDebug("missing-groq-key", { hasKey: false });
    return NextResponse.json(
      { success: false, error: "GROQ_API_KEY belum dikonfigurasi pada environment server." },
      { status: 503 },
    );
  }

  const systemPrompt = `Anda adalah asisten penyusun draft jadwal SDM rumah sakit.
Kembalikan hanya satu objek JSON valid dengan format paling tepat:
{"assignments":[{"weekday":"SENIN","person":"P1","symbol":"P"}],"summary":"ringkasan singkat"}

ATURAN WAJIB:
- Gunakan HANYA person code, weekday, dan simbol yang ada di data input.
- Gunakan riwayat simbol per SDM sebagai bukti pengalaman penugasan; utamakan kecocokan simbol, tetapi jumlah riwayat bukan sertifikasi kompetensi.
- Buat pola yang adil dan tidak monoton; rotasikan SDM lintas simbol hanya jika riwayat menunjukkan ia pernah menangani simbol tersebut.
- Perhatikan leaveDays berisi tanggal cuti yang sudah disetujui; jangan menjadwalkan SDM pada tanggal tersebut. Jadwal akhir tetap akan menjaga kode cuti.
- leaveDetails berisi tanggal dan kode cuti SDM yang harus tetap terlihat pada pratinjau; jangan menggantinya dengan simbol dokter.
- Jangan menugaskan simbol M1, M2, Midel 1, atau Midel 2 kepada SDM yang mendapat salah satu simbol midel tersebut pada hari sebelumnya.
- Sebarkan jumlah penugasan M1/M2/Midel secara seimbang antar-SDM sepanjang bulan; jangan memusatkan penugasan pada orang yang sama.
- Hanya isi hari yang memang memiliki simbol praktik aktif.
- Untuk setiap tanggal, gunakan hanya simbol dalam calendar tanggal tersebut; calendar sudah disesuaikan dengan hari aktual bulan target dan jadwal praktik master dokter. Jangan memindahkan pola berdasarkan nomor tanggal bulan sebelumnya.
- Sertakan semua pasangan person dan simbol pada previousPatterns; jangan menghilangkan SDM yang ada di pola sumber.
- Satu orang maksimal satu simbol per hari.
- Jadikan pola bulan sebelumnya sebagai dasar; variasikan SDM lintas tanggal hanya pada simbol yang tercatat di riwayat kompetensinya.
- Jika simbol lama tidak tersedia, pindahkan orang ke simbol aktif yang masih cocok agar distribusi tetap merata.
- Prioritaskan minimal satu orang untuk setiap simbol aktif bila jumlah petugas mencukupi.
- Jangan menugaskan orang yang tidak tercatat bekerja pada hari itu.
- Patuhi additionalInstructions sebagai ketentuan khusus jika tidak bertentangan dengan cuti, simbol praktik pada kalender, pengalaman simbol, atau larangan midel berturut-turut.
- Jangan menyertakan cuti, absensi, atau status selain simbol praktik.
- Jangan menambahkan teks sebelum atau sesudah JSON.
- summary harus dalam bahasa Indonesia dan tidak boleh menyebutkan nama atau identitas personal.
- Pastikan JSON valid, objek akhir harus tepat dan tidak mengandung markdown atau kode fence.`;

  const groqModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
  let response;
  let result = {};
  let lastErrorMessage = "";
  let content = "";

  for (const model of groqModels) {
    try {
      logDebug("groq-attempt", { model, payloadPreview: {
        periode: payload.periode,
        peopleCount: payload.people.length,
        weekdayCount: payload.weekdays.length,
        previousPatternsCount: payload.previousPatterns.length,
      } });

      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Buat draft pola jadwal untuk ${payload.periode}. Data input:\n${JSON.stringify(payload)}`,
            },
          ],
          temperature: 0.1,
          max_completion_tokens: 3072,
          reasoning_effort: "low",
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(45000),
      });
      result = await response.json().catch(() => ({}));
      logDebug("groq-response", {
        model,
        status: response.status,
        ok: response.ok,
        provider: result?.error ? {
          type: result.error?.type,
          message: result.error?.message,
        } : null,
        choicesCount: Array.isArray(result?.choices) ? result.choices.length : 0,
        finishReason: result?.choices?.[0]?.finish_reason || null,
        messageKeys: Object.keys(result?.choices?.[0]?.message || {}),
        contentLength: typeof result?.choices?.[0]?.message?.content === "string"
          ? result.choices[0].message.content.length
          : 0,
      });

      if (response.ok) {
        content = result.choices?.[0]?.message?.content || "";
        if (content.trim()) break;
        lastErrorMessage = `Groq mengembalikan konten kosong dari model ${model}.`;
        logDebug("groq-empty-content", {
          model,
          finishReason: result?.choices?.[0]?.finish_reason || null,
          messageKeys: Object.keys(result?.choices?.[0]?.message || {}),
        });
        continue;
      }

      const providerMessage = typeof result.error?.message === "string"
        ? result.error.message.replaceAll(apiKey, "[redacted]").slice(0, 400)
        : "";
      lastErrorMessage = providerMessage || `HTTP ${response.status}`;
    } catch (error) {
      console.error(`AI schedule request failed for model ${model}:`, error);
      lastErrorMessage = error instanceof Error ? error.message : "Request failed";
    }
  }

  if (!response || !response.ok) {
    console.error("AI schedule provider request failed:", lastErrorMessage || "Unknown error");
    const errorMessage = lastErrorMessage.includes("rate limit") || lastErrorMessage.includes("429")
      ? "Batas penggunaan Groq tercapai. Silakan coba lagi nanti."
      : lastErrorMessage.includes("API key") || lastErrorMessage.includes("401")
        ? "API key Groq tidak valid atau sudah dicabut."
        : lastErrorMessage.includes("too large") || lastErrorMessage.includes("413")
          ? "Pola jadwal terlalu besar untuk diproses Groq."
          : `Groq gagal membuat pola jadwal. ${lastErrorMessage || "Silakan coba lagi."}`;
    return NextResponse.json({ success: false, error: errorMessage }, { status: 502 });
  }

  logDebug("groq-content-preview", {
    contentPreview: typeof content === "string" ? content.slice(0, 1500) : content,
  });

  const generated = parseJsonContent(content);
  if (!generated || !Array.isArray(generated.assignments)) {
    logDebug("parse-json-failed", {
      rawContentLength: typeof content === "string" ? content.length : 0,
      rawContent: typeof content === "string" ? content.slice(0, 2000) : content,
      finishReason: result?.choices?.[0]?.finish_reason || null,
      messageKeys: Object.keys(result?.choices?.[0]?.message || {}),
    });
    console.error("Groq invalid draft payload:", content);
    const error = content.trim()
      ? "Groq mengembalikan format draft yang tidak valid."
      : "Groq tidak mengembalikan isi draft. Silakan coba lagi.";
    return NextResponse.json({ success: false, error }, { status: 502 });
  }

  const previousSymbolsByWeekday = new Map();
  for (const pattern of previousPatterns) {
    const symbolsByPerson = new Map();
    for (const assignment of pattern.assignments) {
      const personSymbols = symbolsByPerson.get(assignment.person) || new Set();
      personSymbols.add(normalizeSymbol(assignment.symbol));
      symbolsByPerson.set(assignment.person, personSymbols);
    }
    previousSymbolsByWeekday.set(pattern.weekday, symbolsByPerson);
  }
  const experienceByPerson = new Map(safePeople.map((person) => [
    person.code,
    new Set(person.experience.map((item) => normalizeSymbol(item.symbol))),
  ]));

  const seen = new Set();
  const validatedAssignments = [];
  logDebug("ai-generated-assignments", {
    assignmentCount: generated.assignments.length,
    preview: generated.assignments.slice(0, 20),
  });

  for (const assignment of generated.assignments) {
    const weekday = cleanString(assignment?.weekday, 12).toLocaleUpperCase("id-ID");
    const person = cleanString(assignment?.person, 12);
    const symbol = cleanString(assignment?.symbol, 80);
    const allowedSymbols = allowedByWeekday.get(weekday) || [];
    const canonicalSymbol = allowedSymbols.find(
      allowed => allowed.toLocaleUpperCase("id-ID") === symbol.toLocaleUpperCase("id-ID"),
    );
    const previousSymbols = previousSymbolsByWeekday.get(weekday)?.get(person);
    const personExperience = experienceByPerson.get(person);
    const key = `${weekday}|${person}`;
    if (
      !canonicalSymbol ||
      (!previousSymbols?.has(normalizeSymbol(canonicalSymbol)) && !personExperience?.has(normalizeSymbol(canonicalSymbol))) ||
      seen.has(key)
    ) {
      logDebug("validation-failed", {
        weekday,
        person,
        symbol,
        allowedSymbols,
        previousSymbols: previousSymbols ? [...previousSymbols] : [],
        experience: personExperience ? [...personExperience] : [],
        seen: [...seen],
      });
      return NextResponse.json(
        { success: false, error: "Draft Groq melanggar aturan hari praktik, simbol, atau pola sumber. Tidak ada perubahan yang diterapkan." },
        { status: 502 },
      );
    }
    seen.add(key);
    validatedAssignments.push({ weekday, person, symbol: canonicalSymbol });
  }

  let completedFromSourceCount = 0;
  for (const pattern of previousPatterns) {
    const allowedSymbols = allowedByWeekday.get(pattern.weekday) || [];
    for (const assignment of pattern.assignments) {
      const person = assignment.person;
      const key = `${pattern.weekday}|${person}`;
      if (seen.has(key)) continue;

      const sourceSymbol = normalizeSymbol(assignment.symbol);
      const symbol = allowedSymbols.find(
        allowed => allowed.toLocaleUpperCase("id-ID") === sourceSymbol,
      ) || allowedSymbols[0];
      if (!symbol) continue;

      seen.add(key);
      validatedAssignments.push({ weekday: pattern.weekday, person, symbol });
      completedFromSourceCount++;
    }
  }

  logDebug("source-pattern-completion", {
    aiAssignmentCount: generated.assignments.length,
    finalAssignmentCount: validatedAssignments.length,
    completedFromSourceCount,
  });

  const assignmentsByDate = [];
  const midelCounts = new Map(safePeople.map((person) => [person.code, 0]));
  const existingByDate = new Map();
  for (const assignment of safeExistingAssignments) {
    const daily = existingByDate.get(assignment.day) || new Map();
    daily.set(assignment.person, assignment.symbol);
    existingByDate.set(assignment.day, daily);
    if (isMidelSymbol(assignment.symbol)) {
      midelCounts.set(assignment.person, (midelCounts.get(assignment.person) || 0) + 1);
    }
  }
  const previousDayMidelByPerson = new Map(safePreviousDayAssignments.map((assignment) => [
    assignment.person,
    isMidelSymbol(assignment.symbol),
  ]));
  const lastDayMidelByPerson = new Map(previousDayMidelByPerson);
  const weekdayOccurrences = new Map();
  let rotatedSymbolCount = 0;

  const calendarByWeekday = new Map(normalizedWeekdaysInput.map((weekday) => [
    weekday.weekday,
    new Map(weekday.calendar.map((entry) => [entry.day, entry.symbols])),
  ]));
  const targetDates = Array.from({ length: new Date(targetTahun, targetBulan, 0).getDate() }, (_, index) => {
    const day = index + 1;
    const weekday = weekdayNames[new Date(targetTahun, targetBulan - 1, day).getDay()];
    return {
      weekday,
      day,
      symbols: calendarByWeekday.get(weekday)?.get(day) || [],
    };
  });

  for (const targetDate of targetDates) {
    const day = targetDate.day;
    const dateSymbols = targetDate.symbols;
    const occurrence = weekdayOccurrences.get(targetDate.weekday) || 0;
    if (dateSymbols.length) weekdayOccurrences.set(targetDate.weekday, occurrence + 1);
    const existing = existingByDate.get(day) || new Map();
    const dailyAssignments = dateSymbols.length ? validatedAssignments
      .filter((assignment) => assignment.weekday === targetDate.weekday)
      .flatMap((assignment) => {
        const person = peopleByCode.get(assignment.person);
        if (!person || person.leaveDays.includes(day) || existing.has(person.code)) return [];

        const historicalSymbols = person.experience
          .filter((item) => dateSymbols.some((symbol) => normalizeSymbol(symbol) === normalizeSymbol(item.symbol)))
          .sort((first, second) => second.shifts - first.shifts)
          .map((item) => dateSymbols.find((symbol) => normalizeSymbol(symbol) === normalizeSymbol(item.symbol)));
        const baseSymbolAvailable = dateSymbols.some((symbol) => normalizeSymbol(symbol) === normalizeSymbol(assignment.symbol));
        const rotationSymbols = [...new Set([...(baseSymbolAvailable ? [assignment.symbol] : []), ...historicalSymbols])];
        if (!rotationSymbols.length) return [];
        return [{
          assignment,
          person,
          rotationSymbols,
          preferredSymbol: rotationSymbols[occurrence % rotationSymbols.length],
        }];
      }) : [];

    const desiredMidelCount = dailyAssignments.filter((item) => isMidelSymbol(item.preferredSymbol)).length;
    const midelCandidates = dailyAssignments
      .filter(({ person, rotationSymbols }) =>
        !lastDayMidelByPerson.get(person.code) && rotationSymbols.some(isMidelSymbol),
      )
      .sort((first, second) =>
        (midelCounts.get(first.person.code) || 0) - (midelCounts.get(second.person.code) || 0)
        || first.person.code.localeCompare(second.person.code, "id"),
      );
    const selectedMidelPeople = new Set(
      midelCandidates.slice(0, desiredMidelCount).map(({ person }) => person.code),
    );
    const currentDayMidelByPerson = new Map(safePeople.map((person) => [person.code, false]));

    for (const [personCode, symbol] of existing) {
      currentDayMidelByPerson.set(personCode, isMidelSymbol(symbol));
    }

    for (const item of dailyAssignments) {
      const { assignment, person, rotationSymbols, preferredSymbol } = item;
      const midelSymbols = rotationSymbols.filter(isMidelSymbol);
      const nonMidelSymbols = rotationSymbols.filter((symbol) => !isMidelSymbol(symbol));
      const canUseMidel = !lastDayMidelByPerson.get(person.code) && midelSymbols.length > 0;
      let symbol = "";

      if (selectedMidelPeople.has(person.code) && canUseMidel) {
        symbol = midelSymbols.find((candidate) => candidate === preferredSymbol) || midelSymbols[0];
        midelCounts.set(person.code, (midelCounts.get(person.code) || 0) + 1);
        currentDayMidelByPerson.set(person.code, true);
      } else {
        symbol = nonMidelSymbols.find((candidate) => candidate === preferredSymbol) || nonMidelSymbols[0] || "";
        if (!symbol && canUseMidel && selectedMidelPeople.size < desiredMidelCount) {
          symbol = midelSymbols[0];
          midelCounts.set(person.code, (midelCounts.get(person.code) || 0) + 1);
          currentDayMidelByPerson.set(person.code, true);
        }
      }

      if (!symbol) continue;
      if (symbol !== assignment.symbol) rotatedSymbolCount++;
      assignmentsByDate.push({ ...assignment, day, symbol });
    }

    for (const person of safePeople) {
      lastDayMidelByPerson.set(person.code, currentDayMidelByPerson.get(person.code) || false);
    }
  }

  const finalAssignments = assignmentsByDate;
  logDebug("daily-rotation", {
    dateAssignmentCount: assignmentsByDate.length,
    rotatedSymbolCount,
    midelCounts: Object.fromEntries(midelCounts),
  });

  return NextResponse.json({
    success: true,
    assignments: finalAssignments,
    midelCounts: Object.fromEntries(midelCounts),
    summary: cleanString(generated.summary, 500),
  });
}
