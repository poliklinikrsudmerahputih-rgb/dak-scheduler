const indicatorDefinitions = [
  {
    key: "kepatuhanJamPraktik",
    nama: "Kepatuhan Jam Praktik Spesialis",
    label: "Jam Praktik",
    numerator: (counts) => counts.tepatWaktu,
    denominator: (counts) => counts.sampelKehadiran,
    target: 80
  },
  {
    key: "keterlambatanDokter",
    nama: "Keterlambatan Dokter (> 15 Menit)",
    label: "Keterlambatan ≤15 mnt",
    numerator: (counts) => counts.tepatWaktu,
    denominator: (counts) => counts.sampelKehadiran,
    target: 80
  },
  {
    key: "identifikasiPraTindakan",
    nama: "Identifikasi Pasien Pra-Tindakan",
    label: "Identifikasi Pra-Tindakan",
    numerator: (counts) => counts.identifikasiYa,
    denominator: (counts) => counts.sampelIdentifikasi,
    target: 100
  },
  {
    key: "waktuTungguRawatJalan",
    nama: "Waktu Tunggu Rawat Jalan (< 60 Menit)",
    label: "Waktu Tunggu <60 mnt",
    numerator: (counts) => counts.waktuKurang60Tercapai,
    denominator: (counts) => counts.sampelWaktuTunggu,
    target: 80
  }
];

export const POLI_SAMPLE_LIMITS = {
  Dalam: 12,
  Bedah: 12,
  Bidan: 12,
  Anak: 10,
  Gigi: 10,
  Syaraf: 10,
  Uro: 9,
  Paru: 8,
  Ortho: 8,
  Jantung: 8,
  THT: 5,
  Jiwa: 5,
  DV: 5,
  Fisio: 4,
  MCU: 4,
  Mata: 2,
  Psi: 2
};

export const IMUT_REPORT_TARGETS = Object.freeze({
  targetPIC: 128,
  targetValidasi: 48
});

const clinicAliases = new Map([
  ["POLIKLINIK DALAM", "DALAM"],
  ["PENYAKIT DALAM", "DALAM"],
  ["POLI PENYAKIT DALAM", "DALAM"],
  ["SARAF", "SYARAF"],
  ["NEUROLOGI", "SYARAF"],
  ["UROLOGI", "URO"],
  ["ORTO", "ORTHO"],
  ["ORTOPEDI", "ORTHO"],
  ["ORTHOPEDI", "ORTHO"],
  ["OBSGYN", "BIDAN"],
  ["KANDUNGAN", "BIDAN"],
  ["KEBIDANAN", "BIDAN"],
  ["OBSTETRI DAN GINEKOLOGI", "BIDAN"],
  ["OBSTETRI GINEKOLOGI", "BIDAN"],
  ["KULIT", "DV"],
  ["KULIT DAN KELAMIN", "DV"],
  ["DERMATOLOGI DAN VENEREOLOGI", "DV"],
  ["DERMATOLOGI", "DV"],
  ["REHAB MEDIK", "FISIO"],
  ["REHABILITASI MEDIK", "FISIO"],
  ["FISIOTERAPI", "FISIO"],
  ["PSIKOLOGI", "PSI"],
  ["KLINIK MCU", "MCU"]
]);

export function normalizeImutClinic(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/^(POLI|POLIKLINIK)\s+/, "");
  return clinicAliases.get(normalized) || normalized;
}

export function getPoliSampleLimit(clinic) {
  const normalized = normalizeImutClinic(clinic);
  const entry = Object.entries(POLI_SAMPLE_LIMITS).find(([name]) => name.toUpperCase() === normalized);
  return entry ? entry[1] : null;
}

export function getMonthlyImutSampleCount(rekap, clinic, sampleKey) {
  const clinicKey = normalizeImutClinic(clinic);
  const row = (Array.isArray(rekap) ? rekap : []).find(
    (item) => normalizeImutClinic(item.klinik) === clinicKey
  );
  return Number(row?.[sampleKey]) || 0;
}

export function applyImutSampleLimits(indicators = [], rekap = []) {
  return indicators.map((indicator) => {
    if (indicator.key !== "identifikasiPraTindakan" || !rekap.length) return indicator;

    let numerator = 0;
    let denominator = 0;
    for (const row of rekap) {
      const sampleCount = Number(row.sampelIdentifikasi ?? row.sampelWaktuTunggu) || 0;
      const clinicLimit = getPoliSampleLimit(row.klinik);
      const includedSamples = clinicLimit === null ? sampleCount : Math.min(sampleCount, clinicLimit);
      const yesCount = Number(row.identifikasiYa) || 0;

      denominator += includedSamples;
      numerator += sampleCount > 0 ? yesCount * includedSamples / sampleCount : 0;
    }

    numerator = Math.round(numerator * 10) / 10;
    return {
      ...indicator,
      numerator,
      denominator,
      capaian: denominator ? Math.round(numerator / denominator * 1000) / 10 : null
    };
  });
}

export function calculateTargetPIC(populasi) {
  if (populasi >= 640) return 128;
  if (populasi >= 320 && populasi <= 639) return Math.ceil(populasi * 0.20);
  if (populasi >= 64 && populasi <= 319) return 64;
  return populasi;
}

export function calculateTargetValidator(populasi) {
  if (populasi >= 480) return 48;
  if (populasi >= 161 && populasi <= 480) return Math.ceil(populasi * 0.10);
  if (populasi >= 17 && populasi <= 160) {
    const tenPercent = Math.ceil(populasi * 0.10);
    return tenPercent > 16 ? tenPercent : 16;
  }
  return populasi;
}

export function calculateTargetValidatorFromPIC(targetPIC) {
  const normalizedTarget = Math.max(0, Math.floor(Number(targetPIC) || 0));
  return Math.round(normalizedTarget * IMUT_REPORT_TARGETS.targetValidasi / IMUT_REPORT_TARGETS.targetPIC);
}

export function calculateImutTargets(populasi) {
  const normalizedPopulation = Math.max(0, Math.floor(Number(populasi) || 0));
  const targetPIC = calculateTargetPIC(normalizedPopulation);
  return {
    targetPIC,
    targetValidasi: calculateTargetValidatorFromPIC(targetPIC)
  };
}

export function inferImutTargetsFromPicTarget(targetPIC) {
  const normalizedTarget = Math.max(0, Math.floor(Number(targetPIC) || 0));
  return {
    targetPIC: normalizedTarget,
    targetValidasi: calculateTargetValidatorFromPIC(normalizedTarget)
  };
}

export function getMonthlyImutPopulation(rekap, clinic) {
  const clinicKey = normalizeImutClinic(clinic);
  const row = (Array.isArray(rekap) ? rekap : []).find(
    (item) => normalizeImutClinic(item.klinik) === clinicKey
  );
  if (!row || row.kunjungan === null || row.kunjungan === undefined) return null;

  const population = Number(row.kunjungan);
  return Number.isFinite(population) && population >= 0 ? population : null;
}

export function buildImutIndicators(counts = {}) {
  const normalizedCounts = Object.fromEntries([
    "tepatWaktu",
    "terlambat",
    "sampelKehadiran",
    "identifikasiYa",
    "identifikasiTidak",
    "waktuKurang60",
    "waktuKurang60Tercapai",
    "sampelWaktuTunggu",
    "sampelIdentifikasi"
  ].map((key) => [key, Number(counts[key]) || 0]));
  if (counts.sampelIdentifikasi === undefined) {
    normalizedCounts.sampelIdentifikasi = normalizedCounts.sampelWaktuTunggu;
  }

  return indicatorDefinitions.map((definition) => {
    const numerator = definition.numerator(normalizedCounts);
    const denominator = definition.denominator(normalizedCounts);
    return {
      key: definition.key,
      nama: definition.nama,
      label: definition.label,
      numerator,
      denominator,
      capaian: denominator ? Math.round(numerator / denominator * 1000) / 10 : null,
      target: definition.target
    };
  });
}

export function sumImutCounts(rows = []) {
  return rows.reduce((total, row) => {
    total.tepatWaktu += Number(row.tepatWaktu) || 0;
    total.terlambat += Number(row.terlambat) || 0;
    total.sampelKehadiran += Number(row.sampelKehadiran) || 0;
    total.identifikasiYa += Number(row.identifikasiYa) || 0;
    total.identifikasiTidak += Number(row.identifikasiTidak) || 0;
    total.sampelIdentifikasi += Number(row.sampelIdentifikasi ?? row.sampelWaktuTunggu) || 0;
    total.waktuKurang60 += Number(row.waktuKurang60) || 0;
    total.waktuKurang60Tercapai += Number(row.waktuKurang60Tercapai) || 0;
    total.sampelWaktuTunggu += Number(row.sampelWaktuTunggu) || 0;
    return total;
  }, {
    tepatWaktu: 0,
    terlambat: 0,
    sampelKehadiran: 0,
    identifikasiYa: 0,
    identifikasiTidak: 0,
    sampelIdentifikasi: 0,
    waktuKurang60: 0,
    waktuKurang60Tercapai: 0,
    sampelWaktuTunggu: 0
  });
}
