"use client";
import React, { useState, useEffect } from "react";
import { simpanSDM, hapusSDM } from "./actions";
import { 
  Pencil, Trash2, UserPlus, Users, BadgeCheck, 
  Phone, ShieldCheck, Activity, AlertCircle, TrendingUp, Users2, MapPin
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

export default function MasterSDM() {
  const [dataSDM, setDataSDM] = useState([]);
  const [dataCutiSDM, setDataCutiSDM] = useState([]);
  const [editData, setEditData] = useState(null);
  const [tglSekarang, setTglSekarang] = useState("");
  const [filterJabatan, setFilterJabatan] = useState("");
  
  // State Filter untuk Analytics Pasien & Rincian Klinik
  const [bulanFilter, setBulanFilter] = useState(new Date().getMonth() + 1);
  const [tahunFilter, setTahunFilter] = useState(new Date().getFullYear());

  // URUTAN PROFESI SESUAI PERMINTAAN PAK DANIEL
  const urutanProfesi = {
    "Bidan": 1,
    "Psikologi Klinis": 2,
    "Perawat": 3,
    "Terapis Gigi": 4,
    "Fisioterapis": 5,
    "Admin": 6
  };

  const refreshData = async () => {
    try {
      // Mengambil data SDM (termasuk total_pasien & daftar_klinik) dan data Cuti
      const [resSDM, resCuti] = await Promise.all([
        fetch(`/api/sdm?bulan=${bulanFilter}&tahun=${tahunFilter}`),
        fetch("/api/cuti-sdm")
      ]);
      
      const dSDM = await resSDM.json();
      const dCuti = await resCuti.json();
      
      setDataCutiSDM(Array.isArray(dCuti) ? dCuti : []);

      if (Array.isArray(dSDM)) {
        const sortedData = dSDM.sort((a, b) => {
          // 1. PRIORITAS: Jabatan yang dipilih di dropdown naik ke paling atas
          if (filterJabatan) {
            if (a.jabatan === filterJabatan && b.jabatan !== filterJabatan) return -1;
            if (a.jabatan !== filterJabatan && b.jabatan === filterJabatan) return 1;
          }
          // 2. KELOMPOK: Sortir berdasarkan urutan profesi (Bidan -> Admin)
          const orderA = urutanProfesi[a.jabatan] || 99;
          const orderB = urutanProfesi[b.jabatan] || 99;
          if (orderA !== orderB) return orderA - orderB;
          
          // 3. NAMA: Sortir alfabetis
          return a.nama.localeCompare(b.nama);
        });
        setDataSDM(sortedData);
      }
    } catch (error) {
      console.error("Gagal memuat data SDM:", error);
    }
  };

  useEffect(() => {
    const skrg = new Date();
    setTglSekarang(format(skrg, "yyyy-MM-dd"));
    refreshData();
  }, [filterJabatan, bulanFilter, tahunFilter]);

  // FUNGSI CEK STATUS CUTI (Hanya yang status_acc-nya "Disetujui")
  const cekSedangCuti = (nama) => {
    return dataCutiSDM.find(c => 
      c.nama_sdm === nama && 
      c.status_acc === "Disetujui" &&
      tglSekarang >= c.tgl_mulai && 
      tglSekarang <= c.tgl_selesai
    );
  };

  async function handleSubmit(formData) {
    const result = await simpanSDM(formData);
    if (result.success) {
      alert(editData ? "✅ Data Berhasil Diperbarui!" : "✅ Data Berhasil Disimpan!");
      setEditData(null);
      setFilterJabatan("");
      document.getElementById("form-sdm").reset();
      refreshData();
    } else {
      alert("❌ Terjadi kesalahan: " + result.error);
    }
  }

  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 pb-20 font-sans">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none rotate-12"><Users2 size={200} /></div>
        <div className="flex items-center gap-6 relative z-10">
          <div className={`p-4 rounded-[1.8rem] shadow-2xl transition-all ${editData ? "bg-orange-500" : "bg-blue-600"}`}>
            <UserPlus className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-xl md:text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none">
              {editData ? "Adjustment Personil" : "Master Database SDM"}
            </h1>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] italic mt-2 leading-none">
               Real-Time Analysis • {format(new Date(), "dd MMMM yyyy", { locale: id })}
            </p>
          </div>
        </div>

        {/* ANALYTICS MONTH FILTER */}
        <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-[2rem] relative z-10 border border-slate-200">
           <select 
             value={bulanFilter} 
             onChange={(e) => setBulanFilter(parseInt(e.target.value))}
             className="bg-white border-none rounded-2xl px-5 py-3 text-[10px] font-black uppercase cursor-pointer outline-none shadow-sm"
           >
             {namaBulan.map((b, i) => <option key={i} value={i+1}>{b}</option>)}
           </select>
           <div className="h-6 w-[1px] bg-slate-300"></div>
           <p className="px-4 text-[9px] font-black text-slate-400 uppercase italic tracking-widest leading-none">Performance View</p>
        </div>
      </div>

      {/* --- FORM INPUT --- */}
      <form 
        id="form-sdm" 
        action={handleSubmit} 
        className={`p-10 rounded-[4rem] shadow-2xl border-2 transition-all duration-700 ${editData ? "bg-orange-50/50 border-orange-400" : "bg-white border-white"}`}
      >
        {editData && <input type="hidden" name="id" value={editData.id} />}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">Nama Lengkap & Gelar</label>
            <input 
              name="nama" 
              type="text" 
              defaultValue={editData?.nama || ""}
              required 
              className="w-full bg-slate-50 border-none p-5 rounded-3xl outline-none text-xs font-bold uppercase transition-all focus:ring-2 focus:ring-blue-500 shadow-inner" 
              placeholder="Ns. Daniel, S.Kep" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">NIP / No. Registrasi</label>
            <input 
              name="nip" 
              type="text" 
              defaultValue={editData?.nip || ""}
              required 
              className="w-full bg-slate-50 border-none p-5 rounded-3xl outline-none text-xs font-bold transition-all uppercase shadow-inner" 
              placeholder="19890101XXXXXXXX" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-4 italic leading-none mb-1">Jabatan (Urutan Profesi)</label>
            <select 
              name="jabatan" 
              value={editData?.jabatan || filterJabatan || "Perawat"} 
              onChange={(e) => setFilterJabatan(e.target.value)}
              className="w-full bg-blue-50 border-none p-5 rounded-3xl outline-none text-xs font-black uppercase transition-all cursor-pointer shadow-sm"
            >
              {Object.keys(urutanProfesi).map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">Status & WA</label>
            <div className="flex gap-3">
               <select name="status" defaultValue={editData?.status || "PNS"} className="flex-1 bg-slate-50 border-none p-5 rounded-3xl outline-none text-xs font-bold uppercase cursor-pointer shadow-inner">
                 <option value="PNS">PNS</option>
                 <option value="PPPK">PPPK</option>
                 <option value="SS">SS</option>
               </select>
               <input name="no_wa" type="text" defaultValue={editData?.no_wa || ""} required className="flex-[2] bg-slate-50 border-none p-5 rounded-3xl outline-none text-xs font-bold shadow-inner" placeholder="08XXXXXXXXXX" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">Penugasan Ruangan</label>
            <select name="jenis_jabatan" defaultValue={editData?.jenis_jabatan || "Pelaksana"} className="w-full bg-slate-50 border-none p-5 rounded-3xl outline-none text-xs font-bold uppercase cursor-pointer shadow-inner">
              <option value="Koordinator Ruangan">Koordinator Ruangan</option>
              <option value="Wakil Ruangan">Wakil Ruangan</option>
              <option value="Ka TIM">Ka TIM</option>
              <option value="Penanggung Jawab Shift">Penanggung Jawab Shift</option>
              <option value="Pelaksana">Pelaksana</option>
            </select>
          </div>

          <div className="flex items-end gap-3 lg:col-span-1 pt-4">
            <button 
              type="submit" 
              className={`w-full font-black py-5 rounded-3xl text-[10px] text-white transition-all shadow-2xl active:scale-95 uppercase tracking-[0.3em] ${
                editData ? "bg-orange-600 shadow-orange-200" : "bg-slate-900 shadow-slate-200"
              }`}
            >
              {editData ? "UPDATE DATA" : "SIMPAN SDM"}
            </button>
            {(editData || filterJabatan) && (
              <button 
                type="button" 
                onClick={() => { setEditData(null); setFilterJabatan(""); document.getElementById("form-sdm").reset(); refreshData(); }}
                className="bg-slate-200 text-slate-600 px-8 py-5 rounded-3xl text-[10px] font-black uppercase hover:bg-slate-300 transition-all"
              >
                RESET
              </button>
            )}
          </div>
        </div>
      </form>

      {/* --- TABLE: SDM DATABASE & PERFORMANCE --- */}
      <div className="bg-white rounded-[4rem] shadow-2xl overflow-hidden border border-slate-100 relative">
        <div className="bg-slate-900 p-8 flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <TrendingUp size={24} className="text-emerald-400" />
            <div>
               <h2 className="text-sm font-black uppercase tracking-[0.2em] italic leading-none">Database & Performance SDM</h2>
               <p className="text-[8px] font-bold text-slate-500 uppercase mt-2 tracking-widest italic">Periode Analisis: {namaBulan[bulanFilter-1]} {tahunFilter}</p>
            </div>
          </div>
          <span className="text-[10px] font-black bg-blue-600 px-6 py-2.5 rounded-2xl text-white uppercase shadow-lg shadow-blue-900/40 tracking-tighter">
             {dataSDM.length} Personil Aktif
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="p-8 border-b text-center w-24">Status</th>
                <th className="p-8 border-b">Detail Personil & Klinik</th>
                <th className="p-8 border-b">Profesi & Jabatan</th>
                <th className="p-8 border-b text-center">Beban Kerja (Pasien)</th>
                <th className="p-8 border-b text-center w-40">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {dataSDM.length > 0 ? (
                dataSDM.map((sdm, index) => {
                  const dataCuti = cekSedangCuti(sdm.nama);
                  const isLagiCuti = !!dataCuti;
                  const isSesuaiFilter = filterJabatan && sdm.jabatan === filterJabatan;
                  const isNewGroup = index === 0 || dataSDM[index-1].jabatan !== sdm.jabatan;

                  // Kalkulasi Progress Bar (Target misal 500 pasien/bulan)
                  const totalPasien = sdm.total_pasien || 0;
                  const progressWidth = Math.min((totalPasien / 500) * 100, 100);

                  return (
                    <React.Fragment key={sdm.id}>
                      {isNewGroup && (
                        <tr className={`${isSesuaiFilter ? "bg-blue-600 text-white" : "bg-slate-100/50 text-slate-500"}`}>
                          <td colSpan="5" className="px-8 py-3 text-[10px] font-black italic uppercase tracking-widest border-y border-slate-100">
                             {isSesuaiFilter ? `⭐ PRIORITAS: ${sdm.jabatan}` : `📁 GRUP: ${sdm.jabatan}`}
                          </td>
                        </tr>
                      )}
                      <tr className={`border-b transition-all group hover:bg-slate-50/80 ${isLagiCuti ? 'bg-red-50/50' : isSesuaiFilter ? 'bg-blue-50/50' : ''}`}>
                        <td className="p-8 text-center border-r border-slate-50">
                          <div className="flex flex-col items-center">
                            {isLagiCuti ? (
                              <>
                                <span className="w-4 h-4 bg-red-600 rounded-full border-4 border-white shadow-lg animate-pulse"></span>
                                <span className="text-[8px] text-red-600 font-black mt-2 uppercase tracking-tighter italic">CUTI</span>
                              </>
                            ) : (
                              <>
                                <span className="w-4 h-4 bg-emerald-500 rounded-full border-4 border-white shadow-lg"></span>
                                <span className={`text-[8px] font-black mt-2 uppercase ${isSesuaiFilter ? 'text-blue-600' : 'text-slate-300'}`}>
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-col">
                            <div className={`font-black uppercase flex items-center gap-2 text-sm tracking-tighter ${isLagiCuti ? 'text-slate-400 line-through italic' : 'text-slate-800'}`}>
                              {sdm.nama}
                              {!isLagiCuti && sdm.status === "PNS" && <BadgeCheck size={18} className="text-blue-500" />}
                            </div>
                            
                            {/* FITUR BARU: RINCIAN KLINIK YANG DIPEGANG */}
                            {!isLagiCuti && sdm.daftar_klinik && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {sdm.daftar_klinik.split(',').map((klinik, kIdx) => (
                                  <span key={kIdx} className="text-[7px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-100 uppercase italic">
                                    Poli {klinik}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className={`text-[10px] font-mono mt-1 italic uppercase ${isLagiCuti ? 'text-slate-300' : 'text-slate-400'}`}>
                              ID. {sdm.nip}
                            </div>
                            {isLagiCuti && (
                              <span className="text-[8px] text-red-500 font-black mt-2 bg-red-100 px-3 py-1 rounded-lg w-fit italic border border-red-200 uppercase">
                                IZIN {dataCuti.jenis_cuti} s/d {format(new Date(dataCuti.tgl_selesai), 'dd MMM')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] font-black uppercase italic ${isLagiCuti ? 'text-slate-300' : 'text-blue-600'}`}>
                              {sdm.jabatan}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-tighter ${isLagiCuti ? 'text-slate-300' : 'text-slate-400'}`}>
                              {sdm.status} • {sdm.jenis_jabatan}
                            </span>
                          </div>
                        </td>
                        <td className="p-8">
                           <div className="flex flex-col gap-3">
                              <div className="flex justify-between items-end">
                                 <span className="text-[10px] font-black text-slate-800 uppercase italic">
                                   <span className="text-blue-600 text-lg mr-1 leading-none">{totalPasien}</span> Pasien
                                 </span>
                                 <span className="text-[8px] font-black text-slate-400 uppercase italic leading-none">Load: {progressWidth.toFixed(0)}%</span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
                                 <div 
                                   style={{ width: `${progressWidth}%` }} 
                                   className={`h-full transition-all duration-1000 ${
                                     progressWidth > 80 ? 'bg-red-500' : 
                                     progressWidth > 50 ? 'bg-orange-500' : 'bg-emerald-500'
                                   }`}
                                 ></div>
                              </div>
                           </div>
                        </td>
                        <td className="p-8">
                          <div className="flex justify-center gap-3">
                            {sdm.no_wa && (
                              <a href={`https://wa.me/${sdm.no_wa.replace(/^0/, '62')}`} target="_blank" className="p-4 bg-white border border-slate-100 text-emerald-600 rounded-[1.2rem] hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                                <Phone size={18} />
                              </a>
                            )}
                            <button onClick={() => { setEditData(sdm); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="p-4 bg-white border border-slate-100 text-blue-600 rounded-[1.2rem] hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                              <Pencil size={18} />
                            </button>
                            <button onClick={async () => { if(confirm(`Hapus permanen ${sdm.nama}?`)) { await hapusSDM(sdm.id); refreshData(); } }} className="p-4 bg-white border border-slate-100 text-red-600 rounded-[1.2rem] hover:bg-red-600 hover:text-white transition-all shadow-sm">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="p-24 text-center opacity-20">
                    <Users size={60} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] italic">Database Offline / Kosong</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="pt-10 text-center opacity-20">
        <div className="inline-flex items-center gap-3 bg-white px-8 py-3 rounded-full text-slate-400 border border-slate-100 shadow-sm uppercase italic text-[8px] font-black tracking-[0.5em]">
          DAK-SDM ANALYTICS ENGINE v.2.9 | Daniel Ari Kristianto Production
        </div>
      </footer>
    </div>
  );
}