"use client";
import React, { useState, useEffect } from "react";
import { format, getDaysInMonth } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Search, ClipboardList, Stethoscope, Clock, ChevronDown, Send, Cpu, 
  UserCheck, AlertCircle, Save, CheckCircle2, Activity, Edit3, Medal, XCircle,
  RefreshCw, ArrowLeftRight, Users, Loader2, TrendingUp, Download, Lock, Unlock, FileText, CalendarRange
} from "lucide-react"; 
import { simpanCuti } from "../cuti-sdm/actions"; 

export default function ViewJadwalPublic() {
  const [data, setData] = useState(null);
  const [daftarSDM, setDaftarSDM] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inputPasien, setInputPasien] = useState({});
  const [editMode, setEditMode] = useState({});
  
  const [tanggal, setTanggal] = useState(new Date().getDate());
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [swapData, setSwapData] = useState({ sdmA: "", sdmB: "" });

  // STATE BARU: MODAL DOWNLOAD LAPORAN
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [rentangDownload, setRentangDownload] = useState({
    awal: format(new Date(tahun, bulan - 1, 1), "yyyy-MM-dd"), // Default: tgl 1 bulan ini
    akhir: format(new Date(), "yyyy-MM-dd") // Default: hari ini
  });

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
      const resDash = await fetch(`/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}`);
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
  }, [tanggal, bulan, tahun]);

  const handleUpdatePasienSpesifik = async (idx) => {
    const jmlTotal = inputPasien[idx];
    if (jmlTotal === "" || jmlTotal < 0) return alert("Isi jumlah pasien dengan benar!");
    
    setSubmitting(true);
    try {
      const dok = data.dokterPraktik[idx];
      const res = await fetch("/api/jadwal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
        fetchData(); 
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
      fetchData();
    } else {
      alert("❌ Gagal: " + res.error);
    }
    setSubmitting(false);
  };

  // --- FITUR EKSEKUSI DOWNLOAD DENGAN RENTANG WAKTU ---
  const executeDownloadLaporan = async () => {
    if (!rentangDownload.awal || !rentangDownload.akhir) return alert("Pilih rentang tanggal terlebih dahulu!");
    
    setIsDownloading(true);
    try {
      // Panggil API khusus dengan parameter rentang tanggal
      const res = await fetch(`/api/dashboard?tglAwal=${rentangDownload.awal}&tglAkhir=${rentangDownload.akhir}`);
      const dataLaporan = await res.json();

      if (!dataLaporan || !dataLaporan.dokterPraktik || !dataLaporan.leaderboard) {
        throw new Error("Gagal mengambil data dari server");
      }

      const tglAwalIndo = format(new Date(rentangDownload.awal), "dd MMMM yyyy", { locale: id });
      const tglAkhirIndo = format(new Date(rentangDownload.akhir), "dd MMMM yyyy", { locale: id });

      // Template HTML Khusus MS Word
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

            <br/>

            <p><b>B. REKAPITULASI BEBAN KERJA ASISTEN (BOBOT KLINIK)</b></p>
            <table>
              <tr>
                <th style="width: 8%;">NO</th>
                <th>NAMA PERAWAT / ASISTEN</th>
                <th>UNIT POLI DIBANTU</th>
                <th style="width: 25%;">SKOR BEBAN KERJA</th>
              </tr>
              ${dataLaporan.leaderboard.map((item, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${item.nama}</td>
                  <td>${item.detail_poli || "Cadangan/Lainnya"}</td>
                  <td class="center"><b>${item.total_pasien}</b> Poin</td>
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

  const labelHariIni = format(new Date(tahun, bulan-1, tanggal), "eeee, dd MMMM yyyy", { locale: id });
  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const jumlahHari = getDaysInMonth(new Date(tahun, bulan - 1));
  const daftarHari = Array.from({ length: jumlahHari }, (_, i) => i + 1);

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
          <div className="flex flex-col md:flex-row gap-4">
            <button onClick={() => setShowSwap(true)} className="bg-emerald-600 hover:bg-emerald-700 px-8 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase">
                <RefreshCw size={18} /> Tukar Asisten
            </button>
            <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-md text-center md:text-right shadow-inner">
              <p className="text-lg font-black uppercase text-white leading-none tracking-tighter">{labelHariIni}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 -mt-16 space-y-8">
        
        {/* FILTER CONTROL */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[3rem] shadow-2xl border border-white flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 flex items-center gap-4 bg-slate-100/50 px-8 py-5 rounded-[2rem] w-full border border-slate-100">
            <Search size={22} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari Dokter atau Poli..." 
              className="bg-transparent border-none outline-none text-xs font-black w-full uppercase"
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-4 w-full lg:w-auto">
            <select value={tanggal} onChange={(e) => setTanggal(parseInt(e.target.value))} className="bg-emerald-600 text-white text-[11px] font-black px-12 py-5 rounded-2xl uppercase shadow-lg">
              {daftarHari.map(d => <option key={d} value={d}>Tgl {d}</option>)}
            </select>
            <select value={bulan} onChange={(e) => setBulan(parseInt(e.target.value))} className="bg-slate-900 text-white text-[11px] font-black px-12 py-5 rounded-2xl uppercase shadow-lg">
              {namaBulan.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
            </select>
          </div>
        </div>

        {/* GRID INPUT PASIEN */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {data?.dokterPraktik?.filter(d => d.nama_dokter.toLowerCase().includes(searchTerm.toLowerCase())).map((dok, idx) => (
            <div key={idx} className={`bg-white p-10 rounded-[4rem] border-2 transition-all shadow-xl relative overflow-hidden group ${dok.isCuti ? 'border-red-100 opacity-60 bg-red-50/20' : 'border-white hover:border-emerald-500 hover:-translate-y-2'}`}>
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-sm shadow-xl ${dok.isCuti ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                  {dok.simbol_praktik}
                </div>
                {dok.jumlah_pasien_poli > 0 && !dok.isCuti && (
                  <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-3 py-1.5 rounded-full uppercase italic border border-emerald-200 shadow-sm animate-pulse italic">Verified: {dok.jumlah_pasien_poli}</span>
                )}
              </div>
              <h4 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter leading-tight">{dok.nama_dokter}</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">{dok.klinik} • {dok.jam_praktik || "Praktik"}</p>
              
              {!dok.isCuti ? (
                <div className="mt-6 space-y-5">
                  <div className="p-8 rounded-[3rem] border-2 bg-slate-50 border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase italic mb-3">Tim Asisten Petugas:</p>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {dok.timAsisten && dok.timAsisten.length > 0 ? dok.timAsisten.map((as, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] font-black uppercase italic text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
                          <UserCheck size={12} className="text-emerald-500" /> {as.nama}
                        </div>
                      )) : <p className="text-xs font-black text-slate-300 italic">--- Belum Ada ---</p>}
                    </div>

                    <div className="flex gap-3 items-end mt-4 border-t border-slate-200/40 pt-8">
                      <div className="flex-1">
                        <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block italic flex justify-between">
                          <span>Input Pasien Harian ({dok.simbol_praktik})</span>
                          {!editMode[idx] ? <span className="text-red-500 flex items-center gap-1"><Lock size={8}/> Terkunci</span> : <span className="text-emerald-500 flex items-center gap-1"><Unlock size={8}/> Terbuka</span>}
                        </label>
                        <input 
                          type="number" 
                          disabled={!editMode[idx]} 
                          className={`w-full border-2 rounded-2xl px-5 py-4 text-xs font-black outline-none shadow-inner transition-colors ${!editMode[idx] ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-blue-200 text-blue-900 focus:border-blue-500'}`}
                          value={inputPasien[idx] || ""}
                          onChange={(e) => setInputPasien({...inputPasien, [idx]: e.target.value})}
                          placeholder="Total Hari Ini..."
                        />
                      </div>
                      
                      {!editMode[idx] ? (
                        <button 
                          onClick={() => setEditMode({...editMode, [idx]: true})}
                          className="p-5 bg-amber-500 text-white rounded-2xl shadow-xl hover:bg-amber-600 transition-all active:scale-95"
                          title="Edit Jumlah Pasien"
                        >
                          <Edit3 size={20} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleUpdatePasienSpesifik(idx)}
                          disabled={submitting}
                          className="p-5 bg-blue-600 text-white rounded-2xl shadow-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                          title="Simpan Data Pasien"
                        >
                          {submitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-10 p-10 bg-red-50 rounded-[3rem] text-center border-2 border-dashed border-red-200">
                    <AlertCircle size={40} className="mx-auto text-red-300 mb-4" />
                    <p className="text-[11px] font-black text-red-600 uppercase italic tracking-widest">Dokter Izin / Berhalangan</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* PUSAT UNDUHAN LAPORAN BULANAN DENGAN RENTANG WAKTU */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-[3.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 border border-blue-700">
          <div className="absolute -left-10 -top-10 opacity-10"><ClipboardList size={200} /></div>
          <div className="relative z-10 max-w-2xl text-center md:text-left">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-3 flex items-center justify-center md:justify-start gap-3">
              <Download size={24} className="text-blue-400"/> Pusat Laporan Kinerja
            </h3>
            <p className="text-xs text-blue-200 font-bold leading-relaxed">
              Sistem akan menghitung ulang beban kerja asisten perawat berdasarkan <b>Bobot Tindakan Klinik</b> (Cth: Bedah/Ortopedi bernilai lebih tinggi). Silakan pilih rentang tanggal laporan untuk dilampirkan pada SKP atau Laporan Kinerja.
            </p>
          </div>
          {/* TOMBOL INI SEKARANG MEMBUKA MODAL TANGGAL */}
          <button 
            onClick={() => setShowDownloadModal(true)}
            className="relative z-10 whitespace-nowrap bg-white text-blue-900 px-10 py-6 rounded-[2rem] font-black uppercase text-sm shadow-xl hover:scale-105 transition-transform flex items-center gap-3 border-b-4 border-blue-200"
          >
             <FileText size={20} className="text-blue-600"/> Generate Rekap Data
          </button>
        </div>

        {/* BOTTOM SECTION: FORM IZIN & LEADERBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10 items-start">
            
            <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white lg:col-span-1">
                <h3 className="text-sm font-black uppercase text-slate-800 italic mb-8 border-l-8 border-blue-600 pl-4 leading-none flex items-center gap-2">
                    <Edit3 size={18} className="text-blue-600" /> Pengajuan Izin
                </h3>
                <form onSubmit={handleSimpanCutiForm} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Nama Pelaksana</label>
                        <select 
                            name="nama" 
                            required 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-sm font-black uppercase shadow-inner cursor-pointer appearance-none outline-none focus:border-blue-500 transition-all"
                        >
                            <option value="">-- PILIH STAF SDM --</option>
                            {daftarSDM.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <select name="jenis_cuti" className="w-1/3 bg-slate-900 text-white rounded-2xl px-4 py-5 text-xs font-black uppercase italic shadow-lg">
                            {["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <input name="alasan" required className="w-2/3 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-xs font-black uppercase shadow-inner outline-none focus:border-blue-500" placeholder="KEPERLUAN" />
                    </div>
                    <div className="flex gap-2">
                        <input name="tgl_mulai" type="date" required className="w-1/2 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-[10px] font-black shadow-inner" />
                        <input name="tgl_selesai" type="date" required className="w-1/2 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-[10px] font-black shadow-inner" />
                    </div>
                    <button disabled={submitting} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-[2rem] text-[11px] font-black uppercase hover:bg-slate-900 transition-all shadow-2xl active:scale-95 italic tracking-widest">KIRIM PERMINTAAN</button>
                </form>
            </div>

            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100">
                    <div className="bg-slate-900 p-8 text-white flex justify-between items-center italic">
                      <h3 className="text-sm font-black uppercase tracking-widest pl-4 border-l-4 border-emerald-500 flex items-center gap-3">
                        <TrendingUp size={18} /> Skor Beban Kerja Hari Ini
                      </h3>
                    </div>
                    <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 text-[9px] font-black uppercase italic tracking-widest text-slate-400">
                            <th className="p-8">Nama Staf</th>
                            <th className="p-8 text-center">Skor Beban</th>
                            <th className="p-8 text-left">Unit Kerja Dibantu</th>
                            <th className="p-8 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs font-bold uppercase tracking-tighter">
                            {data?.leaderboard?.map((item, i) => (
                                <tr key={i} className="border-b border-slate-50 hover:bg-emerald-50/30 transition-all">
                                    <td className="p-8">
                                      <p className="text-slate-800 font-black italic">{item.nama}</p>
                                      <p className="text-[7px] text-slate-400 mt-1 uppercase italic font-black tracking-widest leading-none">Rank #{i+1}</p>
                                    </td>
                                    <td className="p-8 text-center">
                                      <div className="inline-block px-5 py-3 rounded-2xl bg-slate-900 text-white font-black text-xl shadow-lg italic transition-all group-hover:scale-110">
                                        {item.total_pasien}
                                      </div>
                                    </td>
                                    <td className="p-8 max-w-[200px]">
                                      <p className="text-[8px] text-emerald-600 font-black italic uppercase leading-relaxed bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                        協助 {item.detail_poli || "---"}
                                      </p>
                                    </td>
                                    <td className="p-8 text-center">
                                      {item.total_pasien > 0 ? (
                                        <span className="text-emerald-500 flex items-center justify-center gap-2 italic text-[8px] font-black tracking-widest"><CheckCircle2 size={12}/> UPDATED</span>
                                      ) : (
                                        <span className="text-red-400 flex items-center justify-center gap-2 animate-pulse italic text-[8px] font-black tracking-widest"><AlertCircle size={12}/> PENDING</span>
                                      )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="space-y-6 lg:col-span-1">
                <div className="flex items-center gap-3 px-8"><div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div><h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin</h3></div>
                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
                    {data?.sdmCuti?.map((s, i) => (
                      <div key={`s-${i}`} className={`p-6 rounded-[2.5rem] border-l-8 flex justify-between items-center shadow-lg border transition-all ${s.status_acc === 'Disetujui' ? 'bg-white border-emerald-100 border-l-emerald-500' : s.status_acc === 'Ditolak' ? 'bg-red-50 border-red-100 border-l-red-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                          <div className="max-w-[180px]">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-md italic">{s.jenis_cuti}</span>
                                <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none truncate italic">{s.nama_sdm}</h4>
                            </div>
                            <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{s.tgl_mulai} - {s.tgl_selesai}</p>
                            <p className="text-[8px] text-slate-400 mt-2 italic font-bold leading-tight uppercase truncate">Ket: {s.alasan || "-"}</p>
                          </div>
                          {s.status_acc === 'Disetujui' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Clock size={16} className="text-amber-500" />}
                      </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

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
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none focus:border-emerald-500 transition-all shadow-inner"
                >
                  <option value="">-- PILIH SEMUA PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (
                    <option key={`swap-A-${item.id}`} value={item.id}>
                      {item.nama} (Tugas: {item.detail_poli || "Cadangan"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center py-2 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-dashed border-slate-100"></div></div>
                <div className="relative bg-white p-2 rounded-full border-2 border-emerald-500 shadow-lg">
                   <ArrowLeftRight size={24} className="text-emerald-500 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat B (Tujuan)</label>
                <select 
                  value={swapData.sdmB} 
                  onChange={(e) => setSwapData({...swapData, sdmB: e.target.value})} 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none focus:border-emerald-500 transition-all shadow-inner"
                >
                  <option value="">-- PILIH SEMUA PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (
                    <option key={`swap-B-${item.id}`} value={item.id}>
                      {item.nama} (Tugas: {item.detail_poli || "Cadangan"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => { setShowSwap(false); setSwapData({ sdmA: "", sdmB: "" }); }} 
                  className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSwapDB} 
                  disabled={submitting || !swapData.sdmA || !swapData.sdmB} 
                  className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-emerald-700"
                >
                  {submitting ? "SINGKRONISASI..." : "EKSEKUSI TUKAR"}
                </button>
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
                <input 
                  type="date"
                  value={rentangDownload.awal}
                  onChange={(e) => setRentangDownload({...rentangDownload, awal: e.target.value})}
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none focus:border-blue-500 transition-all shadow-inner text-slate-700"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Selesai (Akhir)</label>
                <input 
                  type="date"
                  value={rentangDownload.akhir}
                  onChange={(e) => setRentangDownload({...rentangDownload, akhir: e.target.value})}
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none focus:border-blue-500 transition-all shadow-inner text-slate-700"
                />
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setShowDownloadModal(false)} 
                  className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={executeDownloadLaporan} 
                  disabled={isDownloading} 
                  className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-blue-800 flex items-center justify-center gap-2"
                >
                  {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isDownloading ? "MENYUSUN..." : "DOWNLOAD WORD"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center py-12 opacity-30 text-[9px] font-black uppercase italic tracking-[0.6em] text-slate-900 italic">
        DAK-SYSTEMS INTELLIGENCE v.4.0 | RSUD MERAH PUTIH MAGELANG
      </footer>
    </div>
  );
}