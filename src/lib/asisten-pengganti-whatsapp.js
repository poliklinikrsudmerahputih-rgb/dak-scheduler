import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";

export function createAsistenPenggantiWhatsAppUrl({ entry, dokter, ruangan, origin }) {
  const publicUrl = new URL("/view-jadwal", origin);
  publicUrl.searchParams.set("tanggal", entry.tanggal);
  if (ruangan) publicUrl.searchParams.set("ruangan", ruangan);
  const tanggalLabel = format(parseISO(`${entry.tanggal}T00:00:00`), "EEEE, dd MMMM yyyy", { locale: id });
  const message = [
    "*INFO PERUBAHAN ASISTEN POLIKLINIK*",
    `Hari/Tanggal: ${tanggalLabel}`,
    `Poliklinik: ${dokter?.klinik || entry.klinik || ruangan}`,
    `Dokter: ${dokter?.nama_dokter || entry.nama_dokter}`,
    `Asisten Awal: ${entry.asisten_awal_nama} (Berhalangan: ${entry.alasan_pergantian})`,
    `*Asisten Pengganti: ${entry.asisten_pengganti_nama}*`,
    "",
    "Pantau jadwal praktik real-time di:",
    publicUrl.toString(),
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
