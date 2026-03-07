import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format, addDays } from "date-fns";
import { id } from "date-fns/locale";

// Memaksa data selalu fresh (Penting untuk dashboard publik)
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  // Ambil parameter dari request (Dropdown View)
  const pTanggal = parseInt(searchParams.get("tanggal")) || new Date().getDate();
  const pBulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
  const pTahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

  // Logic Tanggal untuk Besok (Prediksi)
  const targetDate = new Date(pTahun, pBulan - 1, pTanggal);
  const besokObj = addDays(targetDate, 1);
  const tglBesok = besokObj.getDate();
  const blnBesok = besokObj.getMonth() + 1;
  const thnBesok = besokObj.getFullYear();
  
  // Format Hari Indo untuk Filter Dokter Berdasarkan Jadwal Hari
  const namaHariIndo = format(targetDate, "eeee", { locale: id });
  const formatTglTarget = format(targetDate, "yyyy-MM-dd");

  try {
    // 1. Ambil Summary (Total SDM & Dokter)
    const sdmCount = await turso.execute("SELECT COUNT(*) as total FROM sdm");
    const dokterCount = await turso.execute("SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter");

    // 2. Ambil Jadwal Dinas (Tarik kolom jumlah_pasien)
    const resJadwal = await turso.execute({
      sql: `SELECT j.*, s.nama, s.jabatan 
            FROM jadwal_dinas j 
            JOIN sdm s ON j.sdm_id = s.id 
            WHERE (j.bulan = ? AND j.tahun = ?) OR (j.bulan = ? AND j.tahun = ?)`,
      args: [pBulan, pTahun, blnBesok, thnBesok]
    });
    const semuaJadwal = resJadwal.rows;

    /**
     * 3. DATA CUTI SDM & DOKTER (PERBAIKAN UTAMA):
     * - Untuk SDM: Kita HAPUS filter "status_acc = 'Disetujui'"
     * - Agar pengajuan yang statusnya NULL / 'Menunggu' tetap dikirim ke View
     */
    const [resSdmCuti, resDokterCuti] = await Promise.all([
      turso.execute({
        sql: `SELECT * FROM cuti_sdm 
              WHERE (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)
              ORDER BY id DESC LIMIT 20`,
        args: [String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      }),
      turso.execute({
        sql: "SELECT * FROM cuti_dokter WHERE (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)",
        args: [String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      })
    ]);

    // 4. Ambil Dokter yang harusnya praktik di hari tersebut
    const resMasterDokter = await turso.execute({
      sql: "SELECT * FROM master_dokter WHERE jadwal_hari = ?",
      args: [namaHariIndo]
    });

    // 5. PROSES MAPPING DATA KE VIEW
    const dokterPraktik = resMasterDokter.rows.map(dok => {
      // Cari asisten di tanggal pilihan
      const asistenRow = semuaJadwal.find(p => 
        p.tanggal === pTanggal && 
        p.bulan === pBulan &&
        p.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
      );

      // Cari asisten besok (Prediksi)
      const asistenBesok = semuaJadwal.find(p => 
        p.tanggal === tglBesok && 
        p.bulan === blnBesok &&
        p.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
      );

      // Cek status cuti dokter (Hanya yang disetujui biasanya)
      const isCuti = resDokterCuti.rows.some(c => 
        c.nama_dokter === dok.nama_dokter && 
        formatTglTarget >= c.tgl_mulai && 
        formatTglTarget <= c.tgl_selesai
      );

      return {
        ...dok,
        isCuti,
        asisten: asistenRow ? asistenRow.nama : "---",
        sdm_id_asisten: asistenRow ? asistenRow.sdm_id : null,
        jumlah_pasien: asistenRow ? (asistenRow.jumlah_pasien || 0) : 0,
        asistenBesok: asistenBesok ? asistenBesok.nama : "Belum Ada Jadwal"
      };
    });

    // 6. Format Izin Dokter untuk Sidebar Monitoring
    const dataCutiDokterMapped = resDokterCuti.rows.map(c => ({
      nama_dokter: c.nama_dokter,
      jenis_cuti: c.jenis_cuti,
      tgl_mulai: format(new Date(c.tgl_mulai), "dd MMM"),
      tgl_selesai: format(new Date(c.tgl_selesai), "dd MMM")
    }));

    // 7. Format Izin SDM (Semua Status)
    const dataCutiSdmMapped = resSdmCuti.rows.map(s => ({
      nama_sdm: s.nama_sdm,
      jenis_cuti: s.jenis_cuti,
      status_acc: s.status_acc || "Menunggu", // Handle jika status null
      tgl_mulai: format(new Date(s.tgl_mulai), "dd MMM"),
      tgl_selesai: format(new Date(s.tgl_selesai), "dd MMM")
    }));

    return NextResponse.json({
      summary: {
        totalSDM: sdmCount.rows[0]?.total || 0,
        totalDokter: dokterCount.rows[0]?.total || 0,
        perawatMasuk: semuaJadwal.filter(r => r.tanggal === pTanggal && r.bulan === pBulan && !["L","CT","CS","OFF"].includes(r.simbol.trim().toUpperCase())).length,
        sdmIzinCount: resSdmCuti.rows.length,
        tanggal_hari_ini: pTanggal 
      },
      sdmCuti: dataCutiSdmMapped, // MENGIRIM SEMUA STATUS KE VIEW
      dokterCuti: dataCutiDokterMapped,
      dokterPraktik: dokterPraktik
    });

  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}