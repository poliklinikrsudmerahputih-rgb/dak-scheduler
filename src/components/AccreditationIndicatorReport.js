"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const numberFormat = new Intl.NumberFormat("id-ID");

export default function AccreditationIndicatorReport({ indicators = [], onDownload }) {
  const chartData = indicators.map((indicator) => ({
    ...indicator,
    capaianChart: indicator.capaian === null ? null : Number(indicator.capaian)
  }));

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-sm font-extrabold text-slate-900">Standar Akreditasi · Numerator / Denominator</h2>
        <p className="mt-1 text-xs text-slate-500">Capaian dihitung dari numerator dibagi denominator. Tanpa sampel, capaian ditampilkan sebagai —.</p>
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 36 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" interval={0} angle={-18} textAnchor="end" height={54} tick={{ fill: "#475569", fontSize: 10 }} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#64748b", fontSize: 10 }} />
            <Tooltip formatter={(value, name) => [`${value === null ? "—" : Number(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`, name]} />
            <Legend />
            <Line type="monotone" dataKey="capaianChart" name="Capaian Aktual (%)" stroke="#2563eb" strokeWidth={3} connectNulls={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="target" name="Target (%)" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold text-slate-900">Tabel Capaian INM</h3>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 print:hidden"
            >
              📥 Download Laporan INM (Word)
            </button>
          )}
        </div>
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="border-b border-slate-200 px-4 py-3">Indikator Mutu</th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3">Numerator</th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3">Denominator</th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3">Capaian (%)</th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3">Target (%)</th>
              <th scope="col" className="border-b border-slate-200 px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((indicator) => {
              const hasSamples = Number(indicator.denominator) > 0 && indicator.capaian !== null;
              const reached = hasSamples && Number(indicator.capaian) >= Number(indicator.target);
              return (
                <tr key={indicator.key} className="odd:bg-white even:bg-slate-50/70">
                  <th scope="row" className="border-b border-slate-100 px-4 py-3 font-bold text-slate-800">{indicator.nama}</th>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(indicator.numerator)}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(indicator.denominator)}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{hasSamples ? `${Number(indicator.capaian).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(indicator.target)}%</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${!hasSamples ? "bg-slate-100 text-slate-600" : reached ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                      {!hasSamples ? "Belum ada sampling" : reached ? "🟢 Tercapai" : "🔴 Tidak Tercapai"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {indicators.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada data indikator mutu.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
