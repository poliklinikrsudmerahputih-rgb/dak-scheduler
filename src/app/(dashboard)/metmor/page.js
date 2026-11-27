"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { AlertCircle, CalendarDays, Check, ClipboardCheck, Copy, Edit3, Loader2, Plus, Save, Trash2, X } from "lucide-react";

const getTodayJakarta = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export default function MetmorPage() {
  const [records, setRecords] = useState([]);
  const [tanggal, setTanggal] = useState(getTodayJakarta);
  const [informasi, setInformasi] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/metmor");
      const result = await response.json();
      if (response.status === 401) throw new Error("Sesi login tidak valid. Silakan masuk kembali.");
      if (!response.ok || result.success !== true || !Array.isArray(result.data)) {
        throw new Error(result.error || "Gagal memuat catatan Metmor.");
      }
      setRecords(result.data);
    } catch (loadError) {
      setError(loadError.message || "Gagal memuat catatan Metmor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const resetForm = () => {
    setTanggal(getTodayJakarta());
    setInformasi("");
    setEditingId(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/metmor", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, tanggal, informasi }),
      });
      const result = await response.json();
      if (response.status === 401) throw new Error("Sesi login tidak valid. Silakan masuk kembali.");
      if (!response.ok || result.success !== true) throw new Error(result.error || "Gagal menyimpan Metmor.");
      setNotice(editingId ? "Informasi Metmor berhasil diperbarui." : "Informasi Metmor berhasil ditambahkan.");
      resetForm();
      await loadRecords();
    } catch (saveError) {
      setError(saveError.message || "Gagal menyimpan Metmor.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`Hapus informasi Metmor tanggal ${record.tanggal}?`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/metmor?id=${record.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || "Gagal menghapus Metmor.");
      if (editingId === record.id) resetForm();
      setNotice("Informasi Metmor berhasil dihapus.");
      await loadRecords();
    } catch (deleteError) {
      setError(deleteError.message || "Gagal menghapus Metmor.");
    }
  };

  const handleCopyLink = async (record) => {
    const link = `${window.location.origin}/shared/metmor?token=${encodeURIComponent(record.public_token)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(record.id);
      window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      setError("Tautan tidak dapat disalin. Salin alamat yang ditampilkan manual.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-3 pb-16 sm:p-6">
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-900 p-6 text-white shadow-xl sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-teal-400/15 p-3 text-teal-200"><ClipboardCheck size={26} /></div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wide sm:text-2xl">Metmor · Meeting Morning</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">Catat informasi yang disampaikan pada meeting morning. Catatan akan tampil otomatis di jadwal praktik sesuai tanggal dan tersedia sebagai tautan untuk dibagikan ke e-Kinerja.</p>
          </div>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{notice}</p>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
          {editingId ? <Edit3 size={18} className="text-amber-600" /> : <Plus size={19} className="text-teal-700" />}
          {editingId ? "Edit Informasi" : "Tambah Informasi Meeting Morning"}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <label className="block max-w-xs space-y-2 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-2"><CalendarDays size={15} /> Tanggal Informasi</span>
            <input type="date" required value={tanggal} onChange={(event) => setTanggal(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="block space-y-2 text-xs font-bold text-slate-600">
            <span>Informasi yang disampaikan</span>
            <textarea required maxLength={10000} rows={5} value={informasi} onChange={(event) => setInformasi(event.target.value)} placeholder="Tuliskan poin atau informasi meeting morning..." className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
            <span className="block text-right font-medium text-slate-400">{informasi.length}/10.000</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-xs font-black uppercase text-white hover:bg-teal-800 disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Informasi"}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-xs font-black uppercase text-slate-600 hover:bg-slate-200"><X size={16} /> Batal</button>}
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Riwayat Informasi Metmor</h2>
            <p className="mt-1 text-xs text-slate-500">Maksimal 200 catatan terbaru untuk ruangan akun Anda.</p>
          </div>
          <button type="button" onClick={loadRecords} disabled={loading} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{loading ? "Memuat..." : "Muat ulang"}</button>
        </div>
        {loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-teal-700" /></div> : records.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">Belum ada informasi Metmor.</p>
        ) : (
          <div className="space-y-4">
            {records.map((record) => (
              <article key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase text-teal-800">{format(parseISO(record.tanggal), "EEEE, dd MMMM yyyy", { locale: id })}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{record.informasi}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => handleCopyLink(record)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-blue-800">
                      {copiedId === record.id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedId === record.id ? "Tersalin" : "Salin Link e-Kinerja"}
                    </button>
                    <button type="button" onClick={() => { setEditingId(record.id); setTanggal(record.tanggal); setInformasi(record.informasi); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-[10px] font-black uppercase text-amber-800 hover:bg-amber-200"><Edit3 size={14} /> Edit</button>
                    <button type="button" onClick={() => handleDelete(record)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-2 text-[10px] font-black uppercase text-red-800 hover:bg-red-200"><Trash2 size={14} /> Hapus</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
