"use client";
import React, { useState, useEffect } from "react";
import { getDaysInMonth, startOfMonth, getDay, format } from "date-fns";
import { Save, Printer, Calendar as CalendarIcon, Download, Loader2 } from "lucide-react"; // PERBAIKAN: lucide-react
import { id } from "date-fns/locale";

export default function BuatJadwal() {
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [daftarSDM, setDaftarSDM] = useState([]);
  const [dataMasterDokter, setDataMasterDokter] = useState([]);
  const [isiJadwal, setIsiJadwal] = useState({});
  const [loading, setLoading] = useState(false);

  const hariLibur2026 = [
    "2026-01-01", "2026-01-16", "2026-02-16", "2026-02-17", "2026-03-18",
    "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", "2026-03-23",
    "2026-03-24", "2026-04-03", "2026-04-05", "2026-05-01", "2026-05-14",
    "2026-05-15", "2026-05-27", "2026-05-28", "2026-03-31", "2026-06-01",
    "2026-06-16", "2026-08-17", "2026-08-25", "2026-12-24", "2026-12-25"
  ];

  const [header, setHeader] = useState({
    institusi: "RSUD MERAH PUTIH",
    ruangan: "POLIKLINIK",
    atasan_nama: "RIANA, S.TR.KEB.",
    atasan_jabatan: "KASI PELAYANAN KEPERAWATAN DAN KEBIDANAN",
    atasan_nip: "197510272003122005",
    pembuat_nama: "DANIEL ARI KRISTITANTO,S.KEP.NS",
    pembuat_jabatan: "KOORDINATOR RUANGAN",
    pembuat_nip: "199303042019031006"
  });

  const statusAbsensi = ["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"];

  useEffect(() => {
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

        setDaftarSDM(Array.isArray(dSDM) ? dSDM.sort((a, b) => a.jabatan.localeCompare(b.jabatan)) : []);
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
  }, [bulan, tahun, header.ruangan]);

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
      const isPerawat = sdm.jabatan.toLowerCase().includes("perawat");
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
      if (res.ok) alert("✅ Jadwal Berhasil Disimpan Permanen!");
      else alert("❌ Gagal menyimpan.");
    } catch (e) { alert("❌ Koneksi Database Terputus."); }
    finally { setLoading(false); }
  };

  const downloadWord = () => {
    const content = document.getElementById("area-jadwal").cloneNode(true);
    content.querySelectorAll('.no-export').forEach(el => el.remove());
    content.querySelectorAll('span.hidden').forEach(el => el.style.display = 'block');

    const wordHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        @page Section1 {size:841.9pt 595.3pt; mso-page-orientation:landscape; margin:0.3in;}
        div.Section1 {page:Section1;}
        table {border-collapse:collapse; width:100%; border: 1pt solid black;}
        th, td {border:1pt solid black; padding:2px; text-align:center; font-family: 'Arial Narrow', Arial; font-size: 8pt; color: black;}
        .text-red {color: red !important;}
        .font-bold {font-weight: bold;}
      </style></head>
      <body><div class="Section1">${content.innerHTML}</div></body></html>
    `;
    const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Jadwal_${header.ruangan}_${daftarBulan[bulan-1]}.doc`;
    link.click();
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans print:bg-white relative">
      {loading && (
        <div className="fixed inset-0 bg-white/60 z-[100] flex items-center justify-center print:hidden">
          <Loader2 className="animate-spin text-blue-600" size={40} />
        </div>
      )}

      <div className="p-4 lg:p-8">
        <div className="max-w-full bg-white p-6 rounded-2xl shadow-md mb-6 border border-slate-200 print:hidden shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-medium">
            <div className="space-y-2">
              <label className="text-blue-600 font-bold uppercase flex items-center gap-1"><CalendarIcon size={14} /> Unit & Waktu</label>
              <input type="text" className="w-full p-2 border rounded" value={header.institusi} onChange={e => setHeader({...header, institusi: e.target.value.toUpperCase()})} />
              <input type="text" className="w-full p-2 border rounded" value={header.ruangan} onChange={e => setHeader({...header, ruangan: e.target.value.toUpperCase()})} />
              <div className="flex gap-2">
                <select value={bulan} onChange={(e) => setBulan(parseInt(e.target.value))} className="w-full p-2 border rounded font-bold">
                  {daftarBulan.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
                </select>
                <input type="number" value={tahun} onChange={(e) => setTahun(parseInt(e.target.value))} className="w-full p-2 border rounded font-bold" />
              </div>
            </div>
            <div className="space-y-2 border-l pl-4">
              <label className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Pejabat Pengesah (Atasan)</label>
              <input type="text" placeholder="Nama Atasan" className="w-full p-2 border rounded" value={header.atasan_nama} onChange={e => setHeader({...header, atasan_nama: e.target.value})} />
              <input type="text" placeholder="Jabatan" className="w-full p-2 border rounded" value={header.atasan_jabatan} onChange={e => setHeader({...header, atasan_jabatan: e.target.value})} />
              <input type="text" placeholder="NIP" className="w-full p-2 border rounded" value={header.atasan_nip} onChange={e => setHeader({...header, atasan_nip: e.target.value})} />
            </div>
            <div className="space-y-2 border-l pl-4">
              <label className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Pembuat (Koordinator)</label>
              <input type="text" placeholder="Nama Koordinator" className="w-full p-2 border rounded" value={header.pembuat_nama} onChange={e => setHeader({...header, pembuat_nama: e.target.value})} />
              <input type="text" placeholder="Jabatan" className="w-full p-2 border rounded" value={header.pembuat_jabatan} onChange={e => setHeader({...header, pembuat_jabatan: e.target.value})} />
              <input type="text" placeholder="NIP" className="w-full p-2 border rounded" value={header.pembuat_nip} onChange={e => setHeader({...header, pembuat_nip: e.target.value})} />
            </div>
          </div>
        </div>

        <div id="area-jadwal" className="bg-white p-4 md:p-8 rounded-xl print:p-0">
          <div className="text-center mb-6">
            <h1 className="text-xl font-black text-slate-900 uppercase">JADWAL DINAS {header.ruangan} {header.institusi}</h1>
            <h2 className="text-lg font-bold text-slate-700 uppercase underline decoration-2 underline-offset-8">BULAN {daftarBulan[bulan-1]?.toUpperCase()} {tahun}</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[9px] border-black border">
              <thead className="bg-slate-50 print:bg-white font-bold">
                <tr>
                  <th className="border border-black p-1 w-8" rowSpan="2">NO</th>
                  <th className="border border-black p-1 min-w-[150px] sticky left-0 bg-slate-50 z-30 print:static print:bg-white" rowSpan="2">NAMA & JABATAN</th>
                  <th className="border border-black p-1" colSpan={jumlahHari}>TANGGAL</th>
                  <th className="border border-black p-1 w-20" rowSpan="2">REKAP</th>
                  <th className="border border-black p-1 w-8" rowSpan="2">OFF</th>
                </tr>
                <tr>
                  {Array.from({ length: jumlahHari }).map((_, i) => {
                    const isRed = cekTanggalMerah(i + 1);
                    return (
                      <th key={i} className={`border border-black p-1 min-w-[28px] ${isRed ? 'text-red-600' : ''}`}>
                        {i + 1}<br/>{namaHariSingkat[(hariPertama + i) % 7]}
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
                    <tr key={sdm.id} className="text-center">
                      <td className="border border-black p-1">{idx + 1}</td>
                      <td className="border border-black p-2 text-left font-bold uppercase sticky left-0 bg-white print:static leading-tight">
                        {sdm.nama} <br/><span className="text-[7px] font-normal lowercase text-blue-700 print:text-black">{sdm.jabatan}</span>
                      </td>
                      {Array.from({ length: jumlahHari }).map((_, i) => {
                        const tgl = i + 1;
                        const isRed = cekTanggalMerah(tgl);
                        const currentVal = isiJadwal[`${sdm.id}-${tgl}`] || "";
                        return (
                          <td key={i} className={`border border-black p-0 ${isRed ? 'bg-red-50' : ''} min-w-[30px]`}>
                            <input
                              list={`list-${sdm.id}-${tgl}`}
                              value={currentVal}
                              onChange={(e) => setIsiJadwal({...isiJadwal, [`${sdm.id}-${tgl}`]: e.target.value.toUpperCase()})}
                              className={`w-full h-8 text-center bg-transparent border-none outline-none font-bold no-export print:hidden ${isRed ? 'text-red-600' : 'text-black'}`}
                              placeholder="."
                            />
                            <datalist id={`list-${sdm.id}-${tgl}`}>
                              {statusAbsensi.map(s => <option key={s} value={s} />)}
                              {dataMasterDokter.filter(d => d.jadwal_hari === ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][(hariPertama + i) % 7]).map(d => (
                                <option key={d.id} value={d.simbol_praktik} />
                              ))}
                            </datalist>
                            <span className={`hidden print:block font-bold ${isRed ? 'text-red-600' : ''}`}>{currentVal || "-"}</span>
                          </td>
                        );
                      })}
                      <td className="border border-black text-[7px] font-bold p-1 leading-tight">
                        {Object.entries(rekap.dinas).map(([s, j]) => `${s}:${j} `)}
                      </td>
                      <td className="border border-black font-bold text-red-600">{rekap.off || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-bold bg-slate-100 print:bg-white text-black">
                <tr>
                  <td className="border border-black p-2 text-right uppercase" colSpan="2">Jumlah Perawat Masuk</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className="border border-black font-black text-blue-700 print:text-black">
                      {hitungTotalMasuk(i+1, "perawat") || ""}
                    </td>
                  ))}
                  <td className="border border-black" colSpan="2"></td>
                </tr>
                <tr>
                  <td className="border border-black p-2 text-right uppercase" colSpan="2">Jumlah Tenaga Lain</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className="border border-black font-black text-emerald-700 print:text-black">
                      {hitungTotalMasuk(i+1, "lain") || ""}
                    </td>
                  ))}
                  <td className="border border-black" colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-8 flex justify-between items-start print:mt-10">
            <div className="text-[9pt] italic leading-tight w-1/2 print:text-[8pt]">
              <b>KETERANGAN:</b><br/>
              L: Libur | CT: Cuti Tahunan | CM: Cuti Melahirkan | CS: Cuti Sakit | DD: Dinas Dalam | DL: Dinas Luar | CAP: Alasan Penting | TB: Tugas Belajar
            </div>
            <div className="w-1/2 grid grid-cols-2 text-center text-[10pt] font-bold print:text-[9pt]">
              <div className="flex flex-col justify-between h-36">
                <p>Mengetahui,</p>
                <p className="uppercase leading-tight">{header.atasan_jabatan}</p>
                <div className="mt-auto">
                   <p className="underline uppercase">{header.atasan_nama}</p>
                   <p className="font-normal text-[9pt]">NIP. {header.atasan_nip}</p>
                </div>
              </div>
              <div className="flex flex-col justify-between h-36">
                <p>Temanggung, {format(new Date(), 'dd MMMM yyyy', { locale: id })}</p>
                <p className="uppercase leading-tight">{header.pembuat_jabatan}</p>
                <div className="mt-auto">
                   <p className="underline uppercase">{header.pembuat_nama}</p>
                   <p className="font-normal text-[9pt]">NIP. {header.pembuat_nip}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-8 right-8 flex gap-3 print:hidden">
          <button onClick={downloadWord} className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold shadow-xl hover:bg-emerald-700 transition active:scale-95"><Download size={20} /> WORD</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-6 py-4 rounded-2xl font-bold shadow-2xl hover:bg-black transition active:scale-95"><Printer size={20} /> PDF</button>
          <button onClick={handleSimpan} className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold shadow-2xl hover:bg-blue-700 transition active:scale-95"><Save size={20} /> SIMPAN</button>
        </div>
      </div>
    </div>
  );
}