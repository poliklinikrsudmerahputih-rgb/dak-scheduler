"use client";
import React, { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { 
  Users, Stethoscope, Share2, ChevronDown, ShieldCheck, 
  Activity, UserCheck, Clock, AlertCircle, Cpu, Calendar, HeartPulse
} from "lucide-react";

export default function DashboardUtama() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());

  // Fungsi fetch data dashboard yang sinkron dengan API Route
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?bulan=${bulan}&tahun=${tahun}`);
      
      // Proteksi jika session habis
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      
      const d = await res.json();
      if (d) {
        setData(d);
      }
    } catch (err) {
      console.error("Gagal load dashboard DAK:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // Refresh otomatis setiap 5 menit agar data UPTODATE
    const interval = setInterval(fetchDashboard, 300000);
    return () => clearInterval(interval);
  }, [bulan, tahun]);

  const shareLink = () => {
    const link = window.location.origin + "/view-jadwal";
    navigator.clipboard.writeText(link);
    alert("✅ Link Monitoring Online Berhasil Disalin!");
  };

  const hariIniLabel = format(new Date(), "eeee, dd MMMM yyyy", { locale: id });
  const hariEsokLabel = format(addDays(new Date(), 1), "eeee", { locale: id });
  const daftarBulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 font-black text-blue-400 uppercase text-[10px] tracking-[0.5em] animate-pulse">
      <Cpu size={40} className="mb-4 animate-spin" />
      Menghubungkan ke DAK-Database...
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-8 bg-slate-50 min-h-screen pb-20 font-sans">
      
      {/* --- HEADER PREMIUM --- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900 p-8 md:p-12 rounded-[3rem] shadow-2xl text-white relative overflow-hidden transition-all hover:shadow-blue-900/20">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Cpu size={250} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 text-blue-400">
            <ShieldCheck size={18}/>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic leading-none text-blue-300">Intelligence Scheduling System</p>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none italic drop-shadow-lg">
            DAK-<span className="text-blue-500">SCHEDULER</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 mt-6 flex items-center gap-2 uppercase tracking-widest leading-none bg-white/5 w-fit px-4 py-2 rounded-full border border-white/10">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Unit: {data?.summary?.ruangan || "POLIKLINIK"} • Lead Dev: Daniel Ari K.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto relative z-10">
          <div className="relative flex-1 lg:flex-none">
            <select 
              value={bulan} 
              onChange={(e) => setBulan(parseInt(e.target.value))}
              className="appearance-none bg-white/10 border border-white/20 rounded-2xl px-8 py-4 pr-14 text-xs font-black uppercase text-white outline-none focus:ring-2 focus:ring-blue-500 w-full lg:w-56 cursor-pointer hover:bg-white/20 transition-all"
            >
              {daftarBulan.map((nama, idx) => (
                <option key={idx} value={idx + 1} className="text-slate-800">{nama}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-5 top-4 text-white/50" size={18} />
          </div>
          <button onClick={shareLink} className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95 w-full lg:w-auto">
            <Share2 size={16} /> Share Link
          </button>
        </div>
      </div>

      {/* --- STATS GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard icon={<Users />} label="Total Personil SDM" value={data?.summary?.totalSDM} color="blue" sub={`Bulan ${daftarBulan[bulan-1]}`} />
        <StatCard icon={<Stethoscope />} label="Total Dokter Unik" value={data?.summary?.totalDokter} color="indigo" sub="Terdaftar di Master" />
        <StatCard icon={<Activity />} label="Dinas Masuk Hari Ini" value={data?.summary?.perawatMasuk} color="emerald" sub={hariIniLabel} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* --- KOLOM KIRI: TIM PELAYANAN --- */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-6 bg-blue-600 rounded-full shadow-lg"></div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Dokter & Asisten Hari Ini</h3>
              </div>
              <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest italic">Live Sync Database</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data?.dokterPraktik?.length > 0 ? data.dokterPraktik.map((dok, idx) => (
                <div key={idx} className={`bg-white p-8 rounded-[3rem] border transition-all hover:shadow-2xl group relative overflow-hidden ${dok.isCuti ? 'border-red-200 bg-red-50/50 shadow-inner' : 'border-slate-100 shadow-sm'}`}>
                  
                  <div className="absolute -right-6 -top-6 opacity-[0.03] rotate-12 group-hover:rotate-0 transition-transform duration-700">
                    <Stethoscope size={150} />
                  </div>

                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-sm shadow-xl transition-transform group-hover:scale-110 ${dok.isCuti ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                      {dok.simbol_praktik}
                    </div>
                    {dok.isCuti && (
                      <span className="flex items-center gap-1 bg-red-600 text-white text-[8px] font-black px-4 py-2 rounded-2xl uppercase animate-bounce leading-none shadow-lg shadow-red-200">
                         <AlertCircle size={10} /> Dokter Izin
                      </span>
                    )}
                  </div>

                  <div className="relative z-10">
                    <h4 className={`text-lg font-black uppercase leading-tight tracking-tighter ${dok.isCuti ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {dok.nama_dokter}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-[0.2em] leading-none flex items-center gap-2 italic">
                      {dok.klinik} • <Clock size={12} className="text-blue-500" /> {dok.jam_praktik}
                    </p>

                    {!dok.isCuti ? (
                      <div className="mt-8 space-y-4">
                        <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                          <p className={`text-[8px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-1 leading-none italic transition-colors ${dok.asisten ? 'text-emerald-600 group-hover:text-emerald-100' : 'text-slate-400'}`}>
                            <UserCheck size={12} /> Asisten Hari Ini:
                          </p>
                          <p className={`text-sm font-black uppercase italic leading-none transition-colors ${dok.asisten ? 'text-slate-700 group-hover:text-white' : 'text-slate-400'}`}>
                            {dok.asisten || "Tdk Terjadwal"}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 hover:border-blue-200 transition-all">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-1 leading-none italic">
                            <Calendar size={12} className="text-blue-500" /> {hariEsokLabel} Mendatang:
                          </p>
                          <p className="text-xs font-black text-slate-500 uppercase italic leading-none">
                            {dok.asistenBesok || "---"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-8 p-10 bg-red-100/30 rounded-[2.5rem] text-center border border-dashed border-red-200">
                         <p className="text-[10px] font-black text-red-500 uppercase italic tracking-widest leading-none">Berhalangan Hadir</p>
                         <p className="text-[8px] font-bold text-red-400 mt-2 italic uppercase">Cek Master Cuti Dokter</p>
                      </div>
                    )}
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-32 text-center bg-white rounded-[4rem] border-4 border-dashed border-slate-100 uppercase transition-all hover:border-blue-100">
                   <Stethoscope size={60} className="mx-auto text-slate-100 mb-6 animate-pulse" />
                   <p className="text-sm font-black text-slate-300 tracking-[0.5em] italic">Tidak Ada Jadwal Dokter Hari Ini</p>
                </div>
              )}
            </div>
          </div>

          {/* --- KOLOM KANAN: MONITORING IZIN STAF & DOKTER --- */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-4">
               <div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div>
               <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin {daftarBulan[bulan-1]}</h3>
            </div>
            
            <div className="bg-white p-2 rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto p-4 space-y-4 custom-scrollbar">
                
                {/* --- MONITOR DOKTER CUTI (NEW) --- */}
                {data?.dokterCuti?.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2">● Sektor Dokter</p>
                    {data.dokterCuti.map((d, idx) => (
                      <div key={`doc-${idx}`} className="p-6 bg-red-50 rounded-[2rem] border-l-8 border-red-600 hover:bg-red-100 transition-all group shadow-sm border border-red-100">
                          <div className="flex justify-between items-center mb-3">
                            <p className="text-xs font-black text-red-800 uppercase leading-none tracking-tighter">{d.nama_dokter}</p>
                            <span className="text-[8px] font-black bg-red-600 text-white px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">{d.jenis_cuti}</span>
                          </div>
                          <p className="text-[10px] font-bold text-red-400 uppercase flex items-center gap-2 leading-none italic">
                            <Stethoscope size={12} className="text-red-500" /> {d.tgl_mulai} s/d {d.tgl_selesai}
                          </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* --- MONITOR SDM CUTI --- */}
                <div className="space-y-3 pt-4 border-t border-slate-50">
                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2">● Sektor Staf / Perawat</p>
                   {data?.sdmCuti?.length > 0 ? data.sdmCuti.map((s, idx) => (
                    <div key={`sdm-${idx}`} className="p-6 bg-slate-50 rounded-[2rem] border-l-8 border-amber-500 hover:bg-amber-100 hover:translate-x-2 transition-all group shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <p className="text-xs font-black text-slate-800 uppercase leading-none group-hover:text-amber-700 tracking-tighter">{s.nama_sdm}</p>
                          <span className="text-[8px] font-black bg-amber-500 text-white px-3 py-1.5 rounded-full uppercase tracking-widest leading-none shadow-sm shadow-amber-200">{s.jenis_cuti}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 leading-none italic">
                          <Clock size={12} className="text-amber-500" /> {s.tgl_mulai} <span className="text-[8px] text-slate-300 tracking-tighter">s/d</span> {s.tgl_selesai}
                        </p>
                    </div>
                  )) : (
                    <div className="py-24 text-center opacity-30 uppercase">
                       <UserCheck size={50} className="mx-auto mb-4 text-slate-200" />
                       <p className="text-[10px] font-black tracking-[0.3em] italic text-slate-400">Semua Staf Hadir</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* --- PANEL ENGINE --- */}
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

      <footer className="text-center pt-12 pb-6 opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.5em] italic">DAK-SYSTEMS INTELLIGENCE v.2.9 | RSUD MERAH PUTIH PRODUCTION</p>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  const colors = { 
    blue: "bg-blue-600 text-white shadow-blue-200", 
    emerald: "bg-emerald-600 text-white shadow-emerald-200", 
    indigo: "bg-slate-900 text-white shadow-slate-200" 
  };
  const bgSoft = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    indigo: "bg-slate-100"
  };

  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex items-center gap-6 transition-all hover:-translate-y-3 hover:shadow-2xl hover:border-blue-100 group">
      <div className={`p-6 rounded-[2rem] shadow-lg transition-all duration-500 group-hover:rotate-12 ${colors[color]}`}>
        {React.cloneElement(icon, { size: 30 })}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-3 italic">{label}</p>
        <p className="text-5xl font-black text-slate-900 tracking-tighter mb-2 leading-none group-hover:text-blue-600 transition-colors">{value || 0}</p>
        <div className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none italic ${bgSoft[color]} ${color === 'blue' ? 'text-blue-600' : color === 'emerald' ? 'text-emerald-600' : 'text-slate-500'}`}>
          {sub}
        </div>
      </div>
    </div>
  );
}