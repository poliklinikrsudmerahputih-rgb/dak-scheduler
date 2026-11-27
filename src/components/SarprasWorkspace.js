"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import SarprasKirInventory from "@/components/SarprasKirInventory";
import SarprasAlatRusak from "@/components/SarprasAlatRusak";

const categories = ["ALAT KESEHATAN", "ALAT NON KESEHATAN"];

function createEmptyForm() {
  return {
    kategori: categories[0],
    nama_barang: "",
    klinik: "",
    kebutuhan: "0",
    keadaan: "0",
    kekurangan: "0",
    permintaan: "0",
    spesifikasi: "",
    tahun: String(new Date().getFullYear()),
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

export default function SarprasWorkspace({ readOnly = false }) {
  const router = useRouter();
  const [activeView, setActiveView] = useState("usulan");
  const [records, setRecords] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [proposalError, setProposalError] = useState("");
  const [processingProposalId, setProcessingProposalId] = useState(null);
  const [ruangan, setRuangan] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [clinicFilter, setClinicFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const url = readOnly ? "/api/sarpras/publik?view=usulan" : "/api/sarpras";
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401 && !readOnly) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Data sarpras gagal dimuat.");
      }
      setRecords(result.data);
      setRuangan(result.ruangan || "");
    } catch (error) {
      setLoadError(error.message || "Data sarpras gagal dimuat.");
    } finally {
      setIsLoading(false);
    }
  }, [readOnly, router]);

  const loadProposals = useCallback(async () => {
    if (readOnly) return;
    try {
      const response = await fetch("/api/sarpras/usulan", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Antrean usulan Sarpras gagal dimuat.");
      }
      setProposalError("");
      setProposals(result.data);
    } catch (error) {
      setProposalError(error.message || "Antrean usulan Sarpras gagal dimuat.");
    }
  }, [readOnly, router]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const clinics = useMemo(
    () => [...new Set(records.map((record) => String(record.klinik ?? "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "id")),
    [records]
  );
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return records.filter((record) => {
      if (categoryFilter && record.kategori !== categoryFilter) return false;
      if (clinicFilter && String(record.klinik ?? "").trim() !== clinicFilter) return false;
      return !query || [
        record.nomor,
        record.kategori,
        record.nama_barang,
        record.klinik,
        record.spesifikasi,
        record.tahun,
      ].some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
    });
  }, [records, search, categoryFilter, clinicFilter]);

  const totals = useMemo(() => records.reduce((result, record) => ({
    kebutuhan: result.kebutuhan + (Number(record.kebutuhan) || 0),
    permintaan: result.permintaan + (Number(record.permintaan) || 0),
  }), { kebutuhan: 0, permintaan: 0 }), [records]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(createEmptyForm());
    setNotice(null);
    setIsFormOpen(true);
  };

  const openEditForm = (record) => {
    setEditingId(record.id);
    setForm({
      kategori: record.kategori || categories[0],
      nama_barang: record.nama_barang || "",
      klinik: record.klinik || "",
      kebutuhan: String(record.kebutuhan ?? 0),
      keadaan: String(record.keadaan ?? 0),
      kekurangan: String(record.kekurangan ?? 0),
      permintaan: String(record.permintaan ?? 0),
      spesifikasi: record.spesifikasi || "",
      tahun: String(record.tahun || new Date().getFullYear()),
    });
    setNotice(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingId(null);
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);
    try {
      const isPublicProposal = readOnly;
      const response = await fetch(
        isPublicProposal ? "/api/sarpras/usulan" : editingId ? `/api/sarpras/${editingId}` : "/api/sarpras",
        {
        method: isPublicProposal ? "POST" : editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          kebutuhan: Number(form.kebutuhan),
          keadaan: Number(form.keadaan),
          kekurangan: Number(form.kekurangan),
          permintaan: Number(form.permintaan),
          tahun: Number(form.tahun),
        }),
        }
      );
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Data sarpras gagal disimpan.");
      }
      setIsFormOpen(false);
      setEditingId(null);
      setNotice({
        success: true,
        text: isPublicProposal
          ? "Usulan berhasil dikirim dan menunggu persetujuan."
          : editingId ? "Data sarpras berhasil diperbarui." : "Data sarpras berhasil ditambahkan.",
      });
      if (!isPublicProposal) await loadRecords();
    } catch (error) {
      setNotice({ success: false, text: error.message || "Data sarpras gagal disimpan." });
    } finally {
      setIsSaving(false);
    }
  };

  const reviewProposal = async (proposal, action) => {
    const actionLabel = action === "approve" ? "menyetujui" : "menolak";
    if (!window.confirm(`Apakah Anda yakin ingin ${actionLabel} usulan ${proposal.nama_barang}?`)) return;
    setProcessingProposalId(proposal.id);
    setNotice(null);
    try {
      const response = await fetch("/api/sarpras/usulan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposal.id, action }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Usulan Sarpras gagal diproses.");
      }
      setNotice({
        success: true,
        text: action === "approve"
          ? `Usulan disetujui dan ditambahkan sebagai data Sarpras nomor ${result.nomor}.`
          : "Usulan Sarpras ditolak.",
      });
      await Promise.all([loadProposals(), ...(action === "approve" ? [loadRecords()] : [])]);
    } catch (error) {
      setNotice({ success: false, text: error.message || "Usulan Sarpras gagal diproses." });
    } finally {
      setProcessingProposalId(null);
    }
  };

  const deleteRecord = async (record) => {
    if (!window.confirm(`Hapus ${record.nama_barang} untuk ${record.klinik}?`)) return;
    setDeletingId(record.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/sarpras/${record.id}`, { method: "DELETE" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Data sarpras gagal dihapus.");
      }
      setNotice({ success: true, text: "Data sarpras berhasil dihapus." });
      await loadRecords();
    } catch (error) {
      setNotice({ success: false, text: error.message || "Data sarpras gagal dihapus." });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg sm:p-8">
        <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-teal-300">
          <Boxes size={16} /> Rawat Jalan
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">Pencatatan Sarpras</h1>
            <p className="mt-2 text-sm text-slate-300">
              {readOnly
                ? {
                    usulan: "Lihat usulan kebutuhan alat kesehatan dan non-kesehatan per poli/ruangan.",
                    inventaris: "Lihat inventaris yang tercatat pada Kartu Inventaris Ruangan (KIR).",
                    rusak: "Lihat status tindak lanjut kerusakan alat.",
                  }[activeView]
                : {
                    usulan: "Kelola usulan kebutuhan alat kesehatan dan non-kesehatan per poli/ruangan.",
                    inventaris: "Lihat inventaris yang tercatat pada Kartu Inventaris Ruangan (KIR).",
                    rusak: "Laporkan kerusakan alat dan pantau tindak lanjut IPSRS per ruangan.",
                  }[activeView]}
            </p>
            {ruangan && <p className="mt-2 text-xs font-bold text-teal-200">Data ruang kerja: {ruangan}</p>}
          </div>
          {activeView === "usulan" && (
            <button
              type="button"
              onClick={openCreateForm}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white transition ${
                readOnly ? "bg-teal-700 hover:bg-teal-800" : "bg-teal-500 hover:bg-teal-400"
              }`}
            >
              <Plus size={18} /> {readOnly ? "Ajukan Sarpras" : "Tambah Sarpras"}
            </button>
          )}
        </div>
      </header>

      {readOnly && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
          Ajukan kebutuhan Sarpras tanpa login. Usulan akan masuk ke antrean persetujuan dan belum menjadi data utama sampai disetujui.
        </div>
      )}

      <div role="tablist" aria-label="Jenis data sarpras" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {[
          ["usulan", "Usulan Sarpras"],
          ["inventaris", "Inventaris KIR"],
          ["rusak", "Buku Alat Rusak"],
        ].map(([view, label]) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={activeView === view}
            onClick={() => setActiveView(view)}
            className={`rounded-xl px-4 py-3 text-sm font-black transition ${
              activeView === view
                ? "bg-teal-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeView === "inventaris" ? <SarprasKirInventory readOnly={readOnly} /> : activeView === "rusak" ? <SarprasAlatRusak readOnly={readOnly} /> : (
        <>
          {!readOnly && (
            <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-amber-950">Usulan Menunggu Persetujuan</h2>
                  <p className="mt-1 text-sm text-amber-900">Usulan publik akan masuk ke data utama setelah disetujui.</p>
                </div>
                <button type="button" onClick={loadProposals} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-900">
                  Muat ulang
                </button>
              </div>
              {proposalError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{proposalError}</p>}
              {proposals.length === 0 ? (
                <p className="rounded-lg bg-white p-4 text-sm text-slate-600">Tidak ada usulan yang menunggu persetujuan.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
                  <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                    <thead className="bg-amber-100 text-[10px] uppercase tracking-wide text-amber-950">
                      <tr>
                        {["Diajukan", "Kategori", "Nama Barang", "Poli/Ruangan", "Kebutuhan", "Keadaan", "Kekurangan", "Permintaan", "Spesifikasi", "Aksi"].map((heading) => (
                          <th key={heading} scope="col" className="border-b border-amber-200 px-3 py-3">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {proposals.map((proposal) => (
                        <tr key={proposal.id} className="border-b border-slate-100">
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{proposal.created_at}</td>
                          <td className="px-3 py-3 text-xs font-bold">{proposal.kategori}</td>
                          <td className="px-3 py-3 font-bold">{proposal.nama_barang}</td>
                          <td className="px-3 py-3">{proposal.klinik}</td>
                          {[proposal.kebutuhan, proposal.keadaan, proposal.kekurangan, proposal.permintaan].map((value, index) => (
                            <td key={`${proposal.id}-${index}`} className="px-3 py-3 text-center">{formatNumber(value)}</td>
                          ))}
                          <td className="max-w-64 whitespace-pre-wrap px-3 py-3 text-xs">{proposal.spesifikasi || "—"}</td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => reviewProposal(proposal, "approve")} disabled={processingProposalId === proposal.id} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                {processingProposalId === proposal.id ? "Memproses..." : "Setujui"}
                              </button>
                              <button type="button" onClick={() => reviewProposal(proposal, "reject")} disabled={processingProposalId === proposal.id} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                Tolak
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Data usulan berasal dari tab <strong>ALKES PER POLI</strong> pada pengajuan sarpras rawat jalan tahun 2026. Data inventaris KIR tersedia terpisah pada tab di atas.
          </div>

          {notice && (
        <div role={notice.success ? "status" : "alert"} className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-semibold ${notice.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {notice.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {notice.text}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Jumlah jenis barang", records.length],
          ["Total kebutuhan", totals.kebutuhan],
          ["Total permintaan", totals.permintaan],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatNumber(value)}</p>
          </article>
        ))}
      </section>

      {isFormOpen && (
        <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">{readOnly ? "Ajukan Sarpras" : editingId ? "Ubah Data Sarpras" : "Tambah Data Sarpras"}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {readOnly ? "Usulan akan masuk ke antrean dan belum mengubah data utama." : "Kolom menyesuaikan format pengajuan sarpras pada Excel."}
              </p>
            </div>
            <button type="button" onClick={closeForm} disabled={isSaving} aria-label="Tutup form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={saveRecord} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">
              Kategori
              <select required value={form.kategori} onChange={(event) => setForm((current) => ({ ...current, kategori: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900">
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              Nama Barang
              <input required maxLength={255} value={form.nama_barang} onChange={(event) => setForm((current) => ({ ...current, nama_barang: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Poli Klinik/Ruangan
              <input required maxLength={160} value={form.klinik} onChange={(event) => setForm((current) => ({ ...current, klinik: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
            </label>
            {[
              ["kebutuhan", "Kebutuhan"],
              ["keadaan", "Keadaan"],
              ["kekurangan", "Kekurangan"],
              ["permintaan", "Permintaan"],
              ["tahun", "Tahun"],
            ].map(([field, label]) => (
              <label key={field} className="text-xs font-bold text-slate-600">
                {label}
                <input required type="number" min={field === "tahun" ? "2000" : "0"} max={field === "tahun" ? "2100" : "1000000"} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
              </label>
            ))}
            <label className="text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-4">
              Spesifikasi/Keterangan
              <textarea maxLength={2000} rows={2} value={form.spesifikasi} onChange={(event) => setForm((current) => ({ ...current, spesifikasi: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
            </label>
            <div className="flex justify-end gap-3 sm:col-span-2 lg:col-span-4">
              <button type="button" onClick={closeForm} disabled={isSaving} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-black text-white hover:bg-teal-800 disabled:opacity-50">
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {isSaving ? "Mengirim..." : readOnly ? "Kirim Usulan" : editingId ? "Simpan Perubahan" : "Simpan Sarpras"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row">
          <label className="relative flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama barang, poli, kategori, spesifikasi..." className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 text-sm text-slate-900" />
          </label>
          <select aria-label="Filter kategori" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">
            <option value="">Semua kategori</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select aria-label="Filter poli atau ruangan" value={clinicFilter} onChange={(event) => setClinicFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">
            <option value="">Semua poli/ruangan</option>
            {clinics.map((clinic) => <option key={clinic} value={clinic}>{clinic}</option>)}
          </select>
          <button type="button" onClick={loadRecords} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> Muat ulang
          </button>
        </div>

        {loadError && (
          <div role="alert" className="m-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertCircle size={18} />{loadError}</span>
            <button type="button" onClick={loadRecords} className="font-bold underline">Coba lagi</button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm font-semibold text-slate-500"><Loader2 size={18} className="animate-spin" />Memuat data sarpras...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                <tr>
                  {["No.", "Kategori", "Nama Barang", "Poli Klinik/Ruangan", "Kebutuhan", "Keadaan", "Kekurangan", "Permintaan", "Spesifikasi/Keterangan", ...(!readOnly ? ["Aksi"] : [])].map((heading) => (
                    <th key={heading} scope="col" className="border-b border-slate-200 px-3 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70">
                    <td className="px-3 py-3 font-semibold text-slate-600">{record.nomor}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-600">{record.kategori}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{record.nama_barang}</td>
                    <td className="px-3 py-3 text-slate-700">{record.klinik}</td>
                    {[record.kebutuhan, record.keadaan, record.kekurangan, record.permintaan].map((value, index) => (
                      <td key={`${record.id}-${index}`} className="px-3 py-3 text-center font-semibold text-slate-700">{formatNumber(value)}</td>
                    ))}
                    <td className="max-w-64 whitespace-pre-wrap px-3 py-3 text-xs text-slate-600">{record.spesifikasi || "—"}</td>
                    {!readOnly && <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openEditForm(record)} aria-label={`Ubah ${record.nama_barang}`} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50">
                          <Pencil size={16} />
                        </button>
                        <button type="button" onClick={() => deleteRecord(record)} disabled={deletingId === record.id} aria-label={`Hapus ${record.nama_barang}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
                          {deletingId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>}
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr><td colSpan={readOnly ? 9 : 10} className="p-10 text-center text-sm text-slate-500">{records.length ? "Tidak ada data yang cocok dengan filter." : "Belum ada data sarpras untuk ruangan ini."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">Menampilkan {filteredRecords.length.toLocaleString("id-ID")} dari {records.length.toLocaleString("id-ID")} data.</p>}
      </section>
        </>
      )}
    </div>
  );
}
