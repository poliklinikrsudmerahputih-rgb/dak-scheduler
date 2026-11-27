const allowedCategories = new Set(["ALAT KESEHATAN", "ALAT NON KESEHATAN"]);

function parseNonNegativeInteger(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return NaN;
  return Number(value);
}

export function validateSarprasRecord(body) {
  const value = {
    kategori: typeof body?.kategori === "string" ? body.kategori.trim().toUpperCase() : "",
    nama_barang: typeof body?.nama_barang === "string" ? body.nama_barang.trim() : "",
    klinik: typeof body?.klinik === "string" ? body.klinik.trim() : "",
    kebutuhan: parseNonNegativeInteger(body?.kebutuhan),
    keadaan: parseNonNegativeInteger(body?.keadaan),
    kekurangan: parseNonNegativeInteger(body?.kekurangan),
    permintaan: parseNonNegativeInteger(body?.permintaan),
    spesifikasi: typeof body?.spesifikasi === "string" ? body.spesifikasi.trim() : "",
    tahun: parseNonNegativeInteger(body?.tahun),
  };

  if (!allowedCategories.has(value.kategori)) {
    return { error: "Kategori barang tidak valid." };
  }
  if (!value.nama_barang || value.nama_barang.length > 255) {
    return { error: "Nama barang wajib diisi dan maksimal 255 karakter." };
  }
  if (!value.klinik || value.klinik.length > 160) {
    return { error: "Poli/ruangan wajib diisi dan maksimal 160 karakter." };
  }
  for (const field of ["kebutuhan", "keadaan", "kekurangan", "permintaan"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0 || value[field] > 1000000) {
      return { error: "Jumlah kebutuhan, keadaan, kekurangan, dan permintaan harus berupa bilangan bulat yang valid." };
    }
  }
  if (value.spesifikasi.length > 2000) {
    return { error: "Spesifikasi/keterangan maksimal 2000 karakter." };
  }
  if (!Number.isInteger(value.tahun) || value.tahun < 2000 || value.tahun > 2100) {
    return { error: "Tahun harus berada pada rentang 2000–2100." };
  }
  return { value };
}
