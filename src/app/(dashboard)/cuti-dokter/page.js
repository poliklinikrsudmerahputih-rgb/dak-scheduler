"use client";
import React, { useState, useEffect, useRef } from "react";
import { simpanCutiDokter, hapusCutiDokter } from "./actions";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Stethoscope, MessageCircle, Trash2, Clock, 
  Calendar, Edit3, X, Save, AlertCircle, ChevronRight, ShieldCheck 
} from "lucide-react";

export default function CutiDokter() {
  const [daftarDokterMaster, setDaftarDokterMaster] = useState([]);
  const [dataCuti, setDataCuti] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isEdit, setIsEdit] = useState(false);
  const formRef = useRef(null);
  const [formData, setFormData] = useState({
    id: "", nama: "", jenis_cuti: "CT", tgl_mulai: "", tgl_selesai: "", simbol: ""
  });

  const refreshData = async () => {
    setLoading(true);
    try {
      const [resDkt, resCuti] = await Promise.all([
        fetch("/api/dokter"),
        fetch("/api/cuti-dokter")
      ]);
      const dDkt = await resDkt.json();
      const dCuti = await resCuti.json();
      
      if (Array.isArray(dDkt)) {
        const unik = [...new Set(dDkt.map(d => d.nama_dokter))];
        setDaftarDokterMaster(unik);
      }
      setDataCuti(Array.isArray(dCuti) ? dCuti : []);
    } catch (e) { 
      console.error("Gagal sinkronisasi data:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { 
    refreshData(); 
  }, []);

  const handleEdit = (item) => {
    setIsEdit(true);
    setFormData({
      id: item.id,
      nama: item.nama_dokter,
      jenis_cuti: item.jenis_cuti,
      tgl_mulai: item.tgl_mulai,
      tgl_selesai: item.tgl_selesai,
      simbol: item.simbol || ""
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setIsEdit(false);
    setFormData({ id: "", nama: "", jenis_cuti: "CT", tgl_mulai: "", tgl_selesai: "", simbol: "" });
    formRef.current?.reset();
  };

  return (
    <div className="max-w-[1400px] mx-auto p-2 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-700 pb-20 font-sans">
      
      {/* --- SECTION 1: FORM INPUT / EDIT --- */}
      <div className={`rounded-[2.5rem] shadow-2xl border-2 transition-all duration-500 overflow-hidden ${isEdit ? 'bg-amber-50 border-amber-300' : 'bg-white border-white'}`}>
        <div className="p-6 md:p-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl shadow-lg transition-transform hover:scale-105 ${isEdit ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                {isEdit ? <Edit3 className="text-white" size={24} /> : <Stethoscope className="text-white" size={24} />}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">
                  {isEdit ? 'Edit Izin Dokter' : 'Izin Praktik Dokter'}
                </h1>
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-[0.2em] mt-2 italic flex items-center gap-1">
                   <ShieldCheck size={12} /> DAK-SCHEDULER PRO
                </p>
              </div>
            </div>
            {isEdit && (
              <button onClick={resetForm} className="flex items-center gap-2 bg-white text-amber-600 px-6 py-2 rounded-xl border-2 border-amber-200 font-black text-[10px] hover:bg-amber-100 transition-all shadow-sm uppercase">
                <X size={14} /> Batal Perubahan
              </button>
            )}
          </div>

          <form 
            ref={formRef}
            action={async (fd) => {
              const res = await simpanCutiDokter(fd);
              if(res.success) { 
                alert(isEdit ? "✅ Database Updated!" : "✅ Izin Dokter Berhasil Disimpan!"); 
                resetForm();
                refreshData(); 
              } else { 
                alert("❌ Gagal: " + res.error); 
              }
            }} 
            className="space-y-6"
          >
            <input type="hidden" name="id" value={formData.id} />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Nama Dokter</label>
                <select name="nama" value={formData.nama} onChange={(e) => setFormData({...formData, nama: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer" required>
                  <option value="">-- Pilih Dokter --</option>
                  {daftarDokterMaster.map(nama => <option key={nama} value={nama} className="text-slate-800">{nama}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Simbol Praktik</label>
                <input 
                  name="simbol" 
                  value={formData.simbol} 
                  onChange={(e) => setFormData({...formData, simbol: e.target.value.toUpperCase()})} 
                  placeholder="Contoh: MATA-1"
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-black text-amber-700 uppercase font-mono focus:ring-2 focus:ring-amber-500 transition-all" 
                  required 
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Kategori Berhalangan</label>
                <select name="jenis_cuti" value={formData.jenis_cuti} onChange={(e) => setFormData({...formData, jenis_cuti: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer">
                  <option value="CT">Cuti Tahunan (CT)</option>
                  <option value="CS">Sakit (CS)</option>
                  <option value="DL">Dinas Luar (DL)</option>
                  <option value="CM">Melahirkan (CM)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-50">
              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Periode Tanggal (Mulai s/d Selesai)</label>
                <div className="grid grid-cols-2 gap-4">
                  <input type="date" name="tgl_mulai" value={formData.tgl_mulai} onChange={(e) => setFormData({...formData, tgl_mulai: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all" required />
                  <input type="date" name="tgl_selesai" value={formData.tgl_selesai} onChange={(e) => setFormData({...formData, tgl_selesai: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold focus:ring-2 focus:ring-emerald-500 transition-all" required />
                </div>
              </div>

              <div className="flex items-end">
                <button type="submit" className={`w-full text-white font-black py-4 rounded-2xl shadow-xl transition-all uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 ${isEdit ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-slate-900 hover:bg-emerald-600 shadow-emerald-900/10'}`}>
                  {isEdit ? <Save size={16} /> : <ChevronRight size={16} />}
                  {isEdit ? 'Perbarui Data' : 'Simpan Izin'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* --- SECTION 2: TABEL RIWAYAT (Scrollable) --- */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 transition-all">
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Clock className="text-emerald-400" size={20} />
            </div>
            <div>
              <h2 className="font-black uppercase tracking-widest text-xs leading-none italic text-emerald-400">Monitor Dokter Berhalangan</h2>
            </div>
          </div>
          {loading && <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Live-Sync</span>
          </div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b tracking-[0.2em]">
                <th className="p-6 text-center w-20">No</th>
                <th className="p-6 sticky left-0 bg-slate-50 z-10 border-r border-slate-100">Informasi Dokter</th>
                <th className="p-6 text-center">Simbol</th>
                <th className="p-6">Rentang Waktu</th>
                <th className="p-6 text-center">Aksi Manajemen</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-50 uppercase font-bold">
              {dataCuti.length > 0 ? (
                dataCuti.map((c, i) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-all group">
                    <td className="p-6 text-center font-black text-slate-300 group-hover:text-emerald-500 transition-colors">{String(i + 1).padStart(2, '0')}</td>
                    <td className="p-6 sticky left-0 bg-white z-10 group-hover:bg-slate-50 shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                      <div className="font-black text-slate-800 tracking-tight text-sm leading-none">{c.nama_dokter}</div>
                      <div className="mt-3 flex gap-2">
                        <span className={`text-[8px] px-2 py-1 rounded-full font-black border tracking-widest ${
                          c.jenis_cuti === 'CS' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                          c.jenis_cuti === 'DL' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {c.jenis_cuti}
                        </span>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <span className="inline-block bg-white px-4 py-2 rounded-2xl font-mono font-black border-2 border-slate-100 text-xs text-amber-700 shadow-inner group-hover:scale-110 transition-transform">
                        {c.simbol || '-'}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2 font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl w-fit text-[9px] border border-emerald-100">
                        <Calendar size={12} className="text-emerald-600" /> 
                        {format(new Date(c.tgl_mulai), 'dd MMM yyyy')} 
                        <span className="text-emerald-300 mx-1">→</span>
                        {format(new Date(c.tgl_selesai), 'dd MMM yyyy')}
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <div className="flex justify-center gap-3">
                        <button 
                          onClick={() => window.open(`https://wa.me/${c.no_wa}?text=Halo Dokter, konfirmasi ijin/cuti tercatat tanggal ${c.tgl_mulai} s/d ${c.tgl_selesai}.`)} 
                          className="p-3.5 bg-slate-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" 
                          title="WhatsApp"
                        >
                          <MessageCircle size={18} />
                        </button>
                        <button 
                          onClick={() => handleEdit(c)} 
                          className="p-3.5 bg-slate-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" 
                          title="Edit"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button 
                          onClick={async () => { if(confirm("Hapus data izin dokter ini?")) { await hapusCutiDokter(c.id); refreshData(); } }} 
                          className="p-3.5 bg-slate-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm" 
                          title="Hapus"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-24 text-center opacity-30">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle size={40} className="text-slate-300" />
                      <p className="text-slate-500 font-black uppercase tracking-[0.5em] text-[10px]">Data Belum Tersedia</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- FOOTER BRANDING --- */}
      <footer className="text-center pt-8 opacity-20 print:hidden">
         <p className="text-[8px] font-black uppercase tracking-[0.5em]">DAK-DOCTOR LEAVE v.2.5 | Daniel Ari Kristianto Production</p>
      </footer>
    </div>
  );
}