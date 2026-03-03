"use client";
import React, { useState, useEffect } from "react";
import { simpanDokter, hapusDokter } from "./actions";
import { Pencil, Trash2, Stethoscope, Clock, Calendar, Tag, Hash, ShieldCheck } from "lucide-react";

export default function MasterDokter() {
  const [dataDokter, setDataDokter] = useState([]);
  const [editData, setEditData] = useState(null);

  const daftarKlinik = [
    "Poliklinik Dalam", "Gigi", "Mata", "THT", "Kulit dan Kelamin", 
    "Umum", "Paru", "Saraf", "Jiwa", "Bedah", "Orto", "Obsgyn", 
    "Anak", "Jantung", "Urologi", "Rehabilitasi Medik", "Klinik Nyeri"
  ];

  const refreshData = async () => {
    try {
      const res = await fetch("/api/dokter");
      const data = await res.json();
      if (Array.isArray(data)) {
        const sortedData = data.sort((a, b) => {
          if (a.nama_dokter === b.nama_dokter) {
            if (a.jadwal_hari === b.jadwal_hari) {
              return a.jam_praktik.localeCompare(b.jam_praktik);
            }
            return a.jadwal_hari.localeCompare(b.jadwal_hari);
          }
          return a.nama_dokter.localeCompare(b.nama_dokter);
        });
        setDataDokter(sortedData);
      }
    } catch (error) {
      console.error("Gagal mengambil data dokter:", error);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleAction = async (formData) => {
    const res = await simpanDokter(formData);
    if (res.success) {
      alert(editData ? "✅ Perubahan Berhasil Disimpan!" : "✅ Data Dokter Berhasil Disimpan!");
      setEditData(null);
      document.getElementById("form-dokter").reset();
      refreshData();
    } else {
      alert("❌ Gagal: " + res.error);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-10 pb-20 font-sans">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl shadow-lg transition-colors ${editData ? "bg-amber-500 shadow-amber-200" : "bg-blue-600 shadow-blue-200"}`}>
            <Stethoscope className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">
              {editData ? "Edit Master Dokter" : "Master Database Dokter"}
            </h1>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1 italic">
              DAK-SCHEDULER Intelligent System
            </p>
          </div>
        </div>
      </div>

      {/* --- FORM INPUT (RESPONSIF) --- */}
      <div className={`p-6 md:p-10 rounded-[2.5rem] shadow-2xl border-2 transition-all duration-500 ${
        editData ? "bg-amber-50/50 border-amber-400" : "bg-white border-white"
      }`}>
        <form id="form-dokter" action={handleAction}>
          {editData && <input type="hidden" name="id" value={editData.id} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nama Dokter Spesialis / Umum</label>
              <input 
                name="nama_dokter" 
                defaultValue={editData?.nama_dokter || ""}
                required 
                placeholder="Contoh: dr. Daniel, Sp.OT" 
                className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase transition-all" 
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Klinik Tujuan</label>
              <select 
                name="klinik" 
                defaultValue={editData?.klinik || "Umum"}
                className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase transition-all cursor-pointer"
              >
                {daftarKlinik.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <Calendar size={14}/> Hari Praktik
                </label>
                <select 
                  name="hari" 
                  defaultValue={editData?.jadwal_hari || "Senin"}
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase cursor-pointer"
                >
                  <option>Senin</option><option>Selasa</option><option>Rabu</option>
                  <option>Kamis</option><option>Jumat</option><option>Sabtu</option><option>Minggu</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <Clock size={14}/> Jam Praktik
                </label>
                <input 
                  name="jam" 
                  defaultValue={editData?.jam_praktik || ""}
                  required 
                  placeholder="08:00 - 12:00" 
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold transition-all" 
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                <Tag size={14}/> Simbol Praktik (Singkatan Database)
              </label>
              <input 
                name="simbol" 
                defaultValue={editData?.simbol_praktik || ""}
                required 
                placeholder="MATA-1" 
                className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-black transition-all uppercase font-mono" 
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-10">
            <button 
              type="submit" 
              className={`flex-1 py-4 rounded-2xl font-black text-[10px] text-white shadow-xl transition-all active:scale-95 uppercase tracking-[0.2em] ${
                editData ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-slate-900 hover:bg-blue-700 shadow-slate-200"
              }`}
            >
              {editData ? "Perbarui Jadwal Daniel System" : "Simpan Jadwal ke Database Turso"}
            </button>
            
            {editData && (
              <button 
                type="button"
                onClick={() => { setEditData(null); document.getElementById("form-dokter").reset(); refreshData(); }}
                className="bg-slate-200 text-slate-600 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all"
              >
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* --- TABEL DATA (RESPONSIF DENGAN SCROLL) --- */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-blue-400" />
            <span className="text-xs font-black uppercase tracking-widest italic">Monitoring Jadwal Aktif</span>
          </div>
          <span className="text-[10px] font-black bg-white/10 px-4 py-2 rounded-xl text-blue-300 uppercase">
             {dataDokter.length} Sesi Praktik
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="p-6 border-b text-center w-20">No</th>
                <th className="p-6 border-b">Informasi Dokter</th>
                <th className="p-6 border-b">Waktu Praktik</th>
                <th className="p-6 border-b">Unit Klinik</th>
                <th className="p-6 border-b">Simbol</th>
                <th className="p-6 border-b text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-xs font-bold uppercase">
              {dataDokter.length > 0 ? (
                dataDokter.map((d, index) => {
                  const isSameDoctor = index > 0 && dataDokter[index-1].nama_dokter === d.nama_dokter;
                  return (
                    <tr key={d.id} className={`border-b hover:bg-slate-50/80 transition-all group ${isSameDoctor ? 'opacity-80' : ''}`}>
                      <td className="p-6 text-center font-black text-slate-300 group-hover:text-blue-500 transition-colors border-r border-slate-50">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                      <td className="p-6">
                         <div className={`flex flex-col ${isSameDoctor ? 'opacity-40' : ''}`}>
                            <span className="text-sm font-black text-slate-800">{d.nama_dokter}</span>
                            {isSameDoctor && <span className="text-[8px] italic mt-1">(Sesi Tambahan)</span>}
                         </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col gap-2">
                           <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-xl text-[9px] font-black w-fit border border-blue-100 italic">
                             {d.jadwal_hari}
                           </span>
                           <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                             <Clock size={12}/> {d.jam_praktik}
                           </span>
                        </div>
                      </td>
                      <td className="p-6">
                         <span className="text-slate-700 tracking-tight">{d.klinik}</span>
                      </td>
                      <td className="p-6">
                         <span className="bg-white border-2 border-slate-100 text-blue-600 px-3 py-1.5 rounded-2xl font-black font-mono shadow-inner">
                            {d.simbol_praktik}
                         </span>
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center gap-2">
                          <button 
                            onClick={() => { setEditData(d); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                            className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                          >
                            <Pencil size={18} />
                          </button>
                          <button 
                            onClick={async () => { 
                              if(confirm(`Yakin ingin menghapus jadwal ${d.nama_dokter}?`)) {
                                await hapusDokter(d.id);
                                refreshData();
                              }
                            }}
                            className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="p-20 text-center text-slate-300 italic">
                    <div className="flex flex-col items-center gap-2 opacity-20">
                      <Stethoscope size={60} />
                      <p className="text-[10px] font-black uppercase tracking-[0.5em]">Jadwal Belum Terdaftar</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- SIGNATURE DEVELOPER --- */}
      <footer className="pt-10 text-center">
        <div className="inline-flex items-center gap-3 bg-white px-8 py-3 rounded-full text-slate-300 shadow-sm border border-slate-50">
          <ShieldCheck size={14} className="text-blue-500" />
          <p className="text-[9px] font-black uppercase tracking-widest tracking-tighter italic">
            DAK-DOCTOR SCHEDULING MODULE v.2.5 | Daniel Ari Kristianto Production
          </p>
        </div>
      </footer>
    </div>
  );
}