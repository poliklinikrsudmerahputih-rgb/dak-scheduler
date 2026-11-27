function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateSarprasAlatRusak(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Format laporan alat rusak tidak valid." };
  }

  const value = {
    tanggal_pelaporan: typeof body.tanggal_pelaporan === "string" ? body.tanggal_pelaporan.trim() : "",
    poli_ruangan: typeof body.poli_ruangan === "string" ? body.poli_ruangan.trim() : "",
    nama_barang: typeof body.nama_barang === "string" ? body.nama_barang.trim() : "",
    deskripsi_kerusakan: typeof body.deskripsi_kerusakan === "string" ? body.deskripsi_kerusakan.trim() : "",
    nama_pelapor: typeof body.nama_pelapor === "string" ? body.nama_pelapor.trim() : "",
    petugas_ipsrs: typeof body.petugas_ipsrs === "string" ? body.petugas_ipsrs.trim() : "",
    tanggal_selesai: typeof body.tanggal_selesai === "string" ? body.tanggal_selesai.trim() : "",
  };

  if (!isValidDate(value.tanggal_pelaporan)) {
    return { error: "Tanggal pelaporan wajib diisi dengan tanggal yang valid." };
  }
  if (!value.poli_ruangan || value.poli_ruangan.length > 160) {
    return { error: "Poli/ruangan wajib dipilih dan maksimal 160 karakter." };
  }
  if (!value.nama_barang || value.nama_barang.length > 255) {
    return { error: "Nama barang wajib diisi dan maksimal 255 karakter." };
  }
  if (!value.deskripsi_kerusakan || value.deskripsi_kerusakan.length > 2000) {
    return { error: "Deskripsi kerusakan wajib diisi dan maksimal 2.000 karakter." };
  }
  if (!value.nama_pelapor || value.nama_pelapor.length > 160) {
    return { error: "Nama pelapor wajib diisi dan maksimal 160 karakter." };
  }
  if (!value.petugas_ipsrs || value.petugas_ipsrs.length > 160) {
    return { error: "Nama petugas IPSRS wajib diisi dan maksimal 160 karakter." };
  }
  if (value.tanggal_selesai && !isValidDate(value.tanggal_selesai)) {
    return { error: "Tanggal selesai penanganan tidak valid." };
  }
  if (value.tanggal_selesai && value.tanggal_selesai < value.tanggal_pelaporan) {
    return { error: "Tanggal selesai tidak boleh lebih awal dari tanggal pelaporan." };
  }

  return { value };
}
