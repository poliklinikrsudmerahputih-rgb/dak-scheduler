"use client";
import React, { useState, useEffect } from "react";
import { format, getDaysInMonth } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { 
  Users, Stethoscope, Share2, ChevronDown, ShieldCheck, 
  Activity, UserCheck, Clock, AlertCircle, Cpu, Calendar, 
  HeartPulse, Save, RefreshCw, ArrowLeftRight, TrendingUp,
  CheckCircle2, Loader2, Search, Medal
} from "lucide-react";

export default function DashboardUtama() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inputPasien, setInputPasien] = useState({});
  
  // State Filter Waktu (Dropdown Tanggal di Dashboard)
  const [tanggal, setTanggal] = useState(new Date().getDate());
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [swapData, setSwapData] = useState({ sdmA: "", sdmB: "" });

  const fetchData = async () => {
    setLoading(true);
    try {
      const resDash = await fetch(`/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}`);
      
      if (resDash.status === 401) {
        router.push("/login");
        return;
      }

      const dDash = await resDash.json();
      if (dDash) {
        setData(dDash);
        const savedValues = {};
        // Sinkronisasi input dengan data tabel jumlah_pasien_poli
        dDash.dokterPraktik?.forEach((dok, idx) => {
          savedValues[idx] = dok.jumlah_pasien_poli || "";
        });
        setInputPasien(savedValues);
      }
    } catch (e) { 
      console.error("Gagal sinkronisasi dashboard:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh otomatis setiap 5 menit
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [tanggal, bulan, tahun]);

  const handleUpdatePasienSpesifik = async (idx) => {
    const jmlTotal = inputPasien[idx];
    if (jmlTotal === "" || jmlTotal < 0) return alert("Isi jumlah pasien!");
    
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
        alert(`✅ TERSIMPAN: ${dok.nama_dokter} - ${jmlTotal} Pasien`);
        fetchData(); 
      }
    } catch (e) { alert("Gagal simpan."); } 
    finally { setSubmitting(false); }
  };

  const handleSwapDB = async () => {
    if (!swapData.sdmA || !swapData.sdmB) return alert("Pilih kedua perawat!");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jadwal/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...swapData, tanggal, bulan, tahun })
      });
      if (res.ok) {
        alert("🔄 Penugasan Berhasil Ditukar!");
        setShowSwap(false);
        setSwapData({ sdmA: "", sdmB: "" });
        fetchData();
      }
    } catch (e) { alert("Gagal swap."); }
    finally { setSubmitting(false); }
  };

  const shareLink = () => {
    const link = window.location.origin + "/view-jadwal";
    navigator.clipboard.writeText(link);
    alert("✅ Link Monitoring Online Berhasil Disalin!");
  };

  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const jumlahHari = getDaysInMonth(new Date(tahun, bulan - 1));
  const daftarHari = Array.from({ length: jumlahHari }, (_, i) => i + 1);
  const labelHariIni = format(new Date(tahun, bulan-1, tanggal), "eeee, dd MMMM yyyy", { locale: id });

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 font-black text-blue-400 uppercase text-[10px] tracking-[0.5em] animate-pulse">
      <Cpu size={40} className="mb-4 animate-spin" />
      Syncing Intelligence System...
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-8 bg-slate-50 min-h-screen pb-20 font-sans">
      
      {/* --- HEADER DASHBOARD --- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900 p-8 md:p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Activity size={250} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 text-blue-400">
            <ShieldCheck size={18}/>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic leading-none text-blue-300">Central Intelligence Dashboard</p>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none italic drop-shadow-lg text-white">
            DAK-<span className="text-blue-500">SYSTEMS</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 mt-6 flex items-center gap-2 uppercase tracking-widest leading-none bg-white/5 w-fit px-4 py-2 rounded-full border border-white/10 italic">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Unit: {data?.summary?.ruangan || "POLIKLINIK"} • {labelHariIni}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto relative z-10">
          <div className="flex gap-2 w-full lg:w-auto">
             <select 
                value={tanggal} 
                onChange={(e) => setTanggal(parseInt(e.target.value))}
                className="bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-xs font-black uppercase text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
             >
                {daftarHari.map(d => <option key={d} value={d} className="text-slate-800">Tgl {d}</option>)}
             </select>
             <select 
                value={bulan} 
                onChange={(e) => setBulan(parseInt(e.target.value))}
                className="bg-white/10 border border-white/20 rounded-2xl px-8 py-4 text-xs font-black uppercase text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
             >
                {namaBulan.map((nama, idx) => (
                  <option key={idx} value={idx + 1} className="text-slate-800">{nama}</option>
                ))}
             </select>
          </div>
          <button onClick={shareLink} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center gap-2">
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      {/* --- STATS GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Users />} label="Total SDM" value={data?.summary?.totalSDM} color="blue" sub="Personil" />
        <StatCard icon={<Stethoscope />} label="Dokter Unik" value={data?.summary?.totalDokter} color="indigo" sub="Master" />
        <StatCard icon={<Activity />} label="Perawat Masuk" value={data?.summary?.perawatMasuk} color="emerald" sub="Dinas" />
        <StatCard icon={<AlertCircle />} label="Izin/Cuti" value={data?.summary?.sdmIzinCount} color="red" sub="Bulan Ini" />
      </div>

      {/* --- CONTROL PANEL --- */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col lg:flex-row gap-6 items-center">
        <div className="flex-1 flex items-center gap-4 bg-slate-50 px-8 py-4 rounded-2xl w-full">
          <Search size={20} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search Polyclinic Activity..." 
            className="bg-transparent border-none outline-none text-xs font-black w-full uppercase"
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button onClick={() => setShowSwap(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200">
           <RefreshCw size={18} /> Tukar Asisten
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* --- KOLOM KIRI: TIM PELAYANAN & INPUT --- */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data?.dokterPraktik?.filter(d => d.nama_dokter.toLowerCase().includes(searchTerm.toLowerCase())).map((dok, idx) => (
              <div key={idx} className={`bg-white p-8 rounded-[3.5rem] border-2 transition-all hover:shadow-2xl relative overflow-hidden group ${dok.isCuti ? 'border-red-100 opacity-60 bg-red-50/20' : 'border-white hover:border-blue-500'}`}>
                <div className="flex justify-between items-start mb-6">
                   <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xs italic shadow-lg ${dok.isCuti ? 'bg-red-400 text-white' : 'bg-slate-900 text-white'}`}>
                    {dok.simbol_praktik}
                   </div>
                   {dok.jumlah_pasien_poli > 0 && !dok.isCuti && (
                    <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-4 py-2 rounded-full uppercase italic animate-pulse">Syncing Pasien</span>
                   )}
                </div>

                <h4 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter leading-tight">{dok.nama_dokter}</h4>
                <p className="text-[10px] font-bold text-blue-600 uppercase mt-1 tracking-widest">{dok.klinik}</p>
                
                {!dok.isCuti ? (
                  <div className="mt-8 space-y-4">
                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 group-hover:bg-slate-100/50 transition-colors">
                      <p className="text-[8px] font-black text-slate-400 uppercase italic mb-3 flex items-center gap-1">
                        <UserCheck size={12} className="text-blue-500" /> Tim Asisten:
                      </p>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {dok.timAsisten?.map((as, i) => (
                          <div key={i} className="text-[9px] font-black uppercase italic text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1 shadow-sm">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> {as.nama}
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 items-end pt-4 border-t border-slate-200/50">
                        <div className="flex-1">
                           <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block italic">Input Total Pasien</label>
                           <input 
                              type="number" 
                              className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-4 text-xs font-black outline-none focus:border-blue-500 shadow-inner"
                              value={inputPasien[idx] || ""}
                              onChange={(e) => setInputPasien({...inputPasien, [idx]: e.target.value})}
                              placeholder="Jml Pasien"
                           />
                        </div>
                        <button 
                          onClick={() => handleUpdatePasienSpesifik(idx)}
                          disabled={submitting}
                          className="p-5 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-emerald-600 transition-all active:scale-90"
                        >
                          <Save size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 p-10 bg-red-100/30 rounded-[2.5rem] text-center border-2 border-dashed border-red-200">
                      <AlertCircle size={40} className="mx-auto text-red-300 mb-4" />
                      <p className="text-[11px] font-black text-red-600 uppercase italic tracking-widest">Dokter Izin / Berhalangan</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* --- LEADERBOARD BEBAN KERJA (POOLING) --- */}
          <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center italic">
              <h3 className="text-sm font-black uppercase tracking-widest pl-4 border-l-4 border-blue-500 flex items-center gap-3">
                <TrendingUp size={18} /> Leaderboard Beban Kerja Staf
              </h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black uppercase italic tracking-widest text-slate-400">
                  <th className="p-8">Nama Staf</th>
                  <th className="p-8 text-center">Beban Pasien</th>
                  <th className="p-8 text-left">Unit Dibantu</th>
                  <th className="p-8 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs font-bold uppercase tracking-tighter">
                {data?.leaderboard?.map((item, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/30 transition-all">
                    <td className="p-8">
                      <p className="text-slate-800 font-black italic">{item.nama}</p>
                      <p className="text-[7px] text-slate-400 mt-1 uppercase italic font-black tracking-widest">Rank #{i+1}</p>
                    </td>
                    <td className="p-8 text-center">
                      <span className={`px-5 py-3 rounded-2xl font-black text-sm ${item.total_pasien > 0 ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-slate-100 text-slate-300'}`}>
                        {item.total_pasien}
                      </span>
                    </td>
                    <td className="p-8 max-w-[200px]">
                      <p className="text-[8px] text-blue-600 font-black italic uppercase leading-relaxed bg-blue-50 p-3 rounded-xl border border-blue-100">
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

        {/* --- KOLOM KANAN: MONITOR IZIN --- */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-4">
            <div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div>
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin Bulan Ini</h3>
          </div>
          <div className="bg-white p-2 rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
            <div className="max-h-[800px] overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {data?.sdmCuti?.map((s, i) => (
                <div key={i} className={`p-6 rounded-[2.5rem] border-l-8 flex justify-between items-center shadow-lg border transition-all ${s.status_acc === 'Disetujui' ? 'bg-white border-emerald-100 border-l-emerald-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                  <div className="max-w-[180px]">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-md italic">{s.jenis_cuti}</span>
                        <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none truncate italic">{s.nama_sdm}</h4>
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{s.tgl_mulai} - {s.tgl_selesai}</p>
                    <p className="text-[8px] text-slate-400 mt-2 italic font-bold tracking-tight uppercase truncate">Ket: {s.alasan || "-"}</p>
                  </div>
                  {s.status_acc === 'Disetujui' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Clock size={16} className="text-amber-500 animate-spin-slow" />}
                </div>
              ))}
            </div>
          </div>

          <div className="p-10 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group border border-white/5">
            <Cpu className="absolute -right-8 -bottom-8 text-white/5 group-hover:text-blue-500/10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-1000" size={180} />
            <div className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em] mb-6 italic leading-none flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div> CORE SYSTEM
            </div>
            <p className="text-xs font-medium text-slate-300 leading-relaxed mb-10 italic">
              Sistem diproses menggunakan enkripsi <span className="text-white font-black underline decoration-blue-500">TURSO DB</span> untuk akurasi penjadwalan personil poliklinik secara real-time.
            </p>
            <div className="flex items-center gap-4 pt-8 border-t border-white/10 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-blue-500 flex items-center justify-center font-black text-white text-xs shadow-lg shadow-blue-500/20">DAK</div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest leading-none mb-1 text-white">Daniel Ari Kristianto</p>
                <p className="text-[9px] font-bold text-blue-400 uppercase italic leading-none tracking-tighter">Coordinator of Outpatient Unit</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODAL SWAP LUAS --- */}
      {showSwap && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-500 pl-4 flex items-center gap-3">
              <RefreshCw size={24} className="text-blue-500" /> Manajemen Tukar Tugas
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat A (Asal)</label>
                <select value={swapData.sdmA} onChange={(e) => setSwapData({...swapData, sdmA: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none">
                  <option value="">-- PILIH PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (<option key={`A-${item.id}`} value={item.id}>{item.nama} ({item.detail_poli || "Cadangan"})</option>))}
                </select>
              </div>
              <div className="flex justify-center py-2"><ArrowLeftRight size={30} className="text-blue-500 animate-pulse" /></div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat B (Tujuan)</label>
                <select value={swapData.sdmB} onChange={(e) => setSwapData({...swapData, sdmB: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none">
                  <option value="">-- PILIH PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (<option key={`B-${item.id}`} value={item.id}>{item.nama} ({item.detail_poli || "Cadangan"})</option>))}
                </select>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowSwap(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors">Batal</button>
                <button onClick={handleSwapDB} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl italic tracking-widest border-b-4 border-blue-700">EKSEKUSI TUKAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center pt-12 pb-6 opacity-30">
        <p className="text-[9px] font-black uppercase tracking-[0.5em] italic">DAK-SYSTEMS INTELLIGENCE v.4.0 | RSUD MERAH PUTIH PRODUCTION</p>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  const colors = { 
    blue: "bg-blue-600 text-white shadow-blue-200", 
    emerald: "bg-emerald-600 text-white shadow-emerald-200", 
    indigo: "bg-slate-900 text-white shadow-slate-200",
    red: "bg-red-500 text-white shadow-red-200" 
  };
  const bgSoft = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    indigo: "bg-slate-100",
    red: "bg-red-50"
  };

  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex items-center gap-6 transition-all hover:-translate-y-3 hover:shadow-2xl hover:border-blue-100 group">
      <div className={`p-6 rounded-[2rem] shadow-lg transition-all duration-500 group-hover:rotate-12 ${colors[color]}`}>
        {React.cloneElement(icon, { size: 30 })}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-3 italic">{label}</p>
        <p className="text-5xl font-black text-slate-900 tracking-tighter mb-2 leading-none group-hover:text-blue-600 transition-colors">{value || 0}</p>
        <div className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none italic ${bgSoft[color]} ${color === 'blue' ? 'text-blue-600' : color === 'emerald' ? 'text-emerald-600' : color === 'red' ? 'text-red-600' : 'text-slate-500'}`}>
          {sub}
        </div>
      </div>
    </div>
  );
}