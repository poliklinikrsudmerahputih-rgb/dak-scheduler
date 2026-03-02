"use client";
import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Users, Calendar, UserMinus, ShieldCheck, 
  Search, Info, ClipboardList, Stethoscope, Clock, ChevronDown, Send, Cpu
} from "lucide-react";
import { simpanCuti } from "../cuti-sdm/actions";

export default function ViewJadwalPublic() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?bulan=${bulan}&tahun=${tahun}`);
      const d = await res.json();
      setData(d);
    } catch (e) { console.error("Gagal ambil data:", e); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDashboard();
  }, [bulan, tahun]);

  async function handleSimpanCuti(formData) {
    setSubmitting(true);
    const res = await simpanCuti(formData);
    if (res.success) {
      alert("✅ Pengajuan berhasil! Menunggu verifikasi Daniel Ari Kristianto.");
      fetchDashboard();
    } else {
      alert("❌ Gagal: " + res.error);
    }
    setSubmitting(false);
  }

  const hariIni = format(new Date(), "eeee, dd MMMM yyyy", { locale: id });
  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  const filteredPerawat = data?.perawatDinas?.filter(p => 
    p.nama.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[10px]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p>Syncing DAK-Monitoring...</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-50 font-sans z-[9999] pb-20">
      
      {/* --- HEADER PREMIUM --- */}
      <div className="bg-slate-900 text-white p-6 md:p-12 rounded-b-[3.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5"><Cpu size={200} /></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
             <div className="p-4 bg-blue-600 rounded-3xl shadow-xl">
                <ClipboardList size={32} className="text-white" />
             </div>
             <div>
                <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase leading-none italic">
                  DAK-<span className="text-blue-500">MONITORING</span>
                </h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2 italic">
                  Developed by Daniel Ari Kristianto
                </p>
             </div>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md text-center md:text-right">
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Live System</p>
            <p className="text-sm font-black uppercase text-white">{hariIni}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 -mt-12 space-y-8">
        
        {/* --- SEARCH & FILTER --- */}
        <div className="bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-[2.5rem] shadow-2xl border border-white flex flex-col lg:flex-row gap-4 items-center">
          <div className="flex-1 flex items-center gap-4 bg-slate-100/50 px-6 py-4 rounded-3xl w-full border border-slate-100">
            <Search size={20} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari Nama Staf..." 
              className="bg-transparent border-none outline-none text-sm font-black w-full uppercase placeholder:text-slate-300"
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-3 w-full lg:w-auto">
            <select value={bulan} onChange={(e) => setBulan(e.target.value)} className="flex-1 lg:flex-none bg-slate-900 text-white text-[10px] font-black px-8 py-4 rounded-3xl uppercase cursor-pointer">
              {namaBulan.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* --- KOLOM: FORM PERMINTAAN CUTI --- */}
            <div className="space-y-6 lg:sticky lg:top-8">
                <div className="flex items-center gap-3 px-4">
                    <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic">Form Cuti Staf</h3>
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                    <form action={handleSimpanCuti} className="space-y-5">
                        <input name="nama" required className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500" placeholder="NAMA LENGKAP" />
                        <div className="grid grid-cols-2 gap-4">
                            <select name="jenis_cuti" className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-[10px] font-black uppercase focus:ring-2 focus:ring-blue-500">
                                <option>Tahunan</option>
                                <option>Sakit</option>
                                <option>Penting</option>
                            </select>
                            <input name="alasan" required className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500" placeholder="ALASAN" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <input name="tgl_mulai" type="date" required className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-[10px] font-bold" />
                            <input name="tgl_selesai" type="date" required className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-[10px] font-bold" />
                        </div>
                        <button 
                            disabled={submitting}
                            type="submit" 
                            className="w-full bg-slate-900 text-white py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                        >
                            {submitting ? "PROSES..." : <><Send size={14} /> KIRIM PENGAJUAN</>}
                        </button>
                    </form>
                </div>
            </div>

            {/* --- KOLOM: DAFTAR KEHADIRAN --- */}
            <div className="lg:col-span-1 space-y-6">
                <div className="flex items-center gap-3 px-4">
                    <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic">Kehadiran Staf</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 max-h-[1000px] overflow-y-auto pr-2 custom-scrollbar">
                    {filteredPerawat.map((p, idx) => (
                    <div key={idx} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group transition-all hover:bg-blue-50">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs ${["L","CT","CS"].includes(p.simbol) ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                                {p.simbol}
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-800 uppercase leading-none">{p.nama}</p>
                                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tighter">Tanggal {p.tanggal}</p>
                            </div>
                        </div>
                    </div>
                    ))}
                </div>
            </div>

            {/* --- KOLOM: MONITOR IZIN & DOKTER --- */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 px-4">
                    <div className="w-2 h-6 bg-amber-500 rounded-full"></div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic">Monitor Cuti</h3>
                </div>
                <div className="space-y-4">
                    {data?.sdmCuti?.length > 0 ? data.sdmCuti.map(s => (
                    <div key={s.id} className="bg-white p-6 rounded-[2rem] shadow-lg border-l-8 border-amber-500">
                        <h4 className="text-sm font-black text-slate-800 uppercase leading-tight">{s.nama_sdm}</h4>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[8px] font-black bg-amber-50 text-amber-600 px-2 py-1 rounded uppercase">{s.jenis_cuti}</span>
                          <p className="text-[9px] font-bold text-slate-400 uppercase italic">{s.tgl_mulai} - {s.tgl_selesai}</p>
                        </div>
                    </div>
                    )) : (
                    <div className="p-10 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100 opacity-50">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Tidak ada staf cuti</p>
                    </div>
                    )}

                    <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                        <Stethoscope className="absolute -right-4 -bottom-4 text-white/5 transition-transform group-hover:scale-110 duration-700" size={150} />
                        <h3 className="text-xs font-black text-emerald-400 uppercase mb-6 tracking-[0.3em] italic">Dokter Hari Ini</h3>
                        <div className="space-y-5 relative z-10">
                          {data?.dokterPraktik?.map((dok, i) => (
                            <div key={i} className="border-b border-white/10 pb-4 last:border-0">
                                <p className="text-xs font-black uppercase tracking-tight">{dok.nama_dokter}</p>
                                <p className="text-[9px] font-bold text-slate-500 uppercase mt-1 italic">{dok.klinik} • {dok.jam_praktik}</p>
                            </div>
                          ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* --- FOOTER --- */}
        <div className="py-12 text-center">
            <div className="inline-flex flex-col items-center gap-2">
               <div className="bg-white px-8 py-3 rounded-full text-slate-400 shadow-sm border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] italic leading-none">
                    DAK-SYSTEMS v.2.5 | Daniel Ari Kristianto
                  </p>
               </div>
            </div>
        </div>
      </div>
    </div>
  );
}