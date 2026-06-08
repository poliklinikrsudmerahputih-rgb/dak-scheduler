"use client";
import React, { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Search, ClipboardList, Clock, Cpu, 
  UserCheck, AlertCircle, Save, CheckCircle2, Activity, Edit3, Medal, XCircle,
  RefreshCw, ArrowLeftRight, Loader2, TrendingUp, Download, Lock, Unlock, CalendarRange, Star, Calendar as CalendarIcon, Play, Square, FileText, Trash2, PieChart
} from "lucide-react"; 
import { simpanCuti } from "../cuti-sdm/actions"; 

// ======================================================
// KOMPONEN BARU: JAM BERJALAN (LIVE CLOCK) TERPISAH
// Dipisahkan agar tidak membuat kolom input me-refresh (lose focus) di HP
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
// 1. MODAL OBSERVASI DIGITAL (STOPWATCH REAL-TIME)
// ======================================================
function ModalObservasiDigital({ isOpen, onClose, perawatSelected, ruanganAktif, klinikSelected }) {
  const [kategori, setKategori] = useState('ASESMEN');
  const [detailTindakan, setDetailTindakan] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [noKejadian, setNoKejadian] = useState(1);
  const [waktuMulaiStr, setWaktuMulaiStr] = useState('');
  const [waktuMulaiRaw, setWaktuMulaiRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detikBerjalan, setDetikBerjalan] = useState(0);

  useEffect(() => {
    if (isOpen && perawatSelected) {
      fetch(`/api/observasi?mode=count&sdm_id=${perawatSelected.id}`)
        .then(res => res.json())
        .then(data => setNoKejadian((data.last_count || 0) + 1))
        .catch(() => setNoKejadian(1));
    }
  }, [isOpen, perawatSelected]);

  useEffect(() => {
    let interval;
    if (isRunning) {
        interval = setInterval(() => {
            setDetikBerjalan(prev => prev + 1);
        }, 1000);
    } else {
        clearInterval(interval);
        setDetikBerjalan(0);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isOpen || !perawatSelected) return null;

  const displayMenit = Math.floor(detikBerjalan / 60).toString().padStart(2, '0');
  const displayDetik = (detikBerjalan % 60).toString().padStart(2, '0');

  // Logic penentuan nama poliklinik spesifik
  let namaRuanganTampil = ruanganAktif || 'POLIKLINIK';
  if (namaRuanganTampil.trim().toUpperCase() === 'NERS 3' && klinikSelected) {
      const kl = klinikSelected.toUpperCase();
      if (kl.includes('THT')) namaRuanganTampil = 'NERS 3 (THT)';
      else if (kl.includes('MATA')) namaRuanganTampil = 'NERS 3 (MATA)';
      else if (kl.includes('PARU')) namaRuanganTampil = 'NERS 3 (PARU)';
      else namaRuanganTampil = `NERS 3 (${klinikSelected})`;
  }

  const handleStartTimer = () => {
    const sekarang = new Date();
    setWaktuMulaiRaw(sekarang);
    setWaktuMulaiStr(sekarang.toLocaleTimeString('id-ID'));
    setIsRunning(true);
  };

  const handleResetTimer = () => {
    if(confirm("Yakin ingin membatalkan rekaman waktu ini? Data berjalan akan dibuang.")) {
        setIsRunning(false);
        setWaktuMulaiRaw(null);
        setWaktuMulaiStr('');
    }
  };

  const handleStopAndSave = async () => {
    if (!waktuMulaiRaw) return;
    setLoading(true);
    const sekarang = new Date();
    const durasiMenit = (sekarang - waktuMulaiRaw) / (1000 * 60); 

    try {
      const response = await fetch('/api/observasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdm_id: perawatSelected.id,
          ruangan: namaRuanganTampil,
          blok_kategori: kategori,
          detail_tindakan: detailTindakan || '-',
          waktu_mulai: waktuMulaiStr,
          waktu_selesai: ClinicalTimeFormat(sekarang),
          durasi_menit: durasiMenit > 0 ? durasiMenit : 0.1, 
          no_kejadian: noKejadian
        })
      });
      const result = await response.json();
      if (response.ok) {
        alert(`✅ ` + result.message);
        setIsRunning(false);
        setWaktuMulaiRaw(null);
        setWaktuMulaiStr('');
        setDetailTindakan('');
        onClose();
      } else { alert("Gagal menyimpan data: " + result.error); }
    } catch (err) { alert("Terjadi kesalahan jaringan."); }
    finally { setLoading(false); }
  };

  function ClinicalTimeFormat(date) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
      <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl border-4 border-emerald-500/20 relative overflow-hidden">
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black italic uppercase text-slate-800 flex items-center gap-2">
            <ClipboardList size={24} className="text-emerald-500" /> Time Study
          </h3>
          <button onClick={onClose} disabled={isRunning} className="p-2 bg-slate-100 rounded-full disabled:opacity-30"><XCircle size={20}/></button>
        </div>

        <div className="mb-4 flex items-center justify-between bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-100">
            <span className="text-[10px] font-black uppercase text-emerald-800 tracking-widest">Target Sampel :</span>
            <select 
                disabled={isRunning} 
                value={noKejadian} 
                onChange={(e) => setNoKejadian(parseInt(e.target.value))}
                className="bg-white font-black text-emerald-700 text-xs px-3 py-1.5 rounded-lg border border-emerald-200 outline-none cursor-pointer"
            >
                {Array.from({length: 100}, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>Sampel Ke-{num}</option>
                ))}
            </select>
        </div>
        
        <div className="mb-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl text-[10px] font-black uppercase tracking-wider text-slate-600">
            <p className="text-emerald-600 mb-1 opacity-70">Objek Observasi:</p>
            <p className="text-sm text-slate-800">{perawatSelected.nama}</p>
            <p className="mt-1 opacity-60">STASIUN: {namaRuanganTampil}</p>
        </div>

        <select disabled={isRunning} value={kategori} onChange={(e) => setKategori(e.target.value)} className="w-full p-4 bg-white rounded-2xl font-black uppercase text-[10px] border-2 border-slate-200 mb-4 outline-none focus:border-emerald-500">
          <option value="ASESMEN">BLOK A: Asesmen Terintegrasi</option>
          <option value="EDUKASI">BLOK B: Edukasi & Cetak SK</option>
          <option value="TINDAKAN">BLOK C: Tindakan Prosedural</option>
          <option value="IDLE">BLOK D: Waktu Jeda</option>
        </select>
        
        <input disabled={isRunning} type="text" placeholder="Detail Tindakan (Opsional)..." value={detailTindakan} onChange={(e) => setDetailTindakan(e.target.value)} className="w-full p-4 bg-white rounded-2xl font-black uppercase text-[10px] border-2 border-slate-200 mb-6 outline-none focus:border-emerald-500" />
        
        <div className={`mb-6 rounded-2xl p-6 border-2 text-center transition-all ${isRunning ? 'bg-emerald-50 border-emerald-200 shadow-inner' : 'bg-slate-50 border-dashed border-slate-200'}`}>
            <p className={`text-[10px] font-black tracking-widest uppercase mb-1 ${isRunning ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`}>
                {isRunning ? 'Merekam Durasi...' : 'Stopwatch Siap'}
            </p>
            <p className={`font-mono text-5xl font-black tracking-tighter ${isRunning ? 'text-emerald-800' : 'text-slate-300'}`}>
                {displayMenit}:{displayDetik}
            </p>
            {isRunning && <p className="text-[8px] text-emerald-600/50 mt-2 font-black uppercase">Start: {waktuMulaiStr}</p>}
        </div>

        <div className="flex gap-3">
          {!isRunning ? (
            <button onClick={handleStartTimer} className="flex-1 bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl italic tracking-widest border-b-4 border-emerald-800 flex items-center justify-center gap-2 hover:bg-emerald-700 active:translate-y-1 active:border-b-0 transition-all"><Play size={16} className="fill-white"/> MULAI</button>
          ) : (
            <>
              <button onClick={handleResetTimer} disabled={loading} className="p-5 bg-red-100 text-red-600 rounded-2xl font-black uppercase text-[10px] border-2 border-red-200 flex items-center justify-center gap-2 hover:bg-red-200 transition-all"><Trash2 size={18}/></button>
              <button onClick={handleStopAndSave} disabled={loading} className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl italic tracking-widest border-b-4 border-blue-800 flex items-center justify-center gap-2 hover:bg-blue-700 active:translate-y-1 active:border-b-0 transition-all">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} className="fill-white"/>} 
                {loading ? 'MENYIMPAN...' : 'STOP & SIMPAN'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ======================================================
// 2. MODAL NASA-TLX (KUESIONER SUBJEKTIF)
// ======================================================
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
        
        <button onClick={handleSubmit} disabled={submitting} className="mt-6 w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl italic tracking-widest border-b-4 border-blue-800 active:translate-y-1 active:border-b-0 transition-all flex justify-center items-center gap-2">
          {submitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
          {submitting ? "MENYIMPAN DATA..." : "KIRIM EVALUASI KERJA"}
        </button>
      </div>
    </div>
  );
}

// ======================================================
// 3. MODAL LIVE ANALISIS RISET (FIXED REKAP & E-LOG NASA)
// ======================================================
function ModalAnalisisRiset({ isOpen, onClose, daftarSDM }) {
    const [dataRaw, setDataRaw] = useState([]);
    const [nasaRaw, setNasaRaw] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [tabAktif, setTabAktif] = useState('REKAP'); 

    const fetchAnalisis = async () => {
        setLoading(true);
        try {
            const resObs = await fetch('/api/observasi?mode=analisis');
            const dObs = await resObs.json();
            setDataRaw(dObs.data || []);

            const resNasa = await fetch('/api/nasa-tlx'); 
            const dNasa = await resNasa.json();
            setNasaRaw(Array.isArray(dNasa) ? dNasa : dNasa.data || []);
        } catch(err) {
            console.error("Gagal sinkronisasi data riset:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if(isOpen) fetchAnalisis();
    }, [isOpen]);

    if(!isOpen) return null;

    const getNamaPerawat = (id) => {
        if (!daftarSDM || daftarSDM.length === 0) return `ID:${id}`;
        const sdm = daftarSDM.find(s => s.id === id || String(s.id) === String(id));
        return sdm ? sdm.nama : `ID:${id}`;
    };

    const rekapData = dataRaw.reduce((acc, row) => {
        const key = `${row.ruangan}_${row.sdm_id}_${row.blok_kategori}`;
        if (!acc[key]) {
            acc[key] = { 
                ruangan: row.ruangan, 
                kategori: row.blok_kategori, 
                nama: getNamaPerawat(row.sdm_id), 
                total_menit: 0, 
                jumlah: 0 
            };
        }
        acc[key].total_menit += parseFloat(row.durasi_menit || 0);
        acc[key].jumlah += 1;
        return acc;
    }, {});

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] p-8 md:p-10 shadow-2xl border-4 border-indigo-500/20 max-h-[90vh] flex flex-col relative">
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-indigo-500 pl-4 flex items-center gap-3"><PieChart size={24} className="text-indigo-500"/> Live Analisis Riset</h3>
              <div className="flex gap-2">
                <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"><XCircle size={20}/></button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
                <button onClick={() => setTabAktif('REKAP')} className={`flex-1 py-3 px-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${tabAktif === 'REKAP' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Rekap Rata-rata</button>
                
                <button onClick={() => setTabAktif('OBSERVASI')} className={`flex-1 py-3 px-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${tabAktif === 'OBSERVASI' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Log Time Study (Real-time)</button>
                
                <button onClick={() => setTabAktif('NASA')} className={`flex-1 py-3 px-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${tabAktif === 'NASA' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>E-Log NASA-TLX Stres Kerja</button>
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center items-center p-12"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>
            ) : (
                <div className="overflow-y-auto custom-scrollbar border rounded-[2rem] border-slate-200 bg-white">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-900 text-white text-[9px] font-black uppercase italic tracking-widest z-10 shadow-md">
                            {tabAktif === 'REKAP' && (
                                <tr>
                                    <th className="p-5 text-left">Poliklinik / Stasiun</th>
                                    <th className="p-5 text-left">Nama Asisten (Ners)</th>
                                    <th className="p-5 text-left">Kategori Asuhan</th>
                                    <th className="p-5 text-center bg-indigo-600/30">Jml Sampel</th>
                                    <th className="p-5 text-center bg-emerald-500/30">Rata-rata Waktu</th>
                                </tr>
                            )}
                            
                            {tabAktif === 'OBSERVASI' && (
                                <tr>
                                    <th className="p-4 w-40 text-left">Tanggal & Jam Record</th>
                                    <th className="p-4 text-left">Asisten & Stasiun</th>
                                    <th className="p-4 text-left">Aktivitas Jeda / Kerja</th>
                                    <th className="p-4 text-center bg-emerald-500/30">Durasi Tercatat</th>
                                </tr>
                            )}

                            {tabAktif === 'NASA' && (
                                <tr>
                                    <th className="p-4 w-32">Waktu Input</th>
                                    <th className="p-4">Nama Perawat & Stasiun</th>
                                    <th className="p-4 text-center">Indikator Pembebanan (M/F/W/P/U/FR)</th>
                                    <th className="p-4 text-center bg-blue-900/40">Catatan Lapangan</th>
                                </tr>
                            )}
                        </thead>
                        <tbody className="text-xs font-bold uppercase tracking-tight text-slate-700">
                            
                            {tabAktif === 'REKAP' && (
                                Object.values(rekapData).length === 0 ? (
                                    <tr><td colSpan={5} className="text-center p-10 text-slate-400 italic">Belum ada data observasi time-study.</td></tr>
                                ) : (
                                    Object.values(rekapData).map((row, i) => (
                                        <tr key={`rekap-riset-${i}`} className="border-b border-slate-100 hover:bg-indigo-50/50 transition-colors">
                                            <td className="p-5 text-slate-900 font-extrabold">{row.ruangan}</td>
                                            <td className="p-5 font-black italic text-indigo-900">{row.nama}</td>
                                            <td className="p-5"><span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] text-slate-600">{row.kategori}</span></td>
                                            <td className="p-5 text-center text-indigo-700 bg-indigo-50/30">{row.jumlah}</td>
                                            <td className="p-5 text-center text-emerald-600 font-black text-sm bg-emerald-50/30">{(row.total_menit / row.jumlah).toFixed(2)} Mnt</td>
                                        </tr>
                                    ))
                                )
                            )}

                            {tabAktif === 'OBSERVASI' && (
                                dataRaw.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center p-10 text-slate-400 italic">Belum ada rekaman stopwatch yang tersimpan.</td></tr>
                                ) : (
                                    dataRaw.map((row, i) => (
                                        <tr key={`obs-raw-${row.id || i}`} className="border-b border-slate-100 hover:bg-emerald-50/40 transition-colors">
                                            <td className="p-4">
                                                <p className="text-[10px] font-black text-slate-800 bg-slate-100 w-fit px-2 py-1 rounded mb-1">{row.tanggal_input || '-'}</p>
                                                <p className="text-[9px] font-bold text-slate-500 tracking-wider">Jam: {row.waktu_mulai} - {row.waktu_selesai}</p>
                                            </td>
                                            <td className="p-4">
                                                <p className="font-black italic text-emerald-900">{getNamaPerawat(row.sdm_id)}</p>
                                                <p className="text-[9px] font-bold text-slate-500">{row.ruangan}</p>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-emerald-100 px-2 py-1 rounded-md text-[9px] text-emerald-700 font-black tracking-wider">{row.blok_kategori}</span>
                                                <p className="text-[9px] text-slate-500 mt-1.5 uppercase max-w-[200px] truncate" title={row.detail_tindakan}>{row.detail_tindakan}</p>
                                            </td>
                                            <td className="p-4 text-center text-emerald-700 font-black text-sm bg-emerald-50/30">
                                                {row.durasi_menit} Mnt
                                            </td>
                                        </tr>
                                    ))
                                )
                            )}

                            {tabAktif === 'NASA' && (
                                nasaRaw.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center p-10 text-slate-400 italic">Belum ada data kuisioner NASA-TLX yang masuk.</td></tr>
                                ) : (
                                    nasaRaw.map((row, i) => (
                                        <tr key={`nasa-log-${row.id || i}`} className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
                                            <td className="p-4">
                                                <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-2 py-1 rounded">{row.tanggal_isi || row.created_at || '-'}</span>
                                            </td>
                                            <td className="p-4">
                                                <p className="font-black text-slate-800 italic">{getNamaPerawat(row.sdm_id)}</p>
                                                <p className="font-extrabold text-[9px] text-blue-600 mt-1">{row.ruangan || 'RAWAT JALAN'}</p>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-wrap gap-1 justify-center text-[10px]">
                                                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded" title="Mental">M: {row.mental}</span>
                                                    <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded" title="Fisik">F: {row.fisik}</span>
                                                    <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded" title="Waktu">W: {row.waktu}</span>
                                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded" title="Performa">P: {row.performa}</span>
                                                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded" title="Usaha">U: {row.usaha}</span>
                                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded" title="Frustrasi">FR: {row.frustrasi}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-500 normal-case font-medium max-w-xs truncate">{row.catatan || '-'}</td>
                                        </tr>
                                    ))
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            )}
          </div>
        </div>
    );
}

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
  
  // State untuk Riset
  const [showObservasiModal, setShowObservasiModal] = useState(false);
  const [showNASAModal, setShowNASAModal] = useState(false);
  const [showAnalisisModal, setShowAnalisisModal] = useState(false);
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
      
      {/* RENDER MODALS RISET */}
      <ModalObservasiDigital isOpen={showObservasiModal} onClose={() => setShowObservasiModal(false)} perawatSelected={perawatTarget} ruanganAktif={ruanganAktifGlobal} klinikSelected={klinikAktifGlobal} />
      <ModalNASATLX isOpen={showNASAModal} onClose={() => setShowNASAModal(false)} perawatSelected={perawatTarget} ruanganAktif={ruanganAktifGlobal} klinikSelected={klinikAktifGlobal} />
      <ModalAnalisisRiset isOpen={showAnalisisModal} onClose={() => setShowAnalisisModal(false)} daftarSDM={daftarSDM} />

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
            <button onClick={() => setShowAnalisisModal(true)} className="bg-indigo-600 hover:bg-indigo-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-indigo-800 text-white"><PieChart size={18} /> Analisis Riset</button>
            
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
                 {/* MEMANGGIL KOMPONEN JAM TERPISAH */}
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
              className="bg-transparent border-none outline-none text-xs font-black w-full uppercase"
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
                            <div className="flex flex-wrap gap-2">
                              {dok.timAsisten && dok.timAsisten.length > 0 ? dok.timAsisten.map((as, i) => (
                                <div key={i} className="flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase italic text-slate-700 bg-white px-2 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                                  <UserCheck size={12} className="text-emerald-500" /> 
                                  <span className="mr-2">{as.nama}</span>
                                  
                                  {/* Penguncian data perawat dinas pasca klik */}
                                  <div className="flex bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                      <button 
                                        onClick={() => { 
                                          setPerawatTarget(as); 
                                          setRuanganAktifGlobal(simbol); 
                                          setKlinikAktifGlobal(dok.klinik);
                                          setShowObservasiModal(true); 
                                        }} 
                                        className="flex items-center gap-1 px-2 py-1.5 hover:bg-emerald-500 hover:text-white transition-all text-slate-500" 
                                        title="Time Study (Stopwatch)"
                                      >
                                          <ClipboardList size={12} /> <span className="text-[8px] not-italic">WAKTU</span>
                                      </button>
                                      <div className="w-[1px] bg-slate-200"></div>
                                      <button 
                                        onClick={() => { 
                                          setPerawatTarget(as); 
                                          setRuanganAktifGlobal(simbol); 
                                          setKlinikAktifGlobal(dok.klinik);
                                          setShowNASAModal(true); 
                                        }} 
                                        className="flex items-center gap-1 px-2 py-1.5 hover:bg-blue-600 hover:text-white transition-all text-slate-500" 
                                        title="Kuesioner NASA-TLX"
                                      >
                                          <FileText size={12} /> <span className="text-[8px] not-italic">STRES</span>
                                      </button>
                                  </div>

                                </div>
                              )) : <p className="text-[10px] font-black text-slate-300 italic">--- Belum Ada Asisten Ditugaskan ---</p>}
                            </div>

                            <div className="flex gap-3 items-end pt-2">
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1.5 ml-1">
                                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest italic">Input Kunjungan</span>
                                  {!editMode[originalIndex] ? <span className="text-[8px] text-red-500 flex items-center gap-0.5 font-bold"><Lock size={8}/> Kunci</span> : <span className="text-[8px] text-emerald-500 flex items-center gap-0.5 font-bold"><Unlock size={8}/> Buka</span>}
                                </div>
                                <input 
                                  type="number" 
                                  disabled={!editMode[originalIndex]} 
                                  className={`w-full border-2 rounded-xl px-4 py-2.5 text-xs font-black outline-none transition-colors ${!editMode[originalIndex] ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-blue-200 text-blue-900'}`}
                                  value={inputPasien[originalIndex] || ""}
                                  onChange={(e) => setInputPasien({...inputPasien, [originalIndex]: e.target.value})}
                                  placeholder="Total..."
                                />
                              </div>
                              
                              {!editMode[originalIndex] ? (
                                <button 
                                  onClick={() => setEditMode({...editMode, [originalIndex]: true})}
                                  className="p-3 bg-amber-500 text-white rounded-xl shadow-md hover:bg-amber-600 transition-all text-xs border-b-4 border-amber-700 active:border-b-0 active:mt-1"
                                  title="Edit Data"
                                >
                                  <Edit3 size={16} />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleUpdatePasienSpesifik(originalIndex)}
                                  disabled={submitting}
                                  className="p-3 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition-all text-xs border-b-4 border-blue-800 active:border-b-0 active:mt-1"
                                >
                                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                </button>
                              )}
                            </div>
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
        <div className="mt-12 bg-white rounded-[3.5rem] shadow-xl p-8 border border-slate-100">
            <div className="flex items-center gap-3 px-4 mb-6"><div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div><h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin & Cuti SDM</h3></div>
            
            {data?.sdmCuti?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
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
              <p className="text-center text-xs font-black text-slate-400 italic py-8 uppercase tracking-widest">Tidak ada pengajuan izin di bulan ini.</p>
            )}
        </div>
      </div>

      {/* POP-UP LEADERBOARD POIN */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] p-6 md:p-10 shadow-2xl border-4 border-amber-500/20 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-amber-500 pl-4 flex items-center gap-3">
                <TrendingUp size={24} className="text-amber-500" /> Akumulasi Poin Kinerja Asisten
              </h3>
              <button onClick={() => setShowLeaderboardModal(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar border rounded-[2rem] border-slate-100">
              <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-900 z-10 shadow-md">
                    <tr className="text-[9px] font-black uppercase italic tracking-widest text-white">
                      <th className="p-6">Nama Staf</th>
                      <th className="p-6 text-left">Tugas Hari Ini</th>
                      <th className="p-6 text-center bg-blue-600/20 border-x border-slate-700">Poin Hari Ini</th>
                      <th className="p-6 text-center text-amber-400 bg-amber-500/10">TOTAL POIN (BLN INI)</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-bold uppercase tracking-tighter">
                      {data?.leaderboard?.map((item, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-amber-50/50 transition-all">
                              <td className="p-6">
                                <p className="text-slate-800 font-black italic">{item.nama}</p>
                                <p className="text-[7px] text-slate-400 mt-1 uppercase italic font-black tracking-widest leading-none">Rank #{i+1}</p>
                              </td>
                              <td className="p-6">
                                <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-[9px] border border-slate-200 font-black">
                                  {item.detail_poli || "OFF / LIBUR"}
                                </span>
                              </td>
                              <td className="p-6 text-center border-x border-slate-100 bg-blue-50/30">
                                {item.total_pasien_hari_ini > 0 ? (
                                  <span className="text-blue-600 font-black text-sm flex items-center justify-center gap-1">
                                    +{item.total_pasien_hari_ini} <CheckCircle2 size={12}/>
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="p-6 text-center bg-amber-50/30">
                                <div className="inline-block px-4 py-2 rounded-xl bg-amber-500 text-white font-black text-lg shadow-md italic">
                                  {item.total_pasien_bulanan || item.total_pasien || 0}
                                </div>
                              </td>
                          </tr>
                      ))}
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
                <button onClick={() => { setShowSwap(false); setSwapData({ sdmA: "", sdmB: "" }); }} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors">Batal</button>
                <button onClick={handleSwapDB} disabled={submitting || !swapData.sdmA || !swapData.sdmB} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 active:border-b-0 active:mt-1 disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-emerald-700">EKSEKUSI TUKAR</button>
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
                <button onClick={() => setShowDownloadModal(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors">Batal</button>
                <button onClick={executeDownloadLaporan} disabled={isDownloading} className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-blue-800 active:border-b-0 active:mt-1 flex items-center justify-center gap-2">
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