"use client";
import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { 
  Users, Stethoscope, Share2, ChevronDown, ShieldCheck, 
  Activity, UserCheck, Clock, AlertCircle, Cpu
} from "lucide-react";

export default function DashboardUtama() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());

  const fetchDashboard = () => {
    setLoading(true);
    fetch(`/api/dashboard?bulan=${bulan}&tahun=${tahun}`)
      .then((res) => {
        // Proteksi jika session habis
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        return res.json();
      })
      .then((d) => {
        if (d) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Gagal load dashboard:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, [bulan, tahun]);

  const shareLink = () => {
    const link = window.location.origin + "/view-jadwal";
    navigator.clipboard.writeText(link);
    alert("✅ Link Monitoring Online Berhasil Disalin!");
  };

  const hariIni = format(new Date(), "eeee, dd MMMM yyyy", { locale: id });
  const daftarBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-black text-slate-400 uppercase text-[10px] animate-pulse">
      Menghubungkan ke DAK-Database...
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-8 bg-slate-50 min-h-screen pb-20 font-sans">
      
      {/* --- HEADER PREMIUM (TANPA TOMBOL LOGOUT) --- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900 p-8 md:p-12 rounded-[3rem] shadow-2xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5">
          <Cpu size={200} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 text-blue-400">
            <ShieldCheck size={18}/>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic leading-none">Intelligence Scheduling System</p>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none italic">
            DAK-<span className="text-blue-500">SCHEDULER</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 mt-6 flex items-center gap-2 uppercase tracking-widest leading-none">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Lead Developer: Daniel Ari Kristianto
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto relative z-10">
          {/* TOMBOL LOGOUT DI SINI SUDAH DIHAPUS SESUAI PERINTAH */}
          <div className="relative flex-1 lg:flex-none">
            <select 
              value={bulan} 
              onChange={(e) => setBulan(parseInt(e.target.value))}
              className="appearance-none bg-white/10 border border-white/20 rounded-2xl px-8 py-4 pr-14 text-xs font-black uppercase text-white outline-none focus:ring-2 focus:ring-blue-500 w-full lg:w-56 cursor-pointer"
            >
              {daftarBulan.map((nama, idx) => (
                <option key={idx} value={idx + 1} className="text-slate-800">{nama}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-5 top-4 text-white/50" size={18} />
          </div>
          <button onClick={shareLink} className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95 w-full lg:w-auto">
            <Share2 size={16} /> Share Online
          </button>
        </div>
      </div>

      {/* --- STATS GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard icon={<Users />} label="Personil Aktif" value={data?.summary?.totalSDM} color="blue" sub="Staf Terdaftar" />
        <StatCard icon={<Stethoscope />} label="Dokter Spesialis" value={data?.summary?.totalDokter} color="indigo" sub="Jadwal Praktik" />
        <StatCard icon={<Activity />} label="Dinas Hari Ini" value={data?.summary?.perawatMasuk} color="emerald" sub={hariIni} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3 px-4">
               <div className="w-2 h-6 bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]"></div>
               <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Tim Pelayanan Poli Hari Ini</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data?.dokterPraktik?.length > 0 ? data.dokterPraktik.map((dok, idx) => (
                <div key={idx} className={`bg-white p-8 rounded-[2.5rem] border transition-all hover:shadow-2xl group relative overflow-hidden ${dok.isCuti ? 'border-red-100 bg-red-50/30' : 'border-slate-100 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xs shadow-lg ${dok.isCuti ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                      {dok.simbol_praktik}
                    </div>
                    {dok.isCuti && (
                      <span className="flex items-center gap-1 bg-red-600 text-white text-[8px] font-black px-3 py-1.5 rounded-xl uppercase animate-pulse leading-none">
                         <AlertCircle size={10} /> Berhalangan
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-black text-slate-800 uppercase leading-tight tracking-tighter">{dok.nama_dokter}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest leading-none">{dok.klinik} • {dok.jam_praktik}</p>

                  {!dok.isCuti ? (
                    <div className="mt-8 space-y-4">
                      <div className="bg-emerald-50 p-5 rounded-[1.8rem] border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1 leading-none italic">
                          <UserCheck size={10} /> Asisten Hari Ini:
                        </p>
                        <p className="text-xs font-black text-slate-700 uppercase italic leading-none">{dok.asisten || "---"}</p>
                      </div>
                      <div className="bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1 leading-none italic">
                          <Clock size={10} /> Prediksi Besok:
                        </p>
                        <p className="text-[11px] font-bold text-slate-500 uppercase italic leading-none">{dok.asistenBesok || "Cek Jadwal..."}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 p-6 bg-red-100/50 rounded-[1.8rem] text-center border border-red-100">
                       <p className="text-[10px] font-black text-red-600 uppercase italic tracking-tighter leading-none">Izin/Berhalangan Praktik</p>
                    </div>
                  )}
                </div>
              )) : (
                <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200 uppercase">
                   <Stethoscope size={48} className="mx-auto text-slate-100 mb-4" />
                   <p className="text-xs font-black text-slate-300 tracking-[0.4em]">Jadwal Belum Terdeteksi</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 px-4">
               <div className="w-2 h-6 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
               <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin Staf</h3>
            </div>
            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4 max-h-[700px] overflow-y-auto custom-scrollbar">
              {data?.sdmCuti?.length > 0 ? data.sdmCuti.map((s, idx) => (
                <div key={idx} className="p-5 bg-slate-50 rounded-2xl border-l-8 border-amber-500 hover:bg-amber-50 transition-all group">
                   <div className="flex justify-between items-start mb-2">
                      <p className="text-xs font-black text-slate-800 uppercase leading-none group-hover:text-amber-700">{s.nama_sdm}</p>
                      <span className="text-[8px] font-black bg-amber-100 text-amber-600 px-2 py-1 rounded uppercase tracking-tighter leading-none">{s.jenis_cuti}</span>
                   </div>
                   <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1 leading-none italic">
                      <Clock size={12} /> {s.tgl_mulai} s/d {s.tgl_selesai}
                   </p>
                </div>
              )) : (
                <div className="py-20 text-center opacity-20 uppercase">
                   <UserCheck size={48} className="mx-auto mb-2 text-slate-300" />
                   <p className="text-[10px] font-black tracking-widest italic text-slate-400">Semua Staf Standby</p>
                </div>
              )}
            </div>

            <div className="p-8 bg-gradient-to-br from-slate-900 to-blue-900 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
               <Cpu className="absolute -right-4 -bottom-4 text-white/10 group-hover:scale-110 transition-transform duration-700" size={120} />
               <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em] mb-4 italic leading-none">Core Engine</p>
               <p className="text-xs font-medium text-slate-300 leading-relaxed mb-8">
                 Sistem ini dikelola secara cerdas menggunakan database <span className="text-white font-bold uppercase">Turso</span> dan <span className="text-white font-bold uppercase">Next.js</span> untuk pelayanan presisi.
               </p>
               <div className="flex items-center gap-4 pt-6 border-t border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-xs">DAK</div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Daniel Ari K.</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase italic leading-none">Senior Developer</p>
                  </div>
               </div>
            </div>
          </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  const colors = { 
    blue: "bg-blue-50 text-blue-600 shadow-blue-100", 
    emerald: "bg-emerald-50 text-emerald-600 shadow-emerald-100", 
    indigo: "bg-indigo-50 text-indigo-600 shadow-indigo-100" 
  };
  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-50 flex items-center gap-6 transition-all hover:-translate-y-2 hover:shadow-2xl group">
      <div className={`p-6 rounded-3xl shadow-inner transition-transform group-hover:scale-110 ${colors[color]}`}>
        {React.cloneElement(icon, { size: 35 })}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-3 italic">{label}</p>
        <p className="text-4xl font-black text-slate-900 tracking-tighter mb-2 leading-none">{value || 0}</p>
        <p className="text-[9px] font-bold text-slate-400 italic tracking-tighter uppercase leading-none">{sub}</p>
      </div>
    </div>
  );
}