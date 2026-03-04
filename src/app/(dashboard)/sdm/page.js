"use client";
import React, { useState, useEffect } from "react";
import { simpanSDM, hapusSDM } from "./actions";
import { Pencil, Trash2, UserPlus, Users, BadgeCheck, Hash, Phone, ShieldCheck } from "lucide-react";

export default function MasterSDM() {
  const [dataSDM, setDataSDM] = useState([]);
  const [editData, setEditData] = useState(null);

  const refreshData = async () => {
    try {
      const res = await fetch("/api/sdm");
      const data = await res.json();
      if (Array.isArray(data)) {
        const sortedData = data.sort((a, b) => a.jabatan.localeCompare(b.jabatan));
        setDataSDM(sortedData);
      }
    } catch (error) {
      console.error("Gagal memuat data SDM:", error);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  async function handleSubmit(formData) {
    const result = await simpanSDM(formData);
    if (result.success) {
      alert(editData ? "✅ Data Berhasil Diperbarui!" : "✅ Data Berhasil Disimpan!");
      setEditData(null);
      document.getElementById("form-sdm").reset();
      refreshData();
    } else {
      alert("❌ Terjadi kesalahan: " + result.error);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 pb-20">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
            <UserPlus className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter">
              {editData ? "Edit Database SDM" : "Master Database SDM"}
            </h1>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none mt-1">
              DAK-SCHEDULER Management System
            </p>
          </div>
        </div>
      </div>

      {/* --- FORM INPUT (RESPONSIF) --- */}
      <form 
        id="form-sdm" 
        action={handleSubmit} 
        className={`p-6 md:p-10 rounded-[2.5rem] shadow-2xl border-2 transition-all duration-500 ${
          editData ? "bg-orange-50/50 border-orange-400" : "bg-white border-white"
        }`}
      >
        {editData && <input type="hidden" name="id" value={editData.id} />}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nama Lengkap & Gelar</label>
            <input 
              name="nama" 
              type="text" 
              defaultValue={editData?.nama || ""}
              required 
              className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase transition-all" 
              placeholder="Ns. Daniel, S.Kep" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">NIP / No. Registrasi</label>
            <input 
              name="nip" 
              type="text" 
              defaultValue={editData?.nip || ""}
              required 
              className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold transition-all uppercase" 
              placeholder="19890101XXXXXXXX" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Jabatan Profesi</label>
            <select name="jabatan" defaultValue={editData?.jabatan || "Perawat"} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase transition-all cursor-pointer">
              <option value="Perawat">Perawat</option>
              <option value="Bidan">Bidan</option>
              <option value="Terapis Gigi">Terapis Gigi</option>
              <option value="Fisioterapis">Fisioterapis</option>
              <option value="Psikologi Klinis">Psikologi Klinis</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Status Kepegawaian</label>
            <select name="status" defaultValue={editData?.status || "PNS"} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase transition-all cursor-pointer">
              <option value="PNS">PNS</option>
              <option value="PPPK">PPPK</option>
              <option value="SS">SS (Supporting Staff)</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nomor WhatsApp</label>
            <input 
              name="no_wa" 
              type="text" 
              defaultValue={editData?.no_wa || ""}
              required 
              className="w-full bg-slate-50 border-2 border-transparent focus:border-green-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold transition-all" 
              placeholder="08XXXXXXXXXX" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Penugasan</label>
            <select name="jenis_jabatan" defaultValue={editData?.jenis_jabatan || "Pelaksana"} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-bold uppercase transition-all cursor-pointer">
              <option value="Koordinator Ruangan">Koordinator Ruangan</option>
              <option value="Wakil Ruangan">Wakil Ruangan</option>
              <option value="Ka TIM">Ka TIM</option>
              <option value="Penanggung Jawab Shift">Penanggung Jawab Shift</option>
              <option value="Pelaksana">Pelaksana</option>
            </select>
          </div>

          <div className="flex items-end gap-3 lg:col-span-3 pt-4">
            <button 
              type="submit" 
              className={`flex-1 font-black py-4 rounded-2xl text-[10px] text-white transition-all shadow-xl active:scale-95 uppercase tracking-[0.2em] ${
                editData ? "bg-orange-600 hover:bg-orange-700 shadow-orange-200" : "bg-slate-900 hover:bg-blue-700 shadow-slate-200"
              }`}
            >
              {editData ? "Perbarui Data Daniel System" : "Simpan Data ke Turso DB"}
            </button>
            
            {editData && (
              <button 
                type="button"
                onClick={() => { setEditData(null); document.getElementById("form-sdm").reset(); }}
                className="bg-slate-200 text-slate-600 px-8 py-4 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-300 transition-all"
              >
                Batal
              </button>
            )}
          </div>
        </div>
      </form>

      {/* --- DAFTAR TABEL (SCROLLABLE DI HP) --- */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-blue-400" />
            <span className="text-xs font-black uppercase tracking-widest italic">Data Staf Terintegrasi</span>
          </div>
          <span className="text-[10px] font-black bg-white/10 px-4 py-2 rounded-xl text-blue-300 uppercase">
             {dataSDM.length} Personil
          </span>
        </div>

        {/* Pembungkus Scroll untuk HP */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="p-6 border-b text-center w-20">No</th>
                <th className="p-6 border-b">Detail Personil</th>
                <th className="p-6 border-b">Profesi & Jabatan</th>
                <th className="p-6 border-b text-center">Status</th>
                <th className="p-6 border-b text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {dataSDM.length > 0 ? (
                dataSDM.map((sdm, index) => (
                  <tr key={sdm.id} className="border-b hover:bg-slate-50/80 transition-all group">
                    <td className="p-6 text-center font-black text-slate-300 group-hover:text-blue-500 transition-colors">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="p-6">
                      <div className="font-black text-slate-800 uppercase flex items-center gap-2">
                        {sdm.nama}
                        {sdm.status === "PNS" && <BadgeCheck size={16} className="text-blue-500" />}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1 italic tracking-tight uppercase">NIP. {sdm.nip}</div>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-blue-600 uppercase italic">{sdm.jabatan}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{sdm.jenis_jabatan}</span>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${
                        sdm.status === 'PNS' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                        sdm.status === 'PPPK' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {sdm.status}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex justify-center gap-3">
                        {sdm.no_wa && (
                          <a 
                            href={`https://wa.me/${sdm.no_wa.replace(/^0/, '62')}`} 
                            target="_blank" 
                            className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                          >
                            <Phone size={16} />
                          </a>
                        )}
                        <button 
                          onClick={() => { setEditData(sdm); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                          className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        >
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={async () => { 
                            if(confirm(`Yakin ingin menghapus data ${sdm.nama}?`)) {
                              await hapusSDM(sdm.id);
                              refreshData();
                            }
                          }}
                          className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-20">
                      <Users size={60} />
                      <p className="text-[10px] font-black uppercase tracking-[0.5em]">Database Kosong</p>
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
          <p className="text-[9px] font-black uppercase tracking-widest tracking-tighter">
            DAK-SDM Module v.2.5 | Daniel Ari Kristianto Production
          </p>
        </div>
      </footer>
    </div>
  );
}