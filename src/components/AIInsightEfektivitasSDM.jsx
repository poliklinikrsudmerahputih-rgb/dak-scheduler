"use client";

import { BrainCircuit, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const numberFormat = new Intl.NumberFormat("id-ID");

function getLoadColor(score) {
  if (score > 80) return "#ef4444";
  if (score >= 60) return "#eab308";
  return "#22c55e";
}

function getProfessionStatus(metric) {
  if (!metric.totalSdmAktif) return { label: "Tanpa SDM", style: "bg-slate-100 text-slate-600" };
  const ratio = metric.totalDokterDitangani / metric.totalSdmAktif;
  if (ratio > 1.5 || metric.rataRataSkorNasaTlx > 80) {
    return { label: "🔴 Padat", style: "bg-red-100 text-red-800" };
  }
  if (ratio > 1 || metric.rataRataSkorNasaTlx >= 60) {
    return { label: "🟠 Perlu perhatian", style: "bg-amber-100 text-amber-800" };
  }
  return { label: "🟢 Terkendali", style: "bg-emerald-100 text-emerald-800" };
}

export default function AIInsightEfektivitasSDM({ professionMetrics = [] }) {
  const chartData = professionMetrics.filter((item) => item.rataRataSkorNasaTlx !== null);

  return (
    <section className="space-y-4 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 shadow-sm sm:p-5">
      <header className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-700"><BrainCircuit size={18} /></span>
        <div>
          <h2 className="text-sm font-black text-indigo-950">🤖 AI Insight: Kepadatan &amp; Efektivitas SDM per Profesi</h2>
          <p className="mt-1 text-[11px] leading-4 text-indigo-900/70">Skor beban adalah rata-rata enam dimensi NASA‑TLX (0–100); rasio memakai dokter yang terpetakan ke jadwal dibanding SDM aktif.</p>
        </div>
      </header>

      {professionMetrics.length === 0 ? (
        <p className="rounded-lg border border-indigo-100 bg-white/80 p-3 text-xs text-slate-600">Belum ada data SDM aktif untuk dianalisis.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="rounded-lg border border-indigo-100 bg-white/90 p-3">
            <h3 className="text-xs font-extrabold text-slate-800">📊 Analisis Beban Kerja &amp; Rasio per Profesi</h3>
            <p className="mt-1 text-[10px] text-slate-500">Hijau &lt;60 · Kuning 60–80 · Merah &gt;80</p>
            {chartData.length ? (
              <div className="mt-2 h-[260px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 40 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="jabatan" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" interval={0} height={54} />
                    <YAxis domain={[0, 100]} allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} / 100`, "Rata-rata NASA-TLX"]} />
                    <Bar dataKey="rataRataSkorNasaTlx" name="Skor NASA-TLX" radius={[4, 4, 0, 0]}>
                      {chartData.map((item) => <Cell key={item.jabatan} fill={getLoadColor(Number(item.rataRataSkorNasaTlx) || 0)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="grid h-[260px] place-items-center px-4 text-center text-xs text-slate-500">Belum ada pengisian NASA-TLX pada periode ini.</p>
            )}
          </div>

          <div className="rounded-lg border border-indigo-100 bg-white/90 p-3">
            <h3 className="text-xs font-extrabold text-slate-800">Rasio kepadatan per profesi</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {professionMetrics.map((metric) => {
                const status = getProfessionStatus(metric);
                const ratio = metric.totalDokterDitangani
                  ? (metric.totalSdmAktif / metric.totalDokterDitangani).toFixed(1)
                  : "—";
                return (
                  <li key={metric.jabatan} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900"><Users size={13} className="mr-1 inline text-indigo-600" />{metric.jabatan}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                        Melayani {numberFormat.format(metric.totalDokterDitangani)} dokter · Rasio 1:{ratio} staf/dokter · NASA‑TLX {metric.rataRataSkorNasaTlx === null ? "belum ada" : `${Number(metric.rataRataSkorNasaTlx).toFixed(1)}/100`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${status.style}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
