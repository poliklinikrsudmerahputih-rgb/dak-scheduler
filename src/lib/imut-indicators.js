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
    denominator: (counts) => counts.sampelWaktuTunggu,
    target: 100
  },
  {
    key: "waktuTungguRawatJalan",
    nama: "Waktu Tunggu Rawat Jalan (< 60 Menit)",
    label: "Waktu Tunggu <60 mnt",
    numerator: (counts) => counts.waktuKurang60,
    denominator: (counts) => counts.sampelWaktuTunggu,
    target: 80
  }
];

export function buildImutIndicators(counts = {}) {
  const normalizedCounts = Object.fromEntries([
    "tepatWaktu",
    "terlambat",
    "sampelKehadiran",
    "identifikasiYa",
    "identifikasiTidak",
    "waktuKurang60",
    "sampelWaktuTunggu"
  ].map((key) => [key, Number(counts[key]) || 0]));

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
    total.waktuKurang60 += Number(row.waktuKurang60) || 0;
    total.sampelWaktuTunggu += Number(row.sampelWaktuTunggu) || 0;
    return total;
  }, {
    tepatWaktu: 0,
    terlambat: 0,
    sampelKehadiran: 0,
    identifikasiYa: 0,
    identifikasiTidak: 0,
    waktuKurang60: 0,
    sampelWaktuTunggu: 0
  });
}
