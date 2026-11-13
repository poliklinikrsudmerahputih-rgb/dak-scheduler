"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const headerKey = (value) => normalize(value).replace(/[^A-Z0-9]/g, "");
const SKIP_DOCTOR = "__SKIP_DOCTOR__";

function parseCount(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(text)
    ? text.replace(/[.,]/g, "")
    : /^(\d+)[.,]0+$/.exec(text)?.[1];
  const digits = grouped || text;
  if (!/^\d+$/.test(digits)) return null;
  const count = Number(digits);
  return Number.isSafeInteger(count) ? count : null;
}

function getDate(value) {
  const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = { day: Number(day), month: Number(month), year: Number(year) };
  if (parsed.year < 2000 || parsed.year > 2100 || parsed.month < 1 || parsed.month > 12) return null;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return date.getUTCDate() === parsed.day && date.getUTCMonth() + 1 === parsed.month
    ? parsed
    : null;
}

function detectReport(rows) {
  const periodPattern = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\s*(?:S\/?D|SAMPAI|TO)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i;
  let period = null;
  for (const row of rows) {
    for (const value of row) {
      const match = String(value ?? "").match(periodPattern);
      if (match) period = { awal: getDate(match[1]), akhir: getDate(match[2]) };
    }
  }

  const doctorHeaderRow = rows.findIndex((row) => row.some((value) =>
    ["DOKTER", "NAMADOKTER"].includes(headerKey(value))
  ));
  if (doctorHeaderRow < 0) return { error: "Kolom DOKTER tidak ditemukan pada laporan." };
  const doctorColumn = rows[doctorHeaderRow].findIndex((value) =>
    ["DOKTER", "NAMADOKTER"].includes(headerKey(value))
  );
  const sequenceColumn = rows[doctorHeaderRow].findIndex((value) =>
    ["NO", "NOMOR"].includes(headerKey(value))
  );
  let totalColumn = -1;
  for (let rowIndex = doctorHeaderRow; rowIndex < Math.min(rows.length, doctorHeaderRow + 4); rowIndex += 1) {
    const column = rows[rowIndex].findIndex((value) =>
      ["TOTAL", "JUMLAHKUNJUNGAN", "TOTALKUNJUNGAN"].includes(headerKey(value))
    );
    if (column >= 0) totalColumn = column;
  }
  if (totalColumn < 0) return { error: "Kolom TOTAL tidak ditemukan pada judul tabel." };
  if (!period?.awal || !period?.akhir) {
    return { error: "Periode laporan tidak ditemukan. Pastikan rentang tanggal laporan ada di file." };
  }
  const { awal, akhir } = period;
  const lastDay = new Date(Date.UTC(awal.year, awal.month, 0)).getUTCDate();
  if (awal.day !== 1 || akhir.day !== lastDay || awal.month !== akhir.month || awal.year !== akhir.year) {
    return { error: "File harus berisi rekap satu bulan penuh (tanggal 1 sampai hari terakhir pada bulan yang sama)." };
  }

  const rowsData = [];
  for (let index = doctorHeaderRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const sequence = Number(row[sequenceColumn >= 0 ? sequenceColumn : 0]);
    const sourceName = String(row[doctorColumn] ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !sourceName) continue;
    rowsData.push({
      rowNumber: index + 1,
      sourceName,
      jumlah: parseCount(row[totalColumn])
    });
  }

  if (!rowsData.length) return { error: "Tidak ada baris dokter yang dapat dibaca pada laporan." };
  return {
    year: awal.year,
    month: awal.month,
    rows: rowsData,
    columns: { doctor: doctorColumn + 1, total: totalColumn + 1 }
  };
}

export default function ImportVisitsPage() {
  const router = useRouter();
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
      .then((data) => {
        if (active) setDoctors(data);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError.message || "Daftar Master Dokter gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoadingDoctors(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const doctorNames = useMemo(() => {
    const unique = new Map();
    for (const doctor of doctors) {
      const name = String(doctor.nama_dokter || "").replace(/\s+/g, " ").trim();
      if (name && !unique.has(normalize(name))) unique.set(normalize(name), name);
    }
    return [...unique.values()].sort((first, second) => first.localeCompare(second, "id"));
  }, [doctors]);

  const mappedRows = useMemo(() => {
    if (!report?.rows) return { records: [], errors: [], totalVisits: 0 };
    const seen = new Set();
    const records = report.rows.map((row) => {
      const exactName = doctorNames.find((name) => normalize(name) === normalize(row.sourceName));
      const selectedName = doctorMatches[normalize(row.sourceName)];
      const skipped = selectedName === SKIP_DOCTOR;
      const namaDokter = skipped ? "" : selectedName || exactName || "";
      let message = "";
      if (skipped) message = "Dokter ini akan dilewati.";
      else if (row.jumlah === null) message = "Kolom total tidak berisi angka bulat yang valid.";
      else if (!namaDokter) message = "Pilih nama dokter yang sesuai dari Master Dokter.";

      const key = normalize(namaDokter);
      if (!skipped && !message && seen.has(key)) message = "Ada lebih dari satu baris untuk dokter yang sama.";
      if (!skipped && !message) seen.add(key);
      return { ...row, namaDokter, skipped, message };
    });
    const errors = records.filter((row) => row.message && !row.skipped);
    const skippedCount = records.filter((row) => row.skipped).length;
    const importableRecords = records.filter((row) => !row.skipped && !row.message);
    const unmatchedCount = records.filter((row) => !row.skipped && !row.namaDokter && row.jumlah !== null).length;
    const totalVisits = importableRecords.reduce((sum, row) => sum + (Number(row.jumlah) || 0), 0);
    return { records, errors, skippedCount, unmatchedCount, importableRecords, totalVisits };
  }, [doctorMatches, doctorNames, report]);

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
      const response = await fetch("/api/impor-kunjungan", { method: "POST", body: formData });
      const payload = await response.json();
      if (response.status === 401) {
        router.push("/login");
        throw new Error("Sesi berakhir. Silakan login kembali.");
      }
      if (!response.ok) throw new Error(payload.error || "File Excel gagal dibaca.");
      const detected = detectReport(payload.rows || []);
      if (detected.error) throw new Error(detected.error);
      setReport(detected);
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
      const response = await fetch("/api/impor-kunjungan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tahun: report.year,
          bulan: report.month,
          records: mappedRows.importableRecords.map(({ namaDokter, jumlah, rowNumber }) => ({
            nama_dokter: namaDokter,
            jumlah,
            rowNumber
          }))
        })
      });
      const payload = await response.json();
      if (response.status === 401) {
        router.push("/login");
        throw new Error("Sesi berakhir. Silakan login kembali.");
      }
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
        if (!row.skipped && !row.namaDokter && row.jumlah !== null) {
          next[normalize(row.sourceName)] = SKIP_DOCTOR;
        }
      }
      return next;
    });
  };

  const periodLabel = report
    ? `${String(report.month).padStart(2, "0")}/${report.year}`
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Impor Rekap Kunjungan Bulanan</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Impor laporan rekam medis berdasarkan dokter. Sistem membaca periode, kolom dokter, dan kolom total dari file,
              lalu mencocokkan nama dengan Master Dokter sebelum data disimpan.
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-amber-800">
              File ini hanya berisi total per dokter per bulan, bukan rincian kunjungan harian atau klinik.
              Data ini tidak akan dibagi atau dianggap sebagai kunjungan harian untuk poin asisten.
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">1. Pilih file Excel rekapitulasi</h2>
          <p className="mt-1 text-xs text-slate-500">Format .xlsx, maksimal 10 MB dan 3.000 baris. Periode harus satu bulan penuh.</p>
        </div>
        <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center transition hover:border-teal-500 hover:bg-teal-50/50">
          {loadingFile ? <Loader2 className="mb-3 animate-spin text-teal-600" size={28} /> : <Upload className="mb-3 text-teal-700" size={28} />}
          <span className="text-sm font-bold text-slate-800">{loadingFile ? "Membaca file..." : fileName || "Pilih file atau klik untuk mengunggah"}</span>
          <span className="mt-1 text-xs text-slate-500">Format rekapitulasi rawat jalan berdasarkan dokter.</span>
          <input type="file" accept=".xlsx" onChange={loadFile} disabled={loadingFile} className="sr-only" />
        </label>

        {report && (
          <div className="space-y-5 border-t border-slate-100 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">2. Periksa dan cocokkan dokter</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Periode {periodLabel} · Kolom dokter {report.columns.doctor} · Kolom total {report.columns.total}
                </p>
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
                    <p className="font-bold">
                      {mappedRows.importableRecords.length} dokter siap · {mappedRows.skippedCount} dilewati · {mappedRows.errors.length} perlu diperiksa.
                    </p>
                    {mappedRows.errors.length > 0 && (
                      <p className="mt-1 text-xs">
                        Pilih padanan untuk setiap dokter yang cocok, atau lewati dokter yang tidak lagi ada di Master Dokter.
                      </p>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-3">Baris</th>
                        <th className="px-3 py-3">Nama di file</th>
                        <th className="px-3 py-3">Padanan Master Dokter</th>
                        <th className="px-3 py-3">Total kunjungan</th>
                        <th className="px-3 py-3">Pemeriksaan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.records.map((row) => {
                        const exactName = doctorNames.find((name) => normalize(name) === normalize(row.sourceName));
                        const selectedName = doctorMatches[normalize(row.sourceName)] || exactName || "";
                        return (
                          <tr key={row.rowNumber} className="border-t border-slate-100">
                            <td className="px-3 py-2.5 text-slate-500">{row.rowNumber}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-800">{row.sourceName}</td>
                            <td className="px-3 py-2.5">
                              <select
                                aria-label={`Padanan Master Dokter untuk ${row.sourceName}`}
                                value={row.skipped ? SKIP_DOCTOR : selectedName}
                                onChange={(event) => setDoctorMatches((current) => ({
                                  ...current,
                                  [normalize(row.sourceName)]: event.target.value
                                }))}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800"
                              >
                                <option value="">Pilih dokter...</option>
                                {doctorNames.map((name) => <option key={name} value={name}>{name}</option>)}
                                <option value={SKIP_DOCTOR}>Lewati dokter ini</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{row.jumlah === null ? "—" : row.jumlah.toLocaleString("id-ID")}</td>
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
                    Mengimpor ulang periode yang sama akan mengganti rekap bulanan periode tersebut.
                  </p>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    {mappedRows.unmatchedCount > 0 && (
                      <button
                        type="button"
                        onClick={skipUnmatchedDoctors}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
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
                      {submitting ? "Mengimpor..." : `Impor ${mappedRows.importableRecords.length} Dokter · ${periodLabel}`}
                    </button>
                    {mappedRows.errors.length > 0 && (
                      <p className="text-right text-xs font-semibold text-amber-800">
                        Tombol impor aktif setelah semua baris dipadankan atau dilewati.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}
        {result && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">Rekap {String(result.bulan).padStart(2, "0")}/{result.tahun} berhasil diimpor.</p>
              <p className="mt-1 text-xs">{result.imported} dokter diimpor · {Number(result.totalVisits).toLocaleString("id-ID")} kunjungan · {result.skipped} dokter dilewati.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
