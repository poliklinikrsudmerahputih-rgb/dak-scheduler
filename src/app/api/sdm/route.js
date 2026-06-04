import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// KAMUS BOBOT TINDAKAN (SINKRON DENGAN DASHBOARD)
const BOBOT_POLI = {
  "BEDAH UMUM": 2.5,
  "ORTOPEDI": 2.5,
  "GIGI": 2.0,
  "MATA": 1.5,
  "PENYAKIT DALAM": 1.0,
  "SARAF": 1.0,
  "ANAK": 1.0,
  "OBGYN": 1.5,
  "UMUM": 1.0,
  "KLINIK NYERI": 1.5
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    // Parameter Filter Waktu (Default Bulan & Tahun Berjalan)
    const bulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const tahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    // Identifikasi Ruangan User (Default ke POLIKLINIK jika tidak login / tanpa sesi)
    let userRuangan = "POLIKLINIK"; 
    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama atau tidak valid");
      }
    }

    // 1. Ambil data dasar SDM sesuai unit ruangan (Bisa diakses publik tanpa login)
    const resSdm = await turso.execute({
      sql: `SELECT * FROM sdm WHERE (ruangan = ? OR ruangan IS NULL OR ruangan = '') ORDER BY nama ASC`,
      args: [userRuangan]
    });
    const daftarSdm = resSdm.rows;

    // 2. Ambil komponen relasi untuk komparasi beban kerja bulanan secara kronologis
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

    /**
     * FUNGSI RESOLUSI TIM (SINKRONISASI COUPLING)
     * Menghubungkan nama unit dinas (Cth: 'UMUM', 'ORTO') ke kode stasiun induk ('3', '4')
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

    // 3. PROSES PERHITUNGAN AKUMULASI BEBAN BULANAN SECARA DINAMIS
    const sdmFinal = daftarSdm.map(sdm => {
      // Ambil seluruh rekam penugasan staf ini pada bulan terkait
      const jadwalSdm = semuaJadwal.filter(j => j.sdm_id === sdm.id);
      
      let totalBeban = 0;
      let setKlinik = new Set();

      jadwalSdm.forEach(hari => {
        // Resolve simbol penugasan harian ke grup stasiun utama
        const targetSimbolGroup = getSimbolGrup(hari.simbol);

        // Filter seluruh dokter yang bertugas di grup stasiun tersebut
        const dokterHariIni = masterDokter.filter(d => 
          d.simbol_praktik.trim().toUpperCase() === targetSimbolGroup
        );

        if (dokterHariIni.length > 0) {
          let totalSkorStasiunHariIni = 0;

          dokterHariIni.forEach(dok => {
            setKlinik.add(dok.klinik.trim().toUpperCase());

            // Ambil angka kunjungan pasien harian spesifik per dokter
            const recordPasien = dataPasienPoli.find(p => 
              p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
              p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() && 
              p.tanggal === hari.tanggal
            );

            if (recordPasien && recordPasien.jumlah > 0) {
              const bobot = BOBOT_POLI[dok.klinik.trim().toUpperCase()] || 1.0;
              totalSkorStasiunHariIni += (recordPasien.jumlah * bobot);
            }
          });

          // Cari total asisten yang berbagi tugas di stasiun yang sama pada hari tersebut
          const jumlahAsistenDiPoli = semuaJadwal.filter(j => 
            j.tanggal === hari.tanggal && 
            getSimbolGrup(j.simbol) === targetSimbolGroup
          ).length || 1;

          // Tambahkan distribusi rata beban tertimbang ke akumulasi bulanan staf
          totalBeban += Math.round(totalSkorStasiunHariIni / jumlahAsistenDiPoli);
        } else {
          // Jika tidak ada kecocokan dokter, catat identitas simbol jadwal asli sebagai fallback info
          setKlinik.add(hari.simbol.trim().toUpperCase());
        }
      });

      return {
        ...sdm,
        total_pasien: totalBeban, 
        daftar_klinik: Array.from(setKlinik).join(", ")
      };
    });

    return NextResponse.json(sdmFinal);

  } catch (error) {
    console.error("CRITICAL ERROR API SDM:", error);
    return NextResponse.json([], { status: 500 });
  }
}