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

export default function AIExecutiveAdvisor({
  range,
  clinic = "all",
  operationalSummary,
  activeTab,
  periodType,
  shareMonth,
  shareYear,
  shareQuarter,
  selectedDate,
  reportPayload,
  publicShare = false,
}) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [generationError, setGenerationError] = useState("");

  const metricsUrl = useMemo(() => {
    if (!range?.start || !range?.end) return null;
    const params = new URLSearchParams({
      start: range.start,
      end: range.end,
      periode: periodType,
      poli: clinic,
    });
    if (periodType === "harian") {
      params.set("tanggal", selectedDate);
    } else if (periodType === "bulanan") {
      params.set("bulan", String(shareMonth));
      params.set("tahun", String(shareYear));
    } else if (periodType === "triwulan") {
      params.set("triwulan", String(shareQuarter));
      params.set("tahun", String(shareYear));
    } else if (periodType === "tahunan") {
      params.set("tahun", String(shareYear));
    }
    if (clinic && clinic.toLowerCase() !== "all") params.set("clinic", clinic);
    return `/api/ai-advisor?${params.toString()}`;
  }, [range?.start, range?.end, clinic, periodType, shareMonth, shareYear, shareQuarter, selectedDate]);
  const { data, error, isLoading } = useSWR(publicShare ? null : metricsUrl, fetcher, { revalidateOnFocus: false });
  const publicMetrics = reportPayload?.advisorMetrics;
  const metrics = data?.metrics || publicMetrics;
  const imutMetrics = publicMetrics;
  const metricsLoading = publicShare ? false : isLoading;
  const hasMetrics = publicShare ? Boolean(publicMetrics) : Boolean(data);
  const metricValue = (key, sampleKey) => {
    if (metrics?.sampleCounts?.[sampleKey] > 0) {
      return {
        value: metrics[key],
        note: `${metrics.sampleCounts[sampleKey]} sampel pada periode terpilih`,
      };
    }
    return { value: "—", note: "Tidak ada sampel pada periode terpilih" };
  };

  useEffect(() => {
    if (error?.status === 401) router.push("/login");
  }, [error, router]);

  const generateAnalysis = async () => {
    if (!metricsUrl && !publicShare) return;
    setIsGenerating(true);
    setGenerationError("");
    setAiResult("");
    try {
      const reportMetrics = {
        ...(publicShare ? reportPayload || {} : {
          ...(reportPayload || {}),
          kinerjaPelayanan: {
            ...(reportPayload?.kinerjaPelayanan || {}),
            waktuTunggu: {
              rataRataMenit: metrics?.averageWaitMinutes
                ?? reportPayload?.kinerjaPelayanan?.waktuTunggu?.rataRataMenit
                ?? null,
              sampel: metrics?.sampleCounts?.imut
                ?? reportPayload?.kinerjaPelayanan?.waktuTunggu?.sampel
                ?? null,
            },
          },
          timeMotionStudy: {
            skorNasaTlx: metrics?.averageTlxScore ?? null,
            sampelNasaTlx: metrics?.sampleCounts?.nasaTlx ?? null,
            asesmenPerawatMenit: metrics?.averageAssessmentMinutes ?? null,
            sampelAsesmen: metrics?.sampleCounts?.assessment ?? null,
            pemeriksaanDokterMenit: metrics?.averageExaminationMinutes ?? null,
            edukasiPerawatMenit: metrics?.averageEducationMinutes ?? null,
            sampelEdukasi: metrics?.sampleCounts?.education ?? null,
            tindakanPerawatMenit: metrics?.averageActionMinutes ?? null,
            sampelTindakan: metrics?.sampleCounts?.action ?? null,
            jumlahKejadianObservasi: metrics?.sampleCounts?.observations ?? null,
            totalShiftTerjadwal: metrics?.scheduledShifts ?? null,
          },
        }),
      };
      const response = await fetch(metricsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeTab,
          publicShare,
          fullReportPayload: reportMetrics,
          reportPayload: reportMetrics,
        }),
      });
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
          {publicShare
            ? "Analisis khusus indikator mutu IMUT 1, IMUT 2, dan IMUT 3 berdasarkan rekap Turso pada periode terpilih."
            : "Analisis lintas data IMUT, kunjungan pasien, jadwal, absensi, cuti, NASA-TLX, dan Time-Motion pada periode laporan terpilih. Data yang dikirim ke AI hanya agregat tanpa identitas pasien atau pegawai."}
        </p>
      </header>

      <div className="space-y-5 bg-gradient-to-br from-violet-50/70 via-white to-blue-50/70 p-5 sm:p-6">
        {error && error.status !== 401 && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={17} />{error.message}
          </p>
        )}

        {metricsLoading ? (
          <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[68px] rounded-xl bg-slate-200/70" />)}
          </div>
        ) : hasMetrics ? (
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {publicShare ? (
              <>
                <Metric
                  label="IMUT 1 · Kepatuhan praktik"
                  value={imutMetrics?.imut1?.capaianPersen === null ? "—" : imutMetrics?.imut1?.capaianPersen}
                  suffix={imutMetrics?.imut1?.capaianPersen === null ? "" : "%"}
                  note={imutMetrics?.imut1?.sampel
                    ? `${imutMetrics.imut1.tepatWaktu} tepat waktu · ${imutMetrics.imut1.terlambat} terlambat`
                    : "Tidak ada sampel kepatuhan praktik"}
                />
                <Metric
                  label="IMUT 2 · Identifikasi pasien"
                  value={imutMetrics?.imut2?.capaianPersen === null ? "—" : imutMetrics?.imut2?.capaianPersen}
                  suffix={imutMetrics?.imut2?.capaianPersen === null ? "" : "%"}
                  note={imutMetrics?.imut2?.sampel
                    ? `${imutMetrics.imut2.ya} ya · ${imutMetrics.imut2.tidak} tidak`
                    : "Tidak ada sampel identifikasi"}
                />
                <Metric
                  label="IMUT 3 · Waktu tunggu"
                  value={imutMetrics?.imut3?.rataRataMenit ?? "—"}
                  suffix={imutMetrics?.imut3?.rataRataMenit === null ? "" : "menit"}
                  note={imutMetrics?.imut3?.sampel
                    ? `${imutMetrics.imut3.lebih60} merah · ${imutMetrics.imut3.kurang60} <60 menit tanpa keterlambatan`
                    : "Tidak ada sampel waktu tunggu"}
                />
              </>
            ) : (
              <>
                <Metric label="Rata-rata waktu tunggu" {...metricValue("averageWaitMinutes", "imut")} suffix="menit" />
                <Metric label="Total kunjungan" value={metrics.totalPatients ?? "—"} suffix="pasien" />
                <Metric label="Skor NASA-TLX" {...metricValue("averageTlxScore", "nasaTlx")} suffix="/ 100" />
                <Metric label="Asesmen perawat" {...metricValue("averageAssessmentMinutes", "assessment")} suffix="menit" />
                <Metric label="Edukasi perawat" {...metricValue("averageEducationMinutes", "education")} suffix="menit" />
                <Metric label="Tindakan perawat" {...metricValue("averageActionMinutes", "action")} suffix="menit" />
                <Metric label="Shift terjadwal" value={metrics.scheduledShifts ?? "—"} />
              </>
            )}
            {!publicShare && (
              <Metric
                label="Kehadiran praktik tepat waktu"
                value={operationalSummary ? operationalSummary.onTime : "—"}
                suffix={operationalSummary ? "sesi" : ""}
                note={operationalSummary
                  ? `${operationalSummary.onTime} tepat waktu dari ${operationalSummary.onTime + operationalSummary.late} catatan praktik`
                  : "Tidak ada catatan praktik pada periode ini"}
              />
            )}
          </div>
          </div>
        ) : (
          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Pilih rentang tanggal yang valid untuk memuat metrik AI.</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            AI membedakan fakta dan hipotesis, serta menandai metrik tanpa sampel sebagai data tidak tersedia.
          </p>
          <button type="button" onClick={generateAnalysis} disabled={isGenerating || metricsLoading || !hasMetrics} suppressHydrationWarning={true}
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
