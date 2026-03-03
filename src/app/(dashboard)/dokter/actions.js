"use server";
// PERBAIKAN: Menggunakan @ agar otomatis mengarah ke folder src/lib
import { turso } from "@/lib/turso"; 
import { revalidatePath } from "next/cache";

/**
 * Fungsi Utama: Menyimpan (Insert) atau Memperbarui (Update) Jadwal Dokter
 */
export async function simpanDokter(formData) {
  const id = formData.get("id"); 
  const nama_dokter = formData.get("nama_dokter");
  const klinik = formData.get("klinik");
  const hari = formData.get("hari");
  const jam = formData.get("jam");
  const simbol = formData.get("simbol");

  try {
    if (id) {
      // 1. Logika Update jika sedang dalam mode Edit
      await turso.execute({
        sql: `UPDATE master_dokter 
              SET nama_dokter = ?, klinik = ?, jadwal_hari = ?, jam_praktik = ?, simbol_praktik = ? 
              WHERE id = ?`,
        args: [nama_dokter, klinik, hari, jam, simbol, id]
      });
    } else {
      // 2. Logika Insert jika menambah data baru
      await turso.execute({
        sql: `INSERT INTO master_dokter (nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [nama_dokter, klinik, hari, jam, simbol]
      });
    }

    // Menggunakan revalidatePath agar Sidebar & Tabel Dokter terupdate otomatis
    revalidatePath("/dokter");
    return { success: true };

  } catch (e) {
    console.error("Database Error Detail:", e);
    return { success: false, error: "Gagal memproses data ke database Turso." };
  }
}

/**
 * Fungsi Tambahan: Menghapus Jadwal Dokter
 */
export async function hapusDokter(id) {
  if (!id) return { success: false, error: "ID data tidak valid." };

  try {
    await turso.execute({
      sql: `DELETE FROM master_dokter WHERE id = ?`,
      args: [id]
    });

    revalidatePath("/dokter");
    return { success: true };
  } catch (e) {
    console.error("Gagal menghapus jadwal:", e);
    return { success: false, error: "Data gagal dihapus." };
  }
}