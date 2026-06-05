import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// KAMUS BOBOT SEMENTARA DIHILANGKAN UNTUK KEBUTUHAN RISET BEBAN KERJA MURNI

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    // Parameter Filter Waktu (Default Bulan & Tahun Berjalan)
    const bulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const tahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    // Identifikasi Ruangan User
    let userRuangan = "POLIKLINIK"; 
    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama atau tidak valid");
      }
    }

    // 1. Ambil data dasar SDM sesuai unit ruangan yang aktif (Isolasi Ketat)
    const resSdm = await turso.execute({
      sql: `SELECT * FROM sdm WHERE ruangan = ? ORDER BY nama ASC`,
      args: [userRuangan.toUpperCase()]
    });
    const daftarSdm = resSdm.rows;

    // 2. Ambil komponen relasi dengan filter ruangan yang ketat
    const [resJadwal, resPasienPoli, resMasterDokter] = await Promise.all([
      turso.execute({
        sql: "SELECT * FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND ruangan = ?",
        args: [bulan, tahun, userRuangan.toUpperCase()]
      }),
      turso.execute({
        sql: "SELECT * FROM jumlah_pasien_poli WHERE bulan = ? AND tahun = ?",
        args: [bulan, tahun]
      }),
      turso.execute({
        sql: "SELECT nama_dokter, klinik, simbol_praktik FROM master_dokter WHERE ruangan = ?",
        args: [userRuangan.toUpperCase()]
      })
    ]);

    const semuaJadwal = resJadwal.rows;
    const dataPasienPoli = resPasienPoli.rows;
    const masterDokter = resMasterDokter.rows;

    /**
     * FUNGSI RESOLUSI TIM (SINKRONISASI COUPLING)
     */
    const getSimbolGrup = (jadwalSimbol) => {
      if (!jadwalSimbol) return "LAINNYA";
      let jSimbol = jadwalSimbol.trim().toUpperCase();
      let docMatch = masterDokter.find(md => 
        md.klinik.trim().toUpperCase() === jSimbol || 
        md.simbol_praktik.trim().toUpperCase() === jSimbol
      );
      return docMatch ? docMatch.simbol_praktik.trim().toUpperCase() : jSimbol;
    };

    // 3. PROSES PERHITUNGAN AKUMULASI VOLUME PASIEN BULANAN MURNI
    const sdmFinal = daftarSdm.map(sdm => {
      const jadwalSdm = semuaJadwal.filter(j => j.sdm_id === sdm.id);
      
      let totalPasienMurni = 0;
      let setKlinik = new Set();

      jadwalSdm.forEach(hari => {
        const targetSimbolGroup = getSimbolGrup(hari.simbol);

        const dokterHariIni = masterDokter.filter(d => 
          d.simbol_praktik.trim().toUpperCase() === targetSimbolGroup
        );

        if (dokterHariIni.length > 0) {
          let totalPasienStasiunHariIni = 0;

          dokterHariIni.forEach(dok => {
            setKlinik.add(dok.klinik.trim().toUpperCase());

            const recordPasien = dataPasienPoli.find(p => 
              p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
              p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() && 
              p.tanggal === hari.tanggal
            );

            // PERBAIKAN: Akumulasi langsung angka pasien tanpa dikalikan bobot tindakan
            if (recordPasien && recordPasien.jumlah > 0) {
              totalPasienStasiunHariIni += recordPasien.jumlah;
            }
          });

          // Cari total asisten yang berbagi tugas di stasiun yang sama pada hari tersebut
          const jumlahAsistenDiPoli = semuaJadwal.filter(j => 
            j.tanggal === hari.tanggal && 
            getSimbolGrup(j.simbol) === targetSimbolGroup
          ).length || 1;

          // Distribusikan jumlah pasien murni secara proporsional ke tim yang bertugas bersama
          totalPasienMurni += Math.round(totalPasienStasiunHariIni / jumlahAsistenDiPoli);
        } else {
          if (hari.simbol) {
            setKlinik.add(hari.simbol.trim().toUpperCase());
          }
        }
      });

      return {
        ...sdm,
        total_pasien: totalPasienMurni, 
        daftar_klinik: Array.from(setKlinik).join(", ")
      };
    });

    return NextResponse.json(sdmFinal);

  } catch (error) {
    console.error("CRITICAL ERROR API SDM:", error);
    return NextResponse.json([], { status: 500 });
  }
}