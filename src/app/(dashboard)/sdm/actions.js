"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/**
 * Fungsi Utama: Menyimpan atau Memperbarui Data SDM
 * Ditambahkan kolom 'ruangan' secara otomatis berdasarkan Sesi Login
 */
export async function simpanSDM(formData) {
  // 1. Ambil data dari form
  const id = formData.get("id"); 
  const nama = formData.get("nama");
  const nip = formData.get("nip");
  const jabatan = formData.get("jabatan");
  const status = formData.get("status");
  const jenis_jabatan = formData.get("jenis_jabatan");
  const no_wa = formData.get("no_wa");

  try {
    // 2. Ambil Informasi Ruangan dari Cookies Sesi
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    
    if (!session) {
      return { success: false, error: "Sesi login habis. Silakan login ulang." };
    }

    const userData = JSON.parse(session.value);
    const userRuangan = userData.ruangan || "POLIKLINIK";

    if (id) {
      // 3a. PROSES UPDATE
      // Menyertakan ruangan agar data tetap terkunci di unit yang benar
      await turso.execute({
        sql: `UPDATE sdm 
              SET nama = ?, nip = ?, jabatan = ?, status = ?, jenis_jabatan = ?, no_wa = ?, ruangan = ? 
              WHERE id = ?`,
        args: [nama, nip, jabatan, status, jenis_jabatan, no_wa, userRuangan, id],
      });
    } else {
      // 3b. PROSES INSERT
      // Menambahkan kolom 'ruangan' saat simpan data baru
      await turso.execute({
        sql: `INSERT INTO sdm (nama, nip, jabatan, status, jenis_jabatan, no_wa, ruangan) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [nama, nip, jabatan, status, jenis_jabatan, no_wa, userRuangan],
      });
    }

    // 4. Segarkan cache halaman agar tabel langsung terupdate
    revalidatePath("/sdm");
    return { success: true };

  } catch (error) {
    console.error("Gagal proses data SDM:", error);
    // Return error message asli dari Turso agar mudah didebug
    return { success: false, error: error.message };
  }
}

/**
 * Fungsi: Menghapus Data SDM
 */
export async function hapusSDM(id) {
  if (!id) return { success: false, error: "ID tidak valid." };

  try {
    await turso.execute({
      sql: "DELETE FROM sdm WHERE id = ?",
      args: [id],
    });
    
    revalidatePath("/sdm");
    return { success: true };
  } catch (error) {
    console.error("Gagal hapus data SDM:", error);
    return { success: false, error: error.message };
  }
}