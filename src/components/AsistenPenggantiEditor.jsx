"use client";

import { useEffect, useMemo, useState } from "react";
import { createAsistenPenggantiWhatsAppUrl } from "@/lib/asisten-pengganti-whatsapp";

const ALASAN_PERGANTIAN = [
  "Sakit",
  "Izin Kedukaan",
  "Cuti Mendadak",
  "Tugas Luar",
  "Lainnya",
];

const isActiveStaff = (person) =>
  person.is_aktif === 1 || person.is_aktif === "1" || person.is_aktif === true;

export default function AsistenPenggantiEditor({
  dokter,
  tanggal,
  ruangan,
  existing = null,
  onClose,
  onSaved,
}) {
  const [sdmList, setSdmList] = useState([]);
  const [asistenAwalId, setAsistenAwalId] = useState("");
  const [asistenPenggantiId, setAsistenPenggantiId] = useState("");
  const [alasan, setAlasan] = useState("Sakit");
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedData, setSavedData] = useState(existing);

  useEffect(() => {
    let active = true;
    fetch("/api/sdm")
      .then(async (response) => {
        if (!response.ok) throw new Error("Daftar SDM gagal dimuat.");
        const result = await response.json();
        if (!Array.isArray(result)) throw new Error("Format daftar SDM tidak valid.");
        if (active) setSdmList(result.filter(isActiveStaff));
      })
      .catch((fetchError) => {
        if (active) setError(fetchError.message || "Daftar SDM gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const availableOriginals = useMemo(() => {
    const available = [...sdmList];
    const existingOriginal = existing?.asisten_awal_id;
    if (existingOriginal && !available.some(person => String(person.id) === String(existingOriginal))) {
      const current = dokter?.timAsisten?.find(person =>
        String(person.id) === String(existingOriginal),
      );
      if (current) available.push(current);
    }
    return available;
  }, [dokter, existing?.asisten_awal_id, sdmList]);

  useEffect(() => {
    if (!existing?.asisten_awal_id) return;
    const saved = {
      tanggal,
      asisten_awal_id: existing.asisten_awal_id,
      asisten_awal_nama: existing.asisten_awal_nama,
      asisten_pengganti_id: existing.asisten_pengganti_id,
      asisten_pengganti_nama: existing.asisten_pengganti_nama,
      alasan_pergantian: existing.alasan_pergantian,
      catatan_pergantian: existing.catatan_pergantian,
    };
    setAsistenAwalId(String(saved.asisten_awal_id));
    setAsistenPenggantiId(String(saved.asisten_pengganti_id));
    setAlasan(saved.alasan_pergantian || "Sakit");
    setCatatan(saved.catatan_pergantian || "");
    setSavedData(saved);
  }, [
    dokter?.id,
    tanggal,
    existing?.asisten_awal_id,
    existing?.asisten_awal_nama,
    existing?.asisten_pengganti_id,
    existing?.asisten_pengganti_nama,
    existing?.alasan_pergantian,
    existing?.catatan_pergantian,
  ]);

  useEffect(() => {
    if (existing || asistenAwalId) return;
    const defaultOriginal = (dokter?.timAsisten || []).find((person) => !person.isCuti && !person.isSakit);
    if (defaultOriginal) setAsistenAwalId(String(defaultOriginal.id));
  }, [dokter, existing, asistenAwalId]);

  const replacementOptions = sdmList.filter((person) => String(person.id) !== asistenAwalId);
  const original = availableOriginals.find((person) => String(person.id) === asistenAwalId)
    || sdmList.find((person) => String(person.id) === asistenAwalId);
  const replacement = sdmList.find((person) => String(person.id) === asistenPenggantiId);

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/pergantian-asisten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal,
          dokter_id: dokter.id,
          asisten_awal_id: asistenAwalId,
          asisten_pengganti_id: asistenPenggantiId,
          alasan_pergantian: alasan,
          catatan_pergantian: catatan,
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || "Pergantian gagal disimpan.");
      setSavedData(result.data);
      onSaved?.(result.data);
    } catch (saveError) {
      setError(saveError.message || "Pergantian gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/pergantian-asisten", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal, dokter_id: dokter.id }),
      });
      const result = await response.json();
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || "Pergantian gagal dihapus.");
      setSavedData(null);
      onSaved?.(null);
    } catch (removeError) {
      setError(removeError.message || "Pergantian gagal dihapus.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/70 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="asisten-pengganti-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="asisten-pengganti-title" className="text-lg font-black text-slate-900">Pergantian Asisten Dokter</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{dokter?.nama_dokter} · {dokter?.klinik} · {tanggal}</p>
            <p className="text-xs text-slate-500">Ruangan: {ruangan}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-bold text-slate-600 hover:bg-slate-100">Tutup</button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          {loading ? <p className="text-sm text-slate-500">Memuat daftar SDM...</p> : (
            <>
              <label className="block text-sm font-bold text-slate-700">
                Asisten awal yang berhalangan
                <select required value={asistenAwalId} onChange={(event) => setAsistenAwalId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3">
                  <option value="">Pilih asisten awal</option>
                  {availableOriginals.map((person) => (
                    <option key={person.id} value={person.id}>{person.nama}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Asisten pengganti
                <select required value={asistenPenggantiId} onChange={(event) => setAsistenPenggantiId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3">
                  <option value="">Pilih asisten pengganti</option>
                  {replacementOptions.map((person) => (
                    <option key={person.id} value={person.id}>{person.nama} · {person.jabatan}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Alasan
                <select value={alasan} onChange={(event) => setAlasan(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3">
                  {ALASAN_PERGANTIAN.map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Catatan singkat
                <textarea value={catatan} onChange={(event) => setCatatan(event.target.value)} maxLength={500} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 p-3" />
              </label>
            </>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            {savedData && (
              <>
                <button type="button" onClick={handleRemove} disabled={saving} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Hapus pergantian</button>
                <button
                  type="button"
                  onClick={() => window.open(createAsistenPenggantiWhatsAppUrl({
                    entry: savedData,
                    dokter,
                    ruangan,
                    origin: window.location.origin,
                  }), "_blank", "noopener,noreferrer")}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Kirim Info ke WA Rajal
                </button>
              </>
            )}
            <button type="submit" disabled={loading || saving || !asistenAwalId || !asistenPenggantiId} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Menyimpan..." : savedData ? "Simpan Perubahan" : "Simpan Pergantian"}
            </button>
          </div>

          {savedData && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              Tersimpan: {original?.nama || savedData.asisten_awal_nama} digantikan {replacement?.nama || savedData.asisten_pengganti_nama}.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
