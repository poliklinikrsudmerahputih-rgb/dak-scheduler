"use client";

import React, { useEffect, useState } from "react";
import { format, getDaysInMonth } from "date-fns";
import { id } from "date-fns/locale";

export default function SharedJadwal() {
  const [jadwalRows, setJadwalRows] = useState([]);
  const [sdmList, setSdmList] = useState([]);
  const [dokterLegend, setDokterLegend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [showPersonLegend, setShowPersonLegend] = useState(false);
  const [personLegendData, setPersonLegendData] = useState([]);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [ruangan, setRuangan] = useState("POLIKLINIK");
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const b = sp.get("bulan");
    const t = sp.get("tahun");
    const r = sp.get("ruangan");
    const role = sp.get("role");
    const name = sp.get("name");
    const q = sp.get("filter") || sp.get("q");
    if (b) setBulan(Number(b));
    if (t) setTahun(Number(t));
    if (r) setRuangan(String(r).toUpperCase());
    if (role) setFilterText(role);
    if (name) setFilterText(name);
    if (q) setFilterText(q);
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const q = `?bulan=${bulan}&tahun=${tahun}&ruangan=${ruangan}&isPublic=true`;
        const [resJadwal, resSdm, resDokter] = await Promise.all([
          fetch(`/api/jadwal${q}`),
          fetch(`/api/sdm?ruangan=${ruangan}`),
          fetch(`/api/dokter?ruangan=${ruangan}`)
        ]);
        const jd = await resJadwal.json();
        const sdm = await resSdm.json();
        const dk = await resDokter.json();

        setJadwalRows(Array.isArray(jd) ? jd : []);
        setSdmList(Array.isArray(sdm) ? sdm : []);
        setDokterLegend(Array.isArray(dk) ? dk : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [bulan, tahun, ruangan]);

  const jumlahHari = getDaysInMonth(new Date(tahun, bulan - 1));

  // build map of jadwal by key sdm_id-tanggal
  const jadwalMap = new Map();
  jadwalRows.forEach(r => {
    const key = `${r.sdm_id}-${r.tanggal}`;
    jadwalMap.set(key, r.simbol);
  });

  // build daftarSDM: include sdmList (active) and historical names found in jadwal
  const viewingDate = new Date(tahun, bulan - 1);
  const now = new Date();
  const isViewingCurrentMonth = viewingDate.getMonth() === now.getMonth() && viewingDate.getFullYear() === now.getFullYear();

  let daftar = [];
  if (isViewingCurrentMonth) {
    // Current month: show active SDM from `sdmList` (respect tampil_di_jadwal/is_aktif)
    daftar = (sdmList || []).filter(s => {
      if (s.tampil_di_jadwal === 0 || s.tampil_di_jadwal === '0') return false;
      if (s.is_aktif === 0 || s.is_aktif === '0' || s.is_aktif === false) return false;
      return true;
    }).map(s => ({ ...s }));
  } else {
    // Historical month: derive daftar only from `jadwalRows` so that
    // SDM who were present that month remain, and new SDM (added later)
    // that don't appear in the jadwal are not shown.
    const map = new Map();
    (jadwalRows || []).forEach(r => {
      const sid = String(r.sdm_id || '');
      if (!sid) return;
      if (!map.has(sid)) {
        const fromSdm = (sdmList || []).find(x => String(x.id) === sid) || {};
        map.set(sid, {
          id: sid,
          nama: r.sdm_nama || fromSdm.nama || `ID:${sid}`,
          jabatan: r.sdm_jabatan || fromSdm.jabatan || '',
          tampil_di_jadwal: fromSdm.tampil_di_jadwal ?? 1,
          is_aktif: fromSdm.is_aktif ?? 1
        });
      }
    });
    daftar = Array.from(map.values());
  }
  if (filterText) {
    const t = filterText.toLowerCase();
    daftar = daftar.filter(s => (s.jabatan || '').toLowerCase().includes(t) || (s.nama || '').toLowerCase().includes(t));
  }

  // sort by jabatan order like BuatJadwal if possible
  const urutanProfesi = { "Bidan": 1, "Psikologi Klinis": 2, "Perawat": 3, "Terapis Gigi": 4, "Fisioterapis": 5, "Admin": 6 };
  daftar.sort((a,b) => (urutanProfesi[a.jabatan]||99) - (urutanProfesi[b.jabatan]||99) || (a.nama||'').localeCompare(b.nama||''));

  return (
    <div className="min-h-screen bg-white p-2 text-slate-900 md:p-4">
      <div className="w-full">
        {/* Use Tailwind classes; avoid styled-jsx to prevent hydration mismatch */}
        <div className="mb-4 flex flex-col gap-3 text-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-black text-lg text-slate-900">{`JADWAL - ${ruangan}`}</h1>
            <div className="text-sm text-slate-600">Periode: {format(new Date(tahun, bulan-1), 'MMMM yyyy', { locale: id })}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-slate-900">
            <input value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="Filter nama atau jabatan" className="min-w-0 flex-1 border border-slate-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-500 rounded lg:flex-none" />
            <button onClick={() => {
              // reset filterText and remove filter params from URL
              setFilterText("");
              setPersonLegendData([]);
              const sp = new URLSearchParams(window.location.search);
              sp.delete('filter'); sp.delete('role'); sp.delete('name'); sp.delete('q');
              const base = `${window.location.pathname}`;
              const newUrl = `${base}?${sp.toString()}`.replace(/\?$/, '');
              window.history.replaceState({}, document.title, newUrl || window.location.pathname);
            }} className="rounded bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">Reset</button>
            <select value={bulan} onChange={e => setBulan(Number(e.target.value))} className="border border-slate-300 bg-white p-2 text-sm text-slate-900 rounded">
              {Array.from({length:12}).map((_,i) => <option key={i} value={i+1}>{format(new Date(2020,i,1),'MMMM')}</option>)}
            </select>
            <input type="number" value={tahun} onChange={e => setTahun(Number(e.target.value))} className="w-24 border border-slate-300 bg-white p-2 text-sm text-slate-900 rounded" />
            <button onClick={() => {
              if (filterText.trim()) {
                // build person legend for filtered daftar
                const t = filterText.toLowerCase();
                const matched = daftar.filter(s => (s.nama || '').toLowerCase().includes(t) || (s.jabatan || '').toLowerCase().includes(t));
                const people = matched.map(s => {
                  const entries = jadwalRows.filter(r => String(r.sdm_id) === String(s.id)).map(r => ({ tanggal: r.tanggal, simbol: r.simbol }));
                  return { id: s.id, nama: s.nama, jabatan: s.jabatan, entries };
                });
                setPersonLegendData(people);
                setShowPersonLegend(true);
              } else {
                setShowLegend(true);
              }
            }} className="rounded bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">Keterangan</button>
          </div>
        </div>

        {loading ? <div>Loading...</div> : (
          <div className="overflow-x-auto">
              <div className="max-w-screen-2xl w-full mx-auto">
                <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="p-2 text-[10px] w-8 text-center" rowSpan="2">NO</th>
                    <th className="p-2 text-[10px] text-left" rowSpan="2" style={{ maxWidth: '420px' }}>NAMA & JABATAN</th>
                    <th className="p-2 text-[9px] text-center" colSpan={jumlahHari}>TANGGAL</th>
                  </tr>
                  <tr className="bg-slate-800 text-white">
                    {Array.from({ length: jumlahHari }).map((_, i) => (
                      <th key={i} className="p-1 text-[9px] text-center border-b border-slate-400">{i+1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-slate-900">
                  {daftar.length === 0 && <tr><td colSpan={jumlahHari+2} className="p-4 text-center text-slate-900">Tidak ada data</td></tr>}
                  {daftar.map((sdm, idx) => (
                    <tr key={sdm.id} className="border-b border-slate-200">
                      <td className="p-1 text-center text-[10px] font-black text-slate-900">{idx+1}</td>
                      <td className="p-2 align-top text-[10px] text-slate-900" style={{ maxWidth: '420px', wordBreak: 'break-word' }}>{sdm.nama}<div className="text-xs text-slate-600">{sdm.jabatan}</div></td>
                      {Array.from({ length: jumlahHari }).map((_, i) => {
                        const tgl = i+1;
                        const key = `${sdm.id}-${tgl}`;
                        const val = jadwalMap.get(key) || '';
                        return <td key={i} className="p-1 text-center align-top text-[10px] text-slate-900"><div className="whitespace-normal break-words text-[10px] text-slate-900">{val}</div></td>;
                      })}

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showLegend && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded p-6 max-w-xl w-full">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-black">Keterangan Simbol</h4>
                <button onClick={() => setShowLegend(false)} className="px-3 py-1 bg-slate-100 rounded">Tutup</button>
              </div>
              <div className="space-y-3 max-h-72 overflow-auto text-sm">
                {dokterLegend.filter(d => d.keterangan_simbol && d.keterangan_simbol.trim() !== '').map((d,i) => (
                  <div key={i}>
                    <div className="font-bold">{d.simbol_praktik}</div>
                    <div className="text-slate-600">{d.keterangan_simbol}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {showPersonLegend && (
          <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded p-6 max-w-2xl w-full overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-black">Keterangan Jadwal - Filter: {filterText}</h4>
                <button onClick={() => setShowPersonLegend(false)} className="px-3 py-1 bg-slate-100 rounded">Tutup</button>
              </div>
              <div className="space-y-4 text-sm">
                {personLegendData.length === 0 && <div>Tidak ada data untuk nama ini.</div>}
                {personLegendData.map((p, idx) => (
                  <div key={p.id} className="border-b pb-3">
                    <div className="font-bold">{p.nama}</div>
                    <div className="text-xs text-slate-600 mb-2">{p.jabatan}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {p.entries.length === 0 && <div className="col-span-2 text-slate-500">Tidak ada jadwal untuk periode ini.</div>}
                      {p.entries.map((e,i) => (
                        <div key={i} className="flex justify-between items-center border rounded p-2">
                          <div className="font-mono text-[12px]">Tanggal: {e.tanggal}</div>
                          <div className="text-sm font-bold">{e.simbol}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
