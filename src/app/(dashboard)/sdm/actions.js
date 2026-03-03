"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";

export async function simpanSDM(formData) {
  // 1. Ambil semua data dari form (Termasuk no_wa)
  const id = formData.get("id"); 
  const nama = formData.get("nama");
  const nip = formData.get("nip");
  const jabatan = formData.get("jabatan");
  const status = formData.get("status");
  const jenis_jabatan = formData.get("jenis_jabatan");
  const no_wa = formData.get("no_wa"); // <--- Tambahan Baru

  try {
    if (id) {
      // 2a. PROSES UPDATE (Jika sedang edit)
      await turso.execute({
        sql: "UPDATE sdm SET nama = ?, nip = ?, jabatan = ?, status = ?, jenis_jabatan = ?, no_wa = ? WHERE id = ?",
        args: [nama, nip, jabatan, status, jenis_jabatan, no_wa, id],
      });
    } else {
      // 2b. PROSES INSERT (Jika input baru)
      await turso.execute({
        sql: "INSERT INTO sdm (nama, nip, jabatan, status, jenis_jabatan, no_wa) VALUES (?, ?, ?, ?, ?, ?)",
        args: [nama, nip, jabatan, status, jenis_jabatan, no_wa],
      });
    }

    // 3. Segarkan cache halaman
    revalidatePath("/sdm");
    return { success: true };
  } catch (error) {
    console.error("Gagal proses data SDM:", error);
    return { success: false, error: error.message };
  }
}

// Fungsi Hapus tetap sama
export async function hapusSDM(id) {
  try {
    await turso.execute({
      sql: "DELETE FROM sdm WHERE id = ?",
      args: [id],
    });
    
    revalidatePath("/sdm");
    return { success: true };
  } catch (error) {
    console.error("Gagal hapus data:", error);
    return { success: false, error: error.message };
  }
}