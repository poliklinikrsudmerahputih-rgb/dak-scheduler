"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";

export async function simpanCuti(formData) {
  const nama = formData.get("nama");
  const jenis_cuti = formData.get("jenis_cuti");
  const tgl_mulai = formData.get("tgl_mulai");
  const tgl_selesai = formData.get("tgl_selesai");
  const alasan = formData.get("alasan");
  const tgl_input = new Date().toISOString();

  try {
    await turso.execute({
      sql: "INSERT INTO cuti_sdm (nama_sdm, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tanggal_input, status_acc) VALUES (?, ?, ?, ?, ?, ?, 'Menunggu')",
      args: [nama, jenis_cuti, tgl_mulai, tgl_selesai, alasan, tgl_input]
    });
    revalidatePath("/cuti-sdm");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function updateStatusCuti(id, status) {
  try {
    await turso.execute({
      sql: "UPDATE cuti_sdm SET status_acc = ? WHERE id = ?",
      args: [status, id]
    });
    revalidatePath("/cuti-sdm");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}