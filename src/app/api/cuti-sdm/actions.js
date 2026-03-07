"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/**
 * Fungsi Utama: Menyimpan atau Memperbarui Cuti/Izin SDM
 * Ditambahkan logika Ruangan (RLS) dan penanganan Mode Edit
 */
export async function simpanCuti(formData) {
  const id = formData.get("id"); // Penting untuk logika Edit
  const nama = formData.get("nama");
  const jenis_cuti = formData.get("jenis_cuti");
  const tgl_mulai = formData.get("tgl_mulai");
  const tgl_selesai = formData.get("tgl_selesai");
  const alasan = formData.get("alasan");
  const tgl_input = new Date().toISOString();

  try {
    // 1. Ambil Informasi Ruangan dari Sesi Login
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    if (!session) return { success: false, error: "Sesi habis, silakan login ulang." };
    
    const userData = JSON.parse(session.value);
    const userRuangan = userData.ruangan || "POLIKLINIK";

    if (id) {
      // 2a. MODE EDIT
      await turso.execute({
        sql: `UPDATE cuti_sdm 
              SET nama_sdm = ?, jenis_cuti = ?, tgl_mulai = ?, tgl_selesai = ?, alasan = ?, ruangan = ?
              WHERE id = ?`,
        args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, userRuangan, id]
      });
    } else {
      // 2b. MODE BARU (INSERT)
      await turso.execute({
        sql: `INSERT INTO cuti_sdm (nama_sdm, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tanggal_input, status_acc, ruangan) 
              VALUES (?, ?, ?, ?, ?, ?, 'Menunggu', ?)`,
        args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tgl_input, userRuangan]
      });
    }

    // 3. Segarkan cache agar Master SDM dan Cuti SDM terupdate
    revalidatePath("/cuti-sdm");
    revalidatePath("/sdm"); 
    return { success: true };
  } catch (e) {
    console.error("Error Cuti SDM:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Fungsi: Update Status ACC (Disetujui/Ditolak)
 */
export async function updateStatusCuti(id, status) {
  try {
    await turso.execute({
      sql: "UPDATE cuti_sdm SET status_acc = ? WHERE id = ?",
      args: [status, id]
    });
    
    revalidatePath("/cuti-sdm");
    revalidatePath("/sdm"); // Agar lampu merah di Master SDM langsung nyala setelah di-ACC
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Fungsi: Hapus Data Cuti
 */
export async function hapusCuti(id) {
  try {
    await turso.execute({
      sql: "DELETE FROM cuti_sdm WHERE id = ?",
      args: [id]
    });
    revalidatePath("/cuti-sdm");
    revalidatePath("/sdm");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}