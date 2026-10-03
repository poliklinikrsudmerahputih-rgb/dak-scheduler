const normalizeSymbol = (value) => String(value || "")
  .trim()
  .replace(/[^A-Za-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .toUpperCase();

const symbolKey = (value) => {
  const normalized = normalizeSymbol(value);
  const ners = normalized.match(/NERS\s*\d+/);
  if (ners) return ners[0].replace(/\s+/g, " ");
  const clinic = normalized.match(/POLI\s*[A-Z0-9]+/);
  return clinic ? clinic[0].replace(/\s+/g, " ") : normalized;
};

function symbolsMatch(first, second) {
  const firstKey = symbolKey(first);
  const secondKey = symbolKey(second);
  if (!firstKey || !secondKey) return false;
  if (firstKey === secondKey) return true;

  const firstNers = firstKey.match(/^NERS\s*(\d+)$/)?.[1];
  const secondNers = secondKey.match(/^NERS\s*(\d+)$/)?.[1];
  const firstClinic = firstKey.match(/^POLI\s*(.+)$/)?.[1];
  const secondClinic = secondKey.match(/^POLI\s*(.+)$/)?.[1];
  const firstNumber = firstKey.match(/^(\d+)$/)?.[1];
  const secondNumber = secondKey.match(/^(\d+)$/)?.[1];

  return (firstNers && secondNers && firstNers === secondNers)
    || (firstClinic && secondClinic && firstClinic === secondClinic)
    || (firstNumber && secondNumber && firstNumber === secondNumber)
    || (firstNers && secondNumber && firstNers === secondNumber)
    || (secondNers && firstNumber && secondNers === firstNumber);
}

function workloadGroupKey(date, symbol) {
  return `${date}|${symbolKey(symbol)}`;
}

export function buildScheduleAssignments(scheduleRows, doctors) {
  const assignments = [];
  for (const row of scheduleRows || []) {
    const year = Number(row.tahun);
    const month = Number(row.bulan);
    const day = Number(row.tanggal);
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) continue;

    const weekday = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      timeZone: "UTC"
    }).format(parsedDate).toUpperCase();
    const scheduledDoctors = (doctors || []).filter((doctor) => {
      const days = String(doctor.jadwal_hari || "")
        .split(/[,;/|]+/)
        .map((value) => value.trim().toUpperCase());
      return days.includes(weekday) && symbolsMatch(row.simbol, doctor.simbol_praktik);
    });

    for (const doctor of scheduledDoctors) {
      assignments.push({
        tanggal: date,
        asisten: String(row.nama || "").trim(),
        sdmId: String(row.sdm_id || ""),
        jabatan: String(row.jabatan || row.jenis_jabatan || "Jabatan belum diisi").trim(),
        dokterId: String(doctor.id),
        dokter: String(doctor.nama_dokter || "").trim(),
        poli: String(doctor.klinik || "").trim(),
        jamPraktik: String(doctor.jam_praktik || "").trim(),
        simbolPraktik: String(doctor.simbol_praktik || doctor.klinik || "")
      });
    }
  }
  return assignments;
}

export function addWorkloadScores(assignments, patientRows, doctors) {
  const doctorsByNameAndClinic = new Map();
  for (const doctor of doctors || []) {
    doctorsByNameAndClinic.set(
      `${String(doctor.nama_dokter || "").trim().toUpperCase()}|${String(doctor.klinik || "").trim().toUpperCase()}`,
      doctor
    );
  }

  const weightedPointsByGroup = new Map();
  for (const row of patientRows || []) {
    const doctor = doctorsByNameAndClinic.get(
      `${String(row.nama_dokter || "").trim().toUpperCase()}|${String(row.klinik || "").trim().toUpperCase()}`
    );
    if (!doctor) continue;

    const date = String(row.tanggal_key || row.tanggalKey || row.date || "");
    const rowDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : `${String(Number(row.tahun)).padStart(4, "0")}-${String(Number(row.bulan)).padStart(2, "0")}-${String(Number(row.tanggal)).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rowDate)) continue;

    const symbol = doctor.simbol_praktik || doctor.klinik;
    const key = workloadGroupKey(rowDate, symbol);
    const count = Number(row.jumlah) || 0;
    const weightValue = Number.parseFloat(doctor.bobot_jaspel);
    const weight = Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1;
    weightedPointsByGroup.set(key, (weightedPointsByGroup.get(key) || 0) + count * weight);
  }

  const assistantsByGroup = new Map();
  for (const assignment of assignments || []) {
    const key = workloadGroupKey(assignment.tanggal, assignment.simbolPraktik || assignment.poli);
    if (!assistantsByGroup.has(key)) assistantsByGroup.set(key, new Set());
    assistantsByGroup.get(key).add(assignment.sdmId || assignment.asisten);
  }

  return (assignments || []).map((assignment) => {
    const key = workloadGroupKey(assignment.tanggal, assignment.simbolPraktik || assignment.poli);
    const assistantCount = assistantsByGroup.get(key)?.size || 0;
    const workloadGroup = `${key}|${assignment.sdmId || assignment.asisten}`;
    return {
      ...assignment,
      bebanGroupKey: workloadGroup,
      bebanPoliGroupKey: key,
      bebanPoin: assistantCount
        ? (weightedPointsByGroup.get(key) || 0) / assistantCount
        : 0
    };
  });
}
