"use client";

import React, { useState, useEffect } from "react";
import { getDaysInMonth, startOfMonth, getDay, format } from "date-fns";
import { Save, Printer, Loader2, FileText, AlertTriangle } from "lucide-react";
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

  const [header, setHeader] = useState({
    institusi: "RSUD MERAH PUTIH",
    ruangan: "POLIKLINIK",
    atasan_nama: "RIANA, S.TR.KEB.",
    atasan_jabatan: "KASI PELAYANAN KEPERAWATAN DAN KEBIDANAN",
    atasan_nip: "197510272003122005",
    pembuat_nama: "DANIEL ARI KRISTITANTO,S.KEP.NS",
    pembuat_jabatan: "KOORDINATOR RUANGAN",
    pembuat_nip: "199303042019031006",
    tgl_cetak: format(new Date(), "yyyy-MM-dd")
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
      } catch (error) { console.error("Gagal sinkronisasi data:", error); }
      finally { setLoading(false); }
    }
    fetchData();
  }, [bulan, tahun, hasMounted]);

  // --- 4. LOGIKA HELPER ---
  const getAutoCutiValue = (namaSdm, tgl) => {
    const targetDate = format(new Date(tahun, bulan - 1, tgl), "yyyy-MM-dd");
    const foundCuti = dataCutiSDM.find(c => c.nama_sdm === namaSdm && c.status_acc === "Disetujui" && targetDate >= c.tgl_mulai && targetDate <= c.tgl_selesai);
    return foundCuti ? foundCuti.jenis_cuti : null;
  };

  const getSimbolHarian = (tgl, currentVal) => {
    const dayIndex = (hariPertama + tgl - 1) % 7;
    const hariTarget = namaHariLengkap[dayIndex];
    const simbolSesuaiHari = dataMasterDokter.filter(d => d.jadwal_hari === hariTarget && d.simbol_praktik).map(d => d.simbol_praktik);
    const semuaSimbolMaster = dataMasterDokter.filter(d => d.simbol_praktik).map(d => d.simbol_praktik);
    return [...new Set([...simbolSesuaiHari, currentVal, ...semuaSimbolMaster])].filter(s => s && !statusAbsensi.includes(s));
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
    setLoading(true);
    try {
      const res = await fetch("/api/jadwal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan, tahun, ruangan: header.ruangan, dataJadwal: isiJadwal })
      });
      if (res.ok) alert("✅ Jadwal Berhasil Disimpan!");
    } catch (e) { alert("❌ Koneksi Gagal."); }
    finally { setLoading(false); }
  };

  const downloadWord = () => {
    const areaJadwal = document.querySelector("#area-jadwal").cloneNode(true);
    
    // Konversi select ke teks biasa agar muncul di Word
    areaJadwal.querySelectorAll("select").forEach(select => {
      const textNode = document.createTextNode(select.value || ".");
      select.parentNode.replaceChild(textNode, select);
    });
    
    // Hapus tombol atau elemen no-print lainnya
    areaJadwal.querySelectorAll(".no-print").forEach(el => el.remove());

    const tableHtml = areaJadwal.querySelector("table").outerHTML;
    const wordHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 0.5cm; }
        div.Section1 { page: Section1; }
        table { border-collapse: collapse; width: 100%; font-family: 'Arial Narrow', Arial; }
        th, td { border: 0.5pt solid black; padding: 2px; font-size: 7.5pt; text-align: center; }
        /* Style Blok Merah Hari Libur di Word */
        .bg-red-word { background-color: #FFDADA !important; mso-shading: red; mso-pattern: gray-15 auto; }
        .underline { text-decoration: underline; font-weight: bold; }
      </style></head><body><div class="Section1">
        <div style="text-align:center;"><b>${header.institusi}</b><br/><b>JADWAL DINAS ${header.ruangan}</b><br/>PERIODE: ${daftarBulan[bulan-1].toUpperCase()} ${tahun}</div><br/>
        ${tableHtml}
        <br/>
        <table style="width:100%; border:none;">
          <tr>
            <td style="border:none; width:50%; text-align:center;">Mengetahui,<br/>${header.atasan_jabatan}<br/><br/><br/><br/><span class="underline">${header.atasan_nama}</span><br/>NIP. ${header.atasan_nip}</td>
            <td style="border:none; width:50%; text-align:center;">Temanggung, ${format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>${header.pembuat_jabatan}<br/><br/><br/><br/><span class="underline">${header.pembuat_nama}</u><br/>NIP. ${header.pembuat_nip}</td>
          </tr>
        </table>
      </div></body></html>
    `;
    const blob = new Blob(['\ufeff', wordHeader], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Jadwal_${header.ruangan}.doc`;
    link.click();
  };

  if (!hasMounted) return null;

  return (
    <div className="bg-slate-100 min-h-screen font-sans print:bg-white text-slate-900" suppressHydrationWarning>
      <style jsx global>{`
        @media print {
          @page { size: landscape; margin: 3mm; }
          .no-print { display: none !important; }
          table { width: 100% !important; border: 1pt solid black !important; }
          th, td { border: 0.5pt solid black !important; font-size: 6px !important; padding: 1px !important; }
        }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-white/70 z-[100] flex items-center justify-center no-print">
          <Loader2 className="animate-spin text-blue-600" size={50} />
        </div>
      )}

      <div className="p-2 lg:p-6">
        {/* PANEL INPUT OTORITAS LENGKAP */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-6 no-print">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-[11px] font-bold uppercase">
            <div className="space-y-3">
              <label className="text-blue-600 italic">Unit & Periode</label>
              <input type="text" className="w-full p-2 bg-slate-50 border rounded-xl" value={header.institusi} onChange={e => setHeader({...header, institusi: e.target.value.toUpperCase()})} />
              <div className="flex gap-2">
                <select value={bulan} onChange={e => setBulan(parseInt(e.target.value))} className="w-full p-2 border rounded-xl">
                  {daftarBulan.map((b, i) => <option key={i} value={i+1}>{b}</option>)}
                </select>
                <input type="number" value={tahun} onChange={e => setTahun(parseInt(e.target.value))} className="w-full p-2 border rounded-xl" />
              </div>
            </div>

            <div className="space-y-3 border-l pl-6">
              <label className="text-slate-400 italic">Atasan (Mengetahui)</label>
              <input type="text" placeholder="Nama Atasan" className="w-full p-2 border rounded-xl" value={header.atasan_nama} onChange={e => setHeader({...header, atasan_nama: e.target.value})} />
              <input type="text" placeholder="Jabatan Atasan" className="w-full p-2 border rounded-xl" value={header.atasan_jabatan} onChange={e => setHeader({...header, atasan_jabatan: e.target.value})} />
              <input type="text" placeholder="NIP Atasan" className="w-full p-2 border rounded-xl" value={header.atasan_nip} onChange={e => setHeader({...header, atasan_nip: e.target.value})} />
            </div>

            <div className="space-y-3 border-l pl-6">
              <label className="text-blue-600 italic">Pembuat Jadwal</label>
              <input type="text" placeholder="Nama Pembuat" className="w-full p-2 border rounded-xl" value={header.pembuat_nama} onChange={e => setHeader({...header, pembuat_nama: e.target.value})} />
              <input type="text" placeholder="Jabatan Pembuat" className="w-full p-2 border rounded-xl" value={header.pembuat_jabatan} onChange={e => setHeader({...header, pembuat_jabatan: e.target.value})} />
              <input type="text" placeholder="NIP Pembuat" className="w-full p-2 border rounded-xl" value={header.pembuat_nip} onChange={e => setHeader({...header, pembuat_nip: e.target.value})} />
            </div>

            <div className="space-y-3 border-l pl-6">
              <label className="text-slate-400 italic">Tanggal Cetak</label>
              <input type="date" className="w-full p-2 bg-blue-50 border rounded-xl" value={header.tgl_cetak} onChange={e => setHeader({...header, tgl_cetak: e.target.value})} />
              <div className="bg-amber-50 p-2 rounded-xl border border-amber-200 flex gap-2 items-start">
                <AlertTriangle size={16} className="text-amber-600 mt-1" />
                <p className="text-[9px] text-amber-700 leading-tight"><b>Fitur:</b> Word Pro kini menyertakan blok merah pada hari libur.</p>
              </div>
            </div>
          </div>
        </div>

        {/* TABEL JADWAL */}
        <div id="area-jadwal" className="bg-white p-5 rounded-[2rem] shadow-xl overflow-hidden print-area">
          <div className="text-center mb-5">
            <h1 className="text-xl font-black uppercase tracking-tight">{header.institusi}</h1>
            <h2 className="text-lg font-bold text-blue-600 uppercase tracking-tighter">JADWAL DINAS {header.ruangan}</h2>
            <p className="font-bold text-sm">PERIODE: {daftarBulan[bulan-1].toUpperCase()} {tahun}</p>
          </div>

          <div className="overflow-x-auto border-t border-l border-black">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="border border-black p-1 text-[10px]" rowSpan="2">NO</th>
                  <th className="border border-black p-1 text-[10px] min-w-[150px]" rowSpan="2">NAMA & JABATAN</th>
                  <th className="border border-black p-1 text-[10px]" colSpan={jumlahHari}>TANGGAL</th>
                  <th className="border border-black p-1 text-[10px]" rowSpan="2">REKAP</th>
                </tr>
                <tr className="bg-slate-700 text-white">
                  {Array.from({ length: jumlahHari }).map((_, i) => {
                    const libur = cekTanggalMerah(i+1);
                    return (
                      <th key={i} className={`border border-black p-1 text-[9px] ${libur ? 'text-red-300 bg-red-word' : ''}`}>
                        {i+1}<br/>{namaHariSingkat[(hariPertama + i) % 7]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {daftarSDM.map((sdm, idx) => {
                  const rekap = {};
                  return (
                    <tr key={sdm.id} className="text-center">
                      <td className="border border-black p-1 text-[9px]">{idx+1}</td>
                      <td className="border border-black p-1 text-left whitespace-nowrap bg-slate-50">
                        <div className="font-bold text-[10px] uppercase">{sdm.nama}</div>
                        <div className="text-[8px] text-blue-600 italic font-semibold">{sdm.jabatan}</div>
                      </td>
                      {Array.from({ length: jumlahHari }).map((_, i) => {
                        const tgl = i + 1;
                        const libur = cekTanggalMerah(tgl);
                        const autoVal = getAutoCutiValue(sdm.nama, tgl);
                        const currentVal = autoVal || isiJadwal[`${sdm.id}-${tgl}`] || "";
                        
                        if (currentVal) {
                          rekap[currentVal] = (rekap[currentVal] || 0) + 1;
                        }

                        return (
                          <td key={i} className={`border border-black p-0 ${libur ? 'bg-red-50 bg-red-word' : ''}`}>
                            <div className="no-print">
                              <select 
                                value={currentVal} 
                                disabled={!!autoVal}
                                onChange={e => setIsiJadwal({...isiJadwal, [`${sdm.id}-${tgl}`]: e.target.value.toUpperCase()})}
                                className={`w-full bg-transparent text-center font-bold text-[10px] h-8 outline-none appearance-none cursor-pointer ${autoVal ? 'text-red-600 font-black' : 'text-slate-900'}`}
                              >
                                <option value=""></option>
                                <optgroup label="ABSENSI">
                                  {statusAbsensi.map(s => <option key={s} value={s}>{s}</option>)}
                                </optgroup>
                                <optgroup label="SIMBOL DOKTER">
                                  {getSimbolHarian(tgl, currentVal).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                  <option value="M">M</option>
                                </optgroup>
                              </select>
                            </div>
                            <span className="hidden print:block font-bold text-[9px]">{currentVal}</span>
                          </td>
                        );
                      })}
                      <td className="border border-black p-1 text-[8px] text-left font-bold italic">
                        {Object.entries(rekap).map(([k,v]) => `${k}:${v} `)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold text-[9px]">
                {/* JUMLAH PERAWAT */}
                <tr>
                  <td colSpan="2" className="border border-black p-1 text-right italic">JUMLAH PERAWAT MASUK</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className={`border border-black text-center text-blue-600 font-black ${cekTanggalMerah(i+1) ? 'bg-red-word' : ''}`}>
                      {hitungTotalMasuk(i+1, "perawat") || ""}
                    </td>
                  ))}
                  <td className="border border-black"></td>
                </tr>
                {/* JUMLAH TENAGA LAIN */}
                <tr>
                  <td colSpan="2" className="border border-black p-1 text-right italic">JUMLAH TENAGA LAIN MASUK</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className={`border border-black text-center text-emerald-600 font-black ${cekTanggalMerah(i+1) ? 'bg-red-word' : ''}`}>
                      {hitungTotalMasuk(i+1, "lain") || ""}
                    </td>
                  ))}
                  <td className="border border-black"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-8 flex justify-between text-center font-bold text-[11px] px-10">
            <div className="w-1/3">Mengetahui,<br/>{header.atasan_jabatan}<br/><br/><br/><br/><u>{header.atasan_nama}</u><br/>NIP. {header.atasan_nip}</div>
            <div className="w-1/3">Temanggung, {format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>{header.pembuat_jabatan}<br/><br/><br/><br/><u>{header.pembuat_nama}</u><br/>NIP. {header.pembuat_nip}</div>
          </div>
        </div>

        {/* TOMBOL AKSI */}
        <div className="fixed bottom-6 right-6 flex gap-3 no-print">
          <button onClick={downloadWord} className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
            <FileText size={18} /> Word Pro
          </button>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-all">
            <Printer size={18} /> Print PDF
          </button>
          <button onClick={handleSimpan} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all">
            {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />} Simpan Jadwal
          </button>
        </div>
      </div>
    </div>
  );
}