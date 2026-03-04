"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";

/**
 * Fungsi Utama: Menyimpan Baru atau Memperbarui (Edit) Cuti SDM
 * Jika ada 'id' di formData, maka sistem akan menjalankan UPDATE.
 */
export async function simpanCuti(formData) {
  const id = formData.get("id"); // Menangkap ID untuk mode Edit
  const nama = formData.get("nama");
  const jenis_cuti = formData.get("jenis_cuti");
  const tgl_mulai = formData.get("tgl_mulai");
  const tgl_selesai = formData.get("tgl_selesai");
  const alasan = formData.get("alasan");
  const tgl_input = new Date().toISOString();

  try {
    if (id) {
      // 1. LOGIKA UPDATE (Jika sedang mode Edit)
      await turso.execute({
        sql: `UPDATE cuti_sdm 
              SET nama_sdm = ?, jenis_cuti = ?, tgl_mulai = ?, tgl_selesai = ?, alasan = ? 
              WHERE id = ?`,
        args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, id]
      });
    } else {
      // 2. LOGIKA INSERT (Jika data baru)
      await turso.execute({
        sql: `INSERT INTO cuti_sdm (nama_sdm, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tanggal_input, status_acc) 
              VALUES (?, ?, ?, ?, ?, ?, 'Menunggu')`,
        args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tgl_input]
      });
    }
    
    revalidatePath("/cuti-sdm");
    return { success: true };
  } catch (e) {
    console.error("Gagal simpan/edit cuti:", e);
    return { success: false, error: "Gagal memproses data ke database Turso." };
  }
}

/**
 * Fungsi Tambahan: Menghapus Data Cuti secara Permanen
 */
export async function hapusCuti(id) {
  if (!id) return { success: false, error: "ID tidak valid." };

  try {
    await turso.execute({
      sql: "DELETE FROM cuti_sdm WHERE id = ?",
      args: [id]
    });
    
    revalidatePath("/cuti-sdm");
    return { success: true };
  } catch (e) {
    console.error("Gagal hapus data cuti:", e);
    return { success: false, error: "Data gagal dihapus dari database." };
  }
}

/**
 * Fungsi untuk update status ACC (Setujui/Tolak)
 */
export async function updateStatusCuti(id, status) {
  try {
    await turso.execute({
      sql: "UPDATE cuti_sdm SET status_acc = ? WHERE id = ?",
      args: [status, id]
    });
    
    revalidatePath("/cuti-sdm");
    return { success: true };
  } catch (e) {
    console.error("Gagal update status:", e);
    return { success: false, error: e.message };
  }
}