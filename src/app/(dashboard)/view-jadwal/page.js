"use client";
import React, { useState, useEffect } from "react";
import { format, getDaysInMonth } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Search, ClipboardList, Stethoscope, Clock, ChevronDown, Send, Cpu, 
  UserCheck, AlertCircle, Save, CheckCircle2, Activity, Edit3, Medal, XCircle
} from "lucide-react"; 
import { simpanCuti } from "../cuti-sdm/actions"; 

export default function ViewJadwalPublic() {
  const [data, setData] = useState(null);
  const [daftarSDM, setDaftarSDM] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // State Filter Waktu
  const [tanggal, setTanggal] = useState(new Date().getDate());
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inputPasien, setInputPasien] = useState({});

  // Sinkronisasi Sidebar & Main Content
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
      // 1. Ambil data Dashboard (Asisten, Pasien, & SEMUA DATA CUTI)
      const resDash = await fetch(`/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}`);
      const dDash = await resDash.json();
      
      // 2. Ambil Master SDM (Untuk Dropdown Nama)
      const resSDM = await fetch("/api/sdm");
      const dSDM = await resSDM.json();
      setDaftarSDM(Array.isArray(dSDM) ? dSDM : []);

      if (dDash) {
        setData(dDash);
        const savedValues = {};
        dDash.dokterPraktik?.forEach((dok, idx) => {
          if (dok.jumlah_pasien !== undefined) {
            savedValues[idx] = dok.jumlah_pasien;
          }
        });
        setInputPasien(savedValues);
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

  const handleUpdatePasien = async (sdmId, tglPilihan, jml, isEdit) => {
    if (jml === "" || jml < 0) return alert("Silakan isi jumlah pasien!");
    setSubmitting(true);
    try {
      const res = await fetch("/api/update-pasien", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdm_id: sdmId, tanggal: tglPilihan, bulan, tahun, jumlah: jml
        })
      });
      const result = await res.json();
      if (result.success) {
        alert(isEdit ? `🔄 Perubahan Disimpan: ${jml} Pasien!` : `✅ Berhasil Dicatat: ${jml} Pasien!`);
        fetchData();
      }
    } catch (e) { alert("❌ Kesalahan Koneksi Database."); } 
    finally { setSubmitting(false); }
  };

  const handleSimpanCutiForm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target);
    const res = await simpanCuti(formData);
    if (res.success) {
      alert("✅ Pengajuan Berhasil! Silakan cek monitor status izin di sebelah kanan.");
      e.target.reset();
      fetchData(); // Refresh otomatis agar data langsung muncul di monitor
    } else {
      alert("❌ Gagal: " + res.error);
    }
    setSubmitting(false);
  };

  const labelHariIni = format(new Date(), "eeee, dd MMMM yyyy", { locale: id });
  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const jumlahHari = getDaysInMonth(new Date(tahun, bulan - 1));
  const daftarHari = Array.from({ length: jumlahHari }, (_, i) => i + 1);
  const statusOff = ["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"];

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
      
      {/* --- HEADER --- */}
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
                  Polyclinic Resource Transparency v.3.8
                </p>
             </div>
          </div>
          <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-md text-center md:text-right shadow-inner">
            <p className="text-lg font-black uppercase text-white leading-none tracking-tighter">{labelHariIni}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 -mt-16 space-y-8">
        
        {/* --- FILTER CONTROL --- */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[3rem] shadow-2xl border border-white flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 flex items-center gap-4 bg-slate-100/50 px-8 py-5 rounded-[2rem] w-full border border-slate-100">
            <Search size={22} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari Dokter atau Petugas..." 
              className="bg-transparent border-none outline-none text-xs font-black w-full uppercase placeholder:text-slate-300 tracking-widest"
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-4 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none">
              <select value={tanggal} onChange={(e) => setTanggal(parseInt(e.target.value))} className="w-full appearance-none bg-emerald-600 text-white text-[11px] font-black px-12 py-5 rounded-2xl uppercase cursor-pointer pr-16 shadow-lg shadow-emerald-200">
                {daftarHari.map(d => <option key={d} value={d} className="text-slate-800">Tgl {d}</option>)}
              </select>
              <ChevronDown className="absolute right-6 top-5 text-white/50" size={18} />
            </div>
            <div className="relative flex-1 lg:flex-none">
              <select value={bulan} onChange={(e) => setBulan(parseInt(e.target.value))} className="w-full appearance-none bg-slate-900 text-white text-[11px] font-black px-12 py-5 rounded-2xl uppercase cursor-pointer pr-16 shadow-lg shadow-slate-200">
                {namaBulan.map((b, i) => <option key={i} value={i + 1} className="text-slate-800">{b}</option>)}
              </select>
              <ChevronDown className="absolute right-6 top-5 text-white/50" size={18} />
            </div>
          </div>
        </div>

        {/* --- GRID DOKTER & INPUT PASIEN --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {data?.dokterPraktik?.filter(d => d.nama_dokter.toLowerCase().includes(searchTerm.toLowerCase())).map((dok, idx) => {
            const savedValue = dok.jumlah_pasien || 0;
            const isEditMode = savedValue > 0;
            return (
              <div key={idx} className={`bg-white p-10 rounded-[4rem] border-2 transition-all shadow-xl relative overflow-hidden group ${dok.isCuti ? 'border-red-100 opacity-60 bg-red-50/20' : 'border-white hover:border-emerald-500 hover:-translate-y-2'}`}>
                <div className="flex justify-between items-start mb-8 relative z-10">
                  <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-sm shadow-xl ${dok.isCuti ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                    {dok.simbol_praktik}
                  </div>
                  {isEditMode && !dok.isCuti && (
                    <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-3 py-1.5 rounded-full uppercase italic border border-emerald-200 shadow-sm animate-pulse">
                      Verified: {savedValue}
                    </span>
                  )}
                </div>
                <h4 className="text-lg font-black text-slate-800 uppercase leading-tight italic tracking-tighter">{dok.nama_dokter}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">{dok.klinik} • {dok.jam_praktik}</p>
                {!dok.isCuti ? (
                  <div className="mt-10 space-y-5">
                    <div className={`p-8 rounded-[3rem] border-2 transition-all ${isEditMode ? 'bg-emerald-50 border-emerald-200 shadow-inner' : 'bg-slate-50 border-slate-100'}`}>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3 italic flex items-center gap-2">
                        <UserCheck size={14} /> Asisten Petugas:
                      </p>
                      <p className="text-sm font-black uppercase italic mb-8 leading-none text-slate-800">{dok.asisten || "---"}</p>
                      {dok.asisten && (
                        <div className="flex gap-3 items-end mt-4 border-t border-slate-200/40 pt-8">
                          <div className="flex-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block italic leading-none">
                              {isEditMode ? "Update" : "Input Pasien"}
                            </label>
                            <input 
                              type="number" 
                              className="w-full bg-white text-slate-900 border-2 border-slate-100 rounded-2xl px-5 py-4 text-xs font-black outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-inner"
                              value={inputPasien[idx] || ""}
                              onChange={(e) => setInputPasien({...inputPasien, [idx]: e.target.value})}
                            />
                          </div>
                          <button 
                            onClick={() => handleUpdatePasien(dok.sdm_id_asisten, tanggal, inputPasien[idx], isEditMode)}
                            className={`p-5 text-white rounded-2xl transition-all shadow-xl active:scale-95 border-2 border-white/20 ${isEditMode ? 'bg-blue-600' : 'bg-emerald-600'}`}
                          >
                            {isEditMode ? <Edit3 size={20} /> : <Save size={20} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-10 p-10 bg-red-50 rounded-[3rem] text-center border-2 border-dashed border-red-200">
                     <AlertCircle size={40} className="mx-auto text-red-300 mb-4" />
                     <p className="text-[11px] font-black text-red-600 uppercase italic tracking-widest">Dokter Izin / Berhalangan</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* --- BOTTOM SECTION: LEAVE FORM & MONITORING --- */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10 items-start">
            
            {/* COLUMN 1: FORM CUTI (PERBAIKAN KOLOM KEPERLUAN) */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 px-8">
                    <div className="w-2 h-6 bg-blue-600 rounded-full shadow-lg"></div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Permintaan Izin Staf</h3>
                </div>
                <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white">
                    <form onSubmit={handleSimpanCutiForm} className="space-y-6">
                        <div className="flex flex-col gap-2">
                           <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Pilih Nama Anda</label>
                           <select name="nama" required className="w-full bg-slate-50 border-none rounded-2xl px-6 py-5 text-xs font-black uppercase focus:ring-2 focus:ring-blue-500 shadow-inner cursor-pointer appearance-none">
                               <option value="">-- DAFTAR STAF SDM --</option>
                               {daftarSDM.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
                           </select>
                        </div>
                        
                        {/* PERBAIKAN: Layout Grid untuk mencegah kolom melompat */}
                        <div className="grid grid-cols-12 gap-3 items-center">
                           <div className="col-span-4">
                              <select name="jenis_cuti" className="w-full bg-slate-900 text-white rounded-2xl px-4 py-5 text-[10px] font-black uppercase shadow-xl outline-none">
                                  {statusOff.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                           </div>
                           <div className="col-span-8">
                              <input name="alasan" required className="w-full bg-slate-50 border-none rounded-2xl px-6 py-5 text-xs font-black uppercase focus:ring-2 focus:ring-blue-500 shadow-inner outline-none" placeholder="KEPERLUAN" />
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <input name="tgl_mulai" type="date" required className="w-full bg-slate-50 border-none rounded-2xl px-6 py-5 text-[10px] font-black shadow-inner" />
                            <input name="tgl_selesai" type="date" required className="w-full bg-slate-50 border-none rounded-2xl px-6 py-5 text-[10px] font-black shadow-inner" />
                        </div>
                        <button disabled={submitting} type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.4em] flex items-center justify-center gap-4 hover:bg-blue-600 transition-all shadow-2xl active:scale-95">
                            {submitting ? "PROSES..." : "KIRIM PERMINTAAN"}
                        </button>
                    </form>
                </div>
            </div>

            {/* COLUMN 2 & 3: LEADERBOARD BEBAN KERJA */}
            <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center gap-3 px-8">
                    <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Leaderboard Beban Kerja</h3>
                </div>
                <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[9px] font-black uppercase italic tracking-widest">
                                <th className="p-6">Staf Pelaksana</th>
                                <th className="p-6 text-center">Jml Pasien</th>
                                <th className="p-6 text-center">Status Data</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-bold uppercase tracking-tighter">
                            {data?.dokterPraktik?.filter(d => d.asisten !== "---" && d.asisten?.toLowerCase() !== 'admin').map((d, i) => (
                                <tr key={i} className="border-b border-slate-50 hover:bg-emerald-50/30 transition-all">
                                    <td className="p-6">
                                      <p className="text-slate-800 leading-none font-black">{d.asisten}</p>
                                      <p className="text-[8px] text-slate-400 mt-2 italic">Klinik: {d.klinik}</p>
                                    </td>
                                    <td className="p-6 text-center font-black text-sm">
                                        <span className={`px-4 py-2 rounded-xl ${d.jumlah_pasien > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                            {d.jumlah_pasien || 0}
                                        </span>
                                    </td>
                                    <td className="p-6 text-center">
                                        {d.jumlah_pasien > 0 ? (
                                            <span className="text-emerald-500 text-[8px] font-black tracking-widest flex items-center justify-center gap-2 italic"><CheckCircle2 size={12}/> VERIFIED</span>
                                        ) : (
                                            <span className="text-red-400 text-[8px] font-black tracking-widest flex items-center justify-center gap-2 animate-pulse italic"><AlertCircle size={12}/> PENDING</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* COLUMN 4: MONITOR IZIN (MENAMPILKAN SEMUA STATUS) */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 px-8">
                    <div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Progress Izin</h3>
                </div>
                <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                    {/* MENAMPILKAN SEMUA DATA CUTI DARI API */}
                    {data?.sdmCuti?.map((s, i) => (
                      <div key={`s-${i}`} className={`p-6 rounded-[2.5rem] border-l-8 flex justify-between items-center shadow-lg border transition-all ${s.status_acc === 'Disetujui' ? 'bg-white border-emerald-100 border-l-emerald-500' : s.status_acc === 'Ditolak' ? 'bg-red-50 border-red-100 border-l-red-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                          <div className="max-w-[150px]">
                            <h4 className="text-xs font-black text-slate-800 uppercase leading-none mb-2 truncate">{s.nama_sdm}</h4>
                            <p className="text-[8px] font-bold text-slate-400 uppercase italic leading-none">{s.tgl_mulai} - {s.tgl_selesai}</p>
                            <p className={`text-[7px] font-black uppercase italic mt-2 ${s.status_acc === 'Disetujui' ? 'text-emerald-600' : s.status_acc === 'Ditolak' ? 'text-red-600' : 'text-amber-600'}`}>
                              [{s.status_acc || 'MENUNGGU'}]
                            </p>
                          </div>
                          {s.status_acc === 'Disetujui' ? <CheckCircle2 size={16} className="text-emerald-500" /> : s.status_acc === 'Ditolak' ? <XCircle size={16} className="text-red-500" /> : <Clock size={16} className="text-amber-500 animate-spin-slow" />}
                      </div>
                    ))}
                    {/* Izin Dokter */}
                    {data?.dokterCuti?.map((d, i) => (
                      <div key={`d-${i}`} className="bg-red-50 p-6 rounded-[2.5rem] border-l-8 border-red-600 flex justify-between items-center shadow-lg border border-red-100">
                          <div>
                            <h4 className="text-xs font-black text-red-900 uppercase leading-none mb-2 truncate">{d.nama_dokter}</h4>
                            <p className="text-[8px] font-bold text-red-400 uppercase italic leading-none">{d.tgl_mulai} - {d.tgl_selesai}</p>
                          </div>
                          <span className="text-[8px] font-black bg-red-600 text-white px-2 py-1 rounded-full uppercase italic leading-none">DOKTER</span>
                      </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
      
      <footer className="text-center py-12 opacity-30">
          <p className="text-[8px] font-black uppercase tracking-[0.6em] italic text-slate-900">DAK-SYSTEMS TRANSPARENCY v.3.8 | RSUD MERAH PUTIH MAGELANG</p>
      </footer>
    </div>
  );
}