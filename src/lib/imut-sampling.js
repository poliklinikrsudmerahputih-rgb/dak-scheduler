import { calculateTargetPIC } from "@/lib/imut-indicators";

export const IMUT_SAMPLE_QUOTAS = [
  { clinic: "Paru", quota: 8 },
  { clinic: "THT", quota: 5 },
  { clinic: "Kulit dan Kelamin", quota: 5 },
  { clinic: "Mata", quota: 5 },
  { clinic: "Saraf", quota: 8 },
  { clinic: "Jiwa", quota: 5 },
  { clinic: "Urologi", quota: 9 },
  { clinic: "Psikologi", quota: 2 },
  { clinic: "Bedah", quota: 12 },
  { clinic: "Orto", quota: 8 },
  { clinic: "Obsgyn", quota: 12 },
  { clinic: "Anak", quota: 10 },
  { clinic: "Jantung", quota: 8 },
  { clinic: "Poliklinik Dalam", quota: 12 },
  { clinic: "Rehabilitasi Medik", quota: 4 },
  { clinic: "Gigi", quota: 10 }
];

const quotaTotal = IMUT_SAMPLE_QUOTAS.reduce((total, item) => total + item.quota, 0);
const clinicAliases = new Map([
  ["KANDUNGAN", "OBSGYN"],
  ["DALAM", "POLIKLINIK DALAM"],
  ["KULIT", "KULIT DAN KELAMIN"],
  ["REHAB MEDIK", "REHABILITASI MEDIK"]
]);
const quotaByClinic = new Map(IMUT_SAMPLE_QUOTAS.map(({ clinic, quota }) => [
  normalizeImutClinic(clinic),
  quota
]));

export function normalizeImutClinic(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  return clinicAliases.get(normalized) || normalized;
}

export function getMonthlyImutQuotas(population) {
  const picTarget = Math.max(0, Math.floor(Number(calculateTargetPIC(Number(population) || 0)) || 0));
  const sampleBudget = Math.min(quotaTotal, picTarget);
  const allocated = new Map();
  let allocatedTotal = 0;

  for (const { clinic } of IMUT_SAMPLE_QUOTAS) {
    const exactQuota = quotaByClinic.get(normalizeImutClinic(clinic));
    const proportionalQuota = sampleBudget * exactQuota / quotaTotal;
    const baseQuota = Math.floor(proportionalQuota);
    allocated.set(normalizeImutClinic(clinic), baseQuota);
    allocatedTotal += baseQuota;
  }

  const remainderOrder = [...IMUT_SAMPLE_QUOTAS].sort((first, second) => {
    const firstRemainder = sampleBudget * first.quota / quotaTotal
      - Math.floor(sampleBudget * first.quota / quotaTotal);
    const secondRemainder = sampleBudget * second.quota / quotaTotal
      - Math.floor(sampleBudget * second.quota / quotaTotal);
    return secondRemainder - firstRemainder
      || IMUT_SAMPLE_QUOTAS.indexOf(first) - IMUT_SAMPLE_QUOTAS.indexOf(second);
  });

  for (const { clinic, quota } of remainderOrder) {
    if (allocatedTotal >= sampleBudget) break;
    const key = normalizeImutClinic(clinic);
    if (allocated.get(key) >= quota) continue;
    allocated.set(key, allocated.get(key) + 1);
    allocatedTotal += 1;
  }

  return allocated;
}

function compareRows(first, second) {
  return String(first.tanggal || "").localeCompare(String(second.tanggal || ""))
    || Number(first.id || 0) - Number(second.id || 0);
}

function selectRowsAcrossDates(rows, quota) {
  if (rows.length <= quota) return rows;

  const byDate = new Map();
  for (const row of rows) {
    const date = String(row.tanggal || "").slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }

  const dates = [...byDate.keys()].sort();
  const selectedCounts = new Map(dates.map((date) => [date, 0]));
  let remaining = quota;

  if (quota < dates.length) {
    for (let index = 0; index < quota; index += 1) {
      const dateIndex = Math.floor((index + 0.5) * dates.length / quota);
      selectedCounts.set(dates[dateIndex], 1);
    }
    remaining = 0;
  } else {
    for (const date of dates) {
      if (remaining === 0) break;
      selectedCounts.set(date, 1);
      remaining -= 1;
    }

    while (remaining > 0) {
      let madeProgress = false;
      for (const date of dates) {
        const selected = selectedCounts.get(date);
        if (selected >= byDate.get(date).length) continue;
        selectedCounts.set(date, selected + 1);
        remaining -= 1;
        madeProgress = true;
        if (remaining === 0) break;
      }
      if (!madeProgress) break;
    }
  }

  return dates.flatMap((date) => {
    const dayRows = byDate.get(date).sort(compareRows);
    const count = selectedCounts.get(date);
    return Array.from({ length: count }, (_, index) => {
      const rowIndex = Math.floor((index + 0.5) * dayRows.length / count);
      return dayRows[rowIndex];
    });
  }).sort(compareRows);
}

export function selectMonthlyImutSamples(rows, monthlyPopulationByKey) {
  const groups = new Map();
  for (const row of rows || []) {
    const date = String(row.tanggal || "").slice(0, 10);
    const monthKey = date.slice(0, 7);
    const clinicKey = normalizeImutClinic(row.klinik);
    if (!/^\d{4}-\d{2}$/.test(monthKey) || !quotaByClinic.has(clinicKey)) continue;

    const groupKey = `${monthKey}|${clinicKey}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }

  const selected = [];
  const quotasByMonth = new Map();
  for (const [groupKey, groupRows] of groups) {
    const [monthKey, clinicKey] = groupKey.split("|");
    let quotas = quotasByMonth.get(monthKey);
    if (!quotas) {
      quotas = getMonthlyImutQuotas(monthlyPopulationByKey.get(monthKey) || 0);
      quotasByMonth.set(monthKey, quotas);
    }

    const quota = quotas.get(clinicKey) || 0;
    if (quota > 0) selected.push(...selectRowsAcrossDates(groupRows.sort(compareRows), quota));
  }

  return { rows: selected.sort(compareRows), quotasByMonth };
}
