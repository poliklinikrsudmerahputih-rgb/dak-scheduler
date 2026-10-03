"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import AIInsightEfektivitasSDM from "@/components/AIInsightEfektivitasSDM";
import CapacityLeaveRecommendation from "@/components/CapacityLeaveRecommendation";
import { Activity, AlertCircle, Clock3, ShieldCheck, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
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
  const allowedTypes = ["harian", "bulanan", "tahunan"];
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
  if (!response.ok) throw new Error(result.error || "Laporan eksekutif gagal dimuat.");
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
  const clinicVisits = data.clinicVisits || [];
  const waitData = [
    { name: "< 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuKurang60) || 0), 0), color: chartColors.good },
    { name: "= 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuTepat60) || 0), 0), color: chartColors.yellow },
    { name: "> 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuLebih60) || 0), 0), color: chartColors.late }
  ];
  const abbreviateClinic = (name) => String(name || "").length > 13
    ? `${String(name).slice(0, 12)}…`
    : name;

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2 print:break-inside-avoid">
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
        <h2 className="text-sm font-black text-slate-900">Top Kunjungan per Poliklinik</h2>
        <p className="mt-1 text-xs text-slate-500">Sepuluh poliklinik dengan kunjungan tertinggi pada periode ini.</p>
        {clinicVisits.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={clinicVisits} margin={{ top: 12, right: 12, left: -12, bottom: 38 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="klinik" tickFormatter={abbreviateClinic} angle={-28} textAnchor="end" interval={0} height={55} tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [numberFormat.format(Number(value)), "Pasien"]} />
              <Legend />
              <Bar dataKey="pasien" name="Jumlah pasien" fill={chartColors.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-[300px] place-items-center text-sm text-slate-500">Belum ada data kunjungan per poliklinik.</div>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Capaian Waktu Tunggu Pasien (IMUT 3)</h2>
        <p className="mt-1 text-xs text-slate-500">Distribusi sampel pasien menurut ambang waktu tunggu 60 menit.</p>
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
              {doctors.map((doctor) => {
                const late = doctor.statusDisiplin === "Terlambat";
                return (
                  <tr key={`${doctor.namaDokter}-${doctor.klinik}`} className={`border-b border-slate-100 ${late ? "bg-amber-50/70" : "odd:bg-white even:bg-slate-50/60"}`}>
                    <th scope="row" className="px-4 py-3 font-bold text-slate-800">{doctor.namaDokter}</th>
                    <td className="px-4 py-3 text-slate-700">{doctor.klinik}</td>
                    <td className="px-4 py-3 text-slate-700">{numberFormat.format(doctor.totalSesiPraktik)}</td>
                    <td className="px-4 py-3 text-slate-700">{doctor.rataRataKedatangan || "—"}</td>
                    <td className={`px-4 py-3 ${doctor.keterlambatanTerparah > 0 ? "font-bold text-red-700" : "text-slate-700"}`}>{numberFormat.format(doctor.keterlambatanTerparah)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${late ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
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

function ExecutiveReportContent() {
  const searchParams = useSearchParams();
  const period = getPeriodFromSearch(searchParams);
  const periodParams = new URLSearchParams({ tipe: period.type });
  if (period.type === "harian") periodParams.set("tanggal", period.date);
  if (period.type === "bulanan") {
    periodParams.set("bulan", String(period.month));
    periodParams.set("tahun", String(period.year));
  }
  if (period.type === "tahunan") periodParams.set("tahun", String(period.year));
  const url = `/api/laporan-eksekutif?${periodParams}`;
  const { data, error, isLoading } = useSWR(url, fetchExecutiveReport, {
    revalidateOnFocus: true,
    refreshInterval: 60000,
    dedupingInterval: 30000
  });
  const periodLabel = period.type === "harian"
    ? `Periode Harian: ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.date}T00:00:00.000Z`))}`
    : period.type === "tahunan"
      ? `Periode Tahunan: ${period.year}`
      : `Periode Bulanan: ${monthNames[period.month - 1]} ${period.year}`;

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

        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            <AlertCircle size={20} />{error.message}
          </div>
        )}
        {isLoading && !data && (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
            <span className="inline-flex items-center gap-2"><Activity className="animate-pulse" size={18} />Memuat laporan eksekutif...</span>
          </div>
        )}

        {data && <>
          <section aria-label="Indikator kinerja utama" className="grid grid-cols-1 gap-4 md:grid-cols-3 print:grid-cols-3">
            <MetricCard
              icon={Users}
              title="Total Kunjungan Pasien"
              value={numberFormat.format(data.summary.totalPatients)}
              detail={`Jumlah kunjungan tercatat pada ${periodLabel.toLowerCase()}.`}
              color="bg-teal-50 text-teal-700"
            />
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

          <ExecutiveCharts data={data} />

          <DoctorComplianceSection data={data} />
          <AIInsightEfektivitasSDM professionMetrics={data.professionMetrics} />
          <CapacityLeaveRecommendation
            assignments={data.scheduleAssignments}
            professionMetrics={data.professionMetrics}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:break-inside-avoid print:shadow-none">
            <div className="mb-5">
              <h2 className="text-base font-black text-slate-950">Tren Kunjungan Pasien</h2>
              <p className="mt-1 text-xs text-slate-500">Jumlah kunjungan yang tercatat selama {periodLabel}.</p>
            </div>
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.trend} margin={{ top: 8, right: 14, left: -12, bottom: 3 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={15} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`${numberFormat.format(Number(value))} pasien`, "Kunjungan"]} />
                  <Line type="monotone" dataKey="pasien" name="Kunjungan" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:break-inside-avoid print:shadow-none">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
              <h2 className="text-base font-black text-slate-950">Rekapitulasi Indikator Mutu (IMUT)</h2>
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
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-sm font-semibold text-slate-500">Memuat laporan eksekutif...</main>}>
      <ExecutiveReportContent />
    </Suspense>
  );
}
