"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AlertCircle, BrainCircuit, Loader2, Sparkles } from "lucide-react";

const fetcher = async (url) => {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Metrik advisor gagal dimuat.");
    error.status = response.status;
    throw error;
  }
  return result;
};

function Metric({ label, value, suffix = "", note = "" }) {
  const displayValue = typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("id-ID", { maximumFractionDigits: 2 })
    : value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-900">
        {displayValue}
        <span className="ml-1 text-[10px] font-bold text-slate-500">{suffix}</span>
      </p>
      {note && <p className="mt-1 text-[10px] leading-4 text-slate-500">{note}</p>}
    </div>
  );
}

function HistoricalTimeMotion({ history }) {
  const metrics = [
    { key: "averageAssessmentMinutes", countKey: "assessment", label: "Asesmen perawat" },
    { key: "averageEducationMinutes", countKey: "education", label: "Edukasi perawat" },
    { key: "averageActionMinutes", countKey: "action", label: "Tindakan perawat" },
  ];
  const totalSamples = metrics.reduce(
    (total, metric) => total + Number(history?.sampleCounts?.[metric.countKey] || 0),
    0,
  );

  return (
    <section className="rounded-xl border border-blue-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Riwayat Penelitian Time-Motion</h3>
          <p className="mt-1 text-xs text-slate-500">
            Data arsip yang tetap dapat digunakan AI bila periode laporan tidak memiliki sampel.
          </p>
        </div>
        <p className="text-[10px] font-bold text-slate-500">
          {history?.firstDate && history?.lastDate
            ? `${history.firstDate} – ${history.lastDate}`
            : "Belum ada rentang historis"}
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Aktivitas</th>
              <th className="px-3 py-2">Rata-rata durasi</th>
              <th className="px-3 py-2">Jumlah sampel</th>
              <th className="px-3 py-2">Status AI</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const samples = Number(history?.sampleCounts?.[metric.countKey] || 0);
              const average = Number(history?.[metric.key]);
              return (
                <tr key={metric.key} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="px-3 py-3 font-bold text-slate-800">{metric.label}</th>
                  <td className="px-3 py-3 font-black text-slate-900">
                    {samples && Number.isFinite(average) ? `${average.toLocaleString("id-ID", { maximumFractionDigits: 2 })} menit` : "—"}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{samples.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-3 text-slate-600">{samples ? "Tersedia untuk analisis" : "Belum ada data"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalSamples === 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Data historis Time-Motion tidak ditemukan. AI tidak akan menganggap nilai kosong sebagai durasi 0 menit.
        </p>
      )}
    </section>
  );
}

export default function AIExecutiveAdvisor({ range, clinic = "all", operationalSummary }) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [generationError, setGenerationError] = useState("");

  const metricsUrl = useMemo(() => {
    if (!range?.start || !range?.end) return null;
    const params = new URLSearchParams({ start: range.start, end: range.end });
    if (clinic && clinic.toLowerCase() !== "all") params.set("clinic", clinic);
    return `/api/ai-advisor?${params.toString()}`;
  }, [range?.start, range?.end, clinic]);
  const { data, error, isLoading } = useSWR(metricsUrl, fetcher, { revalidateOnFocus: false });
  const historyRange = data?.metrics?.history?.firstDate && data?.metrics?.history?.lastDate
    ? `${data.metrics.history.firstDate}–${data.metrics.history.lastDate}`
    : "rentang historis";
  const metricValue = (key, sampleKey) => {
    if (data?.metrics?.sampleCounts?.[sampleKey] > 0) {
      return {
        value: data.metrics[key],
        note: `${data.metrics.sampleCounts[sampleKey]} sampel pada periode terpilih`,
      };
    }
    if (data?.metrics?.history?.sampleCounts?.[sampleKey] > 0) {
      return {
        value: data.metrics.history[key],
        note: `Periode terpilih kosong; historis ${data.metrics.history.sampleCounts[sampleKey]} sampel (${historyRange})`,
      };
    }
    return { value: "—", note: "Data tidak tersedia pada periode atau riwayat" };
  };

  useEffect(() => {
    if (error?.status === 401) router.push("/login");
  }, [error, router]);

  const generateAnalysis = async () => {
    if (!metricsUrl) return;
    setIsGenerating(true);
    setGenerationError("");
    setAiResult("");
    try {
      const response = await fetch(metricsUrl, { method: "POST" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Analisis AI gagal dibuat.");
      }
      setAiResult(result.analysis);
    } catch (requestError) {
      setGenerationError(requestError.message || "Analisis AI gagal dibuat.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-lg">
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-violet-950 p-5 text-white sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-white/10 p-2.5 text-cyan-200"><BrainCircuit size={21} /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">AI Executive Advisor</p>
            <h2 className="mt-1 text-lg font-black">Analisis &amp; Intelegensi Operasional</h2>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300">
          Analisis lintas data IMUT, kunjungan pasien, jadwal, absensi, cuti, NASA-TLX, dan Time-Motion pada periode laporan terpilih. Data yang dikirim ke AI hanya agregat tanpa identitas pasien atau pegawai.
        </p>
      </header>

      <div className="space-y-5 bg-gradient-to-br from-violet-50/70 via-white to-blue-50/70 p-5 sm:p-6">
        {error && error.status !== 401 && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={17} />{error.message}
          </p>
        )}

        {isLoading ? (
          <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[68px] rounded-xl bg-slate-200/70" />)}
          </div>
        ) : data ? (
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Rata-rata waktu tunggu" {...metricValue("averageWaitMinutes", "imut")} suffix="menit" />
            <Metric label="Total kunjungan" value={data.metrics.totalPatients} suffix="pasien" />
            <Metric label="Skor NASA-TLX" {...metricValue("averageTlxScore", "nasaTlx")} suffix="/ 100" />
            <Metric label="Asesmen perawat" {...metricValue("averageAssessmentMinutes", "assessment")} suffix="menit" />
            <Metric label="Edukasi perawat" {...metricValue("averageEducationMinutes", "education")} suffix="menit" />
            <Metric label="Tindakan perawat" {...metricValue("averageActionMinutes", "action")} suffix="menit" />
            <Metric label="Shift terjadwal" value={data.metrics.scheduledShifts} />
            <Metric
              label="Kehadiran praktik tepat waktu"
              value={operationalSummary ? operationalSummary.onTime : "—"}
              suffix={operationalSummary ? "sesi" : ""}
              note={operationalSummary
                ? `${operationalSummary.onTime} tepat waktu dari ${operationalSummary.onTime + operationalSummary.late} catatan praktik`
                : "Tidak ada catatan praktik pada periode ini"}
            />
          </div>
          <HistoricalTimeMotion history={data.metrics.history} />
          </div>
        ) : (
          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Pilih rentang tanggal yang valid untuk memuat metrik AI.</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            AI membedakan fakta dan hipotesis, serta menandai metrik tanpa sampel sebagai data tidak tersedia.
          </p>
          <button type="button" onClick={generateAnalysis} disabled={isGenerating || isLoading || !data} suppressHydrationWarning={true}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 hover:from-blue-700 hover:to-violet-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
            {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {isGenerating ? "Menganalisis data..." : "Hasilkan Analisis AI"}
          </button>
        </div>

        {generationError && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={17} />{generationError}
          </p>
        )}

        {aiResult && (
          <article aria-live="polite" className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-violet-950"><Sparkles size={17} /> Analisis Strategis AI</h3>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiResult}</div>
          </article>
        )}
      </div>
    </section>
  );
}
