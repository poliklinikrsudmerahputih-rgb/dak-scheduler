"use client";
import React, { useState, useEffect } from "react";
import { getDaysInMonth, startOfMonth, getDay, format } from "date-fns";
import { Save, Printer, Calendar as CalendarIcon, Loader2 } from "lucide-react";
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
    pembuat_nip: "199303042019031006",
    tgl_cetak: format(new Date(), "yyyy-MM-dd")
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
      if (res.ok) alert("✅ Jadwal Berhasil Disimpan!");
      else alert("❌ Gagal menyimpan.");
    } catch (e) { alert("❌ Koneksi Database Terputus."); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans print:bg-white text-slate-900">
      {loading && (
        <div className="fixed inset-0 bg-white/70 z-[100] flex items-center justify-center print:hidden">
          <Loader2 className="animate-spin text-blue-600" size={50} />
        </div>
      )}

      <div className="p-4 lg:p-8">
        {/* HEADER SETTINGS - HIDDEN ON PRINT */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-8 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-black text-blue-600 uppercase tracking-widest italic font-bold">Unit & Waktu</label>
              <input type="text" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold uppercase" value={header.institusi} onChange={e => setHeader({...header, institusi: e.target.value.toUpperCase()})} />
              <input type="text" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold uppercase" value={header.ruangan} onChange={e => setHeader({...header, ruangan: e.target.value.toUpperCase()})} />
              <div className="flex gap-2 text-xs">
                <select value={bulan} onChange={(e) => setBulan(parseInt(e.target.value))} className="w-full p-3 bg-slate-50 border-none rounded-2xl font-bold uppercase cursor-pointer">
                  {daftarBulan.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
                </select>
                <input type="number" value={tahun} onChange={(e) => setTahun(parseInt(e.target.value))} className="w-full p-3 bg-slate-50 border-none rounded-2xl font-bold" />
              </div>
            </div>
            <div className="space-y-3 border-l pl-6">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest italic font-bold">Atasan Langsung</label>
              <input type="text" placeholder="Nama Atasan" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold" value={header.atasan_nama} onChange={e => setHeader({...header, atasan_nama: e.target.value})} />
              <input type="text" placeholder="Jabatan Atasan" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold" value={header.atasan_jabatan} onChange={e => setHeader({...header, atasan_jabatan: e.target.value})} />
              <input type="text" placeholder="NIP Atasan" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold" value={header.atasan_nip} onChange={e => setHeader({...header, atasan_nip: e.target.value})} />
            </div>
            <div className="space-y-3 border-l pl-6">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest italic font-bold text-blue-600">Tanggal Cetak & Pembuat</label>
              <input type="date" className="w-full p-3 bg-blue-50 border-none rounded-2xl text-xs font-bold uppercase cursor-pointer text-blue-700" value={header.tgl_cetak} onChange={e => setHeader({...header, tgl_cetak: e.target.value})} />
              <input type="text" placeholder="Nama Pembuat" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold" value={header.pembuat_nama} onChange={e => setHeader({...header, pembuat_nama: e.target.value})} />
              <input type="text" placeholder="Jabatan Pembuat" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold" value={header.pembuat_jabatan} onChange={e => setHeader({...header, pembuat_jabatan: e.target.value})} />
              <input type="text" placeholder="NIP Pembuat" className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold" value={header.pembuat_nip} onChange={e => setHeader({...header, pembuat_nip: e.target.value})} />
            </div>
          </div>
        </div>

        {/* AREA JADWAL */}
        <div id="area-jadwal" className="bg-white p-6 md:p-10 rounded-[3rem] print:p-0 print:border-none print:shadow-none overflow-hidden">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-slate-900 print:!text-black uppercase tracking-tighter italic">JADWAL DINAS {header.ruangan}</h1>
            <h2 className="text-xl font-bold text-blue-600 print:!text-black uppercase underline decoration-4 underline-offset-8 italic">{header.institusi} • {daftarBulan[bulan-1]} {tahun}</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[10px] border-black border-[1.5pt] print:!border-black">
              <thead>
                <tr className="bg-slate-900 text-white print:bg-white print:!text-black font-black uppercase">
                  <th className="border-black border-[1pt] p-2 w-10 print:!border-black" rowSpan="2">NO</th>
                  <th className="border-black border-[1pt] p-2 min-w-[180px] sticky left-0 bg-slate-900 text-white print:static print:bg-white print:!text-black print:!border-black font-bold" rowSpan="2">NAMA & JABATAN</th>
                  <th className="border-black border-[1pt] p-2 print:!border-black" colSpan={jumlahHari}>TANGGAL PELAYANAN</th>
                  <th className="border-black border-[1pt] p-2 w-24 print:!border-black" rowSpan="2">REKAP</th>
                  <th className="border-black border-[1pt] p-2 w-10 print:!border-black" rowSpan="2">OFF</th>
                </tr>
                <tr className="bg-slate-800 text-white print:bg-white print:!text-black font-bold">
                  {Array.from({ length: jumlahHari }).map((_, i) => {
                    const isRed = cekTanggalMerah(i + 1);
                    return (
                      <th key={i} className={`border-black border-[1pt] p-1 min-w-[30px] print:!border-black ${isRed ? 'text-red-600 print:!text-red-600' : 'print:!text-black'}`}>
                        {i + 1}<br/>{namaHariSingkat[(hariPertama + i) % 7]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="print:!text-black font-bold">
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
                    <tr key={sdm.id} className="text-center group hover:bg-slate-50 transition-colors print:!text-black">
                      <td className="border-black border-[1pt] p-1 print:!text-black print:!border-black">{idx + 1}</td>
                      <td className="border-black border-[1pt] p-3 text-left font-black uppercase sticky left-0 bg-white z-20 print:static print:!text-black print:!border-black">
                        <div className="leading-none print:!text-black">{sdm.nama}</div>
                        <div className="text-[7px] text-blue-600 mt-1 font-bold print:!text-black uppercase">{sdm.klinik || sdm.jabatan}</div>
                      </td>
                      {Array.from({ length: jumlahHari }).map((_, i) => {
                        const tgl = i + 1;
                        const isRed = cekTanggalMerah(tgl);
                        const currentVal = isiJadwal[`${sdm.id}-${tgl}`] || "";
                        return (
                          <td key={i} className={`border-black border-[1pt] p-0 print:!border-black ${isRed ? 'bg-red-50 print:bg-transparent' : ''} min-w-[30px] print:!text-black`}>
                            <input
                              list={`list-${sdm.id}-${tgl}`}
                              value={currentVal}
                              onChange={(e) => setIsiJadwal({...isiJadwal, [`${sdm.id}-${tgl}`]: e.target.value.toUpperCase()})}
                              className={`w-full h-10 text-center bg-transparent border-none outline-none font-black text-xs print:hidden ${isRed ? 'text-red-600' : 'text-slate-900'}`}
                              placeholder="."
                            />
                            <datalist id={`list-${sdm.id}-${tgl}`}>
                              {statusAbsensi.map(s => <option key={s} value={s} />)}
                            </datalist>
                            <span className={`hidden print:block font-black ${isRed ? 'text-red-600' : 'text-black'}`}>{currentVal || "-"}</span>
                          </td>
                        );
                      })}
                      <td className="border-black border-[1pt] text-[8px] font-black p-1 print:!text-black print:!border-black bg-slate-50/30 print:bg-transparent">
                        {Object.entries(rekap.dinas).map(([s, j]) => `${s}:${j} `)}
                      </td>
                      <td className="border-black border-[1pt] font-black text-red-600 print:!text-red-600 print:!border-black">{rekap.off || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-black bg-slate-900 text-white print:bg-white print:!text-black uppercase text-[8px]">
                <tr className="print:!border-black">
                  <td className="p-3 text-right italic border-black border-[1pt] print:!border-black" colSpan="2">Jumlah Perawat Masuk</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className="border-black border-[1pt] text-center text-blue-400 print:!text-black print:!border-black">
                      {hitungTotalMasuk(i+1, "perawat") || ""}
                    </td>
                  ))}
                  <td className="border-black border-[1pt] print:!border-black" colSpan="2"></td>
                </tr>
                <tr className="print:!border-black">
                  <td className="p-3 text-right italic border-black border-[1pt] print:!border-black" colSpan="2">Jumlah Tenaga Lain</td>
                  {Array.from({ length: jumlahHari }).map((_, i) => (
                    <td key={i} className="border-black border-[1pt] text-center text-emerald-400 print:!text-black print:!border-black">
                      {hitungTotalMasuk(i+1, "lain") || ""}
                    </td>
                  ))}
                  <td className="border-black border-[1pt] print:!border-black" colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* SIGNATURE AREA */}
          <div className="mt-12 space-y-12 print:mt-16 text-slate-900 print:!text-black">
            <div className="grid grid-cols-2 text-center text-xs font-black uppercase italic print:!text-black">
              {/* KOLOM TTD ATASAN */}
              <div className="flex flex-col justify-between h-48 px-4">
                <p>Mengetahui,</p>
                <p className="leading-tight text-[10px] font-bold">{header.atasan_jabatan}</p>
                <div className="mt-auto">
                   <p className="underline decoration-2 underline-offset-4 font-black print:!text-black">{header.atasan_nama}</p>
                   <p className="font-bold text-[9px] not-italic mt-1 print:!text-black">NIP. {header.atasan_nip}</p>
                </div>
              </div>
              {/* KOLOM TTD PEMBUAT */}
              <div className="flex flex-col justify-between h-48 px-4">
                <p>Temanggung, {format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}</p>
                <p className="leading-tight text-[10px] font-bold">{header.pembuat_jabatan}</p>
                <div className="mt-auto">
                   <p className="underline decoration-2 underline-offset-4 font-black print:!text-black">{header.pembuat_nama}</p>
                   <p className="font-bold text-[9px] not-italic mt-1 print:!text-black">NIP. {header.pembuat_nip}</p>
                </div>
              </div>
            </div>

            {/* KETERANGAN SIMBOL DI BAWAH TTD */}
            <div className="pt-6 border-t-2 border-black print:!border-black">
              <div className="text-[9px] italic leading-tight p-4 bg-slate-50 print:bg-white border-2 border-dashed border-black rounded-2xl">
                <b className="uppercase block mb-2 font-black print:!text-black">Keterangan Simbol:</b>
                <p className="font-bold print:!text-black tracking-wide leading-relaxed">
                  L: LIBUR | CT: CUTI TAHUNAN | CM: CUTI MELAHIRKAN | CS: CUTI SAKIT | DD: DINAS DALAM | 
                  DL: DINAS LUAR | CAP: ALASAN PENTING | TB: TUGAS BELAJAR | CLTN: CUTI LUAR TANGGUNGAN NEGARA
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FLOATING ACTIONS */}
        <div className="fixed bottom-10 right-10 flex flex-col md:flex-row gap-4 print:hidden">
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-5 rounded-[2rem] font-black text-xs uppercase shadow-2xl hover:bg-blue-600 transition-all active:scale-90 flex items-center gap-3">
            <Printer size={18} /> Print PDF / Cetak
          </button>
          <button onClick={handleSimpan} className="bg-blue-600 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase shadow-2xl hover:bg-slate-900 transition-all active:scale-90 flex items-center gap-3 shadow-blue-500/40">
            <Save size={18} /> Simpan Permanen
          </button>
        </div>
      </div>
    </div>
  );
}