"use server";
import { turso } from "@/lib/turso"; 
import { revalidatePath } from "next/cache";

export async function simpanCutiDokter(formData) {
  const id = formData.get("id"); // Untuk cek apakah ini edit atau baru
  const nama = formData.get("nama");
  const jenis = formData.get("jenis_cuti");
  const mulai = formData.get("tgl_mulai");
  const selesai = formData.get("tgl_selesai");
  const simbol = formData.get("simbol");
  const tgl_input = new Date().toISOString();

  try {
    if (id) {
      // MODE EDIT
      await turso.execute({
        sql: `UPDATE cuti_dokter SET nama_dokter=?, jenis_cuti=?, tgl_mulai=?, tgl_selesai=?, simbol=? WHERE id=?`,
        args: [nama, jenis, mulai, selesai, simbol, id]
      });
    } else {
      // MODE BARU
      await turso.execute({
        sql: `INSERT INTO cuti_dokter (nama_dokter, jenis_cuti, tgl_mulai, tgl_selesai, simbol, tanggal_input) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [nama, jenis, mulai, selesai, simbol, tgl_input]
      });
    }
    revalidatePath("/cuti-dokter");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function hapusCutiDokter(id) {
  try {
    await turso.execute({ sql: "DELETE FROM cuti_dokter WHERE id = ?", args: [id] });
    revalidatePath("/cuti-dokter");
    return { success: true };
  } catch (e) { return { success: false }; }
}