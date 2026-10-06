"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { AlertCircle, BookOpen, ExternalLink, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { daftarKlinikSop } from "@/lib/sop-constants";

const fetcher = async (url) => {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Gagal memuat daftar SOP.");
  }
  return result;
};

const getSessionRuangan = () => {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split("; ").find((item) => item.startsWith("session_dak_pro="));
  if (!cookie) return "";

  try {
    const session = JSON.parse(decodeURIComponent(cookie.slice("session_dak_pro=".length)));
    return String(session?.ruangan || "").trim().toUpperCase();
  } catch {
    return "";
  }
};

const today = new Date().toISOString().slice(0, 10);
const emptyForm = {
  judul_sop: "",
  ruangan: "",
  klinik: "",
  tanggal_pembuatan: today,
  tanggal_pengesahan: today,
  link_gdrive: ""
};

export default function ManajemenSopPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR("/api/sop", fetcher);
  const [form, setForm] = useState(emptyForm);
  const [editingSop, setEditingSop] = useState(null);
  const [activeRoom, setActiveRoom] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const daftarSop = Array.isArray(data) ? data : [];
  const pencarian = searchTerm.trim().toLowerCase();
  const filteredSop = daftarSop.filter((sop) =>
    `${sop.no_sop} ${sop.judul_prosedur ?? sop.judul_sop ?? ""}`.toLowerCase().includes(pencarian)
  );

  useEffect(() => {
    const ruangan = getSessionRuangan();
    setActiveRoom(ruangan);
    if (ruangan) {
      setForm((current) => ({ ...current, ruangan }));
    }
  }, []);

  const handleFieldChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setFormError("");
    setNotice("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setNotice("");
    setIsSaving(true);

    try {
      const response = await fetch(editingSop ? `/api/sop/${editingSop.id}` : "/api/sop", {
        method: editingSop ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingSop
          ? {
              no_sop: editingSop.no_sop,
              judul_prosedur: form.judul_sop,
              link_gdrive: form.link_gdrive,
              klinik: form.klinik,
              tanggal_pembuatan: form.tanggal_pembuatan,
              tanggal_pengesahan: form.tanggal_pengesahan
            }
          : form),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal menyimpan data SOP.");

      setForm({ ...emptyForm, ruangan: activeRoom });
      setEditingSop(null);
      setNotice(editingSop
        ? "Perubahan SOP berhasil disimpan."
        : `SOP berhasil ditambahkan dengan nomor ${result.data?.nomor_sop || "otomatis"}.`);
      await mutate();
    } catch (submitError) {
      setFormError(submitError.message || "Gagal menyimpan data SOP.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (sop) => {
    setEditingSop(sop);
    setForm({
      judul_sop: sop.judul_prosedur || sop.judul_sop || "",
      ruangan: activeRoom,
      klinik: sop.klinik || daftarKlinikSop[0],
      tanggal_pembuatan: sop.tanggal_pembuatan || "",
      tanggal_pengesahan: sop.tanggal_pengesahan || "",
      link_gdrive: sop.link_gdrive || "",
    });
    setFormError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditing = () => {
    setEditingSop(null);
    setForm({ ...emptyForm, ruangan: activeRoom });
    setFormError("");
    setNotice("");
  };

  const deleteSop = async (sop) => {
    if (!window.confirm(`Hapus SOP "${sop.judul_prosedur}"?`)) return;
    setDeletingId(sop.id);
    setFormError("");
    setNotice("");

    try {
      const response = await fetch(`/api/sop/${sop.id}`, { method: "DELETE" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal menghapus data SOP.");
      if (editingSop?.id === sop.id) cancelEditing();
      setNotice("SOP berhasil dihapus.");
      await mutate();
    } catch (deleteError) {
      setFormError(deleteError.message || "Gagal menghapus data SOP.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-200">
          <BookOpen size={26} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
            Manajemen SOP
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Kelola dokumen prosedur untuk ruangan Anda.
          </p>
        </div>
      </header>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className={`rounded-xl p-2 ${editingSop ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
            {editingSop ? <Pencil size={20} /> : <Plus size={20} />}
          </div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
            {editingSop ? "Ubah Data SOP" : "Tambah SOP"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Judul SOP</span>
            <input
              required
              maxLength={255}
              name="judul_sop"
              value={form.judul_sop}
              onChange={handleFieldChange}
              placeholder="Judul prosedur"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Klinik Tujuan</span>
            <select
              required
              name="klinik"
              value={form.klinik}
              onChange={handleFieldChange}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="" disabled>Pilih klinik</option>
              {daftarKlinikSop.map((klinik) => (
                <option key={klinik} value={klinik}>{klinik}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Tanggal Pembuatan</span>
            <input
              required={!editingSop}
              type="date"
              name="tanggal_pembuatan"
              value={form.tanggal_pembuatan}
              onChange={handleFieldChange}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Tanggal Pengesahan</span>
            <input
              required={!editingSop}
              type="date"
              name="tanggal_pengesahan"
              value={form.tanggal_pengesahan}
              onChange={handleFieldChange}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600 md:col-span-2">
            <span>Link Dokumen Google Drive <span className="font-medium text-slate-400">(opsional)</span></span>
            <input
              type="url"
              name="link_gdrive"
              value={form.link_gdrive}
              onChange={handleFieldChange}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {formError && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">
              <AlertCircle size={18} /> {formError}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 md:col-span-2">
              {notice}
            </p>
          )}

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={isSaving || !activeRoom}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving
                ? "Menyimpan..."
                : editingSop
                  ? "Simpan Perubahan"
                  : "Generate Nomor SOP"}
            </button>
            {!editingSop && (
              <p className="self-center text-xs font-semibold text-blue-700 md:ml-auto">
                Nomor urut SOP akan digenerate otomatis oleh sistem.
              </p>
            )}
            {editingSop && (
              <button
                type="button"
                onClick={cancelEditing}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-200"
              >
                <X size={16} /> Batal
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Daftar SOP</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">{daftarSop.length} dokumen</p>
          </div>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari nomor atau judul SOP..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-sm"
          />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm font-semibold text-slate-500">
            <Loader2 size={20} className="animate-spin" /> Memuat daftar SOP...
          </div>
        )}
        {error && (
          <div role="alert" className="m-5 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            <AlertCircle size={18} />
            {error.message || "Daftar SOP belum dapat dimuat."}
          </div>
        )}
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">No. SOP</th>
                  <th className="px-6 py-4">Judul Prosedur</th>
                  <th className="px-6 py-4">Klinik</th>
                  <th className="px-6 py-4">Dokumen</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredSop.map((sop) => (
                  <tr key={sop.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 font-bold text-slate-700">{sop.no_sop}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{sop.judul_prosedur}</td>
                    <td className="px-6 py-4 text-slate-600">{sop.klinik || "—"}</td>
                    <td className="px-6 py-4">
                      <a
                        href={sop.link_gdrive}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        Buka Dokumen <ExternalLink size={14} />
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(sop)}
                          aria-label={`Ubah SOP ${sop.no_sop}`}
                          className="rounded-lg bg-amber-50 p-2 text-amber-700 hover:bg-amber-100"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSop(sop)}
                          disabled={deletingId === sop.id}
                          aria-label={`Hapus SOP ${sop.no_sop}`}
                          className="rounded-lg bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingId === sop.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSop.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                      {daftarSop.length === 0
                        ? "Belum ada SOP. Tambahkan data melalui formulir di atas."
                        : "Tidak ada SOP yang sesuai dengan pencarian."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
