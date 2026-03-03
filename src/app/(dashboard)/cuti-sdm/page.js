"use client";
import React, { useState, useEffect, useRef } from "react";
import { simpanCuti, updateStatusCuti, hapusCuti } from "./actions";
import { format } from "date-fns"; 
import { 
  PlaneTakeoff, MessageCircle, CheckCircle, XCircle, Clock, 
  Calendar, AlertCircle, Edit3, Trash2, X, Save, ChevronRight, ShieldCheck 
} from "lucide-react";

export default function CutiSDM() {
  const [daftarSDM, setDaftarSDM] = useState([]);
  const [dataCuti, setDataCuti] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [errorDb, setErrorDb] = useState(false);

  // State untuk Fitur Edit
  const [isEdit, setIsEdit] = useState(false);
  const formRef = useRef(null);
  const [formData, setFormData] = useState({
    id: "", nama: "", jenis_cuti: "CT", tgl_mulai: "", tgl_selesai: "", alasan: ""
  });

  const statusOff = ["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"];

  const refreshData = async () => {
    setLoading(true);
    try {
      const resSDM = await fetch("/api/sdm");
      const dSDM = await resSDM.json();
      setDaftarSDM(Array.isArray(dSDM) ? dSDM : []);

      const resCuti = await fetch("/api/cuti-sdm");
      const dCuti = await resCuti.json();
      
      if (Array.isArray(dCuti)) {
        setDataCuti(dCuti);
        setErrorDb(false);
      } else {
        setDataCuti([]);
        setErrorDb(true);
      }
    } catch (error) {
      console.error("Gagal mengambil data:", error);
      setErrorDb(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshData(); }, []);

  const handleEdit = (item) => {
    setIsEdit(true);
    setFormData({
      id: item.id,
      nama: item.nama_sdm,
      jenis_cuti: item.jenis_cuti,
      tgl_mulai: item.tgl_mulai,
      tgl_selesai: item.tgl_selesai,
      alasan: item.alasan
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setIsEdit(false);
    setFormData({ id: "", nama: "", jenis_cuti: "CT", tgl_mulai: "", tgl_selesai: "", alasan: "" });
    formRef.current?.reset();
  };

  const handleKirimWA = (no_wa, nama, tgl, alasan) => {
    if (!no_wa) {
      alert("Nomor WA tidak ditemukan!");
      return;
    }
    const pesan = `Halo ${nama}, Mengenai permintaan cuti Anda tanggal ${tgl} ("${alasan}"). Apakah keperluan ini sangat mendesak? Mohon konfirmasi kembali.`;
    window.open(`https://wa.me/${no_wa}?text=${encodeURIComponent(pesan)}`, "_blank");
  };

  return (
    <div className="max-w-[1400px] mx-auto p-2 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-700 pb-20">
      
      {errorDb && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-2xl flex items-center gap-3 shadow-md mx-2">
          <AlertCircle className="text-red-600 flex-shrink-0" />
          <p className="text-red-800 text-[10px] font-black uppercase">Database Offline / Tabel Cuti Tidak Ditemukan</p>
        </div>
      )}

      {/* --- SECTION 1: FORM INPUT / EDIT --- */}
      <div className={`rounded-[2.5rem] shadow-2xl border-2 transition-all duration-500 overflow-hidden ${isEdit ? 'bg-amber-50 border-amber-300' : 'bg-white border-white'}`}>
        <div className="p-6 md:p-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl shadow-lg transition-transform hover:scale-105 ${isEdit ? 'bg-amber-600' : 'bg-slate-900'}`}>
                {isEdit ? <Edit3 className="text-white" size={24} /> : <PlaneTakeoff className="text-white" size={24} />}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">
                  {isEdit ? 'Edit Pengajuan' : 'Manajemen Cuti Staf'}
                </h1>
                <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.2em] mt-2 italic flex items-center gap-1">
                   <ShieldCheck size={12} /> DAK-SYSTEMS PRO
                </p>
              </div>
            </div>
            {isEdit && (
              <button onClick={resetForm} className="flex items-center gap-2 bg-white text-amber-600 px-6 py-2 rounded-xl border-2 border-amber-200 font-black text-[10px] hover:bg-amber-100 transition-all shadow-sm uppercase">
                <X size={14} /> Batal Edit
              </button>
            )}
          </div>

          <form 
            ref={formRef}
            action={async (fd) => {
              const res = await simpanCuti(fd);
              if(res.success) { 
                alert(isEdit ? "✅ Data Berhasil Diperbarui!" : "✅ Pengajuan Berhasil Terkirim!"); 
                resetForm();
                refreshData(); 
              } else { alert("❌ Gagal: " + res.error); }
            }} 
            className="space-y-6"
          >
            <input type="hidden" name="id" value={formData.id} />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Nama Pegawai</label>
                <select name="nama" value={formData.nama} onChange={(e) => setFormData({...formData, nama: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer" required>
                  <option value="">-- Pilih Staf --</option>
                  {daftarSDM.map(s => <option key={s.id} value={s.nama} className="text-slate-800">{s.nama} ({s.jabatan})</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Jenis Off / Izin</label>
                <select name="jenis_cuti" value={formData.jenis_cuti} onChange={(e) => setFormData({...formData, jenis_cuti: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer" required>
                  {statusOff.map(o => <option key={o} value={o} className="text-slate-800">{o}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Alasan Keperluan</label>
                <input name="alasan" value={formData.alasan} onChange={(e) => setFormData({...formData, alasan: e.target.value})} placeholder="Ketik alasan singkat..." className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 transition-all" required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-50">
              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Periode Izin (Mulai s/d Selesai)</label>
                <div className="grid grid-cols-2 gap-4">
                  <input type="date" name="tgl_mulai" value={formData.tgl_mulai} onChange={(e) => setFormData({...formData, tgl_mulai: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold focus:ring-2 focus:ring-blue-500 transition-all" required />
                  <input type="date" name="tgl_selesai" value={formData.tgl_selesai} onChange={(e) => setFormData({...formData, tgl_selesai: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold focus:ring-2 focus:ring-blue-500 transition-all" required />
                </div>
              </div>

              <div className="flex items-end">
                <button type="submit" className={`w-full text-white font-black py-4 rounded-2xl shadow-xl transition-all uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 ${isEdit ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-slate-900 hover:bg-blue-600 shadow-blue-900/20'}`}>
                  {isEdit ? <Save size={16} /> : <ChevronRight size={16} />}
                  {isEdit ? 'Perbarui Data' : 'Kirim Pengajuan'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* --- SECTION 2: TABLE OUTPUT (Scrollable) --- */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Clock className="text-blue-400" size={20} />
            <h2 className="font-black uppercase tracking-widest text-xs leading-none italic">Log Monitoring Pengajuan</h2>
          </div>
          {loading && <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></div>
            <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em]">Live-Sync</span>
          </div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b tracking-[0.2em]">
                <th className="p-6 text-center w-20">No</th>
                <th className="p-6 sticky left-0 bg-slate-50 z-10 border-r border-slate-100">Informasi Pegawai</th>
                <th className="p-6">Periode & Alasan</th>
                <th className="p-6 text-center">Status ACC</th>
                <th className="p-6 text-center">Aksi Manajemen</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-50 uppercase font-bold">
              {dataCuti.length > 0 ? (
                dataCuti.map((c, i) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-all group">
                    <td className="p-6 text-center font-black text-slate-300 group-hover:text-blue-500 transition-colors">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="p-6 sticky left-0 bg-white z-10 group-hover:bg-slate-50 shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                      <div className="font-black text-slate-800 tracking-tight text-sm">{c.nama_sdm}</div>
                      <div className="text-[8px] text-slate-400 font-mono italic mt-1 font-normal lowercase tracking-tighter">
                        Log: {c.tanggal_input ? format(new Date(c.tanggal_input), 'dd/MM/yy HH:mm') : '-'}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl w-fit text-[9px] border border-blue-100">
                          <Calendar size={12} /> {c.tgl_mulai} <span className="text-slate-300">s/d</span> {c.tgl_selesai}
                        </div>
                        <p className="text-[10px] text-slate-500 px-1 italic leading-tight">"{c.alasan}"</p>
                        <span className="text-[8px] font-black text-red-500 tracking-widest bg-red-50 w-fit px-2 rounded-md italic">KAT: {c.jenis_cuti}</span>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                        {c.status_acc === "Menunggu" ? (
                          <div className="flex gap-2 justify-center">
                            <button onClick={async () => { await updateStatusCuti(c.id, "Disetujui"); refreshData(); }} className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100" title="Setujui"><CheckCircle size={18}/></button>
                            <button onClick={async () => { await updateStatusCuti(c.id, "Ditolak"); refreshData(); }} className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm border border-red-100" title="Tolak"><XCircle size={18}/></button>
                          </div>
                        ) : (
                          <span className={`px-4 py-1.5 rounded-2xl text-[8px] font-black uppercase border tracking-[0.2em] shadow-inner ${c.status_acc === 'Disetujui' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                             {c.status_acc}
                          </span>
                        )}
                    </td>
                    <td className="p-6 text-center">
                      <div className="flex justify-center gap-3">
                        <button onClick={() => handleKirimWA(c.no_wa, c.nama_sdm, c.tgl_mulai, c.alasan)} className="p-3.5 bg-slate-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Hubungi via WA"><MessageCircle size={18} /></button>
                        <button onClick={() => handleEdit(c)} className="p-3.5 bg-slate-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Edit Data"><Edit3 size={18} /></button>
                        <button onClick={async () => { if(confirm("Data pengajuan ini akan dihapus permanen. Lanjutkan?")) { await hapusCuti(c.id); refreshData(); } }} className="p-3.5 bg-slate-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Hapus"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-24 text-center opacity-30">
                    <Clock size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px]">Data Belum Tersedia</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- FOOTER BRANDING --- */}
      <footer className="text-center pt-8 opacity-20 print:hidden">
         <p className="text-[8px] font-black uppercase tracking-[0.5em]">DAK-LEAVE MANAGEMENT v.2.5 | Daniel Ari Kristianto Production</p>
      </footer>
    </div>
  );
}