import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

// =====================================================================
// KONFIGURASI DATABASE TURSO
// Pastikan TURSO_DATABASE_URL & TURSO_AUTH_TOKEN ada di file .env.local
// =====================================================================
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db", // Fallback local jika env belum siap
  authToken: process.env.TURSO_AUTH_TOKEN || "",
});

// =====================================================================
// FUNGSI HELPER: WAKTU WIB & KALKULATOR PENALTI
// =====================================================================
function getWaktuSekarangWIB() {
  const now = new Date();
  
  // Format Jam (HH:mm) WIB
  const optionsJam = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
  const jamWIB = new Intl.DateTimeFormat('id-ID', optionsJam).format(now);
  
  // Format Tanggal (YYYY-MM-DD) WIB
  const optionsTgl = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
  const tglRaw = new Intl.DateTimeFormat('en-CA', optionsTgl).format(now).split('-'); 
  const tanggalWIB = `${tglRaw[0]}-${tglRaw[1]}-${tglRaw[2]}`; // YYYY-MM-DD
  
  return { 
      jamWIB, 
      tanggalWIB, 
      bulan: parseInt(tglRaw[1], 10), 
      tahun: parseInt(tglRaw[0], 10) 
  };
}

function hitungPenaltiKedisiplinan(shift, jamWIB) {
  const [jamStr, menitStr] = jamWIB.split(':');
  const jam = parseInt(jamStr, 10);
  const menit = parseInt(menitStr, 10);
  
  // Konversi waktu ke desimal untuk mempermudah perbandingan (contoh: 07:30 = 7.5)
  const waktuDesimal = jam + (menit / 60);

  let targetJam = 0;
  let batasRingan = 0;
  let batasSedang = 0;

  // Aturan Shift Berdasarkan Blueprint
  if (shift.includes("PAGI")) {
      targetJam = 7.5833;     // 07:35 = batas meeting morning, tidak dipotong sampai 07:35
      batasRingan = 7.983;     // 07:59 (Toleransi Ringan -5)
      batasSedang = 8.5;       // 08:30 (Toleransi Sedang -15, > 08:30 -30 Poin)
  } else if (shift.includes("MID 1")) {
      targetJam = 9.0;         // 09:00
      batasRingan = 9.25;      // 09:15
      batasSedang = 9.983;     // 09:59
  } else if (shift.includes("MID 2")) {
      targetJam = 10.0;        // 10:00
      batasRingan = 10.25;     // 10:15
      batasSedang = 10.983;    // 10:59
  } else if (shift.includes("MID 3")) {
      targetJam = 11.0;        // 11:00
      batasRingan = 11.25;     // 11:15
      batasSedang = 11.983;    // 11:59
  } else if (shift.includes("MID 4")) {
      targetJam = 12.0;        // 12:00
      batasRingan = 12.25;     // 12:15
      batasSedang = 12.983;    // 12:59
  } else {
      return { status: "TEPAT WAKTU", penalti: 0 }; // Default jika format shift tidak dikenali
  }

  // Eksekusi Pemotongan Poin Mutu Kualitatif
  if (waktuDesimal <= targetJam) return { status: "TEPAT WAKTU", penalti: 0 };
  if (waktuDesimal <= batasRingan) return { status: "TERLAMBAT RINGAN", penalti: 5 };
  if (waktuDesimal <= batasSedang) return { status: "TERLAMBAT SEDANG", penalti: 15 };
  
  return { status: "TERLAMBAT BERAT", penalti: 30 }; // Memicu hilangnya Hak Subsidi Jaspel di Frontend
}

// =====================================================================
// METHOD POST: TERIMA DATA CLOCK-IN / CLOCK-OUT DARI KAMERA
// =====================================================================
export async function POST(request) {
  try {
    const body = await request.json();
    const { sdm_id, nama_sdm, ruangan, shift, tipe_absen, lokasi, foto_base64 } = body;

    const { jamWIB, tanggalWIB, bulan, tahun } = getWaktuSekarangWIB();
    
    // Format Lokasi menjadi Link Google Maps jika koordinat valid
    const linkMaps = lokasi && lokasi.includes(',') 
        ? `https://www.google.com/maps?q=${lokasi.replace(/\s/g, '')}` 
        : lokasi;

    // -------------------------------------------------------------
    // ALUR 1: ABSEN PULANG (Hanya Update Jam & Lokasi Pulang)
    // -------------------------------------------------------------
    if (tipe_absen === 'PULANG') {
        const updatePulang = await db.execute({
            sql: `UPDATE absensi 
                  SET jam_pulang = ?, lokasi_pulang = ?, foto_pulang = ? 
                  WHERE sdm_id = ? AND tanggal = ?`,
            args: [jamWIB, linkMaps, foto_base64 || "-", sdm_id, tanggalWIB]
        });

        if (updatePulang.rowsAffected === 0) {
            return NextResponse.json({ error: "Anda belum melakukan Clock-In (Masuk) hari ini!" }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: "Absen Pulang berhasil dicatat!" });
    }

    // -------------------------------------------------------------
    // ALUR 2: ABSEN MASUK (Kalkulasi Penalti & Potong Saldo Mutu)
    // -------------------------------------------------------------
    
    // 1. Hitung Status Kedisiplinan & Penalti
    const hasilDisiplin = hitungPenaltiKedisiplinan(shift, jamWIB);

    // 2. Cek apakah master Saldo Mutu bulan ini sudah ada untuk SDM ini
    const cekSaldo = await db.execute({
        sql: `SELECT id FROM saldo_mutu WHERE sdm_id = ? AND bulan = ? AND tahun = ?`,
        args: [sdm_id, bulan, tahun]
    });

    if (cekSaldo.rows.length === 0) {
        // Jika belum ada, buat record 400 poin dengan penalti_disiplin (karena absensi = pelanggaran disiplin)
        // CATATAN: poin_akhir dan total_penalti adalah GENERATED ALWAYS, jangan diisi!
        await db.execute({
            sql: `INSERT INTO saldo_mutu (sdm_id, bulan, tahun, poin_awal, penalti_disiplin) 
                  VALUES (?, ?, ?, 400, ?)`,
            args: [sdm_id, bulan, tahun, hasilDisiplin.penalti]
        });
    } else {
        // Jika sudah ada, tambahkan penalti_disiplin (poin_akhir otomatis dihitung database)
        await db.execute({
            sql: `UPDATE saldo_mutu 
                  SET penalti_disiplin = penalti_disiplin + ?, 
                      updated_at = CURRENT_TIMESTAMP 
                  WHERE sdm_id = ? AND bulan = ? AND tahun = ?`,
            args: [hasilDisiplin.penalti, sdm_id, bulan, tahun]
        });
    }

    // 3. Simpan ke Tabel Absensi
    await db.execute({
        sql: `INSERT INTO absensi (
                sdm_id, nama_sdm, ruangan, shift, tanggal, jam_masuk, lokasi_masuk, 
                foto_masuk, status_kedisiplinan, penalti_mutu
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            sdm_id, nama_sdm, ruangan, shift, tanggalWIB, jamWIB, 
            linkMaps, foto_base64 || null, hasilDisiplin.status, hasilDisiplin.penalti
        ]
    });

    return NextResponse.json({ 
        success: true, 
        message: `Absensi Masuk Sukses. Status: ${hasilDisiplin.status} (Penalti: -${hasilDisiplin.penalti} Pts)` 
    });

  } catch (error) {
    console.error("Error API POST Absensi:", error);
    return NextResponse.json({ success: false, error: "Gagal memproses database Turso." }, { status: 500 });
  }
}

// =====================================================================
// METHOD GET: TARIK DATA UNTUK MODAL LAPORAN DI DASHBOARD
// =====================================================================
export async function GET(request) {
  try {
    const { tanggalWIB } = getWaktuSekarangWIB();
    const url = new URL(request.url);
    const filterTanggal = url.searchParams.get('tanggal') || tanggalWIB;

    // Ambil data absensi hari ini (atau sesuai filter tanggal)
    const dataAbsen = await db.execute({
        sql: `SELECT * FROM absensi WHERE tanggal = ? ORDER BY jam_masuk DESC`,
        args: [filterTanggal]
    });

    // Formatting hasil untuk dikirim ke UI
    const hasil = dataAbsen.rows.map(row => ({
        id: row.id,
        sdm_id: row.sdm_id,
        nama_sdm: row.nama_sdm,
        ruangan: row.ruangan,
        shift_pilihan: row.shift,
        tanggal_absen: row.tanggal,
        jam_masuk: row.jam_masuk,
        jam_pulang: row.jam_pulang || "Belum Pulang",
        lokasi_masuk: row.lokasi_masuk,
        foto_masuk: row.foto_masuk || null,
        foto_pulang: row.foto_pulang || null,
        status: row.status_kedisiplinan,
        penalti_mutu: row.penalti_mutu
    }));

    return NextResponse.json({ success: true, data: hasil });
  } catch (error) {
    console.error("Error GET API Absensi:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil log absensi." }, { status: 500 });
  }
}