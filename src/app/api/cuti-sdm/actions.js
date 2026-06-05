"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/**
 * Fungsi Internal: Validasi Sesi dan Ruangan
 * Digunakan berulang untuk memastikan keamanan pada setiap tindakan
 */
async function getAuthSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_dak_pro");
  if (!session) return null;
  
  try {
    const userData = JSON.parse(session.value);
    return userData.ruangan || "POLIKLINIK";
  } catch {
    return null;
  }
}

/**
 * Fungsi Utama: Menyimpan atau Memperbarui Cuti/Izin SDM
 */
export async function simpanCuti(formData) {
  const id = formData.get("id"); 
  const nama = formData.get("nama");
  const jenis_cuti = formData.get("jenis_cuti");
  const tgl_mulai = formData.get("tgl_mulai");
  const tgl_selesai = formData.get("tgl_selesai");
  const alasan = formData.get("alasan");
  const tgl_input = new Date().toISOString();

  try {
    // 1. Validasi Keamanan Lapis Pertama
    const userRuangan = await getAuthSession();
    if (!userRuangan) return { success: false, error: "Sesi habis, silakan login ulang." };

    if (id) {
      // 2a. MODE EDIT (Terikat pada ruangan pengubah)
      await turso.execute({
        sql: `UPDATE cuti_sdm 
              SET nama_sdm = ?, jenis_cuti = ?, tgl_mulai = ?, tgl_selesai = ?, alasan = ?, ruangan = ?
              WHERE id = ?`,
        args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, userRuangan.toUpperCase(), id]
      });
    } else {
      // 2b. MODE BARU (Mengunci pengajuan baru ke ruangan yang aktif)
      await turso.execute({
        sql: `INSERT INTO cuti_sdm (nama_sdm, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tanggal_input, status_acc, ruangan) 
              VALUES (?, ?, ?, ?, ?, ?, 'Menunggu', ?)`,
        args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tgl_input, userRuangan.toUpperCase()]
      });
    }

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
    const userRuangan = await getAuthSession();
    if (!userRuangan) return { success: false, error: "Sesi habis." };

    // PERBAIKAN: Mengunci wewenang ACC hanya pada data cuti di ruangan sendiri
    await turso.execute({
      sql: "UPDATE cuti_sdm SET status_acc = ? WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [status, id, userRuangan]
    });
    
    revalidatePath("/cuti-sdm");
    revalidatePath("/sdm"); 
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
    const userRuangan = await getAuthSession();
    if (!userRuangan) return { success: false, error: "Sesi habis." };

    // PERBAIKAN: Mencegah Karu menghapus data milik ruangan lain
    await turso.execute({
      sql: "DELETE FROM cuti_sdm WHERE id = ? AND UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [id, userRuangan]
    });

    revalidatePath("/cuti-sdm");
    revalidatePath("/sdm");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}