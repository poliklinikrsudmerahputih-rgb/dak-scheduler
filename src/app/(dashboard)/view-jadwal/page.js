"use client";
import React, { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Search, Camera, Clock, Cpu, 
  UserCheck, AlertCircle, Save, CheckCircle2, Activity, Edit3, Medal, XCircle,
  RefreshCw, ArrowLeftRight, Loader2, TrendingUp, Download, Lock, Unlock, CalendarRange, Star, Calendar as CalendarIcon, FileText, Trash2, PieChart, MapPin,
  ShieldCheck, ShieldAlert, Scale, MinusCircle, PlusCircle // <-- Tambahan icon untuk Lencana Mutu
} from "lucide-react"; 
import { simpanCuti } from "../cuti-sdm/actions"; 

// ======================================================
// FUNGSI KALKULASI DINAMIS (JASPEL KUANTITATIF)
// ======================================================
const hitungPoinJaspel = (pasien, bobot, timAsisten) => {
  if (!timAsisten || timAsisten.length === 0) return 0;
  
  // Deteksi asisten yang hadir (TIDAK Cuti dan TIDAK Sakit)
  const asistenHadir = timAsisten.filter(as => !as.isCuti && !as.isSakit).length;
  
  if (asistenHadir === 0) return 0; // Mencegah error pembagian dengan nol
  
  // Rumus: (Pasien * Bobot) / Jumlah Hadir
  return ((pasien || 0) * parseFloat(bobot || 1.0)) / asistenHadir;
};

// ======================================================
// KOMPONEN BARU: JAM BERJALAN (LIVE CLOCK) TERPISAH
// ======================================================
const LiveClock = () => {
  const [liveTime, setLiveTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="text-emerald-400 font-mono font-black text-xl tracking-widest leading-none">
       {format(liveTime, 'HH:mm:ss')} <span className="text-[10px] text-emerald-200/70">WIB</span>
    </p>
  );
};

// ======================================================
// 1. MODAL NASA-TLX (KUESIONER SUBJEKTIF)
// ======================================================"
function ModalNASATLX({ isOpen, onClose, perawatSelected, ruanganAktif, klinikSelected }) {
  const [scores, setScores] = useState({ mental: 50, fisik: 50, waktu: 50, performa: 50, usaha: 50, frustrasi: 50 });
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !perawatSelected) return null;

  let namaRuanganTampil = ruanganAktif || 'POLIKLINIK';
  if (namaRuanganTampil.trim().toUpperCase() === 'NERS 3' && klinikSelected) {
      const kl = klinikSelected.toUpperCase();
      if (kl.includes('THT')) namaRuanganTampil = 'NERS 3 (THT)';
      else if (kl.includes('MATA')) namaRuanganTampil = 'NERS 3 (MATA)';
      else if (kl.includes('PARU')) namaRuanganTampil = 'NERS 3 (PARU)';
      else namaRuanganTampil = `NERS 3 (${klinikSelected})`;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/nasa-tlx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sdm_id: perawatSelected.id, 
          ruangan: namaRuanganTampil, 
          ...scores, 
          catatan 
        })
      });
      
      const data = await res.json(); 
      
      if (res.ok) {
        alert("✅ Evaluasi NASA-TLX Berhasil Disimpan!");
        onClose();
      } else { 
        alert("❌ Data gagal disimpan:\n" + (data.error || "Kesalahan Server")); 
      }
    } catch (e) { 
      alert("❌ Terjadi kesalahan jaringan."); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const Slider = ({ label, val, keyName, descKiri, descKanan }) => (
    <div className="mb-5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <div className="flex justify-between items-end mb-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-800">{label}</label>
        <span className="text-sm font-black text-blue-600 bg-blue-100 px-3 py-1 rounded-lg">{val}</span>
      </div>
      <input type="range" min="0" max="100" value={val} onChange={(e) => setScores({...scores, [keyName]: parseInt(e.target.value)})} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-2" />
      <div className="flex justify-between text-[8px] font-bold uppercase text-slate-400">
        <span>{descKiri}</span><span>{descKanan}</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[10006] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
      <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 md:p-10 shadow-2xl border-4 border-blue-600/20 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-blue-600 pl-4">E-Log NASA-TLX</h3>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><XCircle size={20}/></button>
        </div>
        <div className="mb-6 bg-blue-50 p-4 rounded-2xl text-[10px] font-black uppercase text-blue-800 border border-blue-100 space-y-1">
            <p>Responden: <span className="italic font-black text-slate-900">{perawatSelected.nama}</span></p>
            <p>Stasiun Riset: <span className="italic font-black text-slate-900">{namaRuanganTampil}</span></p>
        </div>
        
        <Slider label="1. Kebutuhan Mental" val={scores.mental} keyName="mental" descKiri="Sangat Rendah" descKanan="Sangat Tinggi" />
        <Slider label="2. Kebutuhan Fisik" val={scores.fisik} keyName="fisik" descKiri="Sangat Rendah" descKanan="Sangat Tinggi" />
        <Slider label="3. Tekanan Waktu" val={scores.waktu} keyName="waktu" descKiri="Sangat Longgar" descKanan="Sangat Mendesak" />
        <Slider label="4. Performa Kerja" val={scores.performa} keyName="performa" descKiri="Tidak Puas" descKanan="Sangat Puas" />
        <Slider label="5. Tingkat Usaha" val={scores.usaha} keyName="usaha" descKiri="Sangat Ringan" descKanan="Sangat Keras" />
        <Slider label="6. Tingkat Frustrasi" val={scores.frustrasi} keyName="frustrasi" descKiri="Sangat Rendah" descKanan="Sangat Tinggi" />

        <div className="mt-6">
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Catatan Kualitatif Lapangan (Opsional)</label>
            <textarea placeholder="Tulis kendala sistem, alur pasien, atau alasan jika skor frustrasi tinggi..." value={catatan} onChange={(e) => setCatatan(e.target.value)} className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs font-medium mt-2 outline-none focus:border-blue-500" rows={3} />
        </div>
        
        <button type="button" onClick={handleSubmit} disabled={submitting} className="mt-6 w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl italic tracking-widest border-b-4 border-blue-800 transition-all flex justify-center items-center gap-2">
          {submitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
          {submitting ? "MENYIMPAN DATA..." : "KIRIM EVALUASI KERJA"}
        </button>
      </div>
    </div>
  );
}

// ======================================================
// 2. MODAL LAPORAN ABSEN HARIAN
// ======================================================
function ModalLaporanAbsen({ isOpen, onClose, dataAbsen, loading, tanggalLabel }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] p-8 md:p-10 shadow-2xl border-4 border-emerald-500/20 max-h-[90vh] flex flex-col relative">
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-emerald-500 pl-4 flex items-center gap-3"><UserCheck size={24} className="text-emerald-500"/> Laporan Absensi Harian</h3>
              <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"><XCircle size={20}/></button>
            </div>

            <div className="mb-6 bg-emerald-50 p-4 rounded-2xl text-[10px] font-black uppercase text-emerald-800 border border-emerald-100">
                <p>Tanggal: <span className="italic font-black text-slate-900">{tanggalLabel}</span></p>
                <p>Total Terdaftar: <span className="italic font-black text-emerald-700">{dataAbsen.length} SDM</span></p>
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center items-center p-12"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>
            ) : dataAbsen.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center">
                        <AlertCircle size={40} className="text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-400 font-black uppercase text-sm italic">Belum ada data absensi untuk tanggal ini</p>
                    </div>
                </div>
            ) : (
                <div className="overflow-y-auto custom-scrollbar border rounded-[2rem] border-slate-200 bg-white flex-1">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-900 text-white text-[9px] font-black uppercase italic tracking-widest z-10 shadow-md">
                            <tr>
                                <th className="p-5 text-left">No</th>
                                <th className="p-5 text-left">Nama SDM</th>
                                <th className="p-5 text-left">Ruangan</th>
                                <th className="p-5 text-left">Shift</th>
                                <th className="p-5 text-center bg-emerald-600/30">Jam Masuk</th>
                                <th className="p-5 text-center bg-blue-600/30">Status Disiplin</th>
                                <th className="p-5 text-center bg-red-600/30">Penalti Mutu</th>
                                <th className="p-5 text-left">Lokasi (GPS)</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-bold uppercase tracking-tighter text-slate-700">
                            {dataAbsen.map((row, i) => (
                                <tr key={`absen-${row.id || i}`} className="border-b border-slate-100 hover:bg-emerald-50/50 transition-colors">
                                    <td className="p-5 text-slate-900 font-extrabold">{i + 1}</td>
                                    <td className="p-5 font-black italic text-emerald-900">{row.nama_sdm}</td>
                                    <td className="p-5"><span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] text-slate-600">{row.ruangan}</span></td>
                                    <td className="p-5 text-slate-800 font-black">{row.shift_pilihan}</td>
                                    <td className="p-5 text-center text-emerald-700 bg-emerald-50/30 font-black text-sm">{row.jam_masuk}</td>
                                    <td className="p-5 text-center">
                                        <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black ${
                                            row.status === 'Tepat Waktu' ? 'bg-emerald-100 text-emerald-700' :
                                            row.status === 'Terlambat Ringan' ? 'bg-amber-100 text-amber-700' :
                                            row.status === 'Terlambat Sedang' ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>{row.status}</span>
                                    </td>
                                    <td className="p-5 text-center font-black bg-red-50/30">
                                        <span className="text-red-600">-{row.penalti_mutu} Pts</span>
                                    </td>
                                    <td className="p-5 text-[9px] text-slate-500 max-w-xs">
                                        {row.lokasi_masuk && row.lokasi_masuk.includes('maps') ? (
                                            <a href={row.lokasi_masuk} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                                <MapPin size={12} /> Lihat Maps
                                            </a>
                                        ) : (
                                            <span>{row.lokasi_masuk || '-'}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
          </div>
        </div>
    );
}

// ======================================================
// 3. MODAL LIVE ANALISIS RISET (DIHAPUS - DIGANTI DENGAN LAPORAN ABSEN)
// ======================================================

// ======================================================
// 4. KOMPONEN UTAMA
// ======================================================
export default function ViewJadwalPublic() {
  const [data, setData] = useState(null);
  const [daftarSDM, setDaftarSDM] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inputPasien, setInputPasien] = useState({});
  const [editMode, setEditMode] = useState({});
  
  const [selectedDateFull, setSelectedDateFull] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const tanggal = parseInt(selectedDateFull.split('-')[2], 10);
  const bulan = parseInt(selectedDateFull.split('-')[1], 10);
  const tahun = parseInt(selectedDateFull.split('-')[0], 10);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [showCutiModal, setShowCutiModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  
  // State untuk Laporan Absen Harian
  const [showLaporanAbsenModal, setShowLaporanAbsenModal] = useState(false);
  const [dataLaporanAbsen, setDataLaporanAbsen] = useState([]);
  const [loadingAbsen, setLoadingAbsen] = useState(false);
  
  // State Mutu lokal (dibuka dari View Jadwal)
  const [showMutuModal, setShowMutuModal] = useState(false);
  const [selectedMutuSDM, setSelectedMutuSDM] = useState(null);
  const [mutuForm, setMutuForm] = useState({ jenis: 'POTONG', kategori: 'DISIPLIN', nominal: '', catatan: '' });
  const [loadingMutu, setLoadingMutu] = useState(false);
  const [perawatTarget, setPerawatTarget] = useState(null);
  const [ruanganAktifGlobal, setRuanganAktifGlobal] = useState('POLIKLINIK');
  const [klinikAktifGlobal, setKlinikAktifGlobal] = useState('');

  const [isDownloading, setIsDownloading] = useState(false);
  const [rentangDownload, setRentangDownload] = useState({
    awal: format(new Date(tahun, bulan - 1, 1), "yyyy-MM-dd"), 
    akhir: format(new Date(), "yyyy-MM-dd") 
  });
  const [swapData, setSwapData] = useState({ sdmA: "", sdmB: "" });

  useEffect(() => {
    const sidebar = document.querySelector('aside'); 
    const mainContent = document.querySelector('main');
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.marginLeft = '0';
    
    return () => {
      if (sidebar) sidebar.style.display = 'block';
      if (mainContent) mainContent.style.marginLeft = '';
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ruanganShare = urlParams.get('ruangan');
      const shareQuery = ruanganShare ? `&ruangan=${ruanganShare}` : '';
      
      if (ruanganShare) setRuanganAktifGlobal(ruanganShare);

      const resDash = await fetch(`/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}${shareQuery}`);
      const dDash = await resDash.json();
      const resSDM = await fetch("/api/sdm");
      const dSDM = await resSDM.json();
      
      setDaftarSDM(Array.isArray(dSDM) ? dSDM : []);

      if (dDash) {
        setData(dDash);
        const savedValues = {};
        const editStatus = {};
        
        dDash.dokterPraktik?.forEach((dok, idx) => {
          savedValues[idx] = dok.jumlah_pasien_poli || "";
          editStatus[idx] = !(dok.jumlah_pasien_poli > 0); 
        });
        setInputPasien(savedValues);
        setEditMode(editStatus);
      }
    } catch (e) { 
      console.error("Gagal sinkronisasi data:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDateFull]);

  const handleUpdatePasienSpesifik = async (idx) => {
    const jmlTotal = inputPasien[idx];
    if (jmlTotal === "" || jmlTotal < 0) return alert("Isi jumlah pasien dengan benar!");
    
    setSubmitting(true);
    try {
      const dok = data.dokterPraktik[idx];
      const res = await fetch("/api/jadwal?isPublic=true", {
        method: "PATCH",
        headers: { 
            "Content-Type": "application/json",
            "x-public-access": "true" 
        },
        body: JSON.stringify({
          nama_dokter: dok.nama_dokter,
          klinik: dok.klinik,
          tanggal, bulan, tahun,
          jumlah: parseInt(jmlTotal)
        })
      });

      if (res.ok) {
        alert(`✅ TERSIMPAN!\n${dok.nama_dokter}\nJumlah: ${jmlTotal} Pasien`);
        setEditMode({...editMode, [idx]: false});
        await fetchData(); 
      } else {
        alert("❌ Sesi Backend Menolak. Pastikan route API mengizinkan public.");
      }
    } catch (e) {
      alert("❌ Gagal menyimpan data ke tabel poli.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwapDB = async () => {
    if (!swapData.sdmA || !swapData.sdmB) return alert("Pilih kedua perawat!");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jadwal/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdmA: swapData.sdmA,
          sdmB: swapData.sdmB,
          tanggal, bulan, tahun
        })
      });
      if (res.ok) {
        alert("🔄 Penugasan & Beban Berhasil Ditukar!");
        setShowSwap(false);
        setSwapData({ sdmA: "", sdmB: "" });
        fetchData();
      }
    } catch (e) { 
      alert("❌ Gagal tukar asisten."); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleSimpanCutiForm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target);
    const res = await simpanCuti(formData);
    if (res.success) {
      alert("✅ Pengajuan Berhasil!");
      e.target.reset();
      setShowCutiModal(false);
      fetchData();
    } else {
      alert("❌ Gagal: " + res.error);
    }
    setSubmitting(false);
  };

  const executeDownloadLaporan = async () => {
    if (!rentangDownload.awal || !rentangDownload.akhir) return alert("Pilih rentang tanggal terlebih dahulu!");
    
    setIsDownloading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ruanganShare = urlParams.get('ruangan');
      const shareQuery = ruanganShare ? `&ruangan=${ruanganShare}` : '';

      const res = await fetch(`/api/dashboard?tglAwal=${rentangDownload.awal}&tglAkhir=${rentangDownload.akhir}${shareQuery}`);
      const dataLaporan = await res.json();

      if (!dataLaporan || !dataLaporan.dokterPraktik || !dataLaporan.leaderboard) {
        throw new Error("Gagal mengambil data dari server");
      }

      const tglAwalIndo = format(new Date(rentangDownload.awal), "dd MMMM yyyy", { locale: id });
      const tglAkhirIndo = format(new Date(rentangDownload.akhir), "dd MMMM yyyy", { locale: id });

      const wordHeader = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <style>
            @page Section1 { size: 595.3pt 841.9pt; mso-page-orientation: portrait; margin: 2cm; }
            div.Section1 { page: Section1; font-family: 'Arial', sans-serif; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 11pt; }
            th, td { border: 1pt solid black; padding: 6px; text-align: left; }
            th { background-color: #e2e8f0; text-align: center; font-weight: bold; }
            .center { text-align: center; }
            .title { font-size: 14pt; font-weight: bold; text-align: center; }
            .subtitle { font-size: 12pt; text-align: center; margin-bottom: 25px; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <div class="title">RSUD MERAH PUTIH KABUPATEN MAGELANG</div>
            <div class="subtitle">
              LAPORAN KINERJA RUANG RAWAT JALAN<br/>
              PERIODE: ${tglAwalIndo.toUpperCase()} s.d ${tglAkhirIndo.toUpperCase()}
            </div>

            <p><b>A. REKAPITULASI KUNJUNGAN PASIEN PER KLINIK</b></p>
            <table>
              <tr>
                <th style="width: 8%;">NO</th>
                <th>NAMA DOKTER</th>
                <th>UNIT KLINIK</th>
                <th style="width: 25%;">TOTAL PASIEN</th>
              </tr>
              ${dataLaporan.dokterPraktik.map((dok, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${dok.nama_dokter}</td>
                  <td>${dok.klinik}</td>
                  <td class="center"><b>${dok.total_pasien_bulanan || 0}</b> Pasien</td>
                </tr>
              `).join('')}
            </table>

            <p><b>B. REKAPITULASI BEBAN KERJA ASISTEN (BOBOT KLINIK)</b></p>
            <table>
              <tr>
                <th style="width: 8%;">NO</th>
                <th>NAMA PERAWAT / ASISTEN</th>
                <th style="width: 25%;">TOTAL POIN KERJA BULAN INI</th>
              </tr>
              ${dataLaporan.leaderboard.map((item, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${item.nama}</td>
                  <td class="center"><b>${item.total_pasien_bulanan || item.total_pasien || 0}</b> Poin</td>
                </tr>
              `).join('')}
            </table>

            <br/><br/>
            
            <table style="border:none; width:100%;">
              <tr>
                <td style="border:none; text-align:center; width:50%;"></td>
                <td style="border:none; text-align:center; width:50%;">
                  Magelang, ${tglAkhirIndo}<br/>
                  Koordinator Rawat Jalan<br/><br/><br/><br/><br/>
                  <u><b>DANIEL ARI KRISTIANTO, S.Kep., Ns</b></u><br/>
                  NIP. 199303042019031006
                </td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff', wordHeader], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Laporan_Kinerja_Poli_${rentangDownload.awal}_to_${rentangDownload.akhir}.doc`;
      link.click();
      
      setShowDownloadModal(false);
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat memproses data laporan. Coba lagi.");
    } finally {
      setIsDownloading(false);
    }
  };

  const labelHariIni = format(parseISO(selectedDateFull), "eeee, dd MMMM yyyy", { locale: id });

  const groupedDokter = data?.dokterPraktik?.reduce((acc, dok) => {
    const simbol = dok.simbol_praktik?.trim().toUpperCase() || "LAINNYA";
    if (!acc[simbol]) acc[simbol] = [];
    acc[simbol].push(dok);
    return acc;
  }, {});

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 font-black text-emerald-400 uppercase tracking-[0.5em] text-[10px]">
      <div className="flex flex-col items-center gap-6 animate-pulse text-center">
        <Cpu size={50} className="animate-spin duration-1000" />
        <p>Syncing DAK-Intelligence System...</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-50 font-sans z-[9999] pb-20 scrollbar-hide">
      
      {/* RENDER MODALS */}
      <ModalLaporanAbsen isOpen={showLaporanAbsenModal} onClose={() => setShowLaporanAbsenModal(false)} dataAbsen={dataLaporanAbsen} loading={loadingAbsen} tanggalLabel={labelHariIni} />

      {/* HEADER SECTION */}
      <div className="bg-slate-900 text-white p-8 md:p-16 rounded-b-[4rem] shadow-2xl relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><Activity size={300} /></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
          <div className="flex items-center gap-6">
             <div className="p-5 bg-emerald-600 rounded-[2rem] shadow-2xl rotate-3">
                <Medal size={40} className="text-white" />
             </div>
             <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none italic text-white">
                  DAK-<span className="text-emerald-500">SYSTEMS</span>
                </h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-3 italic leading-none">
                  Polyclinic Resource Transparency v.4.0
                </p>
             </div>
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            <button 
              onClick={async () => {
                setLoadingAbsen(true);
                try {
                  const res = await fetch(`/api/absensi?tanggal=${selectedDateFull}`);
                  const result = await res.json();
                  setDataLaporanAbsen(result.data || []);
                } catch (err) {
                  console.error("Gagal fetch laporan absen:", err);
                  setDataLaporanAbsen([]);
                } finally {
                  setLoadingAbsen(false);
                }
                setShowLaporanAbsenModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-emerald-800 text-white"
            >
              <UserCheck size={18} /> Laporan Absen
            </button>
            
            <button onClick={() => setShowLeaderboardModal(true)} className="bg-amber-500 hover:bg-amber-600 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase text-white border-b-4 border-amber-700">
                <Star size={18} className="fill-white" /> Cek Poin Asisten
            </button>
            
            <button onClick={() => setShowCutiModal(true)} className="bg-blue-600 hover:bg-blue-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-blue-800">
                <Edit3 size={18} /> Ajukan Cuti Staf
            </button>
            <button onClick={() => setShowSwap(true)} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-emerald-800">
                <RefreshCw size={18} /> Tukar Asisten
            </button>
            
            <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-md text-center md:text-right shadow-inner flex flex-col justify-center">
              <p className="text-lg font-black uppercase text-white leading-none tracking-tighter">{labelHariIni}</p>
              <div className="mt-3 flex items-center justify-center md:justify-end gap-2">
                 <Clock size={14} className="text-emerald-400" />
                 <LiveClock />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 -mt-16 space-y-8">
        
        {/* FILTER CONTROL (INPUT DATE TUNGGAL) */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[3rem] shadow-2xl border border-white flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 flex items-center gap-4 bg-slate-100/50 px-8 py-5 rounded-[2rem] w-full border border-slate-100">
            <Search size={22} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari Nama Dokter atau Klinik..." 
              autoComplete="off"
              spellCheck="false"
              className="bg-transparent border-none outline-none text-xs font-black w-full uppercase text-slate-900 placeholder:text-slate-400"
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-4 w-full lg:w-auto items-center">
            
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <CalendarIcon size={16} className="text-emerald-200 group-hover:text-white transition-colors" />
              </div>
              <input 
                type="date" 
                value={selectedDateFull}
                onChange={(e) => setSelectedDateFull(e.target.value)}
                className="bg-emerald-600 text-white text-[11px] font-black pl-12 pr-6 py-5 rounded-2xl uppercase shadow-lg outline-none cursor-pointer appearance-none hover:bg-emerald-700 transition-colors [&::-webkit-calendar-picker-indicator]:invert"
              />
            </div>

            <button 
              onClick={() => setShowDownloadModal(true)}
              className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white text-[11px] font-black px-8 py-5 rounded-2xl uppercase shadow-lg flex items-center gap-2"
            >
              <Download size={14}/> Laporan
            </button>
          </div>
        </div>

        {/* GRID UNIT CONTAINER (GROUPED CARD) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {Object.entries(groupedDokter || {}).map(([simbol, listDokter]) => {
            const filteredDokter = listDokter.filter(d => 
              d.nama_dokter.toLowerCase().includes(searchTerm.toLowerCase()) ||
              d.klinik.toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (filteredDokter.length === 0) return null;

            return (
              <div key={simbol} className="bg-white p-8 md:p-10 rounded-[4rem] border-2 border-white shadow-xl space-y-6 relative overflow-hidden">
                
                <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-lg italic">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                      {simbol}
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider">STASIUN UTAMA {simbol}</h3>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Sektor Pelayanan Rawat Jalan</p>
                    </div>
                  </div>
                  <span className="bg-white/10 text-white text-[8px] font-black px-3 py-1.5 rounded-full uppercase">
                    {filteredDokter.length} Dokter Aktif
                  </span>
                </div>

                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredDokter.map((dok, idx) => {
                    const originalIndex = data.dokterPraktik.findIndex(dp => dp.nama_dokter === dok.nama_dokter && dp.klinik === dok.klinik);

                    return (
                      <div key={idx} className={`p-6 rounded-[2.5rem] border-2 transition-all ${dok.isCuti ? 'border-red-100 bg-red-50/20 opacity-60' : 'border-slate-100 bg-slate-50/50 hover:border-blue-400'}`}>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div>
                            <h4 className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{dok.nama_dokter}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5 tracking-wider">{dok.klinik} • {dok.jam_praktik || "Jam Pelayanan"}</p>
                            
                            {!dok.isCuti && (
                              <p className="text-[8px] font-black text-blue-600 uppercase mt-2 bg-blue-50 w-fit px-2 py-0.5 rounded border border-blue-100 italic">
                                Kunjungan Bulan Ini: {dok.total_pasien_bulanan || 0} Pasien
                              </p>
                            )}
                          </div>

                          {dok.jumlah_pasien_poli > 0 && !dok.isCuti && (
                            <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-3 py-1.5 rounded-full uppercase border border-emerald-200 shadow-sm whitespace-nowrap">Verified: {dok.jumlah_pasien_poli} Pasien</span>
                          )}
                        </div>

                        {!dok.isCuti ? (
                          <div className="mt-4 pt-4 border-t border-slate-200/40 space-y-4">
                            
                            {/* --- INTEGRASI PEMBAGI DINAMIS & LENCANA MUTU --- */}
                            <div className="flex flex-wrap gap-2">
                              {dok.timAsisten && dok.timAsisten.length > 0 ? dok.timAsisten.map((as, i) => {
                                // Eksekusi Kalkulasi Poin Dinamis
                                const bobotDokter = dok.bobot_jaspel || 1.0;
                                const totalPasien = dok.jumlah_pasien_poli || 0;
                                const poinPerAsisten = hitungPoinJaspel(totalPasien, bobotDokter, dok.timAsisten);
                                
                                // Cek Status Kehadiran
                                const isAbsen = as.isCuti || as.isSakit;

                                return (
                                  <div key={i} className={`flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase italic text-slate-700 bg-white px-2 py-1.5 rounded-xl border shadow-sm transition-all ${isAbsen ? 'border-red-200 bg-red-50/50 opacity-70' : 'border-slate-200'}`}>
                                    {isAbsen ? <XCircle size={12} className="text-red-400" /> : <UserCheck size={12} className="text-emerald-500" />} 
                                    
                                    <span className={`mr-1 ${isAbsen ? 'line-through text-red-500' : ''}`}>{as.nama}</span>
                                    
                                    {/* Indikator Lencana Mutu & Tambahan Poin Jaspel */}
                                    {!isAbsen && (
                                      <div className="flex items-center gap-1 mr-2" title="Saldo Mutu Aman & Poin Terdistribusi">
                                        <ShieldCheck size={12} className="text-emerald-500" />
                                        <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-200 not-italic tracking-wider">
                                          +{poinPerAsisten.toFixed(1)} Pts
                                        </span>
                                      </div>
                                    )}
                                    {isAbsen && (
                                      <div className="flex items-center gap-1 mr-2" title="Perawat Absen - Poin Terkunci">
                                        <ShieldAlert size={12} className="text-red-400" />
                                        <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold border border-red-200 not-italic tracking-wider">
                                          0 Pts (ABSEN)
                                        </span>
                                      </div>
                                    )}
                                    
                                    {/* Tombol Aksi Riset (Hanya aktif jika tidak absen) */}
                                    {!isAbsen && (
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          const params = new URLSearchParams({
                                            nama: as.nama,
                                            sdm_id: as.id,
                                            ruangan: simbol
                                          });
                                          window.location.href = `/absensi?${params.toString()}`;
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg border border-emerald-600 shadow-md hover:bg-emerald-600 transition-all" 
                                        title="Sistem Absensi Kamera & GPS"
                                      >
                                        <Camera size={12} /> <span className="text-[8px] not-italic font-black">ABSENSI</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              }) : <p className="text-[10px] font-black text-slate-300 italic">--- Belum Ada Asisten Ditugaskan ---</p>}
                            </div>

                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                if(editMode[originalIndex]) handleUpdatePasienSpesifik(originalIndex);
                              }} 
                              className="flex gap-3 items-end pt-2"
                            >
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1.5 ml-1">
                                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest italic">Input Kunjungan</span>
                                  {!editMode[originalIndex] ? <span className="text-[8px] text-red-500 flex items-center gap-0.5 font-bold"><Lock size={8}/> Kunci</span> : <span className="text-[8px] text-emerald-500 flex items-center gap-0.5 font-bold"><Unlock size={8}/> Buka</span>}
                                </div>
                                <input 
                                  type="number" 
                                  inputMode="numeric"
                                  disabled={!editMode[originalIndex]} 
                                  className={`w-full border-2 rounded-xl px-4 py-2.5 text-xs font-black outline-none transition-colors ${!editMode[originalIndex] ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-blue-200 text-blue-900'}`}
                                  value={inputPasien[originalIndex] || ""}
                                  onChange={(e) => setInputPasien({...inputPasien, [originalIndex]: e.target.value})}
                                  placeholder="Total..."
                                />
                              </div>
                              
                              {!editMode[originalIndex] ? (
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setEditMode({...editMode, [originalIndex]: true});
                                  }}
                                  className="p-3 bg-amber-500 text-white rounded-xl shadow-md hover:bg-amber-600 transition-all text-xs border-b-4 border-amber-700"
                                  title="Edit Data"
                                >
                                  <Edit3 size={16} />
                                </button>
                              ) : (
                                <button 
                                  type="submit"
                                  onMouseDown={(e) => e.preventDefault()} 
                                  onTouchStart={(e) => e.preventDefault()} 
                                  disabled={submitting}
                                  className="p-3 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition-all text-xs border-b-4 border-blue-800"
                                >
                                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                </button>
                              )}
                            </form>
                          </div>
                        ) : (
                          <div className="mt-4 p-4 bg-red-50 rounded-2xl text-center border border-dashed border-red-200 flex items-center justify-center gap-2">
                              <AlertCircle size={14} className="text-red-400" />
                              <p className="text-[10px] font-black text-red-600 uppercase italic">Dokter Izin / Berhalangan Praktik</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>

        {/* BOTTOM SECTION: MONITOR IZIN CUTI */}
        <div className="mt-12 bg-white rounded-[3.5rem] shadow-xl p-8 border border-slate-100 flex flex-col md:flex-row gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 px-4 mb-6"><div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div><h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin & Cuti SDM</h3></div>
              
              {data?.sdmCuti?.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {data?.sdmCuti?.map((s, i) => (
                      <div key={`s-${i}`} className={`p-6 rounded-[2rem] border-l-8 flex justify-between items-center shadow-sm border transition-all ${s.status_acc === 'Disetujui' ? 'bg-white border-emerald-100 border-l-emerald-500' : s.status_acc === 'Ditolak' ? 'bg-red-50 border-red-100 border-l-red-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                          <div className="max-w-[200px]">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-md italic">{s.jenis_cuti}</span>
                                <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none truncate italic">{s.nama_sdm}</h4>
                            </div>
                            <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{s.tgl_mulai} - {s.tgl_selesai}</p>
                          </div>
                          {s.status_acc === 'Disetujui' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Clock size={16} className="text-amber-500" />}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-center text-xs font-black text-slate-400 italic py-8 uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-3xl">Tidak ada pengajuan izin di bulan ini.</p>
              )}
            </div>

            {/* AREA BARU: LOG EVALUASI MUTU */}
            <div className="md:w-1/3 bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100">
               <div className="flex items-center gap-3 px-2 mb-6"><div className="w-2 h-6 bg-blue-600 rounded-full shadow-lg"></div><h3 className="text-[11px] font-black uppercase text-slate-800 tracking-widest italic leading-none">Log Peringatan Mutu</h3></div>
               <div className="space-y-3">
                  <p className="text-center text-[10px] font-black text-slate-400 italic py-8 uppercase tracking-widest">Sistem Mutu & Absensi Kamera<br/>Sedang Disiapkan...</p>
               </div>
            </div>
        </div>
      </div>

      {/* ======================================================
          PEROMBAKAN MODAL LEADERBOARD (DUA PILAR POIN)
          ====================================================== */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl rounded-[3rem] p-6 md:p-10 shadow-2xl border-4 border-amber-500/20 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-amber-500 pl-4 flex items-center gap-3">
                <TrendingUp size={24} className="text-amber-500" /> Akumulasi Poin Terintegrasi
              </h3>
              <button onClick={() => setShowLeaderboardModal(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar border rounded-[2rem] border-slate-100">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-900 z-10 shadow-md">
                      <tr className="text-[9px] font-black uppercase italic tracking-widest text-white">
                        <th className="p-5">Nama Staf & Status</th>
                        <th className="p-5 text-center bg-blue-600/20 border-x border-slate-700">Poin Jaspel<br/>(Kuantitatif)</th>
                        <th className="p-5 text-center bg-emerald-600/20 border-r border-slate-700">Saldo Mutu<br/>(Max 400)</th>
                        <th className="p-5 text-center text-amber-400 bg-amber-500/10">GRAND TOTAL POIN<br/>(Bulan Ini)</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-bold uppercase tracking-tighter">
                        {data?.leaderboard?.map((item, i) => {
                            // Dummy data fallback if backend hasn't supplied 'saldo_mutu' yet
                            const saldoMutu = item.saldo_mutu !== undefined ? item.saldo_mutu : 400; 
                            const poinJaspel = item.total_pasien_bulanan || item.total_pasien || 0;
                            const grandTotal = poinJaspel + saldoMutu;

                            // Pewarnaan Dinamis Lencana Mutu
                            let colorClassMutu = "bg-emerald-100 text-emerald-700 border-emerald-200";
                            let iconMutu = <ShieldCheck size={14} />;
                            if (saldoMutu < 400 && saldoMutu >= 300) {
                                colorClassMutu = "bg-amber-100 text-amber-700 border-amber-200";
                                iconMutu = <ShieldAlert size={14} />;
                            } else if (saldoMutu < 300) {
                                colorClassMutu = "bg-red-100 text-red-700 border-red-200";
                                iconMutu = <ShieldAlert size={14} />;
                            }

                            return (
                            <tr key={i} className="border-b border-slate-100 hover:bg-amber-50/50 transition-all">
                                <td className="p-5">
                                  <p className="text-slate-800 font-black italic text-sm">{item.nama}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[8px] text-white bg-slate-800 px-2 py-0.5 rounded uppercase font-black tracking-widest leading-none">Rank #{i+1}</span>
                                    <span className="text-slate-400 text-[9px] uppercase tracking-wider">{item.detail_poli || "OFF / LIBUR"}</span>
                                  </div>
                                </td>
                                
                                {/* KOLOM 1: POIN KUANTITATIF (JASPEL) */}
                                <td className="p-5 text-center border-x border-slate-100 bg-blue-50/30">
                                  <div className="flex flex-col items-center justify-center">
                                      <span className="text-blue-700 font-black text-base">{poinJaspel} Pts</span>
                                      {item.total_pasien_hari_ini > 0 && (
                                        <span className="text-[8px] text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full mt-1 flex items-center gap-1 font-black tracking-wider">
                                          +{item.total_pasien_hari_ini} HARI INI
                                        </span>
                                      )}
                                  </div>
                                </td>

                                {/* KOLOM 2: SALDO MUTU (KUALITATIF) */}
                                <td className="p-5 text-center border-r border-slate-100 bg-slate-50/30">
                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border ${colorClassMutu}`} title="Batas Maksimal 400 Poin">
                                        {iconMutu} {saldoMutu}
                                    </div>
                                </td>

                                {/* KOLOM 3: GRAND TOTAL */}
                                <td className="p-5 text-center bg-amber-50/30">
                                  <div className="inline-block px-5 py-2.5 rounded-[1rem] bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black text-xl shadow-lg border-b-4 border-amber-700 italic">
                                    {grandTotal.toFixed(1)}
                                  </div>
                                </td>
                            </tr>
                            )
                        })}
                    </tbody>
                  </table>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP CUTI SDM REAL-TIME */}
      {showCutiModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-600/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-600 pl-4 flex items-center gap-3">
              <ClipboardList size={24} className="text-blue-600" /> Form Pengajuan Izin
            </h3>
            <form onSubmit={handleSimpanCutiForm} className="space-y-6">
              
              {/* PENAMBAHAN INPUT HIDDEN UNTUK RUANGAN */}
              <input type="hidden" name="ruangan" value={ruanganAktifGlobal} />

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Nama Staf (Real-time)</label>
                <select 
                  name="nama" 
                  required 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-sm font-black uppercase shadow-inner cursor-pointer appearance-none outline-none focus:border-blue-500 transition-all text-slate-800"
                >
                  <option value="">-- PILIH STAF SDM --</option>
                  {daftarSDM.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <select name="jenis_cuti" className="w-1/3 bg-slate-900 text-white rounded-2xl px-4 py-5 text-xs font-black uppercase italic shadow-lg">
                  {["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input name="alasan" required className="w-2/3 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-xs font-black uppercase shadow-inner outline-none focus:border-blue-500 text-slate-800" placeholder="KEPERLUAN" />
              </div>
              <div className="flex gap-2">
                <input name="tgl_mulai" type="date" required className="w-1/2 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-[10px] font-black shadow-inner text-slate-700" />
                <input name="tgl_selesai" type="date" required className="w-1/2 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-[10px] font-black shadow-inner text-slate-700" />
              </div>
              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowCutiModal(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors">Batal</button>
                <button disabled={submitting} type="submit" className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl italic tracking-widest border-b-4 border-blue-800 active:border-b-0 active:mt-1">KIRIM FORM</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SWAP ASISTEN */}
      {showSwap && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-emerald-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-emerald-500 pl-4 flex items-center gap-3">
              <RefreshCw size={24} className="text-emerald-500" /> Manajemen Tukar Tugas
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat A (Asal)</label>
                <select 
                  value={swapData.sdmA} 
                  onChange={(e) => setSwapData({...swapData, sdmA: e.target.value})} 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none focus:border-emerald-500 text-slate-800"
                >
                  <option value="">-- PILIH SEMUA PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (
                    <option key={`swap-A-${item.id}`} value={item.id}>{item.nama} (Tugas: {item.detail_poli || "Cadangan"})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center py-2 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-dashed border-slate-100"></div></div>
                <div className="relative bg-white p-2 rounded-full border-2 border-emerald-500 shadow-lg"><ArrowLeftRight size={24} className="text-emerald-500 animate-pulse" /></div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat B (Tujuan)</label>
                <select 
                  value={swapData.sdmB} 
                  onChange={(e) => setSwapData({...swapData, sdmB: e.target.value})} 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none focus:border-emerald-500 text-slate-800"
                >
                  <option value="">-- PILIH SEMUA PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (
                    <option key={`swap-B-${item.id}`} value={item.id}>{item.nama} (Tugas: {item.detail_poli || "Cadangan"})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setShowSwap(false); setSwapData({ sdmA: "", sdmB: "" }); }} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors">Batal</button>
                <button type="button" onClick={handleSwapDB} disabled={submitting || !swapData.sdmA || !swapData.sdmB} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-emerald-700">EKSEKUSI TUKAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DOWNLOAD RENTANG TANGGAL */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-500 pl-4 flex items-center gap-3">
              <CalendarRange size={24} className="text-blue-500" /> Filter Data Laporan
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Mulai (Awal)</label>
                <input type="date" value={rentangDownload.awal} onChange={(e) => setRentangDownload({...rentangDownload, awal: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none text-slate-700" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Selesai (Akhir)</label>
                <input type="date" value={rentangDownload.akhir} onChange={(e) => setRentangDownload({...rentangDownload, akhir: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none text-slate-700" />
              </div>
              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowDownloadModal(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors">Batal</button>
                <button type="button" onClick={executeDownloadLaporan} disabled={isDownloading} className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-blue-800 active:border-b-0 active:mt-1 flex items-center justify-center gap-2">
                  {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isDownloading ? "MENYUSUN..." : "DOWNLOAD WORD"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center py-12 opacity-30 text-[9px] font-black uppercase italic tracking-[0.6em] text-slate-900">
        DAK-SYSTEMS INTELLIGENCE v.4.0 | RSUD MERAH PUTIH MAGELANG
      </footer>
    </div>
  );
}