"use server";
import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

function cleanText(value) {
  return String(value ?? "").trim();
}

function isValidWa(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function getSessionUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_dak_pro");

  if (!session) {
    return null;
  }

  try {
    return JSON.parse(session.value);
  } catch (error) {
    return null;
  }
}

/**
 * Fungsi Utama: Menyimpan atau Memperbarui Data SDM
 * Menambahkan validasi input dan log aktivasi serta status aktif/ruangan sekarang
 */
export async function simpanSDM(formData) {
  const id = cleanText(formData.get("id"));
  const nama = cleanText(formData.get("nama"));
  const nip = cleanText(formData.get("nip"));
  const jabatan = cleanText(formData.get("jabatan"));
  const status = cleanText(formData.get("status"));
  const jenis_jabatan = cleanText(formData.get("jenis_jabatan"));
  const no_wa = cleanText(formData.get("no_wa"));

  if (!nama) return { success: false, error: "Nama SDM wajib diisi." };
  if (!nip) return { success: false, error: "NIP tidak boleh kosong." };
  if (!jabatan) return { success: false, error: "Jabatan harus dipilih." };
  if (!status) return { success: false, error: "Status pegawai harus dipilih." };
  if (!jenis_jabatan) return { success: false, error: "Jenis jabatan harus dipilih." };
  if (!isValidWa(no_wa)) return { success: false, error: "Format nomor WA tidak valid." };

  try {
    const userData = await getSessionUser();
    if (!userData) {
      return { success: false, error: "Sesi login habis. Silakan login ulang." };
    }

    const userRuangan = cleanText(userData.ruangan || "POLIKLINIK").toUpperCase();
    const userId = userData.id;
    const statusKerja = cleanText(formData.get("status_kerja")) || "AKTIF";
    const ruanganAktif = cleanText(formData.get("ruangan_aktif") || userRuangan).toUpperCase();
    const isAktif = formData.get("is_aktif") === "0" ? 0 : 1;

    const duplicateCheck = await turso.execute({
      sql: `SELECT id FROM sdm WHERE UPPER(TRIM(nip)) = UPPER(TRIM(?))${id ? " AND id != ?" : ""}`,
      args: id ? [nip, id] : [nip],
    });

    if (duplicateCheck.rows.length > 0) {
      return { success: false, error: "NIP sudah terdaftar. Gunakan NIP lain." };
    }

    const now = new Date().toISOString().slice(0, 10);

    if (id) {
      const oldRow = await turso.execute({
        sql: "SELECT * FROM sdm WHERE id = ?",
        args: [id],
      });

      if (!oldRow.rows || oldRow.rows.length === 0) {
        return { success: false, error: "Data SDM tidak ditemukan." };
      }

      const oldData = oldRow.rows[0];
      await turso.execute({
        sql: `UPDATE sdm
              SET nama = ?, nip = ?, jabatan = ?, status = ?, jenis_jabatan = ?, no_wa = ?,
                  ruangan = ?, is_aktif = ?, status_kerja = ?, ruangan_aktif = ?,
                  tanggal_mulai_kerja = COALESCE(tanggal_mulai_kerja, ?),
                  tanggal_akhir_kerja = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
              WHERE id = ?`,
        args: [
          nama,
          nip,
          jabatan,
          status,
          jenis_jabatan,
          no_wa,
          userRuangan,
          isAktif,
          statusKerja,
          ruanganAktif,
          now,
          statusKerja === "RESIGN" || statusKerja === "NON_AKTIF" ? now : null,
          userId,
          id,
        ],
      });

      await turso.execute({
        sql: `INSERT INTO log_aktivitas (entity_type, entity_id, action, user_id, user_name, ruangan, old_value, new_value, keterangan)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "sdm",
          id,
          "UPDATE",
          userId,
          userData.nama || "admin",
          userRuangan,
          JSON.stringify(oldData),
          JSON.stringify({
            nama,
            nip,
            jabatan,
            status,
            jenis_jabatan,
            no_wa,
            ruangan: userRuangan,
            ruangan_aktif: ruanganAktif,
            status_kerja: statusKerja,
            is_aktif: isAktif,
          }),
          "Update data SDM",
        ],
      });
    } else {
      await turso.execute({
        sql: `INSERT INTO sdm (nama, nip, jabatan, status, jenis_jabatan, no_wa, ruangan, is_aktif, status_kerja, ruangan_aktif, tanggal_mulai_kerja, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          nama,
          nip,
          jabatan,
          status,
          jenis_jabatan,
          no_wa,
          userRuangan,
          isAktif,
          statusKerja,
          ruanganAktif,
          now,
          userId,
        ],
      });

      const inserted = await turso.execute({
        sql: "SELECT last_insert_rowid() AS id",
      });
      const newId = inserted.rows?.[0]?.id;

      await turso.execute({
        sql: `INSERT INTO log_aktivitas (entity_type, entity_id, action, user_id, user_name, ruangan, old_value, new_value, keterangan)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "sdm",
          newId,
          "CREATE",
          userId,
          userData.nama || "admin",
          userRuangan,
          JSON.stringify({}),
          JSON.stringify({
            nama,
            nip,
            jabatan,
            status,
            jenis_jabatan,
            no_wa,
            ruangan: userRuangan,
            ruangan_aktif: ruanganAktif,
            status_kerja: statusKerja,
            is_aktif: isAktif,
          }),
          "Tambah data SDM baru",
        ],
      });
    }

    revalidatePath("/sdm");
    return { success: true };
  } catch (error) {
    console.error("Gagal proses data SDM:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Fungsi: Menghapus Data SDM (soft delete agar data historis tetap aman)
 */
export async function hapusSDM(id) {
  if (!id) return { success: false, error: "ID tidak valid." };

  try {
    const userData = await getSessionUser();
    if (!userData) {
      return { success: false, error: "Sesi login habis. Silakan login ulang." };
    }

    const selected = await turso.execute({
      sql: "SELECT * FROM sdm WHERE id = ?",
      args: [id],
    });

    if (!selected.rows || selected.rows.length === 0) {
      return { success: false, error: "Data SDM tidak ditemukan." };
    }

    const current = selected.rows[0];
    const now = new Date().toISOString().slice(0, 10);

    await turso.execute({
      sql: `UPDATE sdm
            SET is_aktif = 0,
                status_kerja = 'RESIGN',
                tanggal_akhir_kerja = ?,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = ?
            WHERE id = ?`,
      args: [now, userData.id, id],
    });

    await turso.execute({
      sql: `INSERT INTO log_aktivitas (entity_type, entity_id, action, user_id, user_name, ruangan, old_value, new_value, keterangan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "sdm",
        id,
        "DELETE",
        userData.id,
        userData.nama || "admin",
        current.ruangan_aktif || current.ruangan || "POLIKLINIK",
        JSON.stringify(current),
        JSON.stringify({
          is_aktif: 0,
          status_kerja: "RESIGN",
          tanggal_akhir_kerja: now,
        }),
        "SDM dihapus dari daftar aktif (soft delete)",
      ],
    });

    revalidatePath("/sdm");
    return { success: true };
  } catch (error) {
    console.error("Gagal hapus data SDM:", error);
    return { success: false, error: error.message };
  }
}