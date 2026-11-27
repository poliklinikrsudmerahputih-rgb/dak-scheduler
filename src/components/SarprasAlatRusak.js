"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";

const fieldClassName = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900";
const otherRoomOption = "__other_room__";

function getTodayInJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function createEmptyForm(reporterName = "") {
  return {
    tanggal_pelaporan: getTodayInJakarta(),
    poli_ruangan: "",
    poli_ruangan_lainnya: "",
    nama_barang: "",
    deskripsi_kerusakan: "",
    nama_pelapor: reporterName,
    petugas_ipsrs: "",
    tanggal_selesai: "",
  };
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function SarprasAlatRusak({ readOnly = false }) {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [proposalError, setProposalError] = useState("");
  const [processingProposalId, setProcessingProposalId] = useState(null);
  const [poliRuanganOptions, setPoliRuanganOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(createEmptyForm);
  const [defaultReporterName, setDefaultReporterName] = useState("");

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const url = readOnly ? "/api/sarpras/publik?view=rusak" : "/api/sarpras/alat-rusak";
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401 && !readOnly) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success || !Array.isArray(result.data) || !Array.isArray(result.poli_ruangan_options)) {
        throw new Error(result.error || "Buku alat rusak gagal dimuat.");
      }
      setRecords(result.data);
      setPoliRuanganOptions(result.poli_ruangan_options);
      setDefaultReporterName(result.nama_pelapor_default || "");
    } catch (error) {
      setLoadError(error.message || "Buku alat rusak gagal dimuat.");
    } finally {
      setIsLoading(false);
    }
  }, [readOnly, router]);

  const loadProposals = useCallback(async () => {
    if (readOnly) return;
    try {
      const response = await fetch("/api/sarpras/alat-rusak-usulan", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Antrean usulan laporan gagal dimuat.");
      }
      setProposalError("");
      setProposals(result.data);
    } catch (error) {
      setProposalError(error.message || "Antrean usulan laporan gagal dimuat.");
    }
  }, [readOnly, router]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const totals = useMemo(() => records.reduce((result, record) => {
    result[record.status === "SELESAI" ? "selesai" : "menunggu"]++;
    return result;
  }, { menunggu: 0, selesai: 0 }), [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return records.filter((record) => {
      if (locationFilter && record.poli_ruangan !== locationFilter) return false;
      if (statusFilter && record.status !== statusFilter) return false;
      return !query || [
        record.nomor,
        record.tanggal_pelaporan,
        record.poli_ruangan,
        record.nama_barang,
        record.deskripsi_kerusakan,
        record.nama_pelapor,
        record.petugas_ipsrs,
        record.tanggal_selesai,
      ].some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
    });
  }, [records, search, locationFilter, statusFilter]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(createEmptyForm(defaultReporterName));
    setNotice(null);
    setIsFormOpen(true);
  };

  const openEditForm = (record) => {
    setNotice(null);
    const savedLocation = String(record.poli_ruangan ?? "").trim();
    const isKnownLocation = poliRuanganOptions.some(
      (location) => location.toLocaleUpperCase("id-ID") === savedLocation.toLocaleUpperCase("id-ID")
    );
    setEditingId(record.id);
    setForm({
      tanggal_pelaporan: record.tanggal_pelaporan,
      poli_ruangan: savedLocation && isKnownLocation ? savedLocation : otherRoomOption,
      poli_ruangan_lainnya: isKnownLocation ? "" : savedLocation,
      nama_barang: record.nama_barang,
      deskripsi_kerusakan: record.deskripsi_kerusakan,
      nama_pelapor: record.nama_pelapor,
      petugas_ipsrs: record.petugas_ipsrs,
      tanggal_selesai: record.tanggal_selesai || "",
    });
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
      const payload = {
        ...form,
        poli_ruangan: form.poli_ruangan === otherRoomOption
          ? form.poli_ruangan_lainnya
          : form.poli_ruangan,
      };
      delete payload.poli_ruangan_lainnya;
      const response = await fetch(
        readOnly ? "/api/sarpras/alat-rusak-usulan" : editingId ? `/api/sarpras/alat-rusak/${editingId}` : "/api/sarpras/alat-rusak",
        {
          method: readOnly ? "POST" : editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Laporan alat rusak gagal disimpan.");
      }
      setIsFormOpen(false);
      setEditingId(null);
      setNotice({
        success: true,
        text: readOnly
          ? "Usulan laporan alat rusak berhasil dikirim dan menunggu persetujuan."
          : editingId ? "Laporan alat rusak berhasil diperbarui." : `Laporan alat rusak nomor ${result.nomor} berhasil disimpan.`,
      });
      if (!readOnly) await loadRecords();
    } catch (error) {
      setNotice({ success: false, text: error.message || "Laporan alat rusak gagal disimpan." });
    } finally {
      setIsSaving(false);
    }
  };

  const reviewProposal = async (proposal, action) => {
    const actionLabel = action === "approve" ? "menyetujui" : "menolak";
    if (!window.confirm(`Apakah Anda yakin ingin ${actionLabel} laporan ${proposal.nama_barang}?`)) return;
    setProcessingProposalId(proposal.id);
    setNotice(null);
    try {
      const response = await fetch("/api/sarpras/alat-rusak-usulan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposal.id, action }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || "Usulan laporan gagal diproses.");
      setNotice({
        success: true,
        text: action === "approve"
          ? `Laporan disetujui dan ditambahkan dengan nomor ${result.nomor}.`
          : "Usulan laporan alat rusak ditolak.",
      });
      await Promise.all([loadProposals(), ...(action === "approve" ? [loadRecords()] : [])]);
    } catch (error) {
      setNotice({ success: false, text: error.message || "Usulan laporan gagal diproses." });
    } finally {
      setProcessingProposalId(null);
    }
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-amber-950">
          {readOnly
            ? "Lihat status tindak lanjut laporan kerusakan, termasuk nama pelapor dan petugas IPSRS."
            : "Catat laporan kerusakan untuk ditindaklanjuti IPSRS. Laporan yang belum memiliki tanggal selesai tetap berada pada daftar menunggu."}
        </p>
        <button
          type="button"
          onClick={openCreateForm}
          disabled={isLoading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={17} /> {readOnly ? "Buat Laporan" : "Buat Laporan"}
        </button>
      </div>

      {notice && (
        <div
          role={notice.success ? "status" : "alert"}
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-semibold ${
            notice.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {notice.text}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total laporan", records.length],
          ["Menunggu penanganan", totals.menunggu],
          ["Selesai ditangani", totals.selesai],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{Number(value).toLocaleString("id-ID")}</p>
          </article>
        ))}
      </section>

      {!readOnly && (
        <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-amber-950">Usulan Laporan Menunggu Persetujuan</h2>
              <p className="mt-1 text-sm text-amber-900">Laporan baru akan dicatat setelah disetujui.</p>
            </div>
            <button type="button" onClick={loadProposals} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-900">Muat ulang</button>
          </div>
          {proposalError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{proposalError}</p>}
          {proposals.length === 0 ? (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-600">Tidak ada usulan laporan yang menunggu persetujuan.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
              <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                <thead className="bg-amber-100 text-[10px] uppercase tracking-wide text-amber-950">
                  <tr>{["Diajukan", "Tanggal", "Poli/Ruang", "Nama Alat", "Deskripsi Kerusakan", "Pelapor", "Aksi"].map((heading) => <th key={heading} scope="col" className="border-b border-amber-200 px-3 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {proposals.map((proposal) => (
                    <tr key={proposal.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-3 text-xs">{proposal.created_at}</td>
                      <td className="whitespace-nowrap px-3 py-3">{formatDate(proposal.tanggal_pelaporan)}</td>
                      <td className="px-3 py-3">{proposal.poli_ruangan}</td>
                      <td className="px-3 py-3 font-bold">{proposal.nama_barang}</td>
                      <td className="max-w-72 whitespace-pre-wrap px-3 py-3">{proposal.deskripsi_kerusakan}</td>
                      <td className="px-3 py-3">{proposal.nama_pelapor}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => reviewProposal(proposal, "approve")} disabled={processingProposalId === proposal.id} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{processingProposalId === proposal.id ? "Memproses..." : "Setujui"}</button>
                          <button type="button" onClick={() => reviewProposal(proposal, "reject")} disabled={processingProposalId === proposal.id} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Tolak</button>
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

      {isFormOpen && (
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {readOnly ? "Ajukan Laporan Alat Rusak" : editingId ? "Perbarui Laporan Alat Rusak" : "Buat Laporan Alat Rusak"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {readOnly ? "Laporan akan dicatat setelah usulan disetujui." : "Tanggal selesai dapat diisi setelah IPSRS menuntaskan penanganan."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSaving}
              aria-label="Tutup form laporan"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={saveRecord} className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">
              Tanggal Pelaporan
              <input
                type="date"
                required
                value={form.tanggal_pelaporan}
                onChange={(event) => updateForm("tanggal_pelaporan", event.target.value)}
                className={fieldClassName}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Poli / Ruangan
              <select
                required
                value={form.poli_ruangan}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((current) => ({
                    ...current,
                    poli_ruangan: value,
                    poli_ruangan_lainnya: value === otherRoomOption ? current.poli_ruangan_lainnya : "",
                  }));
                }}
                className={fieldClassName}
              >
                <option value="" disabled>Pilih poli / ruangan</option>
                {poliRuanganOptions.map((location) => <option key={location} value={location}>{location}</option>)}
                <option value={otherRoomOption}>Lainnya - isi manual</option>
              </select>
            </label>
            {form.poli_ruangan === otherRoomOption && (
              <label className="text-xs font-bold text-slate-600">
                Nama Poli / Ruangan
                <input
                  required
                  maxLength={160}
                  value={form.poli_ruangan_lainnya}
                  onChange={(event) => updateForm("poli_ruangan_lainnya", event.target.value)}
                  placeholder="Masukkan nama poli atau ruangan"
                  className={fieldClassName}
                />
              </label>
            )}
            <label className="text-xs font-bold text-slate-600">
              Nama Barang / Alat / Alkes
              <input
                required
                maxLength={255}
                value={form.nama_barang}
                onChange={(event) => updateForm("nama_barang", event.target.value)}
                className={fieldClassName}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Nama Pelapor
              <input
                required
                maxLength={160}
                value={form.nama_pelapor}
                onChange={(event) => updateForm("nama_pelapor", event.target.value)}
                className={fieldClassName}
              />
            </label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              Deskripsi Kerusakan
              <textarea
                required
                maxLength={2000}
                rows={3}
                value={form.deskripsi_kerusakan}
                onChange={(event) => updateForm("deskripsi_kerusakan", event.target.value)}
                className={fieldClassName}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Nama Petugas IPSRS Penerima
              <input
                required
                maxLength={160}
                value={form.petugas_ipsrs}
                onChange={(event) => updateForm("petugas_ipsrs", event.target.value)}
                className={fieldClassName}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Tanggal Selesai Penanganan
              <input
                type="date"
                min={form.tanggal_pelaporan}
                value={form.tanggal_selesai}
                onChange={(event) => updateForm("tanggal_selesai", event.target.value)}
                className={fieldClassName}
              />
              <span className="mt-1 block font-medium text-slate-400">Kosongkan sampai perbaikan selesai.</span>
            </label>

            <div className="flex justify-end gap-3 sm:col-span-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={isSaving}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-3 text-sm font-black text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {isSaving ? (readOnly ? "Mengirim..." : "Menyimpan...") : readOnly ? "Kirim Usulan" : editingId ? "Simpan Perubahan" : "Simpan Laporan"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_220px_auto]">
          <label className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari barang, kerusakan, petugas..."
              className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 text-sm text-slate-900"
            />
          </label>
          <select
            aria-label="Filter poli atau ruangan laporan"
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900"
          >
            <option value="">Semua poli/ruangan</option>
            {poliRuanganOptions.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
          <select
            aria-label="Filter status laporan"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900"
          >
            <option value="">Semua status</option>
            <option value="MENUNGGU">Menunggu penanganan</option>
            <option value="SELESAI">Selesai ditangani</option>
          </select>
          <button
            type="button"
            onClick={loadRecords}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
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
          <div className="flex items-center justify-center gap-2 p-12 text-sm font-semibold text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Memuat buku alat rusak...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                <tr>
                  {["No.", "Tgl. Pelaporan", "Poli / Ruangan", "Nama Barang / Alat", "Deskripsi Kerusakan", "Nama Pelapor", "Petugas IPSRS", "Tgl. Selesai", "Status", ...(!readOnly ? ["Aksi"] : [])].map((heading) => (
                    <th key={heading} scope="col" className="border-b border-slate-200 px-3 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70">
                    <td className="px-3 py-3 font-semibold text-slate-600">{record.nomor}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDate(record.tanggal_pelaporan)}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{record.poli_ruangan}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{record.nama_barang}</td>
                    <td className="max-w-72 whitespace-pre-wrap px-3 py-3 text-slate-700">{record.deskripsi_kerusakan}</td>
                    <td className="px-3 py-3 text-slate-700">{record.nama_pelapor}</td>
                    <td className="px-3 py-3 text-slate-700">{record.petugas_ipsrs}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDate(record.tanggal_selesai)}</td>
                    <td className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black ${
                        record.status === "SELESAI"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {record.status === "SELESAI" ? "Selesai" : "Menunggu"}
                      </span>
                    </td>
                    {!readOnly && <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openEditForm(record)}
                        aria-label={`Ubah laporan ${record.nomor}: ${record.nama_barang}`}
                        className="rounded-lg p-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>}
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={readOnly ? 9 : 10} className="p-10 text-center text-sm text-slate-500">
                      {records.length ? "Tidak ada laporan yang cocok dengan pencarian atau filter." : "Belum ada laporan alat rusak untuk ruangan ini."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && (
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Menampilkan {filteredRecords.length.toLocaleString("id-ID")} dari {records.length.toLocaleString("id-ID")} laporan.
          </p>
        )}
      </section>
    </div>
  );
}
