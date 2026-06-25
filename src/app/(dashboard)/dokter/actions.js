"use server";
// Menggunakan @ agar otomatis mengarah ke folder src/lib
import { turso } from "@/lib/turso"; 
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/**
 * Fungsi Utama: Menyimpan (Insert) atau Memperbarui (Update) Jadwal Dokter
 * Dilengkapi dengan pendeteksi Ruangan otomatis berdasarkan Sesi Login
 */
export async function simpanDokter(formData) {
  const id = formData.get("id"); 
  const nama_dokter = formData.get("nama_dokter");
  const klinik = formData.get("klinik");
  const hari = formData.get("hari");
  const jam = formData.get("jam");
  const simbol = formData.get("simbol");
  
  // --- PENANGKAPAN DATA BOBOT JASPEL DARI FORM ---
  // Jika karena alasan tertentu form kosong, nilai defaultnya diset 1.0 agar aman
  const bobot_jaspel = formData.get("bobot_jaspel") || 1.0; 

  try {
    // --- PENAMBAHAN LOGIKA KEAMANAN RUANGAN ---
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    if (!session) return { success: false, error: "Sesi habis, silakan login ulang." };
    
    const userData = JSON.parse(session.value);
    const ruanganUser = userData.ruangan || "POLIKLINIK"; 
    // ------------------------------------------

    if (id) {
      // 1. Logika Update jika sedang dalam mode Edit
      // Kita pastikan juga ID dan Ruangannya cocok (Proteksi data)
      // *MEMASUKKAN kolom bobot_jaspel ke dalam query UPDATE*
      await turso.execute({
        sql: `UPDATE master_dokter 
              SET nama_dokter = ?, klinik = ?, jadwal_hari = ?, jam_praktik = ?, simbol_praktik = ?, ruangan = ?, bobot_jaspel = ?
              WHERE id = ?`,
        args: [nama_dokter, klinik, hari, jam, simbol, ruanganUser, bobot_jaspel, id]
      });
    } else {
      // 2. Logika Insert jika menambah data baru
      // Menambahkan kolom 'ruangan' dan 'bobot_jaspel' agar tersimpan di database
      await turso.execute({
        sql: `INSERT INTO master_dokter (nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik, ruangan, bobot_jaspel) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [nama_dokter, klinik, hari, jam, simbol, ruanganUser, bobot_jaspel]
      });
    }

    // Menggunakan revalidatePath agar data di halaman dokter langsung segar
    revalidatePath("/dokter");
    return { success: true };

  } catch (e) {
    console.error("Database Error Detail:", e);
    // Memberikan pesan error yang lebih teknis jika di localhost untuk debugging
    return { success: false, error: "Kesalahan Database: " + e.message };
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