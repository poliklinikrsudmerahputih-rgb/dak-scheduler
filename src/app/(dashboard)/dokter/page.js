"use client";
import React, { useState, useEffect, useCallback } from "react";
import { simpanDokter, hapusDokter, simpanDeskripsiSimbol } from "./actions";
import { Pencil, Trash2, Stethoscope, Clock, Calendar, Tag, ShieldCheck, Activity, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { daftarKlinikSop } from "@/lib/sop-constants";

const urutanHari = {
  Senin: 1,
  Selasa: 2,
  Rabu: 3,
  Kamis: 4,
  Jumat: 5,
  Sabtu: 6,
  Minggu: 7
};

export default function MasterDokter() {
  const [dataDokter, setDataDokter] = useState([]);
  const [dataCuti, setDataCuti] = useState([]); 
  const [editData, setEditData] = useState(null);
  const [hariIni, setHariIni] = useState("");
  const [tglSekarang, setTglSekarang] = useState(""); 
  const [filterHari, setFilterHari] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [formKey, setFormKey] = useState("new");
  const [simbolDeskripsi, setSimbolDeskripsi] = useState(null);
  const [isSavingSimbol, setIsSavingSimbol] = useState(false);

  const daftarKlinik = daftarKlinikSop;

  const refreshData = useCallback(async () => {
    try {
      // Jika sedang mengetik pencarian, ambil semua hari agar hasil menampilkan semua
      // hari praktik dokter yang dicari. Hanya gunakan filterHari jika tidak sedang mencari.
      const queryHari = (filterHari && !searchQuery) ? `?hari=${filterHari}` : "";
      
      const [resDkt, resCuti] = await Promise.all([
        fetch(`/api/dokter${queryHari}`),
        fetch("/api/cuti-dokter")
      ]);
      
      const dDkt = await resDkt.json();
      const dCt = await resCuti.json();
      
      setDataCuti(Array.isArray(dCt) ? dCt : []);

      if (Array.isArray(dDkt)) {
        const sortedData = dDkt.sort((a, b) => {
          if (filterHari) {
            if (a.jadwal_hari === filterHari && b.jadwal_hari !== filterHari) return -1;
            if (a.jadwal_hari !== filterHari && b.jadwal_hari === filterHari) return 1;
          }
          if (urutanHari[a.jadwal_hari] !== urutanHari[b.jadwal_hari]) {
            return urutanHari[a.jadwal_hari] - urutanHari[b.jadwal_hari];
          }
          if (a.jam_praktik !== b.jam_praktik) {
            return a.jam_praktik.localeCompare(b.jam_praktik);
          }
          return a.nama_dokter.localeCompare(b.nama_dokter);
        });
        setDataDokter(sortedData);
      }
    } catch (error) {
      console.error("Gagal sinkronisasi data:", error);
    }
  }, [filterHari, searchQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const skrg = new Date();
      const daftarHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const hariSekarang = daftarHari[skrg.getDay()];

      setHariIni(hariSekarang);
      setTglSekarang(format(skrg, "yyyy-MM-dd"));
      setFilterHari(hariSekarang);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (filterHari !== "" || searchQuery !== "") {
        void refreshData();
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [filterHari, searchQuery, refreshData]);

  const cekSedangCuti = (nama, simbol) => {
    return dataCuti.find(c => 
      c.nama_dokter === nama && 
      c.simbol === simbol &&
      tglSekarang >= c.tgl_mulai && 
      tglSekarang <= c.tgl_selesai
    );
  };

  const handleAction = async (formData) => {
    const res = await simpanDokter(formData);
    if (res.success) {
      alert(editData ? "✅ Perubahan Berhasil Disimpan!" : "✅ Data Dokter Berhasil Disimpan!");
      setEditData(null);
      setFormKey("new");
      // safe-reset form after remount
      setTimeout(() => document.getElementById("form-dokter")?.reset(), 50);
      refreshData();
    } else {
      alert("❌ Gagal: " + res.error);
    }
  };

  // --- SEARCH / GROUPING LOGIC ---
  const trimmedQuery = (searchQuery || "").trim().toLowerCase();
  const filteredForSearch = trimmedQuery ? dataDokter.filter(d =>
    (d.nama_dokter || "").toLowerCase().includes(trimmedQuery) ||
    (d.klinik || "").toLowerCase().includes(trimmedQuery) ||
    (d.simbol_praktik || "").toLowerCase().includes(trimmedQuery)
  ) : [];
  const groupedResults = {};
  if (filteredForSearch.length) {
    filteredForSearch.forEach(d => {
      const key = (d.nama_dokter || "").trim().toLowerCase();
      if (!groupedResults[key]) groupedResults[key] = { nama: d.nama_dokter, clinics: new Set(), symbols: new Set(), sessions: [] };
      if (d.klinik) groupedResults[key].clinics.add(d.klinik);
      if (d.simbol_praktik) groupedResults[key].symbols.add(d.simbol_praktik);
      groupedResults[key].sessions.push(d);
    });
  }
  const groupsArray = Object.values(groupedResults).map(g => ({
    nama: g.nama,
    clinics: Array.from(g.clinics),
    symbols: Array.from(g.symbols),
    sessions: g.sessions
  }));

  const openSymbolDescription = (simbol) => {
    const existing = dataDokter.find(d =>
      (d.simbol_praktik || "").trim().toLowerCase() === simbol.trim().toLowerCase() &&
      (d.keterangan_simbol || "").trim()
    );
    setSimbolDeskripsi({ simbol, keterangan: existing?.keterangan_simbol || "" });
  };

  const saveSymbolDescription = async (event) => {
    event.preventDefault();
    if (!simbolDeskripsi) return;
    setIsSavingSimbol(true);
    const result = await simpanDeskripsiSimbol(simbolDeskripsi.simbol, simbolDeskripsi.keterangan);
    setIsSavingSimbol(false);
    if (!result.success) {
      alert("❌ Gagal: " + result.error);
      return;
    }
    alert(`✅ Deskripsi simbol ${simbolDeskripsi.simbol} disimpan untuk semua dokter dengan simbol yang sama.`);
    setSimbolDeskripsi(null);
    refreshData();
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
              Hari Real-Time: <span className="text-slate-900 bg-amber-300 px-2 rounded-md">{hariIni}, {format(new Date(), 'dd MMMM yyyy', {locale: id})}</span>
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Nama Dokter, Klinik, atau Simbol..."
              className="flex-1 bg-slate-50 border-2 border-transparent focus:border-blue-400 p-3 rounded-2xl outline-none text-sm font-semibold"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="px-4 py-2 bg-slate-200 rounded-2xl text-sm font-black">Clear</button>
            )}
          </div>

          {searchQuery && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {groupsArray.length > 0 ? groupsArray.map((g, i) => (
                <div key={i} className="p-3 rounded-xl border bg-white shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-black text-slate-800">{g.nama}</div>
                      <div className="text-[11px] text-slate-500">{g.clinics && g.clinics.length ? g.clinics.join(', ') : ''}</div>
                    </div>
                    <div className="text-xs font-black text-slate-400">{g.sessions.length} sesi</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {g.symbols.map((simbol) => (
                      <button key={simbol} type="button" onClick={() => openSymbolDescription(simbol)} className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-black font-mono" title="Edit deskripsi simbol untuk semua dokter dengan simbol ini">
                        Simbol: {simbol}
                      </button>
                    ))}
                    {[...new Set(g.sessions.map(s => s.jadwal_hari))].map((hari) => (
                      <button key={hari} onClick={() => {
                        // pilih sesi pertama yang cocok untuk membuka mode edit
                        const sesi = g.sessions.find(s => s.jadwal_hari === hari);
                        if (sesi) {
                          setEditData(sesi);
                          setFilterHari(sesi.jadwal_hari || hariIni);
                          setFormKey(`edit-${sesi.id}`);
                          window.scrollTo({top: 0, behavior: 'smooth'});
                        }
                      }} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black">{hari}</button>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="text-sm italic text-slate-400">Tidak ditemukan hasil untuk &quot;{searchQuery}&quot;</div>
              )}
            </div>
          )}
        </div>
      </div>

      {simbolDeskripsi && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 p-4">
          <form onSubmit={saveSymbolDescription} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-slate-800">Deskripsi Simbol {simbolDeskripsi.simbol}</h2>
            <p className="mt-2 text-xs text-slate-500">Deskripsi ini akan disimpan ke semua dokter di ruangan Anda yang menggunakan simbol tersebut.</p>
            <textarea
              value={simbolDeskripsi.keterangan}
              onChange={(e) => setSimbolDeskripsi({ ...simbolDeskripsi, keterangan: e.target.value })}
              rows={4}
              autoFocus
              className="mt-4 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm outline-none focus:border-blue-500"
              placeholder="Contoh: Praktik pagi dokter spesialis mata"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setSimbolDeskripsi(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold">Batal</button>
              <button type="submit" disabled={isSavingSimbol} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{isSavingSimbol ? "Menyimpan..." : "Simpan untuk Semua"}</button>
            </div>
          </form>
        </div>
      )}

      {/* --- FORM INPUT --- */}
      <div className={`p-6 md:p-10 rounded-[2.5rem] shadow-2xl border-2 transition-all duration-500 ${
        editData ? "bg-amber-50 border-amber-400" : "bg-white border-white"
      }`}>
        <form id="form-dokter" action={handleAction} key={formKey}>
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
                  value={filterHari}
                  onChange={(e) => setFilterHari(e.target.value)}
                  className="w-full bg-blue-50 border-2 border-blue-200 focus:border-blue-600 focus:bg-white p-4 rounded-2xl outline-none text-xs font-black uppercase cursor-pointer transition-all"
                >
                  <option value="">-- SEMUA HARI --</option>
                  <option value="Senin">Senin</option>
                  <option value="Selasa">Selasa</option>
                  <option value="Rabu">Rabu</option>
                  <option value="Kamis">Kamis</option>
                  <option value="Jumat">Jumat</option>
                  <option value="Sabtu">Sabtu</option>
                  <option value="Minggu">Minggu</option>
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

            {/* --- PENAMBAHAN FITUR INPUT BOBOT & SIMBOL --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <Tag size={14}/> Simbol Praktik
                </label>
                <input 
                  name="simbol" 
                  defaultValue={editData?.simbol_praktik || ""}
                  required 
                  placeholder="MATA-1" 
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-black transition-all uppercase font-mono" 
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <Activity size={14}/> Bobot Jaspel
                </label>
                <input 
                  type="number"
                  step="0.1"
                  name="bobot_jaspel" 
                  defaultValue={editData?.bobot_jaspel || "1.0"}
                  required 
                  placeholder="1.0" 
                  className="w-full bg-amber-50 border-2 border-amber-200 focus:border-amber-600 focus:bg-white p-4 rounded-2xl outline-none text-xs font-black transition-all font-mono text-amber-900" 
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Keterangan Simbol (Deskripsi)</label>
              <input
                name="keterangan_simbol"
                defaultValue={editData?.keterangan_simbol || ""}
                placeholder="Deskripsi simbol untuk cetak/tooltip"
                className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white p-4 rounded-2xl outline-none text-xs font-medium transition-all"
              />
            </div>
            {/* --- SELESAI PENAMBAHAN --- */}

          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-10">
            <button 
              type="submit" 
              className={`flex-1 py-4 rounded-2xl font-black text-[10px] text-white shadow-xl transition-all active:scale-95 uppercase tracking-[0.2em] ${
                editData ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-slate-900 hover:bg-blue-700 shadow-slate-200"
              }`}
            >
              {editData ? "Perbarui Data Dokter" : "Simpan Ke Database Turso"}
            </button>
            
            {(editData || filterHari) && (
              <button 
                type="button"
                onClick={() => { 
                  setEditData(null); 
                  setFilterHari(""); 
                  setFormKey("new");
                  document.getElementById("form-dokter")?.reset(); 
                }}
                className="bg-slate-200 text-slate-600 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all"
              >
                Batal / Tampilkan Semua
              </button>
            )}
          </div>
        </form>
      </div>

      {/* --- TABEL DATA --- */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Activity size={20} className="text-green-400 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest italic">
              {filterHari ? `Prioritas Hari: ${filterHari}` : "Monitoring Seluruh Jadwal Dokter"}
            </span>
          </div>
          <span className="text-[10px] font-black bg-white/10 px-4 py-2 rounded-xl text-blue-300 uppercase">
             {dataDokter.length} Sesi Terdaftar
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="p-6 border-b text-center w-24">Status</th>
                <th className="p-6 border-b">Informasi Dokter</th>
                <th className="p-6 border-b">Jadwal</th>
                <th className="p-6 border-b">Klinik</th>
                <th className="p-6 border-b text-center">Simbol</th>
                <th className="p-6 border-b text-center">Bobot</th>
                <th className="p-6 border-b text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-xs font-bold uppercase">
              {dataDokter.length > 0 ? (
                dataDokter.map((d, index) => {
                  const isAktifHariIni = d.jadwal_hari === hariIni;
                  const isSesuaiFilter = filterHari && d.jadwal_hari === filterHari;
                  const dataIzin = cekSedangCuti(d.nama_dokter, d.simbol_praktik);
                  const isLagiCuti = !!dataIzin;
                  const isNewDay = index === 0 || dataDokter[index-1].jadwal_hari !== d.jadwal_hari;

                  return (
                    <React.Fragment key={d.id}>
                      {isNewDay && (
                        <tr className={`${isSesuaiFilter ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400"}`}>
                          <td colSpan="7" className="px-6 py-2 text-[10px] font-black border-y border-slate-100 italic uppercase tracking-widest">
                            {isSesuaiFilter ? `⭐ PRIORITAS HARI ${d.jadwal_hari}` : `📅 KELOMPOK HARI ${d.jadwal_hari}`}
                          </td>
                        </tr>
                      )}
                      <tr className={`border-b transition-all group ${isLagiCuti ? 'bg-red-50/50' : isSesuaiFilter ? 'bg-blue-50/80' : isAktifHariIni ? 'bg-amber-50/30' : 'opacity-70'}`}>
                        <td className="p-6 text-center border-r border-slate-50">
                          <div className="flex flex-col items-center gap-1">
                            {isLagiCuti ? (
                              <>
                                <span className="w-3 h-3 bg-red-600 rounded-full border-2 border-white shadow-sm shadow-red-500"></span>
                                <span className="text-[7px] text-red-600 font-black mt-1">OFF ({dataIzin.jenis_cuti})</span>
                              </>
                            ) : isAktifHariIni ? (
                              <>
                                <span className="w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm shadow-green-500 animate-pulse"></span>
                                <span className="text-[7px] text-green-600 font-black mt-1">ACTIVE</span>
                              </>
                            ) : (
                              <span className="font-black text-slate-300">{String(index + 1).padStart(2, '0')}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-6">
                           <div className="flex flex-col items-start">
                              <span className={`text-sm tracking-tight ${isLagiCuti ? 'text-slate-400 line-through italic' : isSesuaiFilter || isAktifHariIni ? "font-black text-blue-700 underline decoration-blue-300 underline-offset-4" : "font-semibold text-slate-800"}`}>
                                  {d.nama_dokter}
                              </span>
                              
                              {d.ai_total_simbol > 1 && (
                                <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-lg">
                                  <AlertCircle size={10} className="animate-pulse" />
                                  <span className="text-[7px] font-black uppercase tracking-widest">
                                    Simbol Ganda: {d.ai_daftar_simbol}
                                  </span>
                                </div>
                              )}

                              {isLagiCuti ? (
                                <span className="text-[7px] text-red-500 font-black mt-1 uppercase italic">Izin s/d {format(new Date(dataIzin.tgl_selesai), 'dd MMM yyyy')}</span>
                              ) : isAktifHariIni && (
                                <span className="text-[7px] text-blue-500 font-black mt-1">● SEDANG PRAKTIK REAL-TIME</span>
                              )}
                           </div>
                        </td>
                        <td className="p-6">
                          <div className="flex flex-col gap-2">
                             <span className={`${isLagiCuti ? 'bg-slate-200 text-slate-400' : isSesuaiFilter || isAktifHariIni ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'} px-3 py-1 rounded-xl text-[9px] font-black w-fit border italic transition-all`}>
                               {d.jadwal_hari}
                             </span>
                             <span className={`flex items-center gap-1 text-[10px] font-mono ${isLagiCuti ? 'text-slate-300' : isSesuaiFilter || isAktifHariIni ? 'text-blue-700 font-black' : 'text-slate-500'}`}>
                               <Clock size={12}/> {d.jam_praktik}
                             </span>
                          </div>
                        </td>
                        <td className="p-6">
                           <span className={`${isLagiCuti ? 'text-slate-300' : isSesuaiFilter || isAktifHariIni ? 'text-blue-900 font-black' : 'text-slate-700'} tracking-tight`}>{d.klinik}</span>
                        </td>
                        <td className="p-6 text-center">
                          <span className={`border-2 px-3 py-1.5 rounded-2xl font-black font-mono shadow-inner transition-all ${isLagiCuti ? 'bg-slate-100 border-slate-200 text-slate-300' : isSesuaiFilter || isAktifHariIni ? 'bg-blue-700 border-blue-800 text-white' : 'bg-white border-slate-100 text-blue-600'}`}>
                            {d.simbol_praktik}
                          </span>
                        </td>
                        {/* --- KOLOM BOBOT JASPEL --- */}
                        <td className="p-6 text-center">
                           <span className={`px-3 py-1.5 rounded-xl font-black font-mono shadow-sm border ${
                              isLagiCuti 
                                ? 'bg-slate-50 text-slate-300 border-slate-100' 
                                : parseFloat(d.bobot_jaspel) > 1.5 
                                  ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                  : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                           }`}>
                              {d.bobot_jaspel ? parseFloat(d.bobot_jaspel).toFixed(1) : "1.0"}
                           </span>
                        </td>
                        <td className="p-6">
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => { setEditData(d); setFilterHari(d.jadwal_hari || hariIni); setFormKey(`edit-${d.id}`); window.scrollTo({top: 0, behavior: 'smooth'}); }}
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
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="p-20 text-center text-slate-300 italic">Database Kosong</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- SIGNATURE --- */}
      <footer className="pt-10 text-center">
        <div className="inline-flex items-center gap-3 bg-white px-8 py-3 rounded-full text-slate-300 shadow-sm border border-slate-50">
          <ShieldCheck size={14} className="text-blue-500" />
          <p className="text-[9px] font-black uppercase tracking-widest italic leading-none">
            DAK-DOCTOR SCHEDULING MODULE AI v.2.8 | Daniel Ari Kristianto Production
          </p>
        </div>
      </footer>
    </div>
  );
}