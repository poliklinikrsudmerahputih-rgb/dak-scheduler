import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    // 1. Proteksi Sesi Login
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parameter Filter Waktu
    const bulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const tahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    // 3. Identifikasi Ruangan User
    let userRuangan = "POLIKLINIK"; 
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan || "POLIKLINIK";
    } catch (e) {
      console.warn("Format cookie lama");
    }

    /**
     * 4. QUERY CERDAS (SINKRON DENGAN SISTEM SWAP & POLI BARU)
     * Kita tidak lagi SUM(j.jumlah_pasien) secara mentah.
     * Kita mengambil jadwal (simbol) dan mencocokkannya dengan tabel jumlah_pasien_poli.
     */
    
    // Ambil data dasar SDM sesuai ruangan
    const resSdm = await turso.execute({
      sql: `SELECT * FROM sdm WHERE (ruangan = ? OR ruangan IS NULL OR ruangan = '') ORDER BY nama ASC`,
      args: [userRuangan]
    });
    const daftarSdm = resSdm.rows;

    // Ambil SEMUA Jadwal & Angka Pasien Poli di bulan ini untuk perhitungan pooling
    const [resJadwal, resPasienPoli, resMasterDokter] = await Promise.all([
      turso.execute({
        sql: "SELECT * FROM jadwal_dinas WHERE bulan = ? AND tahun = ?",
        args: [bulan, tahun]
      }),
      turso.execute({
        sql: "SELECT * FROM jumlah_pasien_poli WHERE bulan = ? AND tahun = ?",
        args: [bulan, tahun]
      }),
      turso.execute("SELECT nama_dokter, klinik, simbol_praktik FROM master_dokter")
    ]);

    const semuaJadwal = resJadwal.rows;
    const dataPasienPoli = resPasienPoli.rows;
    const masterDokter = resMasterDokter.rows;

    // 5. PROSES PERHITUNGAN BEBAN (Logic Sinkronisasi)
    const sdmFinal = daftarSdm.map(sdm => {
      // Cari semua jadwal sdm ini di bulan tsb
      const jadwalSdm = semuaJadwal.filter(j => j.sdm_id === sdm.id);
      
      let totalBeban = 0;
      let setKlinik = new Set();

      jadwalSdm.forEach(hari => {
        // Cari dokter mana yang menggunakan simbol hari ini
        const dokterHariIni = masterDokter.filter(d => 
          d.simbol_praktik.trim().toUpperCase() === hari.simbol.trim().toUpperCase()
        );

        dokterHariIni.forEach(dok => {
          setKlinik.add(dok.simbol_praktik);

          // Cari angka pasien yang diinput di Dashboard untuk dokter ini pada tanggal ini
          const recordPasien = dataPasienPoli.find(p => 
            p.nama_dokter === dok.nama_dokter && 
            p.klinik === dok.klinik && 
            p.tanggal === hari.tanggal
          );

          if (recordPasien && recordPasien.jumlah > 0) {
            // Hitung berapa asisten yang bertugas di simbol/poli yang sama di hari itu (untuk pembagian beban)
            const jumlahAsistenDiPoli = semuaJadwal.filter(j => 
              j.tanggal === hari.tanggal && 
              j.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
            ).length;

            // Beban = Pasien Poli / Jumlah Asisten di Poli tsb
            totalBeban += Math.round(recordPasien.jumlah / (jumlahAsistenDiPoli || 1));
          }
        });
      });

      return {
        ...sdm,
        total_pasien: totalBeban, // Ini sekarang dinamis mengikuti Dashboard & Swap
        daftar_klinik: Array.from(setKlinik).join(", ")
      };
    });

    return NextResponse.json(sdmFinal);

  } catch (error) {
    console.error("CRITICAL ERROR API SDM:", error);
    return NextResponse.json([], { status: 500 });
  }
}