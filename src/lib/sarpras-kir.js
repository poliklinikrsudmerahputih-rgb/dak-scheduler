export const sarprasKirCategories = [
  "ALAT KESEHATAN",
  "ALAT MEDIS",
  "ALAT NON KESEHATAN",
  "ALAT NON MEDIS",
];

export const sarprasKirConditions = [
  { value: "BAIK", label: "Baik" },
  { value: "RUSAK RINGAN", label: "Rusak Ringan" },
  { value: "RUSAK BERAT", label: "Rusak Berat" },
];

const fieldLimits = {
  nama_barang: 255,
  nomor_barang: 100,
  register: 100,
  merk_model: 255,
  no_seri_pabrik: 255,
  ukuran: 120,
  bahan: 120,
  warna: 120,
  tahun_pembuatan: 20,
  keadaan: 80,
  jumlah_barang: 20,
  kebutuhan_riil: 20,
  keterangan: 2000,
};

export function normalizeSarprasKirCondition(value) {
  const condition = String(value ?? "").trim().toUpperCase();
  return condition === "BAIIK" ? "BAIK" : condition;
}

export function getSarprasKirConditionLabel(value) {
  const condition = normalizeSarprasKirCondition(value);
  return sarprasKirConditions.find((option) => option.value === condition)?.label
    || (condition === "RUSAK" ? "Rusak (data lama)" : String(value ?? "").trim() || "—");
}

export function validateSarprasKirRecord(body, { allowLegacyCondition = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Format data inventaris tidak valid." };
  }

  const value = {};
  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    const rawValue = body[field];
    if (rawValue != null && typeof rawValue !== "string" && typeof rawValue !== "number") {
      return { error: `Nilai ${field} tidak valid.` };
    }

    value[field] = String(rawValue ?? "").trim();
    if (value[field].length > maxLength) {
      return { error: `Kolom ${field} maksimal ${maxLength} karakter.` };
    }
  }

  value.kategori = typeof body.kategori === "string" ? body.kategori.trim().toUpperCase() : "";
  if (!sarprasKirCategories.includes(value.kategori)) {
    return { error: "Kategori inventaris tidak valid." };
  }
  if (!value.nama_barang) {
    return { error: "Nama barang wajib diisi." };
  }
  value.keadaan = normalizeSarprasKirCondition(value.keadaan);
  if (!value.keadaan) {
    return { error: "Pilih kondisi aset." };
  }
  const isStandardCondition = sarprasKirConditions.some((option) => option.value === value.keadaan);
  if (!isStandardCondition && !(allowLegacyCondition && value.keadaan === "RUSAK")) {
    return { error: "Kondisi aset tidak valid." };
  }

  return { value };
}
