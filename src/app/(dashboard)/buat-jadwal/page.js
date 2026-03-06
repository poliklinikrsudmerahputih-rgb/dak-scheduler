"use client";
import React, { useState, useEffect } from "react";
import { getDaysInMonth, startOfMonth, getDay, format } from "date-fns";
import { Save, Printer, Loader2, FileText } from "lucide-react";
import { id } from "date-fns/locale";

export default function BuatJadwal() {
  // --- 1. STATE & HYDRATION ---
  const [hasMounted, setHasMounted] = useState(false);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [daftarSDM, setDaftarSDM] = useState([]);
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

  const hariLibur2026 = [
    "2026-01-01", "2026-01-16", "2026-02-16", "2026-02-17", "2026-03-18",
    "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", "2026-03-23",
    "2026-03-24", "2026-04-03", "2026-04-05", "2026-05-01", "2026-05-14",
    "2026-05-15", "2026-05-27", "2026-05-28", "2026-03-31", "2026-06-01",
    "2026-06-16", "2026-08-17", "2026-08-25", "2026-12-24", "2026-12-25"
  ];

  const statusAbsensi = ["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"];

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    async function fetchData() {
      setLoading(true);
      try {
        const [resSDM, resDkt, resJadwal] = await Promise.all([
          fetch("/api/sdm"),
          fetch("/api/dokter"),
          fetch(`/api/jadwal?bulan=${bulan}&tahun=${tahun}&ruangan=${header.ruangan}`)
        ]);
        const dSDM = await resSDM.json();
        const dDkt = await resDkt.json();
        const dJadwal = await resJadwal.json();

        if (dSDM.length > 0 && dSDM[0].ruangan) {
          setHeader(prev => ({ ...prev, ruangan: dSDM[0].ruangan }));
        }

        setDaftarSDM(Array.isArray(dSDM) ? dSDM.sort((a, b) => (a.jabatan || "").localeCompare(b.jabatan || "")) : []);
        setDataMasterDokter(Array.isArray(dDkt) ? dDkt : []);

        const mapJadwal = {};
        if (Array.isArray(dJadwal)) {
          dJadwal.forEach(item => { mapJadwal[`${item.sdm_id}-${item.tanggal}`] = item.simbol; });
        }
        setIsiJadwal(mapJadwal);
      } catch (error) {
        console.error("Gagal sinkronisasi data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [bulan, tahun, hasMounted]);

  const semuaSimbol = [
    ...new Set(dataMasterDokter.map(d => d.simbol_praktik).filter(s => s)),
    ...statusAbsensi
  ];

  const daftarBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const namaHariSingkat = ["M", "SN", "SL", "R", "K", "J", "S"];
  const tanggalPilihan = new Date(tahun, bulan - 1);
  const jumlahHari = getDaysInMonth(tanggalPilihan);
  const hariPertama = getDay(startOfMonth(tanggalPilihan));

  const cekTanggalMerah = (tgl) => {
    const d = new Date(tahun, bulan - 1, tgl);
    return getDay(d) === 0 || hariLibur2026.includes(format(d, "yyyy-MM-dd"));
  };

  const hitungTotalMasuk = (tgl, kategori) => {
    let total = 0;
    daftarSDM.forEach(sdm => {
      const val = isiJadwal[`${sdm.id}-${tgl}`];
      const isPerawat = sdm.jabatan?.toLowerCase().includes("perawat");
      if (val && !statusAbsensi.includes(val)) {
        if (kategori === "perawat" && isPerawat) total++;
        if (kategori === "lain" && !isPerawat) total++;
      }
    });
    return total;
  };

  const handleSimpan = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jadwal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan, tahun, ruangan: header.ruangan, dataJadwal: isiJadwal })
      });
      if (res.ok) alert("✅ Jadwal Berhasil Disimpan!");
      else alert("❌ Gagal menyimpan.");
    } catch (e) { alert("❌ Koneksi Database Terputus."); }
    finally { setLoading(false); }
  };

  const downloadWord = () => {
    const tableHtml = document.querySelector("#area-jadwal table").outerHTML;
    const wordHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Jadwal Dinas</title>
      <style>
        @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 0.5cm; }
        div.Section1 { page: Section1; }
        table { border-collapse: collapse; width: 100%; font-family: 'Arial Narrow', Arial; table-layout: auto; }
        th, td { border: 0.5pt solid black; padding: 2px; font-size: 7pt; text-align: center; white-space: nowrap; }
        .ttd-table { border: none !important; margin-top: 20px; width: 100%; }
        .ttd-cell { border: none !important; width: 50%; font-size: 9pt; text-align: center; vertical-align: top; }
        .underline { text-decoration: underline; font-weight: bold; }
      </style>
      </head><body><div class="Section1">
        <div style="text-align:center;">
          <h1 style="font-size:14pt; margin:0;">${header.institusi}</h1>
          <h2 style="font-size:12pt; margin:0;">JADWAL DINAS ${header.ruangan}</h2>
          <p style="font-size:9pt; font-weight:bold;">PERIODE: ${daftarBulan[bulan - 1]} ${tahun}</p>
        </div>
        <br/>
        ${tableHtml}
        <table class="ttd-table">
          <tr>
            <td class="ttd-cell">
              Mengetahui,<br/>${header.atasan_jabatan}<br/><br/><br/><br/>
              <span class="underline">${header.atasan_nama}</span><br/>NIP. ${header.atasan_nip}
            </td>
            <td class="ttd-cell">
              Temanggung, ${format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>
              ${header.pembuat_jabatan}<br/><br/><br/><br/>
              <span class="underline">${header.pembuat_nama}</span><br/>NIP. ${header.pembuat_nip}
            </td>
          </tr>
        </table>
      </div></body></html>
    `;
    const blob = new Blob(['\ufeff', wordHeader], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Jadwal_${header.ruangan}_${daftarBulan[bulan - 1]}.doc`;
    link.click();
  };

  if (!hasMounted) return null;

  return (
    <div className="bg-slate-100 min-h-screen font-sans print:bg-white text-slate-900" suppressHydrationWarning>
      <style jsx global>{`
        @media print {
          @page { size: landscape; margin: 3mm; }
          body { background: white; }
          .print-area { width: 100% !important; transform: scale(1); }
          .no-print { display: none !important; }
          table { width: 100% !important; border: 1pt solid black !important; table-layout: auto !important; }
          th, td { border: 0.5pt solid black !important; font-size: 6px !important; padding: 1px !important; white-space: nowrap !important; }
        }
        /* FITUR RESIZE KOLOM ALA EXCEL */
        .resizable-col {
          resize: horizontal;
          overflow: hidden;
          min-width: 45px;
          display: inline-block;
          vertical-align: middle;
          cursor: col-resize;
        }
        .resizable-col::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-white/70 z-[100] flex items-center justify-center no-print">
          <Loader2 className="animate-spin text-blue-600" size={50} />
        </div>
      )}

      <div className="p-2 lg:p-6">
        {/* --- SETTINGS --- */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-6 no-print">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-black text-blue-600 uppercase italic">Unit & Waktu</label>
              <input type="text" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold uppercase" value={header.institusi} onChange={e => setHeader({ ...header, institusi: e.target.value.toUpperCase() })} />
              <input type="text" className="w-full p-2 bg-slate-100 rounded-xl text-xs font-black text-blue-700 uppercase" value={header.ruangan} readOnly />
              <div className="flex gap-2">
                <select value={bulan} onChange={(e) => setBulan(parseInt(e.target.value))} className="w-full p-2 bg-slate-50 rounded-xl font-bold uppercase text-xs">
                  {daftarBulan.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
                </select>
                <input type="number" value={tahun} onChange={(e) => setTahun(parseInt(e.target.value))} className="w-full p-2 bg-slate-50 rounded-xl font-bold text-xs" />
              </div>
            </div>
            <div className="space-y-3 border-l pl-6">
              <label className="text-xs font-black text-slate-400 uppercase italic">Otoritas Mengetahui</label>
              <input type="text" placeholder="Nama Atasan" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold" value={header.atasan_nama} onChange={e => setHeader({ ...header, atasan_nama: e.target.value })} />
              <input type="text" placeholder="Jabatan Atasan" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold" value={header.atasan_jabatan} onChange={e => setHeader({ ...header, atasan_jabatan: e.target.value })} />
              <input type="text" placeholder="NIP Atasan" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold" value={header.atasan_nip} onChange={e => setHeader({ ...header, atasan_nip: e.target.value })} />
            </div>
            <div className="space-y-3 border-l pl-6">
              <label className="text-xs font-black text-blue-600 uppercase italic">Otoritas Pembuat</label>
              <input type="text" placeholder="Nama Pembuat" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold" value={header.pembuat_nama} onChange={e => setHeader({ ...header, pembuat_nama: e.target.value })} />
              {/* INPUT JABATAN PEMBUAT SUDAH TERSEDIA */}
              <input type="text" placeholder="Jabatan Pembuat" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold" value={header.pembuat_jabatan} onChange={e => setHeader({ ...header, pembuat_jabatan: e.target.value })} />
              <input type="text" placeholder="NIP Pembuat" className="w-full p-2 bg-slate-50 rounded-xl text-xs font-bold" value={header.pembuat_nip} onChange={e => setHeader({ ...header, pembuat_nip: e.target.value })} />
              <input type="date" className="w-full p-2 bg-blue-50 rounded-xl text-xs font-bold text-blue-700" value={header.tgl_cetak} onChange={e => setHeader({ ...header, tgl_cetak: e.target.value })} />
            </div>
          </div>
        </div>

        {/* --- AREA JADWAL --- */}
        <div id="area-jadwal" className="print-area bg-white p-4 rounded-[2rem] shadow-xl overflow-hidden" suppressHydrationWarning>
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
            <h1 style={{ fontSize: '14pt', fontWeight: '900', margin: '0' }}>{header.institusi}</h1>
            <h2 style={{ fontSize: '12pt', fontWeight: 'bold', margin: '0', color: '#2563eb' }}>JADWAL DINAS {header.ruangan}</h2>
            <p style={{ fontSize: '9pt', fontWeight: 'bold', margin: '2px 0' }}>PERIODE: {daftarBulan[bulan - 1]} {tahun}</p>
          </div>

          <div className="overflow-x-auto border border-black scrollbar-thin scrollbar-thumb-slate-300">
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a', color: 'white' }}>
                  <th style={{ border: '1pt solid black', padding: '4px' }} rowSpan="2">NO</th>
                  <th style={{ border: '1pt solid black', padding: '4px', whiteSpace: 'nowrap' }} rowSpan="2">NAMA & JABATAN</th>
                  <th style={{ border: '1pt solid black', padding: '4px' }} colSpan={jumlahHari}>TANGGAL</th>
                  <th style={{ border: '1pt solid black', padding: '4px' }} rowSpan="2">REKAP</th>
                  <th style={{ border: '1pt solid black', padding: '4px' }} rowSpan="2">OFF</th>
                </tr>
                <tr style={{ backgroundColor: '#1e293b', color: 'white' }}>
                  {Array.from({ length: jumlahHari }).map((_, i) => {
                    const isRed = cekTanggalMerah(i + 1);
                    return (
                      <th key={i} style={{ border: '1pt solid black', padding: '0', color: isRed ? '#f87171' : 'white' }}>
                        {/* DIV RESIZABLE UNTUK TARIK GARIS KOLOM */}
                        <div className="resizable-col no-print" style={{ padding: '4px', fontSize: '8pt' }}>
                          {i + 1}<br />{namaHariSingkat[(hariPertama + i) % 7]}
                        </div>
                        <div className="hidden print:block" style={{ padding: '2px', fontSize: '7pt' }}>
                           {i + 1}<br />{namaHariSingkat[(hariPertama + i) % 7]}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {daftarSDM.map((sdm, idx) => {
                  const rekap = { dinas: {}, off: 0 };
                  for (let i = 1; i <= jumlahHari; i++) {
                    const val = isiJadwal[`${sdm.id}-${i}`];
                    if (val) {
                      if (statusAbsensi.includes(val)) rekap.off++;
                      else rekap.dinas[val] = (rekap.dinas[val] || 0) + 1;
                    }
                  }
                  return (
                    <tr key={sdm.id} style={{ textAlign: 'center' }}>
                      <td style={{ border: '1pt solid black', padding: '2px', fontSize: '8pt' }}>{idx + 1}</td>
                      <td style={{ border: '1pt solid black', padding: '4px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '8.5pt', fontWeight: 'bold' }}>{sdm.nama}</div>
                        <div style={{ fontSize: '6.5pt', color: '#2563eb', fontWeight: '600' }}>{sdm.jabatan}</div>
                      </td>
                      {Array.from({ length: jumlahHari }).map((_, i) => {
                        const tgl = i + 1;
                        const isRed = cekTanggalMerah(tgl);
                        const val = isiJadwal[`${sdm.id}-${tgl}`] || "";
                        return (
                          <td key={i} style={{ border: '1pt solid black', padding: '0', backgroundColor: isRed ? '#fef2f2' : 'transparent' }}>
                            <input
                              className="no-print"
                              value={val}
                              onChange={(e) => setIsiJadwal({ ...isiJadwal, [`${sdm.id}-${tgl}`]: e.target.value.toUpperCase() })}
                              list="simbol-list"
                              style={{ width: '100%', minWidth: '100%', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'bold', fontSize: '9px', color: isRed ? '#dc2626' : 'black', padding: '8px 2px' }}
                            />
                            <span className="hidden print:block" style={{ fontWeight: 'bold', fontSize: '7pt', color: isRed ? '#dc2626' : 'black' }}>{val || "."}</span>
                          </td>
                        );
                      })}
                      <td style={{ border: '1pt solid black', fontSize: '6.5pt', textAlign: 'left', padding: '2px', whiteSpace: 'nowrap' }}>
                        {Object.entries(rekap.dinas).map(([s, j]) => `${s}:${j} `)}
                      </td>
                      <td style={{ border: '1pt solid black', color: '#dc2626', fontWeight: 'bold', fontSize: '8pt' }}>{rekap.off || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot style={{ backgroundColor: '#f8fafc', fontWeight: 'bold', fontSize: '7.5pt' }}>
                <tr>
                  <td style={{ border: '1pt solid black', padding: '5px', textAlign: 'right' }} colSpan="2">Jumlah Perawat Masuk</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} style={{ border: '1pt solid black', color: '#2563eb' }}>{hitungTotalMasuk(i + 1, "perawat") || ""}</td>
                  ))}
                  <td style={{ border: '1pt solid black' }} colSpan="2"></td>
                </tr>
                <tr>
                  <td style={{ border: '1pt solid black', padding: '5px', textAlign: 'right' }} colSpan="2">Jumlah Tenaga Lain</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} style={{ border: '1pt solid black', color: '#059669' }}>{hitungTotalMasuk(i + 1, "lain") || ""}</td>
                  ))}
                  <td style={{ border: '1pt solid black' }} colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', textAlign: 'center', fontSize: '9pt' }}>
            <div style={{ width: '40%' }}>
              <p>Mengetahui,</p>
              <p style={{ fontWeight: 'bold', margin: '0' }}>{header.atasan_jabatan}</p>
              <br /><br /><br />
              <p style={{ textDecoration: 'underline', fontWeight: 'bold', margin: '0' }}>{header.atasan_nama}</p>
              <p style={{ margin: '0' }}>NIP. {header.atasan_nip}</p>
            </div>
            <div style={{ width: '40%' }}>
              <p>Temanggung, {format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}</p>
              <p style={{ fontWeight: 'bold', margin: '0' }}>{header.pembuat_jabatan}</p>
              <br /><br /><br />
              <p style={{ textDecoration: 'underline', fontWeight: 'bold', margin: '0' }}>{header.pembuat_nama}</p>
              <p style={{ margin: '0' }}>NIP. {header.pembuat_nip}</p>
            </div>
          </div>
        </div>

        <datalist id="simbol-list">
          {semuaSimbol.map((s, idx) => (
            <option key={idx} value={s} />
          ))}
        </datalist>

        <div className="fixed bottom-6 right-6 flex flex-col md:flex-row gap-3 no-print">
          <button onClick={downloadWord} className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
            <FileText size={18} /> Word
          </button>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-blue-600 transition-all">
            <Printer size={18} /> PDF
          </button>
          <button onClick={handleSimpan} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-slate-900 transition-all">
            <Save size={18} /> Simpan Jadwal
          </button>
        </div>
      </div>
    </div>
  );
}