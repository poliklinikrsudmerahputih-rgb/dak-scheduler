"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { simpanSDM, hapusSDM } from "./actions";
import { 
  Pencil, Trash2, UserPlus, Users, BadgeCheck, 
  Phone, ShieldCheck, Activity, AlertCircle, TrendingUp, Users2, MapPin, HeartPulse, Plane, Coffee,
  ShieldAlert, Scale, MinusCircle, PlusCircle, Save, Loader2, XCircle
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

const urutanProfesi = {
  "Bidan": 1,
  "Psikologi Klinis": 2,
  "Perawat": 3,
  "Terapis Gigi": 4,
  "Fisioterapis": 5,
  "Terapi Wicara": 6,
  "Terapi Okupasi": 7,
  "Admin": 8
};

export default function MasterSDM() {
  const [dataSDM, setDataSDM] = useState([]);
  const [dataCutiSDM, setDataCutiSDM] = useState([]);
  const [editData, setEditData] = useState(null);
  const [tglSekarang, setTglSekarang] = useState("");
  const [filterJabatan, setFilterJabatan] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("SEMUA");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // State Filter untuk Analytics Pasien & Rincian Klinik
  const [bulanFilter, setBulanFilter] = useState(new Date().getMonth() + 1);
  const [tahunFilter, setTahunFilter] = useState(new Date().getFullYear());

  // --- STATE MODAL EVALUASI MUTU ---
  const [showMutuModal, setShowMutuModal] = useState(false);
  const [selectedMutuSDM, setSelectedMutuSDM] = useState(null);
  const [mutuForm, setMutuForm] = useState({ jenis: 'POTONG', kategori: 'DISIPLIN', nominal: '', catatan: '' });
  const [loadingMutu, setLoadingMutu] = useState(false);

  // --- STATE MODAL MUTASI / RIWAYAT ---
  const [showMutasiModal, setShowMutasiModal] = useState(false);
  const [selectedMutasiSDM, setSelectedMutasiSDM] = useState(null);
  const [mutasiForm, setMutasiForm] = useState({ status_kerja: 'AKTIF', ruangan_aktif: '', keterangan: '' });
  const [loadingMutasi, setLoadingMutasi] = useState(false);
  const [logAktivitas, setLogAktivitas] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchLogAktivitas = useCallback(async () => {
    try {
      setLoadingLogs(true);
      const res = await fetch("/api/log-aktivitas");
      const data = await res.json();
      setLogAktivitas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Gagal memuat log aktivitas:", error);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      // Mengambil data SDM (termasuk total_pasien) dan data Cuti
      const [resSDM, resCuti] = await Promise.all([
        fetch(`/api/sdm?bulan=${bulanFilter}&tahun=${tahunFilter}`),
        fetch("/api/cuti-sdm")
      ]);
      
      const dSDM = await resSDM.json();
      const dCuti = await resCuti.json();
      
      setDataCutiSDM(Array.isArray(dCuti) ? dCuti : []);

      if (Array.isArray(dSDM)) {
        const sortedData = dSDM.sort((a, b) => {
          // 1. PRIORITAS
          if (filterJabatan) {
            if (a.jabatan === filterJabatan && b.jabatan !== filterJabatan) return -1;
            if (a.jabatan !== filterJabatan && b.jabatan === filterJabatan) return 1;
          }
          // 2. KELOMPOK PROFESI
          const orderA = urutanProfesi[a.jabatan] || 99;
          const orderB = urutanProfesi[b.jabatan] || 99;
          if (orderA !== orderB) return orderA - orderB;
          
          // 3. ALFABETIS
          return a.nama.localeCompare(b.nama);
        });
        setDataSDM(sortedData);
      }
    } catch (error) {
      console.error("Gagal memuat data SDM:", error);
    }
  }, [bulanFilter, filterJabatan, tahunFilter]);

  useEffect(() => {
    const skrg = new Date();
    setTglSekarang(format(skrg, "yyyy-MM-dd"));
    refreshData();
    fetchLogAktivitas();
  }, [refreshData, fetchLogAktivitas]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterJabatan, searchTerm, statusFilter]);

  const filteredData = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    let hasil = [...dataSDM];

    if (filterJabatan) {
      hasil = hasil.filter((item) => item.jabatan === filterJabatan);
    }

    if (normalizedSearch) {
      hasil = hasil.filter((item) => {
        const text = `${item.nama || ""} ${item.nip || ""}`.toLowerCase();
        return text.includes(normalizedSearch);
      });
    }

    if (statusFilter !== "SEMUA") {
      hasil = hasil.filter((item) => {
        const statusAktif = item.status_kerja || "AKTIF";
        return statusAktif.toUpperCase() === statusFilter;
      });
    }

    return hasil;
  }, [dataSDM, filterJabatan, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // FUNGSI CEK STATUS BERHALANGAN HARI INI
  const cekSedangCuti = (nama) => {
    return dataCutiSDM.find(c => 
      c.nama_sdm === nama && 
      c.status_acc === "Disetujui" &&
      tglSekarang >= c.tgl_mulai && 
      tglSekarang <= c.tgl_selesai
    );
  };

  // FITUR AI: MENGHITUNG STATISTIK IZIN DALAM BULAN YANG DIPILIH
  const getStatsCutiBulanan = (nama) => {
    const riwayatBulanIni = dataCutiSDM.filter(c => {
      if (c.nama_sdm !== nama || c.status_acc !== "Disetujui") return false;
      const tglMulai = new Date(c.tgl_mulai);
      return (tglMulai.getMonth() + 1) === bulanFilter && tglMulai.getFullYear() === tahunFilter;
    });

    const sakit = riwayatBulanIni.filter(c => c.jenis_cuti === 'CS').length;
    const cuti = riwayatBulanIni.filter(c => c.jenis_cuti === 'CT' || c.jenis_cuti === 'CM').length;
    const dl = riwayatBulanIni.filter(c => c.jenis_cuti === 'DL').length;
    
    return { sakit, cuti, dl, total: riwayatBulanIni.length };
  };

  const terjemahkanIzin = (kode) => {
    if(kode === 'CS') return 'SEDANG SAKIT';
    if(kode === 'CT') return 'CUTI TAHUNAN';
    if(kode === 'DL') return 'DINAS LUAR';
    if(kode === 'CM') return 'CUTI MELAHIRKAN';
    return 'SEDANG IZIN';
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

  // --- FUNGSI EKSEKUSI MUTU (DIPERBAIKI) ---
  const handleSimpanMutu = async (e) => {
    e.preventDefault();
    if (!mutuForm.nominal || mutuForm.nominal <= 0) return alert("Nominal harus diisi dan lebih dari 0!");
    if (!mutuForm.catatan.trim()) return alert("Catatan/Alasan wajib diisi sebagai bukti log!");

    setLoadingMutu(true);
    try {
      const res = await fetch('/api/sdm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdm_id: selectedMutuSDM.id,
          bulan: bulanFilter,
          tahun: tahunFilter,
          jenis: mutuForm.jenis,
          kategori: mutuForm.kategori,
          nominal: Number(mutuForm.nominal),
          catatan: mutuForm.catatan
        })
      });

      if (res.ok) {
        alert(mutuForm.jenis === 'POTONG' ? "⚠️ Poin Mutu Berhasil Dipotong!" : "✅ Poin Berhasil Dipulihkan (Dispensasi)!");
        setShowMutuModal(false);
        setMutuForm({ jenis: 'POTONG', kategori: 'DISIPLIN', nominal: '', catatan: '' });
        refreshData();
        fetchLogAktivitas();
      } else {
        alert("Gagal menyimpan evaluasi mutu. Pastikan backend sudah siap.");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setLoadingMutu(false);
    }
  };

  const handleSimpanMutasi = async (e) => {
    e.preventDefault();
    if (!selectedMutasiSDM) return;

    setLoadingMutasi(true);
    try {
      const res = await fetch('/api/sdm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mutasi',
          id: selectedMutasiSDM.id,
          ruangan_aktif: mutasiForm.ruangan_aktif || selectedMutasiSDM.ruangan_aktif || selectedMutasiSDM.ruangan || 'POLIKLINIK',
          status_kerja: mutasiForm.status_kerja,
          keterangan: mutasiForm.keterangan || 'Perubahan status / ruangan SDM'
        })
      });

      const result = await res.json();

      if (res.ok && result.success) {
        alert("✅ Perubahan status/ruangan SDM berhasil disimpan!");
        setShowMutasiModal(false);
        setSelectedMutasiSDM(null);
        setMutasiForm({ status_kerja: 'AKTIF', ruangan_aktif: '', keterangan: '' });
        refreshData();
        fetchLogAktivitas();
      } else {
        alert(result.error || "Gagal menyimpan mutasi SDM.");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan jaringan saat mutasi SDM.");
    } finally {
      setLoadingMutasi(false);
    }
  };

  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 pb-20 font-sans">
      
      {/* MODAL MUTASI SDM */}
      {showMutasiModal && selectedMutasiSDM && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl border-4 border-slate-200 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 flex items-center gap-2">
                <MapPin size={24} className="text-blue-600" /> Mutasi SDM
              </h3>
              <button onClick={() => setShowMutasiModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><XCircle size={20}/></button>
            </div>

            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target</p>
              <p className="text-sm font-black uppercase text-slate-800 mt-1">{selectedMutasiSDM.nama}</p>
              <p className="text-[10px] font-bold uppercase text-slate-500 mt-1">Ruangan saat ini: {selectedMutasiSDM.ruangan_aktif || selectedMutasiSDM.ruangan || 'POLIKLINIK'}</p>
            </div>

            <form onSubmit={handleSimpanMutasi} className="space-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Status Kerja</label>
                <select
                  value={mutasiForm.status_kerja}
                  onChange={(e) => setMutasiForm({ ...mutasiForm, status_kerja: e.target.value })}
                  className="w-full p-4 bg-white rounded-2xl font-black uppercase text-[10px] border-2 border-slate-200 outline-none focus:border-blue-500 text-slate-700"
                >
                  <option value="AKTIF">AKTIF</option>
                  <option value="MUTASI">MUTASI</option>
                  <option value="RESIGN">RESIGN</option>
                  <option value="NON_AKTIF">NON_AKTIF</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Ruangan Baru</label>
                <input
                  type="text"
                  value={mutasiForm.ruangan_aktif}
                  onChange={(e) => setMutasiForm({ ...mutasiForm, ruangan_aktif: e.target.value })}
                  placeholder="POLIKLINIK / IGD / ICU"
                  className="w-full p-4 bg-white rounded-2xl font-black uppercase text-xs border-2 border-slate-200 outline-none focus:border-blue-500 text-slate-700"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Keterangan</label>
                <input
                  type="text"
                  value={mutasiForm.keterangan}
                  onChange={(e) => setMutasiForm({ ...mutasiForm, keterangan: e.target.value })}
                  placeholder="Contoh: Mutasi ke ruangan IGD"
                  className="w-full p-4 bg-white rounded-2xl font-black uppercase text-xs border-2 border-slate-200 outline-none focus:border-blue-500 text-slate-700"
                />
              </div>

              <button
                type="submit"
                disabled={loadingMutasi}
                className="w-full py-4 rounded-2xl text-[11px] font-black uppercase shadow-xl flex justify-center items-center gap-2 transition-all bg-blue-600 text-white border-b-4 border-blue-800 hover:bg-blue-700"
              >
                {loadingMutasi ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />} 
                Simpan Mutasi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KENDALI MUTU (OVERRIDE KOORDINATOR) */}
      {showMutuModal && selectedMutuSDM && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl border-4 border-slate-200 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 flex items-center gap-2">
                <Scale size={24} className="text-slate-800" /> Pengadilan Mutu
              </h3>
              <button onClick={() => setShowMutuModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><XCircle size={20}/></button>
            </div>

            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Evaluasi</p>
                  <p className="text-sm font-black uppercase text-slate-800 mt-1">{selectedMutuSDM.nama}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo Saat Ini</p>
                  {/* PERBAIKAN 3A: Ubah saldo_mutu menjadi poin_akhir */}
                  <p className={`text-xl font-black italic ${selectedMutuSDM.poin_akhir < 300 ? 'text-red-600' : selectedMutuSDM.poin_akhir < 400 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {selectedMutuSDM.poin_akhir !== undefined ? selectedMutuSDM.poin_akhir : 400} <span className="text-[10px] text-slate-400">/ 400</span>
                  </p>
               </div>
            </div>

            <form onSubmit={handleSimpanMutu} className="space-y-6">
              {/* TOGGLE JENIS AKSI */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                <button 
                  type="button" 
                  onClick={() => setMutuForm({...mutuForm, jenis: 'POTONG'})}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mutuForm.jenis === 'POTONG' ? 'bg-red-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-200'}`}
                >
                  <MinusCircle size={14}/> Penalti / Potong
                </button>
                <button 
                  type="button" 
                  onClick={() => setMutuForm({...mutuForm, jenis: 'PEMUTIHAN'})}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mutuForm.jenis === 'PEMUTIHAN' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-200'}`}
                >
                  <PlusCircle size={14}/> Dispensasi
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Indikator Penilaian</label>
                  <select 
                    value={mutuForm.kategori} 
                    onChange={(e) => setMutuForm({...mutuForm, kategori: e.target.value})}
                    className="w-full p-4 bg-white rounded-2xl font-black uppercase text-[10px] border-2 border-slate-200 outline-none focus:border-blue-500 text-slate-700"
                  >
                    <option value="DISIPLIN">Kedisiplinan & Kehadiran (Max 150)</option>
                    <option value="SOP_ETIKA">Kepatuhan SOP & Etika Pelayanan (Max 150)</option>
                    <option value="ASKEP">Mutu Administrasi & ASKEP (Max 100)</option>
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex flex-col gap-1.5 w-1/3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Poin</label>
                    <input 
                      type="number" 
                      min="1"
                      value={mutuForm.nominal}
                      onChange={(e) => setMutuForm({...mutuForm, nominal: e.target.value})}
                      placeholder="0"
                      className={`w-full p-4 bg-white rounded-2xl font-black text-center text-lg border-2 outline-none ${mutuForm.jenis === 'POTONG' ? 'border-red-200 text-red-600 focus:border-red-500' : 'border-emerald-200 text-emerald-600 focus:border-emerald-500'}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 w-2/3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 italic">Catatan Pembuktian (Log)</label>
                    <input 
                      type="text" 
                      value={mutuForm.catatan}
                      onChange={(e) => setMutuForm({...mutuForm, catatan: e.target.value})}
                      placeholder="Contoh: Terlambat > 30 Menit..."
                      className="w-full p-4 bg-white rounded-2xl font-black text-xs border-2 border-slate-200 outline-none focus:border-blue-500 text-slate-700"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loadingMutu}
                className={`w-full py-5 rounded-2xl text-[11px] font-black uppercase shadow-xl flex justify-center items-center gap-2 transition-all italic tracking-widest ${mutuForm.jenis === 'POTONG' ? 'bg-red-600 text-white border-b-4 border-red-800 hover:bg-red-700' : 'bg-emerald-600 text-white border-b-4 border-emerald-800 hover:bg-emerald-700'}`}
              >
                {loadingMutu ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {mutuForm.jenis === 'POTONG' ? 'EKSEKUSI PEMOTONGAN POIN' : 'PULIHKAN POIN STAF'}
              </button>
            </form>
          </div>
        </div>
      )}

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
              defaultValue={editData?.jabatan || "Perawat"}
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
            {(editData || filterJabatan || searchTerm || statusFilter !== "SEMUA") && (
              <button 
                type="button" 
                onClick={() => { setEditData(null); setFilterJabatan(""); setSearchTerm(""); setStatusFilter("SEMUA"); document.getElementById("form-sdm").reset(); refreshData(); }}
                className="bg-slate-200 text-slate-600 px-8 py-5 rounded-3xl text-[10px] font-black uppercase hover:bg-slate-300 transition-all"
              >
                RESET
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex-1 w-full md:max-w-md">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cari Nama / NIP</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Masukkan nama atau NIP"
            className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500"
          />
        </div>

        <div className="w-full md:max-w-xs">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Filter Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="SEMUA">Semua</option>
            <option value="AKTIF">Aktif</option>
            <option value="RESIGN">Resign</option>
            <option value="MUTASI">Mutasi</option>
            <option value="NON_AKTIF">Non Aktif</option>
          </select>
        </div>
      </div>

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
             {filteredData.length} Personil Aktif
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="p-8 border-b text-center w-24">Status</th>
                <th className="p-8 border-b w-64">Detail Personil</th>
                <th className="p-8 border-b">Profesi & Jabatan</th>
                <th className="p-8 border-b text-center">Beban Jaspel (Kuantitatif)</th>
                <th className="p-8 border-b text-center border-l border-slate-200">Saldo Mutu (Max 400)</th>
                <th className="p-8 border-b text-center">Kendali Aksi</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {paginatedData.length > 0 ? (
                paginatedData.map((sdm, index) => {
                  const dataCuti = cekSedangCuti(sdm.nama);
                  const isLagiCuti = !!dataCuti;
                  const isSesuaiFilter = filterJabatan && sdm.jabatan === filterJabatan;
                  const isNewGroup = index === 0 || paginatedData[index-1].jabatan !== sdm.jabatan;

                  // Kalkulasi Progress Bar Pasien
                  const totalPasien = sdm.total_pasien || 0;
                  const progressWidth = Math.min((totalPasien / 500) * 100, 100);
                  
                  // Kalkulasi AI Statistik Kehadiran SDM
                  const statsKehadiran = getStatsCutiBulanan(sdm.nama);

                  // PERBAIKAN 3B: Ubah saldo_mutu menjadi poin_akhir pada Tabel
                  const saldoMutu = sdm.poin_akhir !== undefined ? sdm.poin_akhir : 400;
                  let colorClassMutu = "text-emerald-600 bg-emerald-50 border-emerald-100";
                  let iconMutu = <ShieldCheck size={16} className="text-emerald-500" />;
                  if (saldoMutu < 400 && saldoMutu >= 300) {
                      colorClassMutu = "text-amber-600 bg-amber-50 border-amber-100";
                      iconMutu = <ShieldAlert size={16} className="text-amber-500" />;
                  } else if (saldoMutu < 300) {
                      colorClassMutu = "text-red-600 bg-red-50 border-red-100";
                      iconMutu = <ShieldAlert size={16} className="text-red-500" />;
                  }

                  return (
                    <React.Fragment key={sdm.id}>
                      {isNewGroup && (
                        <tr className={`${isSesuaiFilter ? "bg-blue-600 text-white" : "bg-slate-100/50 text-slate-500"}`}>
                          <td colSpan="6" className="px-8 py-3 text-[10px] font-black italic uppercase tracking-widest border-y border-slate-100">
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
                                <span className="text-[8px] text-red-600 font-black mt-2 uppercase tracking-tighter italic">OFF</span>
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
                            
                            {/* RINCIAN KLINIK */}
                            {!isLagiCuti && sdm.daftar_klinik && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {sdm.daftar_klinik.split(',').map((klinik, kIdx) => (
                                  <span key={kIdx} className="text-[7px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-100 uppercase italic">
                                    Poli {klinik}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* FITUR AI: STATISTIK IZIN BULANAN */}
                            {statsKehadiran.total > 0 && (
                              <div className="flex gap-1.5 mt-2.5">
                                {statsKehadiran.sakit > 0 && (
                                  <span className="flex items-center gap-1 text-[7px] font-black bg-orange-50 text-orange-600 px-2 py-1 rounded-md border border-orange-100 uppercase tracking-widest">
                                    <HeartPulse size={10} /> Sakit {statsKehadiran.sakit}x
                                  </span>
                                )}
                                {statsKehadiran.cuti > 0 && (
                                  <span className="flex items-center gap-1 text-[7px] font-black bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-widest">
                                    <Coffee size={10} /> Cuti {statsKehadiran.cuti}x
                                  </span>
                                )}
                                {statsKehadiran.dl > 0 && (
                                  <span className="flex items-center gap-1 text-[7px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 uppercase tracking-widest">
                                    <Plane size={10} /> Dinas {statsKehadiran.dl}x
                                  </span>
                                )}
                              </div>
                            )}

                            <div className={`text-[10px] font-mono mt-1.5 italic uppercase ${isLagiCuti ? 'text-slate-300' : 'text-slate-400'}`}>
                              ID. {sdm.nip}
                            </div>
                            
                            {/* STATUS BERHALANGAN SAAT INI */}
                            {isLagiCuti && (
                              <span className="text-[8px] text-red-600 font-black mt-2 bg-red-100 px-3 py-1.5 rounded-lg w-fit italic border border-red-200 uppercase tracking-widest shadow-sm">
                                {terjemahkanIzin(dataCuti.jenis_cuti)} s/d {format(new Date(dataCuti.tgl_selesai), 'dd MMM')}
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

                        {/* --- INJEKSI KOLOM SALDO MUTU --- */}
                        <td className="p-8 border-l border-slate-100 text-center bg-slate-50/30">
                           <div className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 shadow-sm ${colorClassMutu}`}>
                              {iconMutu}
                              <span className="font-black text-base">{saldoMutu}</span>
                           </div>
                        </td>

                        <td className="p-8">
                          <div className="flex justify-center gap-2">
                            {/* Tombol Khusus Panel Mutu */}
                            <button 
                              onClick={() => { setSelectedMutuSDM(sdm); setShowMutuModal(true); }} 
                              className="px-4 py-3 flex items-center gap-2 bg-slate-900 border border-slate-800 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-lg border-b-4 active:border-b-0 active:mt-1"
                              title="Kelola Poin Mutu (Kedisiplinan & Pelanggaran)"
                            >
                              <Scale size={16} className="text-amber-400" /> <span className="text-[9px] font-black tracking-widest uppercase">MUTU</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedMutasiSDM(sdm);
                                setMutasiForm({
                                  status_kerja: sdm.status_kerja || 'AKTIF',
                                  ruangan_aktif: sdm.ruangan_aktif || sdm.ruangan || '',
                                  keterangan: ''
                                });
                                setShowMutasiModal(true);
                              }}
                              className="px-4 py-3 flex items-center gap-2 bg-blue-600 border border-blue-700 text-white rounded-2xl hover:bg-blue-500 transition-all shadow-lg border-b-4 active:border-b-0 active:mt-1"
                              title="Mutasi / pindah ruangan / ubah status kerja"
                            >
                              <MapPin size={16} className="text-white" /> <span className="text-[9px] font-black tracking-widest uppercase">MUTASI</span>
                            </button>
                             
                            {/* Tombol Edit & Hapus Lama (Hanya Ikon agar rapi) */}
                            {sdm.no_wa && (
                              <a href={`https://wa.me/${sdm.no_wa.replace(/^0/, '62')}`} target="_blank" className="p-3 bg-white border border-slate-100 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                                <Phone size={16} />
                              </a>
                            )}
                            <button onClick={() => { setEditData(sdm); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="p-3 bg-white border border-slate-100 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                              <Pencil size={16} />
                            </button>
                            <button onClick={async () => { if(confirm(`Hapus permanen ${sdm.nama}?`)) { await hapusSDM(sdm.id); refreshData(); fetchLogAktivitas(); } }} className="p-3 bg-white border border-slate-100 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="p-24 text-center opacity-20">
                    <Users size={60} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] italic">Database Offline / Kosong</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredData.length > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white rounded-[2rem] p-4 shadow-xl border border-slate-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Halaman {currentPage} / {totalPages} • {filteredData.length} data
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity size={20} className="text-emerald-400" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Riwayat Aktivitas SDM</h2>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">{loadingLogs ? 'Memuat...' : `${logAktivitas.length} catatan`}</span>
        </div>

        <div className="divide-y divide-slate-200">
          {loadingLogs ? (
            <div className="p-8 text-center text-slate-400 text-xs font-black uppercase tracking-[0.2em]">Loading...</div>
          ) : logAktivitas.length > 0 ? (
            logAktivitas.slice(0, 8).map((log, idx) => (
              <div key={log.id || idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{log.action} • {log.entity_type}</p>
                  <p className="mt-1 text-sm font-black uppercase text-slate-800">{log.keterangan || 'Aktivitas SDM'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{log.user_name || 'System'}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-400">{log.ruangan || '-'} • {log.created_at ? format(new Date(log.created_at), 'dd MMM yyyy HH:mm', { locale: id }) : '-'}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs font-black uppercase tracking-[0.2em]">Belum ada aktivitas</div>
          )}
        </div>
      </div>

      <footer className="pt-10 text-center opacity-20">
        <div className="inline-flex items-center gap-3 bg-white px-8 py-3 rounded-full text-slate-400 border border-slate-100 shadow-sm uppercase italic text-[8px] font-black tracking-[0.5em]">
          DAK-SDM ANALYTICS ENGINE v.3.0 | Daniel Ari Kristianto Production
        </div>
      </footer>
    </div>
  );
}