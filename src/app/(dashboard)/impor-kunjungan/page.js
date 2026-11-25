"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarRange, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const SKIP_DOCTOR = "__SKIP_DOCTOR__";

const MODE_OPTIONS = [
  { value: "bulanan", label: "Bulanan", desc: "Rekap total per dokter untuk satu bulan penuh." },
  { value: "harian", label: "Harian", desc: "Kunjungan per dokter untuk satu tanggal. Masuk ke poin checkpoint asisten." },
  { value: "rentang", label: "Rentang Waktu", desc: "Kunjungan per dokter untuk beberapa tanggal. Masuk ke poin checkpoint asisten." },
];

function formatDateLabel(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export default function ImportVisitsPage() {
  const router = useRouter();
  const [mode, setMode] = useState("bulanan");
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [doctorMatches, setDoctorMatches] = useState({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/dokter")
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) {
          router.push("/login");
          throw new Error("Sesi berakhir. Silakan login kembali.");
        }
        if (!response.ok || !Array.isArray(data)) throw new Error("Daftar Master Dokter gagal dimuat.");
        return data;
      })
      .then((data) => { if (active) setDoctors(data); })
      .catch((fetchError) => { if (active) setError(fetchError.message || "Daftar Master Dokter gagal dimuat."); })
      .finally(() => { if (active) setLoadingDoctors(false); });
    return () => { active = false; };
  }, [router]);

  const doctorNames = useMemo(() => {
    const unique = new Map();
    for (const doctor of doctors) {
      const name = String(doctor.nama_dokter || "").replace(/\s+/g, " ").trim();
      if (name && !unique.has(normalize(name))) unique.set(normalize(name), name);
    }
    return [...unique.values()].sort((first, second) => first.localeCompare(second, "id"));
  }, [doctors]);

  const doctorClinicMap = useMemo(() => {
    const map = new Map();
    for (const doctor of doctors) {
      const nameKey = normalize(doctor.nama_dokter);
      const clinic = String(doctor.klinik || "").replace(/\s+/g, " ").trim();
      if (!map.has(nameKey)) map.set(nameKey, new Set());
      if (clinic) map.get(nameKey).add(clinic);
    }
    return map;
  }, [doctors]);

  const isDailyMode = report?.mode === "harian" || report?.mode === "rentang";
  const isAggregateReport = report?.reportType === "aggregate";

  const mappedRows = useMemo(() => {
    if (!report?.rows) return { records: [], errors: [], skippedCount: 0, unmatchedCount: 0, importableRecords: [], totalVisits: 0 };
    const seen = new Set();
    const records = report.rows.map((row) => {
      const exactName = doctorNames.find((name) => normalize(name) === normalize(row.sourceName));
      const selectedName = doctorMatches[normalize(row.sourceName)];
      const skipped = selectedName === SKIP_DOCTOR;
      const namaDokter = skipped ? "" : selectedName || exactName || "";
      const clinics = doctorClinicMap.get(normalize(namaDokter)) || new Set();
      const resolvedClinic = row.clinicName || (clinics.size === 1 ? [...clinics][0] : "");
      const effectiveDate = row.tanggal || (isAggregateReport ? report.startDate : "");
      let message = "";
      if (skipped) message = "Dokter ini akan dilewati.";
      else if (isDailyMode && !isAggregateReport && !row.tanggal) message = "Tanggal tidak valid.";
      else if (row.jumlah === null) message = "Kolom jumlah/total tidak berisi angka bulat yang valid.";
      else if (!namaDokter) message = "Pilih nama dokter yang sesuai dari Master Dokter.";
      else if (isDailyMode && !resolvedClinic) message = "Klinik tidak ditemukan. Isi kolom KLINIK di file atau pastikan dokter punya satu klinik di Master Dokter.";
      else if (isDailyMode && clinics.size > 0 && ![...clinics].map(normalize).includes(normalize(resolvedClinic))) message = "Klinik tidak cocok dengan Master Dokter.";

      const dedupeKey = isDailyMode && !isAggregateReport
        ? `${row.tanggal}|${normalize(namaDokter)}|${normalize(resolvedClinic)}`
        : isAggregateReport
          ? `${normalize(namaDokter)}|${normalize(resolvedClinic)}`
          : normalize(namaDokter);
      if (!skipped && !message && seen.has(dedupeKey)) message = isAggregateReport ? "Ada data ganda untuk dokter/klinik yang sama." : isDailyMode ? "Ada data ganda untuk dokter/klinik/tanggal yang sama." : "Ada lebih dari satu baris untuk dokter yang sama.";
      if (!skipped && !message) seen.add(dedupeKey);
      return { ...row, namaDokter, resolvedClinic, effectiveDate, skipped, message };
    });
    const errors = records.filter((row) => row.message && !row.skipped);
    const skippedCount = records.filter((row) => row.skipped).length;
    const importableRecords = records.filter((row) => !row.skipped && !row.message);
    const unmatchedCount = records.filter((row) => !row.skipped && !row.namaDokter && row.jumlah !== null).length;
    const totalVisits = importableRecords.reduce((sum, row) => sum + (Number(row.jumlah) || 0), 0);
    return { records, errors, skippedCount, unmatchedCount, importableRecords, totalVisits };
  }, [doctorMatches, doctorNames, doctorClinicMap, isAggregateReport, isDailyMode, report]);

  const loadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    setReport(null);
    setDoctorMatches({});
    setFileName(file.name);
    setLoadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      const response = await fetch("/api/impor-kunjungan", { method: "POST", body: formData });
      const payload = await response.json();
      if (response.status === 401) { router.push("/login"); throw new Error("Sesi berakhir. Silakan login kembali."); }
      if (!response.ok) throw new Error(payload.error || "File Excel gagal dibaca.");
      if (payload?.report?.error) throw new Error(payload.report.error);
      setReport(payload.report);
    } catch (loadError) {
      setError(loadError.message || "File Excel gagal dibaca.");
    } finally {
      setLoadingFile(false);
      event.target.value = "";
    }
  };

  const importData = async () => {
    setError("");
    setSubmitting(true);
    try {
      const isDaily = report?.mode === "harian" || report?.mode === "rentang";
      const payloadBody = isDaily ? {
        mode: report.mode,
        reportType: report.reportType || "daily_rows",
        startDate: report.startDate,
        endDate: report.endDate,
        records: mappedRows.importableRecords.map(({ namaDokter, resolvedClinic, jumlah, tanggal, effectiveDate, rowNumber }) => ({
          nama_dokter: namaDokter,
          klinik: resolvedClinic,
          jumlah,
          tanggal: tanggal || effectiveDate,
          rowNumber
        }))
      } : {
        mode: "bulanan",
        tahun: report.year,
        bulan: report.month,
        records: mappedRows.importableRecords.map(({ namaDokter, jumlah, rowNumber }) => ({
          nama_dokter: namaDokter,
          jumlah,
          rowNumber
        }))
      };

      const response = await fetch("/api/impor-kunjungan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      const payload = await response.json();
      if (response.status === 401) { router.push("/login"); throw new Error("Sesi berakhir. Silakan login kembali."); }
      if (!response.ok || !payload.success) throw new Error(payload.error || "Impor data kunjungan gagal.");
      setResult({ ...payload, skipped: mappedRows.skippedCount });
    } catch (importError) {
      setError(importError.message || "Impor data kunjungan gagal.");
    } finally {
      setSubmitting(false);
    }
  };

  const skipUnmatchedDoctors = () => {
    setDoctorMatches((current) => {
      const next = { ...current };
      for (const row of mappedRows.records) {
        if (!row.skipped && !row.namaDokter && row.jumlah !== null) next[normalize(row.sourceName)] = SKIP_DOCTOR;
      }
      return next;
    });
  };

  const periodLabel = report?.mode === "bulanan"
    ? `${String(report.month).padStart(2, "0")}/${report.year}`
    : report?.startDate === report?.endDate
      ? formatDateLabel(report?.startDate)
      : `${formatDateLabel(report?.startDate)} s/d ${formatDateLabel(report?.endDate)}`;

  const activeMode = MODE_OPTIONS.find((m) => m.value === mode) || MODE_OPTIONS[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Impor Data Kunjungan Dokter</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Impor data kunjungan bulanan, harian, atau rentang waktu. Data harian/rentang akan disimpan sebagai kunjungan harian
              sehingga sistem dapat mencocokkan asisten SDM dari jadwal/simbol dokter dan menghitung poin checkpoint asisten.
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">1. Pilih jenis impor</h2>
          <p className="mt-1 text-xs text-slate-500">Pilih format impor sesuai file yang Anda miliki.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const active = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => { setMode(option.value); setReport(null); setResult(null); setError(""); setFileName(""); setDoctorMatches({}); }}
                className={`rounded-2xl border p-4 text-left transition ${active ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
              >
                <div className="flex items-center gap-2">
                  <CalendarRange size={16} className={active ? "text-teal-700" : "text-slate-500"} />
                  <span className={`text-sm font-black ${active ? "text-teal-900" : "text-slate-800"}`}>{option.label}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{option.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          {mode === "bulanan" ? (
            <p><span className="font-bold text-slate-800">Format Bulanan:</span> file rekap satu bulan penuh dengan kolom <b>DOKTER</b> dan <b>TOTAL/JUMLAH</b>. Data disimpan ke rekap bulanan.</p>
          ) : (
            <div className="space-y-2">
              <p><span className="font-bold text-slate-800">Format {activeMode.label} (rincian harian):</span> file Excel dengan kolom <b>TANGGAL</b>, <b>DOKTER</b>, <b>KLINIK</b> (disarankan), dan <b>JUMLAH/TOTAL</b>.</p>
              <p><span className="font-bold text-slate-800">Format laporan rekap SIMRS:</span> file &quot;Rekapitulasi Kunjungan Pasien Rawat Jalan Berdasarkan Dokter&quot; dengan periode <b>S/D</b>, kolom <b>DOKTER</b> dan <b>TOTAL</b> juga didukung. Untuk rentang agregat, total akan didistribusikan merata per hari karena file tidak memuat rincian harian.</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-base font-extrabold text-slate-900">2. Pilih file Excel</h2>
          <p className="mt-1 text-xs text-slate-500">Format .xlsx, maksimal 10 MB dan 3.000 baris.</p>
        </div>
        <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center transition hover:border-teal-500 hover:bg-teal-50/50">
          {loadingFile ? <Loader2 className="mb-3 animate-spin text-teal-600" size={28} /> : <Upload className="mb-3 text-teal-700" size={28} />}
          <span className="text-sm font-bold text-slate-800">{loadingFile ? "Membaca file..." : fileName || "Pilih file atau klik untuk mengunggah"}</span>
          <span className="mt-1 text-xs text-slate-500">Mode: {activeMode.label}</span>
          <input type="file" accept=".xlsx" onChange={loadFile} disabled={loadingFile} className="sr-only" />
        </label>

        {report && (
          <div className="space-y-5 border-t border-slate-100 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">3. Periksa dan cocokkan data</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Periode {periodLabel} Â· {report.rows?.length || 0} baris terbaca
                </p>
                {isDailyMode && !isAggregateReport && (
                  <p className="mt-1 text-xs font-semibold text-teal-700">
                    Poin checkpoint asisten akan dihitung otomatis dari jadwal/simbol dokter pada tanggal terkait.
                  </p>
                )}
                {isAggregateReport && report.startDate === report.endDate && (
                  <p className="mt-1 text-xs font-semibold text-teal-700">
                    File rekap harian terdeteksi. Total kunjungan akan disimpan pada tanggal {formatDateLabel(report.startDate)} dan poin checkpoint asisten dihitung otomatis dari jadwal/simbol dokter.
                  </p>
                )}
                {isAggregateReport && report.startDate !== report.endDate && (
                  <p className="mt-1 text-xs font-semibold text-amber-800">
                    File ini berisi total agregat per dokter untuk rentang waktu, bukan rincian per hari. Saat impor, total akan didistribusikan merata ke setiap hari dalam rentang agar poin checkpoint asisten dapat dihitung. Untuk akurasi terbaik, gunakan file dengan kolom TANGGAL per hari.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Total kunjungan</p>
                <p className="mt-1 text-xl font-black text-blue-950">{mappedRows.totalVisits.toLocaleString("id-ID")}</p>
              </div>
            </div>

            {loadingDoctors ? (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Memuat Master Dokter...</p>
            ) : doctors.length === 0 ? (
              <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Master Dokter belum tersedia untuk ruangan ini.</p>
            ) : (
              <>
                <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${mappedRows.errors.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                  {mappedRows.errors.length ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
                  <div>
                    <p className="font-bold">{mappedRows.importableRecords.length} baris siap Â· {mappedRows.skippedCount} dilewati Â· {mappedRows.errors.length} perlu diperiksa.</p>
                    {mappedRows.errors.length > 0 && <p className="mt-1 text-xs">Perbaiki baris bermasalah, pilih padanan dokter, atau lewati baris yang tidak perlu.</p>}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-3">Baris</th>
                        {isDailyMode && <th className="px-3 py-3">{isAggregateReport ? "Periode" : "Tanggal"}</th>}
                        <th className="px-3 py-3">Nama di file</th>
                        {isDailyMode && <th className="px-3 py-3">Klinik</th>}
                        <th className="px-3 py-3">Padanan Master Dokter</th>
                        <th className="px-3 py-3">Jumlah</th>
                        <th className="px-3 py-3">Pemeriksaan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.records.map((row) => {
                        const exactName = doctorNames.find((name) => normalize(name) === normalize(row.sourceName));
                        const selectedName = doctorMatches[normalize(row.sourceName)] || exactName || "";
                        return (
                          <tr key={`${row.rowNumber}-${row.tanggal || "m"}`} className="border-t border-slate-100">
                            <td className="px-3 py-2.5 text-slate-500">{row.rowNumber}</td>
                            {isDailyMode && <td className="px-3 py-2.5 text-slate-700">{isAggregateReport ? (report.startDate === report.endDate ? formatDateLabel(report.startDate) : `${formatDateLabel(report.startDate)} - ${formatDateLabel(report.endDate)}`) : formatDateLabel(row.tanggal)}</td>}
                            <td className="px-3 py-2.5 font-semibold text-slate-800">{row.sourceName}</td>
                            {isDailyMode && <td className="px-3 py-2.5 text-slate-700">{row.resolvedClinic || row.clinicName || "—"}</td>}
                            <td className="px-3 py-2.5">
                              <select
                                aria-label={`Padanan Master Dokter untuk ${row.sourceName}`}
                                value={row.skipped ? SKIP_DOCTOR : selectedName}
                                onChange={(event) => setDoctorMatches((current) => ({ ...current, [normalize(row.sourceName)]: event.target.value }))}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800"
                              >
                                <option value="">Pilih dokter...</option>
                                {doctorNames.map((name) => <option key={name} value={name}>{name}</option>)}
                                <option value={SKIP_DOCTOR}>Lewati dokter ini</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.jumlah === null ? "â€”" : row.jumlah.toLocaleString("id-ID")}</td>
                            <td className={`px-3 py-2.5 font-semibold ${row.skipped ? "text-slate-500" : row.message ? "text-amber-700" : "text-emerald-700"}`}>
                              {row.skipped ? "Akan dilewati" : row.message || "Siap"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-600">
                    {isDailyMode
                      ? "Impor harian/rentang akan memperbarui data kunjungan harian pada tanggal yang diimpor. Rekap bulanan dokter terkait juga akan disinkronkan agar total kartu dokter tetap konsisten."
                      : "Mengimpor ulang periode yang sama akan mengganti rekap bulanan periode tersebut."}
                  </p>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    {mappedRows.unmatchedCount > 0 && (
                      <button type="button" onClick={skipUnmatchedDoctors} className="rounded-lg px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">
                        Lewati {mappedRows.unmatchedCount} dokter yang belum cocok
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={importData}
                      disabled={submitting || loadingDoctors || !mappedRows.importableRecords.length || mappedRows.errors.length > 0}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting && <Loader2 size={16} className="animate-spin" />}
                      {submitting ? "Mengimpor..." : `Impor ${mappedRows.importableRecords.length} Baris Â· ${periodLabel}`}
                    </button>
                    {mappedRows.errors.length > 0 && <p className="text-right text-xs font-semibold text-amber-800">Tombol impor aktif setelah semua baris siap atau dilewati.</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}
        {result && (
          <div role="status" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">
                  {result.mode === "bulanan"
                    ? `Rekap ${String(result.bulan).padStart(2, "0")}/${result.tahun} berhasil diimpor.`
                    : `Data kunjungan ${result.startDate === result.endDate ? formatDateLabel(result.startDate) : `${formatDateLabel(result.startDate)} s/d ${formatDateLabel(result.endDate)}`} berhasil diimpor.`}
                </p>
                <p className="mt-1 text-xs">
                  {result.imported} baris diproses Â· {Number(result.totalVisits).toLocaleString("id-ID")} kunjungan Â· {result.skipped || 0} dilewati
                  {result.mode !== "bulanan" ? ` Â· ${result.inserted || 0} baru Â· ${result.updated || 0} diperbarui` : ""}.
                </p>
                {result.distributedEvenly && (
                  <p className="mt-1 text-xs font-semibold text-amber-800">
                    Total agregat rentang didistribusikan merata per hari dalam periode karena file sumber tidak memiliki rincian harian.
                  </p>
                )}
                {result.mode !== "bulanan" && (
                  <p className="mt-1 text-xs">
                    Poin checkpoint asisten akan mengikuti jadwal/simbol dokter pada tanggal terkait. Cocok: {result.assistantSummary?.matched || 0}, tanpa asisten terjadwal: {result.assistantSummary?.unmatched || 0}.
                  </p>
                )}
              </div>
            </div>
            {result.assistantSummary?.details?.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-white/70">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-emerald-100/60 text-[10px] uppercase tracking-wide text-emerald-900">
                    <tr>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Dokter</th>
                      <th className="px-3 py-2">Klinik</th>
                      <th className="px-3 py-2">Jumlah</th>
                      <th className="px-3 py-2">Asisten Terjadwal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assistantSummary.details.map((d, idx) => (
                      <tr key={`${d.tanggal}-${d.nama_dokter}-${idx}`} className="border-t border-emerald-100">
                        <td className="px-3 py-2">{formatDateLabel(d.tanggal)}</td>
                        <td className="px-3 py-2 font-semibold">{d.nama_dokter}</td>
                        <td className="px-3 py-2">{d.klinik}</td>
                        <td className="px-3 py-2">{Number(d.jumlah).toLocaleString("id-ID")}</td>
                        <td className="px-3 py-2">{d.asisten_count > 0 ? d.asisten.join(", ") : <span className="font-semibold text-amber-700">Tidak ada asisten terjadwal</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
