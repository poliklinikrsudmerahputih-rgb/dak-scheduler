"use client";

import useSWR from "swr";
import { useState } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Activity, AlertCircle, Clock3, RefreshCw, Users } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const fetchDashboard = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}.`);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Permintaan data melewati batas waktu 20 detik.");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const chartColors = ["#059669", "#e11d48"];

export default function DashboardAnalitik() {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const tanggal = Math.min(now.getDate(), new Date(tahun, bulan, 0).getDate());
  const apiUrl = `/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}`;
  const { data, error, isLoading, mutate } = useSWR(apiUrl, fetchDashboard, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });

  const totalIzinSakit = (data?.sdmIzinList || []).filter((item) => {
    const kind = String(item.jenis_cuti || "").toUpperCase();
    return kind.includes("SAKIT") || kind === "CS" || item.status_acc === "Disetujui";
  }).length;
  const punctualityData = [
    { name: "Tepat waktu", value: Number(data?.mutuPraktik?.tepatWaktu) || 0 },
    { name: "Terlambat", value: Number(data?.mutuPraktik?.terlambat) || 0 }
  ];
  const topAssistants = [...(data?.leaderboard || [])]
    .sort((first, second) => (Number(second.total_pasien_bulanan) || 0) - (Number(first.total_pasien_bulanan) || 0))
    .slice(0, 5);
  const monthLabel = format(new Date(tahun, bulan - 1, 1), "MMMM yyyy", { locale: id });

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">DAK-SYSTEMS / Analitik</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Dashboard Manajerial</h1>
          <p className="mt-1 text-sm text-slate-500">Ringkasan kunjungan, mutu waktu praktik, dan beban kerja SDM.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="dashboard-month">Bulan laporan</label>
          <input
            id="dashboard-month"
            type="month"
            value={`${tahun}-${String(bulan).padStart(2, "0")}`}
            onChange={(event) => {
              const [nextYear, nextMonth] = event.target.value.split("-").map(Number);
              if (nextYear && nextMonth) {
                setTahun(nextYear);
                setBulan(nextMonth);
              }
            }}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={() => mutate()}
            title="Muat ulang data"
            aria-label="Muat ulang data"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-emerald-600 hover:text-emerald-700"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center text-red-800">
          <AlertCircle size={28} className="text-red-600" />
          <p className="max-w-lg text-sm font-semibold">Gagal memuat analitik. Periksa koneksi internet, lalu coba muat ulang.</p>
          <button type="button" onClick={() => mutate()} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-700">Muat Ulang</button>
        </div>
      ) : (
        <>
          <section aria-label="Indikator kinerja utama" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article className="min-h-36 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total pasien bulan ini</p>
                  <p className="mt-4 text-3xl font-black tabular-nums text-slate-900">{isLoading ? "--" : (Number(data?.totalPasienBulanIni) || 0).toLocaleString("id-ID")}</p>
                  <p className="mt-1 text-xs text-slate-500">{monthLabel}</p>
                </div>
                <span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700"><Users size={20} /></span>
              </div>
            </article>

            <article className="min-h-36 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kepatuhan waktu praktik</p>
                  <p className="mt-4 text-3xl font-black tabular-nums text-slate-900">{isLoading ? "--" : `${Number(data?.mutuPraktik?.kepatuhanPersen) || 0}%`}</p>
                  <p className="mt-1 text-xs text-slate-500">Berdasarkan praktik yang sudah dicatat</p>
                </div>
                <span className="rounded-lg bg-teal-50 p-2.5 text-teal-700"><Clock3 size={20} /></span>
              </div>
            </article>

            <article className="min-h-36 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">SDM izin / sakit</p>
                  <p className="mt-4 text-3xl font-black tabular-nums text-slate-900">{isLoading ? "--" : totalIzinSakit.toLocaleString("id-ID")}</p>
                  <p className="mt-1 text-xs text-slate-500">Catatan dalam periode yang dipilih</p>
                </div>
                <span className="rounded-lg bg-rose-50 p-2.5 text-rose-700"><Activity size={20} /></span>
              </div>
            </article>
          </section>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {[0, 1].map((item) => <div key={item} className="h-[360px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />)}
            </div>
          ) : (
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Tren kunjungan pasien</h2>
                    <p className="mt-1 text-xs text-slate-500">Jumlah pasien per tanggal pada {monthLabel}</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700">{(Number(data?.totalPasienBulanIni) || 0).toLocaleString("id-ID")} pasien</span>
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.trenPasienHarian || []} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="tanggal" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                      <Tooltip formatter={(value) => [`${Number(value).toLocaleString("id-ID")} pasien`, "Kunjungan"]} labelFormatter={(label) => `Tanggal ${label}`} />
                      <Line type="monotone" dataKey="pasien" stroke="#059669" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#047857" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2">
                  <h2 className="text-sm font-bold text-slate-900">Mutu waktu praktik</h2>
                  <p className="mt-1 text-xs text-slate-500">Rekap waktu aktual yang tercatat pada {monthLabel}</p>
                </div>
                <div className="grid min-h-[280px] grid-cols-1 items-center sm:grid-cols-[1fr_180px]">
                  <div className="h-[260px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={punctualityData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={3}>
                          {punctualityData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} dokter`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-4 pb-4">
                    {punctualityData.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: chartColors[index] }} />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{item.name}</p>
                          <p className="text-lg font-black tabular-nums text-slate-900">{item.value}</p>
                        </div>
                      </div>
                    ))}
                    {punctualityData.every((item) => item.value === 0) && <p className="text-xs text-slate-500">Belum ada waktu praktik tercatat.</p>}
                  </div>
                </div>
              </article>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Leaderboard asisten</h2>
                <p className="mt-1 text-xs text-slate-500">Lima beban kerja tertinggi pada {monthLabel}</p>
              </div>
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700"><Activity size={18} /></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-5 py-3 font-bold">Peringkat</th><th className="px-5 py-3 font-bold">Nama Asisten</th><th className="px-5 py-3 text-right font-bold">Poin beban kerja</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? [1, 2, 3, 4, 5].map((rank) => (
                    <tr key={rank}><td className="px-5 py-4"><div className="h-4 w-8 animate-pulse rounded bg-slate-200" /></td><td className="px-5 py-4"><div className="h-4 w-40 animate-pulse rounded bg-slate-200" /></td><td className="px-5 py-4"><div className="ml-auto h-4 w-14 animate-pulse rounded bg-slate-200" /></td></tr>
                  )) : topAssistants.length > 0 ? topAssistants.map((assistant, index) => (
                    <tr key={assistant.id ?? assistant.nama} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-xs font-bold text-slate-500">#{index + 1}</td>
                      <td className="px-5 py-4"><p className="text-sm font-semibold text-slate-800">{assistant.nama}</p><p className="mt-0.5 text-xs text-slate-500">{assistant.detail_poli || "-"}</p></td>
                      <td className="px-5 py-4 text-right text-sm font-black tabular-nums text-emerald-700">{Number(assistant.total_pasien_bulanan || assistant.total_pasien || 0).toLocaleString("id-ID")}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="px-5 py-10 text-center text-sm text-slate-500">Belum ada data leaderboard pada periode ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
