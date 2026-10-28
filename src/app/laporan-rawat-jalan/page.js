"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import AIExecutiveAdvisor from "@/components/AIExecutiveAdvisor";
import AccreditationIndicatorReport from "@/components/AccreditationIndicatorReport";
import { generateWordINM } from "@/lib/exportWordINM";
import { Activity, AlertCircle, CalendarDays, Clock3, ShieldCheck } from "lucide-react";
import {
  Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip
} from "recharts";

const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const numberFormat = new Intl.NumberFormat("id-ID");
const chartColors = {
  good: "#22c55e",
  late: "#ef4444",
  warning: "#f97316",
  yellow: "#eab308",
  blue: "#3b82f6"
};

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const current = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    month: Number(current.month),
    year: Number(current.year),
    day: Number(current.day)
  };
}

function getPeriodFromSearch(searchParams) {
  const allowedTypes = ["harian", "bulanan", "triwulan", "tahunan"];
  const requestedType = searchParams.get("tipe");
  const type = allowedTypes.includes(requestedType) ? requestedType : "bulanan";
  const current = getCurrentPeriod();
  const requestedYear = Number(searchParams.get("tahun"));
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 9999
    ? requestedYear
    : current.year;

  if (type === "harian") {
    const requestedDate = searchParams.get("tanggal") || "";
    const date = isValidDateKey(requestedDate)
      ? requestedDate
      : `${current.year}-${String(current.month).padStart(2, "0")}-${String(current.day).padStart(2, "0")}`;
    return { type, date, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
  }

  if (type === "tahunan") return { type, year };
  if (type === "triwulan") {
    const requestedQuarter = Number(searchParams.get("triwulan"));
    return {
      type,
      year,
      quarter: Number.isInteger(requestedQuarter) && requestedQuarter >= 1 && requestedQuarter <= 4
        ? requestedQuarter
        : Math.ceil(current.month / 3)
    };
  }
  const requestedMonth = Number(searchParams.get("bulan"));
  return {
    type,
    year,
    month: Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
      ? requestedMonth
      : current.month
  };
}

async function fetchExecutiveReport(url) {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Laporan manajemen gagal dimuat.");
  return result;
}

function MetricCard({ icon: Icon, title, value, detail, color }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <span className={`grid h-12 w-12 place-items-center rounded-xl ${color}`}><Icon size={23} /></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-slate-950 sm:text-4xl">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function ExecutiveCharts({ data }) {
  const rekap = data.rekap || [];
  const complianceData = [
    { name: "Tepat Waktu", value: Number(data.summary.onTime) || 0, color: chartColors.good },
    { name: "Terlambat", value: Number(data.summary.late) || 0, color: chartColors.late }
  ];
  const waitData = [
    { name: "< 60 menit · praktik tidak terlambat", value: rekap.reduce((total, row) => total + (Number(row.waktuKurang60Grafik ?? row.waktuKurang60) || 0), 0), color: chartColors.good },
    { name: "= 60 menit · praktik tidak terlambat", value: rekap.reduce((total, row) => total + (Number(row.waktuTepat60Grafik ?? row.waktuTepat60) || 0), 0), color: chartColors.yellow },
    { name: "Praktik terlambat atau > 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuLebih60Grafik ?? row.waktuLebih60) || 0), 0), color: chartColors.late }
  ];
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 print:break-inside-avoid">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Rasio Kepatuhan Waktu Praktik (IMUT 1)</h2>
        <p className="mt-1 text-xs text-slate-500">Perbandingan sesi praktik tepat waktu dan terlambat.</p>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={complianceData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
              {complianceData.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value) => [numberFormat.format(Number(value)), "Sesi"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Capaian Waktu Tunggu Pasien (IMUT 3)</h2>
        <p className="mt-1 text-xs text-slate-500">Jika dokter terlambat pada tanggal dan poliklinik yang sama, sampel pasiennya masuk merah meskipun waktu tunggu tercatat &lt;60 menit.</p>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={waitData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
              {waitData.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value) => [numberFormat.format(Number(value)), "Sampel"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </article>
    </section>
  );
}

function DoctorComplianceSection({ data }) {
  const summary = data.summary || {};
  const worstDelay = summary.keterlambatanTerparah;
  const doctors = data.doctorCompliance || [];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:break-inside-avoid print:shadow-none">
      <div>
        <h2 className="text-base font-black text-slate-950">📊 Kepatuhan Praktik &amp; Kehadiran Dokter</h2>
        <p className="mt-1 text-xs text-slate-500">Rangkuman kedatangan dan kedisiplinan praktik dokter dalam periode laporan.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard
          icon={Clock3}
          title="Rata-rata Jam Kehadiran Dokter"
          value={summary.rataRataKedatangan || "—"}
          detail="Rata-rata seluruh sesi dengan jam kedatangan tercatat."
          color="bg-blue-50 text-blue-700"
        />
        <MetricCard
          icon={AlertCircle}
          title="Rekor Keterlambatan Terlama"
          value={worstDelay ? `${numberFormat.format(worstDelay.menit)} menit` : "—"}
          detail={worstDelay ? `${worstDelay.namaDokter} · ${worstDelay.klinik}` : "Tidak ada keterlambatan tercatat."}
          color={worstDelay ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}
        />
        <MetricCard
          icon={ShieldCheck}
          title="Total Persentase Tepat Waktu"
          value={summary.punctuality === null ? "—" : `${summary.punctuality}%`}
          detail={`${numberFormat.format(summary.onTime || 0)} tepat waktu · ${numberFormat.format(summary.late || 0)} terlambat`}
          color="bg-emerald-50 text-emerald-700"
        />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">Nama Dokter</th>
                <th className="border-b border-slate-200 px-4 py-3">Poliklinik</th>
                <th className="border-b border-slate-200 px-4 py-3">Total Sesi Praktik</th>
                <th className="border-b border-slate-200 px-4 py-3">Rata-rata Kedatangan</th>
                <th className="border-b border-slate-200 px-4 py-3">Keterlambatan Terlama (Menit)</th>
                <th className="border-b border-slate-200 px-4 py-3">Status Disiplin</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((doctor, index) => {
                const late = doctor.statusDisiplin === "Terlambat";
                const onTime = doctor.statusDisiplin === "Tepat Waktu";
                return (
                  <tr key={`${doctor.namaDokter}-${doctor.klinik}-${index}`} className={`border-b border-slate-100 ${late ? "bg-amber-50/70" : "odd:bg-white even:bg-slate-50/60"}`}>
                    <th scope="row" className="px-4 py-3 font-bold text-slate-800">{doctor.namaDokter}</th>
                    <td className="px-4 py-3 text-slate-700">{doctor.klinik}</td>
                    <td className="px-4 py-3 text-slate-700">{numberFormat.format(doctor.totalSesiPraktik)}</td>
                    <td className="px-4 py-3 text-slate-700">{doctor.rataRataKedatangan || "—"}</td>
                    <td className={`px-4 py-3 ${doctor.keterlambatanTerparah > 0 ? "font-bold text-red-700" : "text-slate-700"}`}>{numberFormat.format(doctor.keterlambatanTerparah)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${late ? "bg-red-100 text-red-700" : onTime ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {doctor.statusDisiplin}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {doctors.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada log kehadiran dokter untuk periode ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function buildSharedAdvisorPayload(data, periodLabel) {
  const recap = data.rekap || [];
  const waitSamples = recap.reduce((total, row) => total + (Number(row.sampelWaktuTunggu) || 0), 0);
  const totalWaitMinutes = recap.reduce(
    (total, row) => total + (Number(row.rataRataWaktuTunggu) || 0) * (Number(row.sampelWaktuTunggu) || 0),
    0
  );
  const waitSummary = {
    rataRataMenit: waitSamples ? Math.round(totalWaitMinutes / waitSamples) : null,
    sampel: waitSamples,
    kurang60: recap.reduce((total, row) => total + (Number(row.waktuKurang60) || 0), 0),
    tepat60: recap.reduce((total, row) => total + (Number(row.waktuTepat60) || 0), 0),
    lebih60: recap.reduce((total, row) => total + (Number(row.waktuLebih60) || 0), 0)
  };
  const punctuality = {
    tepatWaktu: recap.reduce((total, row) => total + (Number(row.tepatWaktu) || 0), 0),
    terlambat: recap.reduce((total, row) => total + (Number(row.terlambat) || 0), 0)
  };
  const identification = {
    ya: recap.reduce((total, row) => total + (Number(row.identifikasiYa) || 0), 0),
    tidak: recap.reduce((total, row) => total + (Number(row.identifikasiTidak) || 0), 0)
  };
  const identificationSamples = identification.ya + identification.tidak;
  const punctualitySamples = punctuality.tepatWaktu + punctuality.terlambat;
  const waitChartSummary = {
    kurang60: recap.reduce((total, row) => total + (Number(row.waktuKurang60Grafik ?? row.waktuKurang60) || 0), 0),
    tepat60: recap.reduce((total, row) => total + (Number(row.waktuTepat60Grafik ?? row.waktuTepat60) || 0), 0),
    lebih60: recap.reduce((total, row) => total + (Number(row.waktuLebih60Grafik ?? row.waktuLebih60) || 0), 0)
  };

  return {
    periode: periodLabel,
    poliklinik: "Semua poliklinik",
    advisorMetrics: {
      imut1: {
        capaianPersen: punctualitySamples ? Math.round(punctuality.tepatWaktu / punctualitySamples * 1000) / 10 : null,
        ...punctuality,
        sampel: punctualitySamples
      },
      imut2: {
        capaianPersen: identificationSamples ? Math.round(identification.ya / identificationSamples * 1000) / 10 : null,
        ...identification,
        sampel: identificationSamples
      },
      imut3: {
        rataRataMenit: waitSummary.rataRataMenit,
        sampel: waitSamples,
        ...waitChartSummary
      }
    },
    indikatorMutu: {
      indikator: data.indikatorMutu || [],
      rekapPerPoliklinik: recap.map(({
        klinik, tepatWaktu, terlambat, identifikasiYa, identifikasiTidak,
        waktuKurang60, waktuTepat60, waktuLebih60, waktuKurang60Grafik,
        waktuTepat60Grafik, waktuLebih60Grafik, sampelWaktuTunggu, rataRataWaktuTunggu
      }) => ({
        klinik, tepatWaktu, terlambat, identifikasiYa, identifikasiTidak,
        waktuKurang60, waktuTepat60, waktuLebih60, waktuKurang60Grafik,
        waktuTepat60Grafik, waktuLebih60Grafik, sampelWaktuTunggu, rataRataWaktuTunggu
      })),
      ringkasan: {
        imut1: {
          ...punctuality,
          sampel: punctualitySamples,
          capaianPersen: punctualitySamples ? Math.round(punctuality.tepatWaktu / punctualitySamples * 1000) / 10 : null
        },
        imut2: {
          ...identification,
          sampel: identificationSamples,
          capaianPersen: identificationSamples ? Math.round(identification.ya / identificationSamples * 1000) / 10 : null
        },
        imut3: { ...waitSummary, ...waitChartSummary }
      }
    }
  };
}

function ExecutiveReportContent() {
  const [wordExportError, setWordExportError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = getPeriodFromSearch(searchParams);
  const periodParams = new URLSearchParams({ tipe: period.type });
  if (period.type === "harian") periodParams.set("tanggal", period.date);
  if (period.type === "bulanan") {
    periodParams.set("bulan", String(period.month));
    periodParams.set("tahun", String(period.year));
  }
  if (period.type === "triwulan") {
    periodParams.set("triwulan", String(period.quarter));
    periodParams.set("tahun", String(period.year));
  }
  if (period.type === "tahunan") periodParams.set("tahun", String(period.year));
  const url = `/api/laporan-eksekutif?${periodParams}`;
  const updatePeriod = (updates) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
      else nextParams.delete(key);
    });
    router.replace(`/laporan-rawat-jalan?${nextParams.toString()}`, { scroll: false });
  };
  const changePeriodType = (type) => {
    const current = getCurrentPeriod();
    const updates = { tipe: type };
    if (type === "harian") {
      updates.tanggal = period.type === "harian"
        ? period.date
        : `${String(period.year || current.year)}-${String(period.month || current.month).padStart(2, "0")}-01`;
    } else if (type === "bulanan") {
      updates.bulan = String(period.month || current.month);
      updates.tahun = String(period.year || current.year);
    } else if (type === "triwulan") {
      updates.triwulan = String(period.quarter || Math.ceil(current.month / 3));
      updates.tahun = String(period.year || current.year);
    } else {
      updates.tahun = String(period.year || current.year);
    }
    updatePeriod(updates);
  };
  const { data, error, isLoading } = useSWR(url, fetchExecutiveReport, {
    revalidateOnFocus: true,
    refreshInterval: 60000,
    dedupingInterval: 30000
  });
  const periodLabel = period.type === "harian"
    ? `Periode Harian: ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.date}T00:00:00.000Z`))}`
    : period.type === "tahunan"
      ? `Periode Tahunan: ${period.year}`
      : period.type === "triwulan"
        ? `Periode Triwulan ${period.quarter}: ${period.year}`
        : `Periode Bulanan: ${monthNames[period.month - 1]} ${period.year}`;
  const exportPeriodLabel = period.type === "harian"
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${period.date}T00:00:00.000Z`))
    : period.type === "tahunan"
      ? String(period.year)
      : period.type === "triwulan"
        ? `Triwulan ${period.quarter} ${period.year}`
        : `${monthNames[period.month - 1]} ${period.year}`;
  const downloadWordINM = async () => {
    setWordExportError("");
    try {
      await generateWordINM(data, exportPeriodLabel);
    } catch (exportError) {
      console.error("Gagal membuat laporan INM Word:", exportError);
      setWordExportError(exportError.message || "Gagal membuat file laporan INM.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-8 sm:py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 px-5 py-8 text-white shadow-sm sm:px-10 sm:py-11 print:rounded-none print:shadow-none">
          <div className="flex items-center gap-3 text-teal-200">
            <ShieldCheck size={21} />
            <p className="text-[10px] font-black uppercase tracking-[0.22em] sm:text-xs">Laporan Manajemen · Read-only</p>
          </div>
          <h1 className="mt-5 max-w-4xl text-2xl font-black leading-tight sm:text-4xl">
            Laporan Kinerja, Kepatuhan &amp; Mutu Instalasi Rawat Jalan - RSUD Merah Putih
          </h1>
          <p className="mt-3 text-sm font-semibold text-teal-100 sm:text-base">{periodLabel}</p>
          <p className="mt-5 max-w-3xl text-xs leading-5 text-slate-300 sm:text-sm">
            Laporan analitik komprehensif mencakup volume kunjungan pasien, tingkat kepatuhan kehadiran medis (IMUT 1), efisiensi pelayanan (IMUT 2 &amp; 3), serta performa operasional Poliklinik secara keseluruhan.
          </p>
        </header>

        <section aria-label="Filter periode laporan" className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 print:hidden">
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Jenis periode
            <select value={period.type} onChange={(event) => changePeriodType(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
              <option value="harian">Harian</option>
              <option value="bulanan">Bulanan</option>
              <option value="triwulan">Triwulan</option>
              <option value="tahunan">Tahunan</option>
            </select>
          </label>
          {period.type === "harian" && (
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Pilih tanggal
              <span className="relative">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <input type="date" value={period.date} onChange={(event) => updatePeriod({ tanggal: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800" />
              </span>
            </label>
          )}
          {period.type === "bulanan" && (
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Pilih bulan &amp; tahun
              <input type="month" value={`${period.year}-${String(period.month).padStart(2, "0")}`} onChange={(event) => {
                const [year, month] = event.target.value.split("-");
                if (year && month) updatePeriod({ tahun: year, bulan: String(Number(month)) });
              }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
            </label>
          )}
          {period.type === "triwulan" && <>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Pilih triwulan
              <select value={period.quarter} onChange={(event) => updatePeriod({ triwulan: event.target.value })} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value={1}>Triwulan 1 (Jan–Mar)</option>
                <option value={2}>Triwulan 2 (Apr–Jun)</option>
                <option value={3}>Triwulan 3 (Jul–Sep)</option>
                <option value={4}>Triwulan 4 (Okt–Des)</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600">Pilih tahun
              <input key={period.year} type="number" min="2000" max="9999" defaultValue={period.year} onBlur={(event) => {
                const year = Number(event.currentTarget.value);
                if (Number.isInteger(year) && year >= 2000 && year <= 9999) updatePeriod({ tahun: String(year) });
                else event.currentTarget.value = String(period.year);
              }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
            </label>
          </>}
          {period.type === "tahunan" && (
            <label className="grid gap-1 text-xs font-bold text-slate-600">Pilih tahun
              <input key={period.year} type="number" min="2000" max="9999" defaultValue={period.year} onBlur={(event) => {
                const year = Number(event.currentTarget.value);
                if (Number.isInteger(year) && year >= 2000 && year <= 9999) updatePeriod({ tahun: String(year) });
                else event.currentTarget.value = String(period.year);
              }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
            </label>
          )}
        </section>

        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            <AlertCircle size={20} />{error.message}
          </div>
        )}
        {isLoading && !data && (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
            <span className="inline-flex items-center gap-2"><Activity className="animate-pulse" size={18} />Memuat laporan manajemen...</span>
          </div>
        )}

        {data && <>
          <section aria-label="Indikator kinerja utama" className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2">
            <MetricCard
              icon={Clock3}
              title="Kepatuhan Waktu Praktik"
              value={data.summary.punctuality === null ? "—" : `${data.summary.punctuality}%`}
              detail={`${numberFormat.format(data.summary.onTime)} tepat waktu dari ${numberFormat.format(data.summary.onTime + data.summary.late)} catatan praktik; toleransi 15 menit.`}
              color="bg-blue-50 text-blue-700"
            />
            <MetricCard
              icon={ShieldCheck}
              title="Total Poli Tepat Waktu IMUT"
              value={numberFormat.format(data.summary.poliTanpaTerlambat)}
              detail="Poli dengan catatan IMUT 1 dan tanpa keterlambatan pada periode ini."
              color="bg-emerald-50 text-emerald-700"
            />
          </section>

          <AIExecutiveAdvisor
            key={`${period.type}-${exportPeriodLabel}`}
            publicShare
            activeTab="Laporan Mutu (IMUT)"
            periodType={period.type}
            shareMonth={period.month}
            shareYear={period.year}
            shareQuarter={period.quarter}
            selectedDate={period.date}
            range={data.range}
            clinic="all"
            operationalSummary={data.summary}
            reportPayload={buildSharedAdvisorPayload(data, exportPeriodLabel)}
          />

          <ExecutiveCharts data={data} />

          <DoctorComplianceSection data={data} />

          {wordExportError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{wordExportError}</div>}
          <AccreditationIndicatorReport indicators={data.indikatorMutu || []} onDownload={downloadWordINM} />

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:break-inside-avoid print:shadow-none">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
              <h2 className="text-base font-black text-slate-950">Rincian Indikator Mutu per Poliklinik (IMUT)</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Rekap per poliklinik. IMUT 3 mengelompokkan waktu tunggu menjadi &lt;60, tepat 60, dan &gt;60 menit.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="border-b border-slate-200 px-4 py-3">Poliklinik</th>
                    <th scope="col" className="border-b border-slate-200 px-4 py-3">IMUT 1 · Tepat / Terlambat</th>
                    <th scope="col" className="border-b border-slate-200 px-4 py-3">IMUT 2 · Identifikasi Ya / Tidak</th>
                    <th scope="col" className="border-b border-slate-200 px-4 py-3">IMUT 3 · &lt;60 / 60 / &gt;60 Menit</th>
                    <th scope="col" className="border-b border-slate-200 px-4 py-3">Rata-rata Tunggu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rekap.map((row) => {
                    const needsAttention = row.terlambat > 0 || row.waktuLebih60 > 0;
                    return (
                      <tr key={row.klinik} className={needsAttention ? "bg-red-50/80" : "odd:bg-white even:bg-slate-50/60"}>
                        <th scope="row" className="border-b border-slate-100 px-4 py-3 font-bold text-slate-800">{row.klinik}</th>
                        <td className={`border-b border-slate-100 px-4 py-3 ${row.terlambat > 0 ? "font-bold text-red-700" : "text-slate-700"}`}>
                          {numberFormat.format(row.tepatWaktu)} / {numberFormat.format(row.terlambat)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(row.identifikasiYa)} / {numberFormat.format(row.identifikasiTidak)}</td>
                        <td className={`border-b border-slate-100 px-4 py-3 ${row.waktuLebih60 > 0 ? "font-bold text-red-700" : "text-slate-700"}`}>
                          {numberFormat.format(row.waktuKurang60)} / {numberFormat.format(row.waktuTepat60)} / {numberFormat.format(row.waktuLebih60)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                          {row.rataRataWaktuTunggu === null ? "—" : `${numberFormat.format(row.rataRataWaktuTunggu)} menit`}
                        </td>
                      </tr>
                    );
                  })}
                  {data.rekap.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Belum ada data mutu untuk periode ini.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500 sm:px-6">
              Baris berwarna merah menunjukkan keterlambatan IMUT 1 dan/atau sampel waktu tunggu lebih dari 60 menit.
            </p>
          </section>
        </>}

        <footer className="border-t border-slate-200 pt-4 text-center text-[10px] leading-5 text-slate-500">
          DAK-SYSTEMS · Laporan ringkasan read-only · Dicetak sesuai periode {periodLabel}
        </footer>
      </div>
    </main>
  );
}

export default function LaporanEksekutifPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-sm font-semibold text-slate-500">Memuat laporan manajemen...</main>}>
      <ExecutiveReportContent />
    </Suspense>
  );
}
