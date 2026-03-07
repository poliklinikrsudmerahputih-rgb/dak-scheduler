"use server";
import { turso } from "@/lib/turso"; 
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers"; // Penting untuk ambil data sesi login

/**
 * Fungsi Utama: Menyimpan atau Memperbarui Izin/Cuti Dokter
 * Ditambahkan proteksi Ruangan agar sinkron dengan filter RLS di tabel
 */
export async function simpanCutiDokter(formData) {
  const id = formData.get("id"); 
  const nama = formData.get("nama");
  const jenis = formData.get("jenis_cuti");
  const mulai = formData.get("tgl_mulai");
  const selesai = formData.get("tgl_selesai");
  const simbol = formData.get("simbol");
  const tgl_input = new Date().toISOString();

  try {
    // 1. Ambil data ruangan dari Sesi Login Bapak
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    if (!session) return { success: false, error: "Sesi Anda berakhir, silakan login kembali." };
    
    const userData = JSON.parse(session.value);
    const ruanganUser = userData.ruangan || "POLIKLINIK";

    if (id) {
      // 2. MODE EDIT: Pastikan kolom ruangan juga ikut diperbarui/dipertahankan
      await turso.execute({
        sql: `UPDATE cuti_dokter 
              SET nama_dokter=?, jenis_cuti=?, tgl_mulai=?, tgl_selesai=?, simbol=?, ruangan=? 
              WHERE id=?`,
        args: [nama, jenis, mulai, selesai, simbol, ruanganUser, id]
      });
    } else {
      // 3. MODE BARU: Wajib memasukkan ruanganUser agar data muncul di tabel RLS
      await turso.execute({
        sql: `INSERT INTO cuti_dokter (nama_dokter, jenis_cuti, tgl_mulai, tgl_selesai, simbol, tanggal_input, ruangan) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [nama, jenis, mulai, selesai, simbol, tgl_input, ruanganUser]
      });
    }

    // 4. Update tampilan secara real-time di dua halaman
    revalidatePath("/cuti-dokter");
    revalidatePath("/dokter"); // Penting agar Master Dokter langsung tahu ada status "OFF" (lampu merah)
    
    return { success: true };
  } catch (e) {
    console.error("Database Error:", e);
    return { success: false, error: "Database Gagal: " + e.message };
  }
}

/**
 * Fungsi: Menghapus Data Cuti
 */
export async function hapusCutiDokter(id) {
  if (!id) return { success: false, error: "ID tidak ditemukan." };

  try {
    await turso.execute({ 
      sql: "DELETE FROM cuti_dokter WHERE id = ?", 
      args: [id] 
    });
    
    revalidatePath("/cuti-dokter");
    revalidatePath("/dokter");
    return { success: true };
  } catch (e) { 
    return { success: false, error: "Gagal menghapus data." }; 
  }
}