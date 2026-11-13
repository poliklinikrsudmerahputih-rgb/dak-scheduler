"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, CalendarDays, FileSpreadsheet, Loader2, Stethoscope, Users } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

const numberFormat = new Intl.NumberFormat("id-ID");
const palette = ["#0f766e", "#2563eb", "#7c3aed", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#4f46e5"];

function getMonthLabel(year, month) {
  return format(new Date(Number(year), Number(month) - 1, 1), "MMMM yyyy", { locale: id });
}

export default function LaporanKunjunganPage() {
  const router = useRouter();
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [records, setRecords] = useState([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [reportPeriod, setReportPeriod] = useState("");
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/impor-kunjungan")
      .then(async (response) => {
        const payload = await response.json();
        if (response.status === 401) {
          router.push("/login");
          throw new Error("Sesi berakhir. Silakan login kembali.");
        }
        if (!response.ok) throw new Error(payload.error || "Daftar periode gagal dimuat.");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const availablePeriods = Array.isArray(payload.periods) ? payload.periods : [];
        setPeriods(availablePeriods);
        if (availablePeriods.length) {
          setSelectedPeriod(`${availablePeriods[0].tahun}-${String(availablePeriods[0].bulan).padStart(2, "0")}`);
        }
      })
      .catch((fetchError) => {
        if (active) setError(fetchError.message || "Daftar periode gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoadingPeriods(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedPeriod) return undefined;

    let active = true;
    const [year, month] = selectedPeriod.split("-");
    const params = new URLSearchParams({ tahun: year, bulan: String(Number(month)) });
    fetch(`/api/impor-kunjungan?${params}`)
      .then(async (response) => {
        const payload = await response.json();
        if (response.status === 401) {
          router.push("/login");
          throw new Error("Sesi berakhir. Silakan login kembali.");
        }
        if (!response.ok) throw new Error(payload.error || "Laporan kunjungan gagal dimuat.");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setRecords(Array.isArray(payload.records) ? payload.records : []);
        setTotalVisits(Number(payload.totalVisits) || 0);
        setPeriods(Array.isArray(payload.periods) ? payload.periods : []);
        setReportPeriod(selectedPeriod);
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message || "Laporan kunjungan gagal dimuat.");
          setRecords([]);
          setTotalVisits(0);
          setReportPeriod(selectedPeriod);
        }
      });
    return () => {
      active = false;
    };
  }, [router, selectedPeriod]);

  const selectedLabel = useMemo(() => {
    if (!selectedPeriod) return "";
    const [year, month] = selectedPeriod.split("-");
    return getMonthLabel(year, month);
  }, [selectedPeriod]);

  const topDoctors = records.slice(0, 10).map((record) => ({
    ...record,
    shortName: String(record.nama_dokter || "").length > 27
      ? `${String(record.nama_dokter).slice(0, 24)}…`
      : record.nama_dokter
  }));
  const topFive = records.slice(0, 5);
  const averageVisits = records.length ? Math.round(totalVisits / records.length) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-xl sm:p-9">
        <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-teal-200 ring-1 ring-white/15">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-200">Rekap Rekam Medis</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Laporan Kunjungan Pasien</h1>
              <p className="mt-2 text-sm text-slate-300">
                Ringkasan kunjungan rawat jalan berdasarkan dokter dari file yang sudah diimpor.
              </p>
            </div>
          </div>
          <label className="w-full sm:w-64">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-300">Filter periode</span>
            <select
              value={selectedPeriod}
              onChange={(event) => {
                setError("");
                setSelectedPeriod(event.target.value);
              }}
              disabled={loadingPeriods || periods.length === 0}
              className="w-full rounded-xl border border-white/15 bg-slate-800/80 px-4 py-3 text-sm font-bold text-white outline-none focus:border-teal-300"
            >
              {periods.length === 0 && <option value="">Belum ada periode impor</option>}
              {periods.map((period) => {
                const value = `${period.tahun}-${String(period.bulan).padStart(2, "0")}`;
                return <option key={value} value={value}>{getMonthLabel(period.tahun, period.bulan)}</option>;
              })}
            </select>
          </label>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {loadingPeriods ? (
        <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-sm font-semibold text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin text-teal-700" size={26} />
          Memuat periode laporan...
        </div>
      ) : periods.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <CalendarDays className="mx-auto mb-4 text-slate-400" size={34} />
          <h2 className="text-lg font-black text-slate-800">Belum ada data kunjungan bulanan</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Impor laporan Excel terlebih dahulu. Setelah impor, rekap dan grafik akan tersedia di halaman ini.
          </p>
          <a href="/impor-kunjungan" className="mt-5 inline-flex rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800">
            Buka Impor Kunjungan
          </a>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Total kunjungan", value: numberFormat.format(totalVisits), note: selectedLabel, icon: <Users size={20} />, accent: "text-teal-700 bg-teal-50" },
              { label: "Dokter dalam laporan", value: numberFormat.format(records.length), note: "Dokter yang dipadankan saat impor", icon: <Stethoscope size={20} />, accent: "text-blue-700 bg-blue-50" },
              { label: "Rata-rata per dokter", value: numberFormat.format(averageVisits), note: "Total kunjungan ÷ jumlah dokter", icon: <CalendarDays size={20} />, accent: "text-violet-700 bg-violet-50" }
            ].map((item) => (
              <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${item.accent}`}>{item.icon}</span>
                </div>
                <p className="mt-4 text-3xl font-black tracking-tight text-slate-900">{reportPeriod !== selectedPeriod ? "…" : item.value}</p>
                <p className="mt-1 text-xs text-slate-500">{item.note}</p>
              </article>
            ))}
          </section>

          {reportPeriod !== selectedPeriod ? (
            <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-sm font-semibold text-slate-500">
              <Loader2 className="mx-auto mb-3 animate-spin text-teal-700" size={26} />
              Memuat laporan {selectedLabel}...
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
              Data periode {selectedLabel} belum tersedia.
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">Peringkat dokter</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">10 Kunjungan Terbanyak</h2>
                    <p className="mt-1 text-xs text-slate-500">Jumlah kunjungan yang tercatat pada periode {selectedLabel}.</p>
                  </div>
                  <div className="h-[390px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topDoctors} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value) => numberFormat.format(value)} />
                        <YAxis type="category" dataKey="shortName" width={150} tick={{ fill: "#334155", fontSize: 10 }} />
                        <Tooltip
                          cursor={{ fill: "#f1f5f9" }}
                          formatter={(value) => [`${numberFormat.format(Number(value))} pasien`, "Kunjungan"]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.nama_dokter || ""}
                        />
                        <Bar dataKey="jumlah" name="Kunjungan" radius={[0, 7, 7, 0]} maxBarSize={24}>
                          {topDoctors.map((record, index) => <Cell key={record.nama_dokter} fill={palette[index % palette.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Kontribusi</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Lima Teratas</h2>
                    <p className="mt-1 text-xs text-slate-500">Bagian dari total kunjungan periode ini.</p>
                  </div>
                  <div className="relative h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={topFive} dataKey="jumlah" nameKey="nama_dokter" innerRadius={66} outerRadius={100} paddingAngle={3}>
                          {topFive.map((record, index) => <Cell key={record.nama_dokter} fill={palette[index % palette.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => [`${numberFormat.format(Number(value))} pasien`, "Kunjungan"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Total</span>
                      <span className="text-xl font-black text-slate-900">{numberFormat.format(totalVisits)}</span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {topFive.map((record, index) => (
                      <div key={record.nama_dokter} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 text-slate-600">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                          <span className="truncate">{record.nama_dokter}</span>
                        </span>
                        <span className="shrink-0 font-bold text-slate-800">{numberFormat.format(Number(record.jumlah))}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">Rincian lengkap</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Rekap per Dokter</h2>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{records.length} dokter · {selectedLabel}</p>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Peringkat</th>
                        <th className="px-5 py-3">Nama dokter</th>
                        <th className="px-5 py-3 text-right">Kunjungan</th>
                        <th className="px-5 py-3 text-right">Proporsi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record, index) => (
                        <tr key={record.nama_dokter} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50">
                          <td className="px-5 py-3 text-slate-500">#{index + 1}</td>
                          <th scope="row" className="px-5 py-3 text-left font-semibold text-slate-800">{record.nama_dokter}</th>
                          <td className="px-5 py-3 text-right font-bold text-slate-800">{numberFormat.format(Number(record.jumlah))}</td>
                          <td className="px-5 py-3 text-right text-slate-600">
                            {totalVisits ? `${(Number(record.jumlah) / totalVisits * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "0%"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-900 text-white">
                      <tr>
                        <th colSpan={2} className="px-5 py-3 text-left text-xs font-black uppercase">Total</th>
                        <th className="px-5 py-3 text-right">{numberFormat.format(totalVisits)}</th>
                        <th className="px-5 py-3 text-right">100%</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
