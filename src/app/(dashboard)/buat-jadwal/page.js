"use client";

import React, { useState, useEffect } from "react";
import { getDaysInMonth, startOfMonth, getDay, format } from "date-fns";
import { Save, Printer, Loader2, FileText, AlertTriangle, Undo2, Redo2, Settings, X } from "lucide-react";
import { id } from "date-fns/locale";

export default function BuatJadwal() {
  // --- 1. STATE & HYDRATION ---
  const [hasMounted, setHasMounted] = useState(false);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [daftarSDM, setDaftarSDM] = useState([]);
  const [dataCutiSDM, setDataCutiSDM] = useState([]); 
  const [dataMasterDokter, setDataMasterDokter] = useState([]);
  const [isiJadwal, setIsiJadwal] = useState({});
  const [loading, setLoading] = useState(false);

  // STATE UNTUK MODAL PENGATURAN HEADER (POP-UP)
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // STATE UNTUK UNDO & REDO
  const [history, setHistory] = useState([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [header, setHeader] = useState({
    institusi: "RSUD MERAH PUTIH",
    judul_bebas: "JADWAL DINAS POLIKLINIK",
    ruangan: "POLIKLINIK",
    atasan_nama: "RIANA, S.TR.KEB.",
    atasan_jabatan: "KASI PELAYANAN KEPERAWATAN DAN KEBIDANAN",
    atasan_nip: "197510272003122005",
    pembuat_nama: "DANIEL ARI KRISTIANTO, S.KEP.NS",
    pembuat_jabatan: "KOORDINATOR RUANGAN",
    pembuat_nip: "199303042019031006",
    tgl_cetak: format(new Date(), "yyyy-MM-dd"),
    tempat_cetak: "MAGELANG" // FITUR BARU: Tempat Cetak Bebas
  });

  // --- 2. DATA MASTER ---
  const urutanProfesi = { "Bidan": 1, "Psikologi Klinis": 2, "Perawat": 3, "Terapis Gigi": 4, "Fisioterapis": 5, "Admin": 6 };
  const statusAbsensi = ["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"];
  const namaHariLengkap = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const namaHariSingkat = ["M", "SN", "SL", "R", "K", "J", "S"];
  const daftarBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const hariLibur2026 = ["2026-01-01", "2026-01-16", "2026-02-16", "2026-02-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", "2026-03-23", "2026-03-24", "2026-04-03", "2026-04-05", "2026-05-01", "2026-05-14", "2026-05-15", "2026-05-27", "2026-05-28", "2026-03-31", "2026-06-01", "2026-06-16", "2026-08-17", "2026-08-25", "2026-12-24", "2026-12-25"];

  const tanggalPilihan = new Date(tahun, bulan - 1);
  const jumlahHari = getDaysInMonth(tanggalPilihan);
  const hariPertama = getDay(startOfMonth(tanggalPilihan));

  // --- 3. FETCHING DATA ---
  useEffect(() => { setHasMounted(true); }, []);

  useEffect(() => {
    if (!hasMounted) return;
    async function fetchData() {
      setLoading(true);
      try {
        const [resSDM, resDkt, resJadwal, resCuti] = await Promise.all([
          fetch("/api/sdm"), fetch("/api/dokter"),
          fetch(`/api/jadwal?bulan=${bulan}&tahun=${tahun}&ruangan=${header.ruangan}`),
          fetch("/api/cuti-sdm")
        ]);
        const dSDM = await resSDM.json();
        const dDkt = await resDkt.json();
        const dJadwal = await resJadwal.json();
        const dCuti = await resCuti.json();

        const sortedSDM = Array.isArray(dSDM) ? dSDM.sort((a, b) => (urutanProfesi[a.jabatan] || 99) - (urutanProfesi[b.jabatan] || 99)) : [];
        setDaftarSDM(sortedSDM);
        setDataMasterDokter(Array.isArray(dDkt) ? dDkt : []);
        setDataCutiSDM(Array.isArray(dCuti) ? dCuti : []);

        const mapJadwal = {};
        if (Array.isArray(dJadwal)) {
          dJadwal.forEach(item => { mapJadwal[`${item.sdm_id}-${item.tanggal}`] = item.simbol; });
        }
        setIsiJadwal(mapJadwal);
        // Reset History saat ganti bulan/pertama load
        setHistory([mapJadwal]);
        setHistoryIndex(0);
      } catch (error) { console.error("Gagal sinkronisasi data:", error); }
      finally { setLoading(false); }
    }
    fetchData();
  }, [bulan, tahun, hasMounted]);

  // --- 4. LOGIKA HELPER & UNDO/REDO ---
  const updateIsiJadwal = (newIsiJadwal) => {
    setIsiJadwal(newIsiJadwal);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newIsiJadwal);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setIsiJadwal(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setIsiJadwal(history[historyIndex + 1]);
    }
  };

  const getAutoCutiValue = (namaSdm, tgl) => {
    const targetDate = format(new Date(tahun, bulan - 1, tgl), "yyyy-MM-dd");
    const foundCuti = dataCutiSDM.find(c => c.nama_sdm === namaSdm && c.status_acc === "Disetujui" && targetDate >= c.tgl_mulai && targetDate <= c.tgl_selesai);
    return foundCuti ? foundCuti.jenis_cuti : null;
  };

  const getSimbolHarian = (tgl, currentVal) => {
    const dayIndex = (hariPertama + tgl - 1) % 7;
    const hariTarget = namaHariLengkap[dayIndex];
    const simbolSesuaiHari = dataMasterDokter.filter(d => d.jadwal_hari === hariTarget && d.simbol_praktik).map(d => d.simbol_praktik);
    const uniqueSimbols = [...new Set([...simbolSesuaiHari, currentVal])];
    return uniqueSimbols.filter(s => s && !statusAbsensi.includes(s));
  };

  const cekTanggalMerah = (tgl) => {
    const d = new Date(tahun, bulan - 1, tgl);
    return getDay(d) === 0 || hariLibur2026.includes(format(d, "yyyy-MM-dd"));
  };

  const hitungTotalMasuk = (tgl, kategori) => {
    let total = 0;
    daftarSDM.forEach(sdm => {
      const val = getAutoCutiValue(sdm.nama, tgl) || isiJadwal[`${sdm.id}-${tgl}`];
      if (val && !statusAbsensi.includes(val)) {
        const isPerawat = sdm.jabatan?.toLowerCase().includes("perawat");
        if (kategori === "perawat" && isPerawat) total++;
        if (kategori === "lain" && !isPerawat) total++;
      }
    });
    return total;
  };

  // --- 5. FUNGSI AKSI ---
  const handleSimpan = async () => {
    // FITUR ALERT JADWAL KOSONG
    let missingCount = 0;
    daftarSDM.forEach(sdm => {
      for (let tgl = 1; tgl <= jumlahHari; tgl++) {
        const autoVal = getAutoCutiValue(sdm.nama, tgl);
        const currentVal = autoVal || isiJadwal[`${sdm.id}-${tgl}`];
        if (!currentVal) missingCount++;
      }
    });

    if (missingCount > 0) {
      const lanjut = window.confirm(`⚠️ PERINGATAN: Masih ada ${missingCount} kotak jadwal yang KOSONG!\n\nKlik 'OK' jika Bapak ingin tetap menyimpannya sekarang, atau 'Batal' untuk melengkapi jadwal.`);
      if (!lanjut) return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/jadwal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan, tahun, ruangan: header.ruangan, dataJadwal: isiJadwal, custom_judul: header.judul_bebas })
      });
      if (res.ok) alert("✅ Jadwal Berhasil Disimpan!");
    } catch (e) { alert("❌ Koneksi Gagal."); }
    finally { setLoading(false); }
  };

  const downloadWord = () => {
    const areaJadwal = document.querySelector("#area-jadwal").cloneNode(true);
    areaJadwal.querySelectorAll("select").forEach(select => {
      const textNode = document.createTextNode(select.value || ".");
      select.parentNode.replaceChild(textNode, select);
    });
    areaJadwal.querySelectorAll(".no-print").forEach(el => el.remove());

    const tableHtml = areaJadwal.querySelector("table").outerHTML;
    const wordHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 0.5cm; }
        div.Section1 { page: Section1; }
        table { border-collapse: collapse; width: 100%; font-family: 'Arial Narrow', Arial; table-layout: fixed; }
        th, td { border: 0.5pt solid black; padding: 2px; font-size: 7.5pt; text-align: center; overflow: hidden; word-wrap: break-word; }
        .bg-red-word { background-color: #FFDADA !important; mso-shading: red; mso-pattern: gray-15 auto; }
        .underline { text-decoration: underline; font-weight: bold; }
      </style></head><body><div class="Section1">
        <div style="text-align:center;"><b>${header.institusi}</b><br/><b>${header.judul_bebas.toUpperCase()}</b><br/>PERIODE: ${daftarBulan[bulan-1].toUpperCase()} ${tahun}</div><br/>
        ${tableHtml}
        <br/>
        <table style="width:100%; border:none;">
          <tr>
            <td style="border:none; width:50%; text-align:center; font-size:9pt;">Mengetahui,<br/>${header.atasan_jabatan}<br/><br/><br/><br/><span class="underline">${header.atasan_nama}</span><br/>NIP. ${header.atasan_nip}</td>
            <td style="border:none; width:50%; text-align:center; font-size:9pt;">${header.tempat_cetak}, ${format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>${header.pembuat_jabatan}<br/><br/><br/><br/><span class="underline">${header.pembuat_nama}</span><br/>NIP. ${header.pembuat_nip}</td>
          </tr>
        </table>
      </div></body></html>
    `;
    const blob = new Blob(['\ufeff', wordHeader], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${header.judul_bebas}.doc`;
    link.click();
  };

  if (!hasMounted) return null;

  return (
    <div className="bg-slate-100 min-h-screen font-sans print:bg-white text-slate-900" suppressHydrationWarning>
      <style jsx global>{`
        .cell-input { min-width: 32px; max-width: 45px; width: 100%; }
        .dropdown-select { width: 100%; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
        @media print {
          @page { size: landscape; margin: 3mm; }
          .no-print { display: none !important; }
          table { width: 100% !important; border: 1pt solid black !important; table-layout: fixed; }
          th, td { border: 0.5pt solid black !important; font-size: 6px !important; padding: 1px !important; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-white/70 z-[100] flex items-center justify-center no-print">
          <Loader2 className="animate-spin text-blue-600" size={50} />
        </div>
      )}

      {/* POP-UP MODAL PENGATURAN HEADER */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
              <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-3">
                <Settings size={20} className="text-blue-400" />
                Pengaturan Identitas Cetak
              </h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px] font-bold uppercase">
                {/* KOLOM KIRI */}
                <div className="space-y-6">
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-blue-600 italic border-b border-blue-200 pb-2 block">Unit & Judul Utama</label>
                    <input type="text" className="w-full p-3 bg-white border rounded-xl" value={header.institusi} onChange={e => setHeader({...header, institusi: e.target.value.toUpperCase()})} />
                    <input type="text" placeholder="JUDUL JADWAL (FREE TEXT)" className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-black" value={header.judul_bebas} onChange={e => setHeader({...header, judul_bebas: e.target.value.toUpperCase()})} />
                  </div>

                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-slate-500 italic border-b border-slate-200 pb-2 block">Identitas Atasan (Mengetahui)</label>
                    <input type="text" placeholder="Nama Atasan" className="w-full p-3 bg-white border rounded-xl" value={header.atasan_nama} onChange={e => setHeader({...header, atasan_nama: e.target.value})} />
                    <input type="text" placeholder="Jabatan Atasan" className="w-full p-3 bg-white border rounded-xl" value={header.atasan_jabatan} onChange={e => setHeader({...header, atasan_jabatan: e.target.value})} />
                    <input type="text" placeholder="NIP Atasan" className="w-full p-3 bg-white border rounded-xl" value={header.atasan_nip} onChange={e => setHeader({...header, atasan_nip: e.target.value})} />
                  </div>
                </div>

                {/* KOLOM KANAN */}
                <div className="space-y-6">
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-emerald-600 italic border-b border-emerald-200 pb-2 block">Identitas Pembuat Jadwal</label>
                    <input type="text" placeholder="Nama Pembuat" className="w-full p-3 bg-white border rounded-xl" value={header.pembuat_nama} onChange={e => setHeader({...header, pembuat_nama: e.target.value})} />
                    <input type="text" placeholder="Jabatan Pembuat" className="w-full p-3 bg-white border rounded-xl" value={header.pembuat_jabatan} onChange={e => setHeader({...header, pembuat_jabatan: e.target.value})} />
                    <input type="text" placeholder="NIP Pembuat" className="w-full p-3 bg-white border rounded-xl" value={header.pembuat_nip} onChange={e => setHeader({...header, pembuat_nip: e.target.value})} />
                  </div>

                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-slate-500 italic border-b border-slate-200 pb-2 block">Tempat & Tanggal Pengesahan</label>
                    <input type="text" placeholder="Tempat (Contoh: MAGELANG)" className="w-full p-3 bg-white border rounded-xl" value={header.tempat_cetak} onChange={e => setHeader({...header, tempat_cetak: e.target.value.toUpperCase()})} />
                    <input type="date" className="w-full p-3 bg-white border rounded-xl" value={header.tgl_cetak} onChange={e => setHeader({...header, tgl_cetak: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowSettingsModal(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black text-xs uppercase transition-all shadow-md">
                Tutup & Simpan Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-2 lg:p-6">
        
        {/* ACTION BAR ATAS (PENGGANTI FORM HEADER) */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={() => setShowSettingsModal(true)} 
              className="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-700 w-full md:w-auto justify-center transition-all"
            >
              <Settings size={16} className="text-blue-400" />
              Atur Identitas & Header
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden md:block">Pilih Periode:</span>
            <select value={bulan} onChange={e => setBulan(parseInt(e.target.value))} className="p-3 border-2 border-blue-100 bg-blue-50 text-blue-900 rounded-xl font-black text-xs uppercase w-full md:w-auto">
              {daftarBulan.map((b, i) => <option key={i} value={i+1}>{b}</option>)}
            </select>
            <input type="number" value={tahun} onChange={e => setTahun(parseInt(e.target.value))} className="p-3 border-2 border-blue-100 bg-blue-50 text-blue-900 rounded-xl font-black text-xs uppercase w-24 text-center" />
          </div>
        </div>

        {/* AREA TABEL JADWAL */}
        <div id="area-jadwal" className="bg-white p-2 md:p-5 rounded-[2rem] shadow-xl overflow-hidden print-area">
          <div className="text-center mb-5 uppercase font-bold hidden print:block">
            <h1 className="text-xl font-black">{header.institusi}</h1>
            <h2 className="text-lg text-blue-600">{header.judul_bebas}</h2>
            <p className="text-sm">PERIODE: {daftarBulan[bulan-1].toUpperCase()} {tahun}</p>
          </div>

          <div className="overflow-x-auto border-t border-l border-black">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="border border-black p-1 text-[10px] w-8" rowSpan="2">NO</th>
                  <th className="border border-black p-1 text-[10px] w-48" rowSpan="2">NAMA & JABATAN</th>
                  <th className="border border-black p-1 text-[10px]" colSpan={jumlahHari}>TANGGAL</th>
                  <th className="border border-black p-1 text-[10px] w-32" rowSpan="2">REKAP</th>
                </tr>
                <tr className="bg-slate-700 text-white">
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <th key={i} className={`border border-black p-1 text-[9px] cell-input ${cekTanggalMerah(i+1) ? 'text-red-300 bg-red-word' : ''}`}>
                      {i+1}<br/>{namaHariSingkat[(hariPertama + i) % 7]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daftarSDM.map((sdm, idx) => {
                  const rekap = {};
                  return (
                    <tr key={sdm.id} className="text-center">
                      <td className="border border-black p-1 text-[9px]">{idx+1}</td>
                      <td className="border border-black p-1 text-left whitespace-nowrap bg-slate-50 truncate">
                        <div className="font-bold text-[10px] uppercase truncate">{sdm.nama}</div>
                        <div className="text-[8px] text-blue-600 italic font-semibold truncate">{sdm.jabatan}</div>
                      </td>
                      {Array.from({ length: jumlahHari }).map((_, i) => {
                        const tgl = i + 1;
                        const autoVal = getAutoCutiValue(sdm.nama, tgl);
                        const currentVal = autoVal || isiJadwal[`${sdm.id}-${tgl}`] || "";
                        if (currentVal) rekap[currentVal] = (rekap[currentVal] || 0) + 1;
                        
                        return (
                          <td key={i} className={`border border-black p-0 cell-input`}>
                            <div className="no-print">
                              <select 
                                value={currentVal} 
                                title={currentVal} 
                                disabled={!!autoVal}
                                onChange={e => updateIsiJadwal({...isiJadwal, [`${sdm.id}-${tgl}`]: e.target.value.toUpperCase()})}
                                className={`dropdown-select bg-transparent text-center font-bold text-[10px] h-8 outline-none appearance-none cursor-pointer ${autoVal ? 'text-red-600 font-black' : 'text-slate-900'}`}
                              >
                                <option value=""></option>
                                <optgroup label="ABSENSI">
                                  {statusAbsensi.map(s => <option key={s} value={s}>{s}</option>)}
                                </optgroup>
                                <optgroup label="DOKTER (CERDAS)">
                                  {getSimbolHarian(tgl, currentVal).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                  <option value="M">M</option>
                                </optgroup>
                              </select>
                            </div>
                            <span className="hidden print:block font-bold text-[9px] truncate">{currentVal}</span>
                          </td>
                        );
                      })}
                      <td className="border border-black p-1 text-[8px] text-left font-bold italic truncate">
                        {Object.entries(rekap).map(([k,v]) => `${k}:${v} `)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold text-[9px]">
                <tr>
                  <td colSpan="2" className="border border-black p-1 text-right italic uppercase">Jumlah Perawat Masuk</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className="border border-black text-center text-blue-600 font-black cell-input">
                      {hitungTotalMasuk(i+1, "perawat") || ""}
                    </td>
                  ))}
                  <td className="border border-black"></td>
                </tr>
                <tr>
                  <td colSpan="2" className="border border-black p-1 text-right italic uppercase">Jumlah Tenaga Lain Masuk</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className="border border-black text-center text-emerald-600 font-black cell-input">
                      {hitungTotalMasuk(i+1, "lain") || ""}
                    </td>
                  ))}
                  <td className="border border-black"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-8 flex justify-between text-center font-bold text-[11px] px-10 hidden print:flex">
            <div className="w-1/3">Mengetahui,<br/>{header.atasan_jabatan}<br/><br/><br/><br/><u>{header.atasan_nama}</u><br/>NIP. {header.atasan_nip}</div>
            <div className="w-1/3">{header.tempat_cetak}, {format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>{header.pembuat_jabatan}<br/><br/><br/><br/><u>{header.pembuat_nama}</u><br/>NIP. {header.pembuat_nip}</div>
          </div>
        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="fixed bottom-6 right-6 flex gap-3 no-print z-[90]">
          {/* TOMBOL UNDO */}
          <button onClick={handleUndo} disabled={historyIndex === 0} className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg hover:bg-amber-600 disabled:opacity-50 transition-all hidden md:block">
            <Undo2 size={18} />
          </button>
          {/* TOMBOL REDO */}
          <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg hover:bg-amber-600 disabled:opacity-50 transition-all hidden md:block">
            <Redo2 size={18} />
          </button>

          <button onClick={downloadWord} className="bg-emerald-600 text-white px-4 md:px-6 py-4 rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
            <FileText size={18} /> <span className="hidden md:inline">Word Pro</span>
          </button>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 md:px-6 py-4 rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-all">
            <Printer size={18} /> <span className="hidden md:inline">Print PDF</span>
          </button>
          <button onClick={handleSimpan} className="bg-blue-600 text-white px-6 md:px-10 py-4 rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all">
            {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />} <span className="hidden md:inline">Simpan Jadwal</span>
          </button>
        </div>
      </div>
    </div>
  );
}