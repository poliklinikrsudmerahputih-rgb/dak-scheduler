"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  getSarprasKirConditionLabel,
  normalizeSarprasKirCondition,
  sarprasKirCategories,
  sarprasKirConditions,
} from "@/lib/sarpras-kir";

const newRoomOption = "__new_room__";

const inventoryFields = [
  { key: "nama_barang", label: "Nama Barang", maxLength: 255, required: true },
  { key: "nomor_barang", label: "Kode Barang", maxLength: 100 },
  { key: "register", label: "Nomor Register", maxLength: 100 },
  { key: "merk_model", label: "Merek / Model", maxLength: 255 },
  { key: "no_seri_pabrik", label: "Nomor Seri Pabrik", maxLength: 255 },
  { key: "ukuran", label: "Ukuran", maxLength: 120 },
  { key: "bahan", label: "Bahan", maxLength: 120 },
  { key: "warna", label: "Warna", maxLength: 120 },
  { key: "tahun_pembuatan", label: "Tahun Pembuatan", maxLength: 20 },
  { key: "keadaan", label: "Kondisi Aset", maxLength: 80, required: true, select: true },
  { key: "jumlah_barang", label: "Jumlah Barang", maxLength: 20, inputMode: "decimal", type: "number", min: "0", step: "any" },
  { key: "kebutuhan_riil", label: "Kebutuhan Riil", maxLength: 20, inputMode: "decimal", type: "number", min: "0", step: "any" },
  { key: "keterangan", label: "Catatan", maxLength: 2000, multiline: true },
];

function createEmptyForm(sourceSheetIndex = "") {
  return {
    source_sheet_index: sourceSheetIndex,
    new_room_name: "",
    kategori: sarprasKirCategories[0],
    ...Object.fromEntries(inventoryFields.map(({ key }) => [key, ""])),
  };
}

function getSheetDisplayName(sheet) {
  return String(sheet.nama_ruang ?? "").trim()
    || String(sheet.source_sheet_name ?? "").trim()
    || `Tab ${sheet.source_sheet_index}`;
}

function displayValue(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

export default function SarprasKirInventory({ readOnly = false }) {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [proposalError, setProposalError] = useState("");
  const [processingProposalId, setProcessingProposalId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [notice, setNotice] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm());
  const [isSaving, setIsSaving] = useState(false);

  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const url = readOnly ? "/api/sarpras/publik?view=inventaris" : "/api/sarpras/kir";
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401 && !readOnly) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success || !Array.isArray(result.data) || !Array.isArray(result.sheets)) {
        throw new Error(result.error || "Inventaris KIR gagal dimuat.");
      }
      setRecords(result.data);
      setSheets(result.sheets);
    } catch (error) {
      setLoadError(error.message || "Inventaris KIR gagal dimuat.");
    } finally {
      setIsLoading(false);
    }
  }, [readOnly, router]);

  const loadProposals = useCallback(async () => {
    if (readOnly) return;
    try {
      const response = await fetch("/api/sarpras/kir-usulan", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Antrean usulan KIR gagal dimuat.");
      }
      setProposalError("");
      setProposals(result.data);
    } catch (error) {
      setProposalError(error.message || "Antrean usulan KIR gagal dimuat.");
    }
  }, [readOnly, router]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const sheetOptions = useMemo(() => {
    const options = new Map(
      sheets.map((sheet) => [String(sheet.source_sheet_index), { ...sheet }])
    );
    const recordCounts = new Map();

    for (const record of records) {
      const index = String(record.source_sheet_index ?? "").trim();
      if (!index) continue;
      recordCounts.set(index, (recordCounts.get(index) || 0) + 1);

      const existing = options.get(index);
      if (existing) {
        if (!String(existing.nama_ruang ?? "").trim() && String(record.nama_ruang ?? "").trim()) {
          options.set(index, { ...existing, nama_ruang: String(record.nama_ruang).trim() });
        }
        continue;
      }

      options.set(index, {
        source_sheet_index: Number(index),
        source_sheet_name: String(record.source_sheet_name ?? "").trim(),
        nama_ruang: String(record.nama_ruang ?? "").trim(),
        kode_ruang: String(record.kode_ruang ?? "").trim(),
        periode_kartu: String(record.periode_kartu ?? "").trim(),
        record_count: 0,
      });
    }

    const rows = [...options.values()]
      .map((sheet) => ({
        ...sheet,
        record_count: Math.max(
          Number(sheet.record_count) || 0,
          recordCounts.get(String(sheet.source_sheet_index)) || 0
        ),
        display_name: getSheetDisplayName(sheet),
      }))
      .sort((left, right) => Number(left.source_sheet_index) - Number(right.source_sheet_index));
    const labelCounts = new Map();
    for (const sheet of rows) {
      const labelKey = sheet.display_name.toLocaleUpperCase("id-ID");
      labelCounts.set(labelKey, (labelCounts.get(labelKey) || 0) + 1);
    }
    return rows.map((sheet) => {
      const labelKey = sheet.display_name.toLocaleUpperCase("id-ID");
      if (labelCounts.get(labelKey) <= 1) return sheet;
      const sourceName = String(sheet.source_sheet_name ?? "").trim();
      const suffix = sourceName && sourceName.toLocaleUpperCase("id-ID") !== labelKey
        ? sourceName
        : `Tab ${sheet.source_sheet_index}`;
      return { ...sheet, display_name: `${sheet.display_name} (${suffix})` };
    });
  }, [records, sheets]);

  const availableCategories = useMemo(
    () => [...new Set(records.map((record) => record.kategori).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "id")),
    [records]
  );
  const conditions = useMemo(
    () => [...new Set(records.map((record) => normalizeSarprasKirCondition(record.keadaan)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "id")),
    [records]
  );
  const conditionOptions = useMemo(() => {
    const options = [...sarprasKirConditions];
    if (editingId && form.keadaan && !options.some((option) => option.value === form.keadaan)) {
      options.push({
        value: form.keadaan,
        label: getSarprasKirConditionLabel(form.keadaan),
      });
    }
    return options;
  }, [editingId, form.keadaan]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return records.filter((record) => {
      if (sheetFilter && String(record.source_sheet_index) !== sheetFilter) return false;
      if (categoryFilter && record.kategori !== categoryFilter) return false;
      if (conditionFilter && normalizeSarprasKirCondition(record.keadaan) !== conditionFilter) return false;
      return !query || [
        record.source_sheet_name,
        record.nama_ruang,
        record.kode_ruang,
        record.periode_kartu,
        record.kategori,
        record.nomor_urut,
        record.nama_barang,
        record.nomor_barang,
        record.register,
        record.merk_model,
        record.no_seri_pabrik,
        record.ukuran,
        record.bahan,
        record.warna,
        record.tahun_pembuatan,
        record.keadaan,
        record.jumlah_barang,
        record.kebutuhan_riil,
        record.keterangan,
      ].some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
    });
  }, [records, search, sheetFilter, categoryFilter, conditionFilter]);

  const totalQuantity = useMemo(
    () => records.reduce((total, record) => total + (Number(record.jumlah_barang) || 0), 0),
    [records]
  );
  const selectedSheet = sheetOptions.find((sheet) => String(sheet.source_sheet_index) === sheetFilter);

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingId(null);
  };

  const openCreateForm = () => {
    const defaultSheetIndex = sheetFilter
      || String(sheetOptions.find((sheet) => Number(sheet.record_count) > 0)?.source_sheet_index || sheetOptions[0]?.source_sheet_index || "");
    setEditingId(null);
    setForm(createEmptyForm(defaultSheetIndex));
    setNotice(null);
    setIsFormOpen(true);
  };

  const openEditForm = (record) => {
    setEditingId(record.id);
    setForm({
      source_sheet_index: String(record.source_sheet_index),
      kategori: record.kategori || sarprasKirCategories[0],
      ...Object.fromEntries(inventoryFields.map(({ key }) => [
        key,
        key === "keadaan"
          ? normalizeSarprasKirCondition(record[key])
          : String(record[key] ?? ""),
      ])),
    });
    setNotice(null);
    setIsFormOpen(true);
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);
    try {
      const payload = {
        kategori: form.kategori,
        ...Object.fromEntries(inventoryFields.map(({ key }) => [key, form[key]])),
      };
      if (!editingId) {
        payload.source_sheet_index = form.source_sheet_index === newRoomOption
          ? newRoomOption
          : Number(form.source_sheet_index);
        if (form.source_sheet_index === newRoomOption) payload.new_room_name = form.new_room_name;
      }
      const response = await fetch(
        readOnly ? "/api/sarpras/kir-usulan" : editingId ? `/api/sarpras/kir/${editingId}` : "/api/sarpras/kir",
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
        throw new Error(result.error || "Inventaris KIR gagal disimpan.");
      }
      if (!readOnly && !editingId && Number.isSafeInteger(Number(result.source_sheet_index))) {
        setSheetFilter(String(result.source_sheet_index));
      }
      setIsFormOpen(false);
      setEditingId(null);
      const savedNumber = String(result.nomor_urut ?? "").trim();
      setNotice({
        success: true,
        text: readOnly
          ? "Usulan inventaris KIR berhasil dikirim dan menunggu persetujuan."
          : editingId
            ? "Data inventaris KIR berhasil diperbarui."
            : `Data inventaris KIR berhasil ditambahkan${savedNumber ? ` dengan nomor urut ${savedNumber}` : ""}.`,
      });
      if (!readOnly) await loadInventory();
    } catch (error) {
      setNotice({ success: false, text: error.message || "Inventaris KIR gagal disimpan." });
    } finally {
      setIsSaving(false);
    }
  };

  const reviewProposal = async (proposal, action) => {
    const actionLabel = action === "approve" ? "menyetujui" : "menolak";
    if (!window.confirm(`Apakah Anda yakin ingin ${actionLabel} usulan KIR ${proposal.nama_barang}?`)) return;
    setProcessingProposalId(proposal.id);
    setNotice(null);
    try {
      const response = await fetch("/api/sarpras/kir-usulan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposal.id, action }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || "Usulan KIR gagal diproses.");
      setNotice({
        success: true,
        text: action === "approve"
          ? `Usulan KIR disetujui dengan nomor urut ${result.nomor_urut}.`
          : "Usulan KIR ditolak.",
      });
      await Promise.all([loadProposals(), ...(action === "approve" ? [loadInventory()] : [])]);
    } catch (error) {
      setNotice({ success: false, text: error.message || "Usulan KIR gagal diproses." });
    } finally {
      setProcessingProposalId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-teal-950">
          {readOnly
            ? "Anda dapat menambahkan usulan inventaris KIR tanpa login. Usulan akan masuk antrean dan baru dicatat setelah disetujui di submenu Sarpras."
            : "Data KIR terpisah dari usulan Sarpras. Data Excel dapat diedit; baris sumber asli tetap tersimpan dan input baru ditandai sebagai manual."}
        </p>
        <button
          type="button"
          onClick={openCreateForm}
          disabled={isLoading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={17} /> {readOnly ? "Tambahkan KIR" : "Tambah Inventaris"}
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

      {!readOnly && (
        <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-amber-950">Usulan KIR Menunggu Persetujuan</h2>
              <p className="mt-1 text-sm text-amber-900">Data akan masuk ke inventaris setelah disetujui.</p>
            </div>
            <button type="button" onClick={loadProposals} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-900">Muat ulang</button>
          </div>
          {proposalError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{proposalError}</p>}
          {proposals.length === 0 ? (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-600">Tidak ada usulan KIR yang menunggu persetujuan.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead className="bg-amber-100 text-[10px] uppercase tracking-wide text-amber-950">
                  <tr>{["Diajukan", "Ruang", "Kategori", "Nama Barang", "Kondisi", "Jumlah", "Keterangan", "Aksi"].map((heading) => <th key={heading} scope="col" className="border-b border-amber-200 px-3 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {proposals.map((proposal) => (
                    <tr key={proposal.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-3 text-xs">{proposal.created_at}</td>
                      <td className="px-3 py-3">{proposal.new_room_name || sheetOptions.find((sheet) => String(sheet.source_sheet_index) === String(proposal.source_sheet_index))?.display_name || "—"}</td>
                      <td className="px-3 py-3">{proposal.kategori}</td>
                      <td className="px-3 py-3 font-bold">{proposal.nama_barang}</td>
                      <td className="px-3 py-3">{getSarprasKirConditionLabel(proposal.keadaan)}</td>
                      <td className="px-3 py-3">{displayValue(proposal.jumlah_barang)}</td>
                      <td className="max-w-64 whitespace-pre-wrap px-3 py-3 text-xs">{proposal.keterangan || "—"}</td>
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
        <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {readOnly ? "Ajukan Inventaris KIR" : editingId ? "Edit Inventaris KIR" : "Input Inventaris KIR"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {readOnly ? "Usulan akan masuk antrean persetujuan sebelum ditambahkan ke inventaris." : "Isi informasi aset. Nomor urut dibuat otomatis sesuai tab inventaris."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSaving}
              aria-label="Tutup form inventaris"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={saveRecord} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {!editingId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2 lg:col-span-4">
                <p className="text-xs font-bold text-slate-600">Nomor Urut</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">Dibuat otomatis saat data disimpan</p>
              </div>
            )}
            <label className="text-xs font-bold text-slate-600">
              Tab / Ruangan
              <select
                required
                disabled={Boolean(editingId)}
                value={form.source_sheet_index}
                onChange={(event) => setForm((current) => ({ ...current, source_sheet_index: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 disabled:bg-slate-100"
              >
                <option value="" disabled>Pilih tab / ruangan</option>
                {sheetOptions.map((sheet) => (
                  <option key={sheet.source_sheet_index} value={String(sheet.source_sheet_index)}>
                    {sheet.display_name}
                  </option>
                ))}
                {!editingId && <option value={newRoomOption}>+ Tambahkan ruangan baru</option>}
              </select>
              {editingId && <span className="mt-1 block font-medium text-slate-400">Tab sumber tidak dapat diubah saat edit.</span>}
            </label>
            {!editingId && form.source_sheet_index === newRoomOption && (
              <label className="text-xs font-bold text-slate-600">
                Nama Ruangan Baru
                <input
                  required
                  maxLength={160}
                  value={form.new_room_name}
                  onChange={(event) => setForm((current) => ({ ...current, new_room_name: event.target.value }))}
                  placeholder="Contoh: POLI GIGI UMUM 3"
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
                />
              </label>
            )}
            <label className="text-xs font-bold text-slate-600">
              Kategori
              <select
                required
                value={form.kategori}
                onChange={(event) => setForm((current) => ({ ...current, kategori: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
              >
                {sarprasKirCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            {inventoryFields.map((field) => (
              <label
                key={field.key}
                className={`text-xs font-bold text-slate-600 ${
                  field.multiline ? "sm:col-span-2 lg:col-span-4" : ""
                }`}
              >
                {field.label}
                {field.select ? (
                  <select
                    required={field.required}
                    value={form[field.key]}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
                  >
                    <option value="" disabled>Pilih kondisi aset</option>
                    {conditionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : field.multiline ? (
                  <textarea
                    maxLength={field.maxLength}
                    rows={3}
                    value={form[field.key]}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
                  />
                ) : (
                  <input
                    type={field.type || "text"}
                    required={field.required}
                    maxLength={field.maxLength}
                    inputMode={field.inputMode}
                    min={field.min}
                    step={field.step}
                    value={form[field.key]}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
                  />
                )}
              </label>
            ))}
            <div className="flex justify-end gap-3 sm:col-span-2 lg:col-span-4">
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
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-black text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {isSaving ? (readOnly ? "Mengirim..." : "Menyimpan...") : readOnly ? "Kirim Usulan" : editingId ? "Simpan Perubahan" : "Simpan Inventaris"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Jumlah catatan barang", records.length],
          ["Total jumlah barang", totalQuantity],
          ["Tab inventaris", sheetOptions.length],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatNumber(value)}</p>
          </article>
        ))}
      </section>

      {selectedSheet && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <span className="font-bold">{selectedSheet.display_name}</span>
          {selectedSheet.kode_ruang && <span> · {selectedSheet.kode_ruang}</span>}
          {selectedSheet.periode_kartu && <span> · {selectedSheet.periode_kartu}</span>}
          {Number(selectedSheet.record_count) === 0 && <span> · Tidak ada baris barang pada tab ini.</span>}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[minmax(240px,1fr)_minmax(200px,0.8fr)_minmax(180px,0.6fr)_minmax(170px,0.6fr)_auto]">
          <label className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, kode, poli, kondisi..."
              className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 text-sm text-slate-900"
            />
          </label>
          <select aria-label="Filter tab KIR" value={sheetFilter} onChange={(event) => setSheetFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">
            <option value="">Semua tab/ruangan</option>
            {sheetOptions.map((sheet) => (
              <option key={sheet.source_sheet_index} value={String(sheet.source_sheet_index)}>
                {sheet.display_name} ({formatNumber(sheet.record_count)})
              </option>
            ))}
          </select>
          <select aria-label="Filter kategori inventaris" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">
            <option value="">Semua kategori</option>
            {availableCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select aria-label="Filter kondisi inventaris" value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">
            <option value="">Semua kondisi</option>
            {conditions.map((condition) => <option key={condition} value={condition}>{getSarprasKirConditionLabel(condition)}</option>)}
          </select>
          <button type="button" onClick={loadInventory} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> Muat ulang
          </button>
        </div>

        {loadError && (
          <div role="alert" className="m-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertCircle size={18} />{loadError}</span>
            <button type="button" onClick={loadInventory} className="font-bold underline">Coba lagi</button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm font-semibold text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Memuat inventaris KIR...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2800px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                <tr>
                  {[
                    "No.", "Kategori", "Nama Barang", "Ruang", "Kode Ruang", "Kode Barang",
                    "Register", "Merk/Model", "No. Seri Pabrik", "Ukuran", "Bahan", "Warna",
                    "Tahun", "Kondisi", "Jumlah", "Kebutuhan Riil", "Keterangan", "Tab Excel", "Periode Kartu", "Sumber",
                    ...(!readOnly ? ["Aksi"] : []),
                  ].map((heading) => (
                    <th key={heading} scope="col" className="border-b border-slate-200 px-3 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/70">
                    <td className="px-3 py-3 font-semibold text-slate-600">{displayValue(record.nomor_urut)}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-600">{displayValue(record.kategori)}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{displayValue(record.nama_barang)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.nama_ruang)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.kode_ruang)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.nomor_barang)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.register)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.merk_model)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.no_seri_pabrik)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.ukuran)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.bahan)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.warna)}</td>
                    <td className="px-3 py-3 text-slate-700">{displayValue(record.tahun_pembuatan)}</td>
                    <td className="px-3 py-3 text-slate-700">{getSarprasKirConditionLabel(record.keadaan)}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-700">{displayValue(record.jumlah_barang)}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-700">{displayValue(record.kebutuhan_riil)}</td>
                    <td className="max-w-72 whitespace-pre-wrap px-3 py-3 text-xs text-slate-600">{displayValue(record.keterangan)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{displayValue(record.source_sheet_name)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{displayValue(record.periode_kartu)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{displayValue(record.source_file)}</td>
                    {!readOnly && <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openEditForm(record)}
                        aria-label={`Edit ${record.nama_barang}`}
                        className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>}
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={readOnly ? 20 : 21} className="p-10 text-center text-sm text-slate-500">
                      {records.length ? "Tidak ada data yang cocok dengan filter." : "Belum ada data inventaris KIR untuk ruangan ini."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && (
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Menampilkan {formatNumber(filteredRecords.length)} dari {formatNumber(records.length)} data.
          </p>
        )}
      </section>
    </div>
  );
}
