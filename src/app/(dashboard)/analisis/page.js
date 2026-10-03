"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import AIInsightEfektivitasSDM from "@/components/AIInsightEfektivitasSDM";
import CapacityLeaveRecommendation from "@/components/CapacityLeaveRecommendation";
import {
  Activity, AlertCircle, BrainCircuit, CalendarDays, CheckCircle2, ClipboardCheck,
  Clock3, Copy, Download, FileText, RefreshCw, Stethoscope, Users, UserRoundCheck, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const numberFormat = new Intl.NumberFormat("id-ID");
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const chartColors = ["#0f766e", "#e11d48"];
const palette = ["#0f766e", "#2563eb", "#65a30d", "#0891b2", "#d97706", "#db2777", "#4f46e5"];
const reportChartColors = { good: "#22c55e", late: "#ef4444", yellow: "#eab308", blue: "#3b82f6" };

function getJakartaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function fetchReport(url) {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Laporan gagal dimuat.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function makeCsv(data, imutData) {
  const rows = [
    ["Bagian", "Nama", "Nilai", "Keterangan"],
    ...data.trend.map((row) => ["Tren pasien", row.tanggal || row.label, row.pasien, "kunjungan"]),
    ...data.doctorWorkload.map((row) => ["Beban dokter", row.name, row.pasien, `${row.sesi} sesi praktik terjadwal`]),
    ...data.staffWorkload.map((row) => ["Beban SDM", row.name, row.shifts, "shift terjadwal"]),
    ...data.leaveTypes.map((row) => ["SDM Absen/Cuti", row.name, row.value, "catatan cuti"]),
    ...data.insights.map((row, index) => ["Wawasan operasional", `Insight ${index + 1}`, "", row]),
    ...(imutData?.rekap || []).map((row) => ["Rekap IMUT", row.klinik, "", `IMUT 1: ${row.tepatWaktu}/${row.terlambat}; IMUT 2: ${row.identifikasiYa}/${row.identifikasiTidak}; IMUT 3: ${row.waktuKurang60}/${row.waktuTepat60}/${row.waktuLebih60}`])
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `laporan-analisis-${data.range.start}-${data.range.end}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Kpi({ icon: Icon, label, value, note, tone = "teal" }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-blue-50 text-blue-700",
    lime: "bg-lime-50 text-lime-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700"
  };
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon size={19} /></span>
      </div>
    </article>
  );
}

function ChartPanel({ title, subtitle, children, className = "" }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-5">
        <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ReportCharts({ data }) {
  const rekap = data?.rekap || [];
  const complianceData = [
    { name: "Tepat Waktu", value: Number(data?.summary?.onTime) || 0, color: reportChartColors.good },
    { name: "Terlambat", value: Number(data?.summary?.late) || 0, color: reportChartColors.late }
  ];
  const waitData = [
    { name: "< 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuKurang60) || 0), 0), color: reportChartColors.good },
    { name: "= 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuTepat60) || 0), 0), color: reportChartColors.yellow },
    { name: "> 60 menit", value: rekap.reduce((total, row) => total + (Number(row.waktuLebih60) || 0), 0), color: reportChartColors.late }
  ];
  const clinicVisits = data?.clinicVisits || [];
  const abbreviateClinic = (name) => String(name || "").length > 13
    ? `${String(name).slice(0, 12)}…`
    : name;

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartPanel title="Rasio Kepatuhan Waktu Praktik (IMUT 1)" subtitle="Perbandingan sesi praktik tepat waktu dan terlambat.">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={complianceData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
              {complianceData.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value) => [numberFormat.format(Number(value)), "Sesi"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Top Kunjungan per Poliklinik" subtitle="Sepuluh poliklinik dengan kunjungan tertinggi pada periode ini.">
        {clinicVisits.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={clinicVisits} margin={{ top: 12, right: 12, left: -12, bottom: 38 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="klinik" tickFormatter={abbreviateClinic} angle={-28} textAnchor="end" interval={0} height={55} tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [numberFormat.format(Number(value)), "Pasien"]} />
              <Legend />
              <Bar dataKey="pasien" name="Jumlah pasien" fill={reportChartColors.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="grid h-[300px] place-items-center text-sm text-slate-500">Belum ada data kunjungan per poliklinik.</p>}
      </ChartPanel>
      <ChartPanel title="Capaian Waktu Tunggu Pasien (IMUT 3)" subtitle="Jumlah sampel di bawah, tepat, dan di atas 60 menit.">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={waitData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
              {waitData.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value) => [numberFormat.format(Number(value)), "Sampel"]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>
    </section>
  );
}

function ComplianceSection({ data, loading = false, error }) {
  const summary = data?.summary || {};
  const worstDelay = summary.keterlambatanTerparah;
  const doctors = data?.doctorCompliance || [];

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-black text-slate-950">📊 Kepatuhan Praktik &amp; Kehadiran Dokter</h2>
        <p className="mt-1 text-xs text-slate-500">Berdasarkan log kehadiran IMUT 1 pada periode terpilih.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error.message}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={Clock3} label="Rata-rata Jam Kehadiran Dokter" value={summary.rataRataKedatangan || "—"} note="Rata-rata seluruh sesi dengan jam kedatangan tercatat" tone="blue" />
        <Kpi icon={AlertCircle} label="Rekor Keterlambatan Terlama" value={worstDelay ? `${numberFormat.format(worstDelay.menit)} menit` : "—"} note={worstDelay ? `${worstDelay.namaDokter} · ${worstDelay.klinik}` : "Tidak ada keterlambatan tercatat"} tone="amber" />
        <Kpi icon={CheckCircle2} label="Total Persentase Tepat Waktu" value={summary.punctuality === null || summary.punctuality === undefined ? "—" : `${summary.punctuality}%`} note={`${numberFormat.format(summary.onTime || 0)} tepat · ${numberFormat.format(summary.late || 0)} terlambat`} tone="lime" />
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
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
                  <tr key={`${doctor.namaDokter}-${doctor.klinik}`} className={`border-b border-slate-100 ${late ? "bg-amber-50/60" : "odd:bg-white even:bg-slate-50/50"}`}>
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
              {!loading && doctors.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada log kehadiran dokter pada periode ini.</td></tr>
              )}
              {loading && doctors.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Memuat data kepatuhan praktik...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ModalMonitoringImut({ data, isLoading, error, onClose }) {
  const belumInput = data?.belumInputHariIni || [];
  const tanggalLaporan = data?.tanggalHariIni
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(`${data.tanggalHariIni}T00:00:00.000Z`))
    : "hari ini";
  const labelTunggakan = {
    "Kunjungan Pasien": "Kunjungan",
    "IMUT 1": "IMUT 1",
    "IMUT 2/3": "Sampel IMUT 2 & 3"
  };

  const copyReminder = async () => {
    const detailTunggakan = belumInput.map((item) => [
      `👉 *${item.poli}*`,
      `Dokter: ${item.dokter || "-"}`,
      `Asisten: *${item.asisten || "Belum ada asisten terjadwal"}*`,
      `Mohon segera melengkapi: ${item.tunggakan.map((entry) => labelTunggakan[entry] || entry).join(", ")}`
    ].join("\n")).join("\n---\n\n");
    const message = `Mohon izin mengingatkan untuk kelengkapan data *DAK-SYSTEMS* hari ini (Tanggal ${tanggalLaporan}):\n\n${detailTunggakan}\n\n---\n\nMohon kerjasamanya agar data mutu dapat segera direkapitulasi. Terima kasih 🙏`;
    try {
      await navigator.clipboard.writeText(message);
      alert("Pesan pengingat berhasil disalin untuk dibagikan melalui WhatsApp.");
    } catch {
      alert("Clipboard tidak tersedia. Periksa izin browser.");
    }
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="monitoring-imut-title" className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 id="monitoring-imut-title" className="text-lg font-black text-slate-950">Monitoring Kepatuhan Input</h2>
            <p className="mt-1 text-xs text-slate-500">Status input per dokter dan asisten terjadwal · {tanggalLaporan}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup monitoring" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><X size={17} /></button>
        </header>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          {isLoading && !data && <p className="text-sm text-slate-500">Memuat status input...</p>}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error.message}</p>}
          {data && data.jumlahDokterTerjadwal === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">Tidak ada dokter terjadwal pada tanggal laporan ini.</div>
          )}
          {data && data.jumlahDokterTerjadwal > 0 && belumInput.length === 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">Semua dokter terjadwal sudah melengkapi input kunjungan dan IMUT.</div>
          )}
          {belumInput.length > 0 && (
            <>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {belumInput.map((item, index) => (
                  <li key={`${item.poli}-${item.dokter}-${index}`} className="space-y-2 p-4">
                    <p className="text-sm font-black leading-6 text-slate-800">
                      🏥 {item.poli} <span className="font-medium text-slate-400">|</span> 👨‍⚕️ {item.dokter}
                    </p>
                    <p className="text-xs font-semibold text-slate-600">🧑‍⚕️ Asisten: {item.asisten}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.tunggakan.map((entry) => (
                        <span key={entry} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase text-red-700 ring-1 ring-inset ring-red-200">
                          <AlertCircle size={12} />Belum Input {labelTunggakan[entry] || entry}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={copyReminder} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-xs font-black uppercase text-white hover:bg-red-800">
                <Copy size={15} /> Salin Pesan Pengingat
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function AnalisisPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("summary");
  const [showMonitoringImut, setShowMonitoringImut] = useState(false);
  const [periodType, setPeriodType] = useState("bulanan");
  const [clinic, setClinic] = useState("all");
  const [toast, setToast] = useState("");
  const [shareMonth, setShareMonth] = useState(() => Number(getJakartaDateParts().month));
  const [shareYear, setShareYear] = useState(() => Number(getJakartaDateParts().year));
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = getJakartaDateParts();
    return `${today.year}-${today.month}-${today.day}`;
  });

  const range = useMemo(() => {
    if (periodType === "harian") {
      return isValidDateKey(selectedDate) ? { start: selectedDate, end: selectedDate } : null;
    }
    if (!Number.isInteger(shareYear) || shareYear < 2000 || shareYear > 9999) return null;
    if (periodType === "bulanan") {
      if (!Number.isInteger(shareMonth) || shareMonth < 1 || shareMonth > 12) return null;
      const month = String(shareMonth).padStart(2, "0");
      const lastDay = new Date(shareYear, shareMonth, 0).getDate();
      return { start: `${shareYear}-${month}-01`, end: `${shareYear}-${month}-${String(lastDay).padStart(2, "0")}` };
    }
    return { start: `${shareYear}-01-01`, end: `${shareYear}-12-31` };
  }, [periodType, selectedDate, shareMonth, shareYear]);

  const analyticsParams = new URLSearchParams({ preset: "custom", clinic });
  const imutParams = new URLSearchParams({ tipe: periodType, clinic });
  if (range) {
    analyticsParams.set("start", range.start);
    analyticsParams.set("end", range.end);
    imutParams.set("start", range.start);
    imutParams.set("end", range.end);
    if (periodType === "harian") imutParams.set("tanggal", selectedDate);
    if (periodType === "bulanan") {
      imutParams.set("bulan", String(shareMonth));
      imutParams.set("tahun", String(shareYear));
    }
    if (periodType === "tahunan") imutParams.set("tahun", String(shareYear));
  }
  const analyticsUrl = range ? `/api/analytics?${analyticsParams}` : null;
  const imutUrl = range ? `/api/laporan-eksekutif?${imutParams}` : null;
  const todayParts = getJakartaDateParts();
  const tanggalMonitoring = periodType === "harian" ? selectedDate : `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const monitoringDate = isValidDateKey(tanggalMonitoring) ? tanggalMonitoring : `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const monitoringParams = new URLSearchParams({
    bulan: String(Number(monitoringDate.slice(5, 7))),
    tahun: String(Number(monitoringDate.slice(0, 4))),
    tanggal_hari_ini: monitoringDate
  });
  const monitoringUrl = `/api/analisis-imut?${monitoringParams}`;
  const swrOptions = { revalidateOnFocus: true, refreshInterval: 60000, dedupingInterval: 30000 };
  const { data, error, isLoading, mutate } = useSWR(analyticsUrl, fetchReport, swrOptions);
  const { data: imutData, error: imutError, isLoading: imutLoading, mutate: mutateImut } = useSWR(imutUrl, fetchReport, swrOptions);
  const {
    data: monitoringData,
    error: monitoringError,
    isLoading: monitoringLoading,
    mutate: mutateMonitoring
  } = useSWR(monitoringUrl, fetchReport, swrOptions);

  useEffect(() => {
    if (error?.status === 401 || imutError?.status === 401 || monitoringError?.status === 401) router.push("/login");
  }, [error, imutError, monitoringError, router]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const summary = data?.summary;
  const attendanceChart = [
    { name: "Tepat waktu", value: summary?.attendanceOnTime || 0 },
    { name: "Lainnya", value: Math.max(0, (summary?.attendanceCount || 0) - (summary?.attendanceOnTime || 0)) }
  ];
  const totalShifts = (data?.staffWorkload || []).reduce((total, row) => total + row.shifts, 0);
  const periodeLabel = periodType === "harian"
    ? range.start
    : periodType === "bulanan"
      ? `${String(shareMonth).padStart(2, "0")}/${shareYear}`
      : String(shareYear);

  const shareExecutiveLink = async () => {
    const params = new URLSearchParams({ tipe: periodType });
    if (periodType === "harian") {
      params.set("tanggal", selectedDate);
    } else if (periodType === "bulanan") {
      params.set("bulan", String(shareMonth));
      params.set("tahun", String(shareYear));
    } else {
      params.set("tahun", String(shareYear));
    }
    const url = `${window.location.origin}/laporan-eksekutif?${params}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link laporan berhasil disalin! Silakan bagikan ke WhatsApp atasan.");
    } catch {
      alert("Tidak dapat menyalin tautan. Periksa izin clipboard browser.");
    }
  };

  const exportCsv = () => {
    if (data) makeCsv(data, imutData);
  };

  const tabs = [
    { id: "summary", label: "Ringkasan Eksekutif", icon: Activity },
    { id: "operations", label: "Operasional & SDM", icon: Users },
    { id: "imut", label: "Laporan Mutu (IMUT)", icon: ClipboardCheck }
  ];

  return (
    <main className="space-y-5 pb-10">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">DAK-SYSTEMS / Intelligence</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Laporan Kinerja, Kepatuhan &amp; Mutu Instalasi Rawat Jalan - RSUD Merah Putih</h1>
          <p className="mt-2 text-sm text-slate-600">Ringkasan operasional, beban SDM, dan indikator mutu untuk pengambilan keputusan.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={shareExecutiveLink} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-teal-900">
            <Copy size={16} /> Bagikan Laporan Eksekutif
          </button>
          <button type="button" onClick={exportCsv} disabled={!data} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:opacity-40">
            <Download size={16} /> CSV
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white hover:bg-slate-900">
            <FileText size={16} /> Cetak
          </button>
          <button type="button" onClick={() => { void mutate(); void mutateImut(); }} aria-label="Muat ulang laporan" title="Muat ulang" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:border-teal-600 hover:text-teal-700">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {toast && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{toast}</p>}

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Jenis periode
          <select value={periodType} onChange={(event) => setPeriodType(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-700">
            <option value="harian">Harian</option>
            <option value="bulanan">Bulanan</option>
            <option value="tahunan">Tahunan</option>
          </select>
        </label>
        {periodType === "harian" && <label className="grid gap-1 text-xs font-bold text-slate-600">Pilih tanggal
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
        </label>}
        {periodType === "bulanan" && <label className="grid gap-1 text-xs font-bold text-slate-600">Pilih bulan &amp; tahun
          <input type="month" value={`${shareYear}-${String(shareMonth).padStart(2, "0")}`} onChange={(event) => {
            const [year, month] = event.target.value.split("-").map(Number);
            if (year && month) { setShareYear(year); setShareMonth(month); }
          }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
        </label>}
        {periodType === "tahunan" && <label className="grid gap-1 text-xs font-bold text-slate-600">Pilih tahun
          <input type="number" min="2000" max="9999" value={shareYear} onChange={(event) => {
            const year = Number(event.target.value);
            if (Number.isInteger(year) && year >= 2000 && year <= 9999) setShareYear(year);
          }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
        </label>}
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Poliklinik
          <select value={clinic} onChange={(event) => setClinic(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-700">
            <option value="all">Semua poliklinik</option>
            {(data?.filters?.clinics || []).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <p className="flex items-end pb-2 text-xs font-semibold text-slate-500">
          <CalendarDays size={15} className="mr-2 shrink-0" />{data ? `${periodeLabel} · ${data.filters.ruangan}` : periodeLabel}
        </p>
        <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2 lg:col-span-4">
          Link eksekutif mengikuti jenis dan nilai periode yang sedang dipilih.
        </p>
      </section>

      {error && <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><AlertCircle size={18} />{error.message}</div>}
      {isLoading && !data && range && <div className="grid min-h-52 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500"><span className="inline-flex items-center gap-2"><Activity className="animate-pulse" size={18} />Memuat laporan...</span></div>}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden" role="tablist" aria-label="Bagian laporan">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => {
              setActiveTab(id);
              if (id === "imut") void mutateImut();
            }}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-bold transition sm:px-4 sm:text-sm ${activeTab === id ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>

      {data && activeTab === "summary" && (
        <section role="tabpanel" className="space-y-4">
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${isLoading ? "opacity-60" : ""}`}>
            <Kpi icon={Users} label="Total kunjungan pasien" value={numberFormat.format(summary.totalPatients)} note="Total pasien terdata dalam periode" />
            <Kpi icon={Clock3} label="Kepatuhan waktu praktik" value={summary.punctuality === null ? "—" : `${summary.punctuality}%`} note={`${summary.onTime} tepat waktu · ${summary.late} terlambat`} tone="blue" />
            <Kpi icon={CheckCircle2} label="Cakupan mulai praktik" value={summary.practiceCoverage === null ? "—" : `${summary.practiceCoverage}%`} note={`${summary.practiceStarts} dari ${summary.expectedSessions} sesi terjadwal tercatat`} tone="lime" />
          </div>
          {imutData && <ReportCharts data={imutData} />}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
            <ChartPanel title="Tren kunjungan pasien" subtitle={data.range.days <= 62 ? "Kunjungan per hari pada periode terpilih" : "Kunjungan per bulan pada periode terpilih"}>
              <div className="w-full">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.trend} margin={{ top: 8, right: 12, left: -18, bottom: 2 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={14} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${numberFormat.format(Number(value))} pasien`, "Kunjungan"]} />
                    <Line type="monotone" dataKey="pasien" name="Pasien" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>
            <section className="rounded-xl border border-teal-200 bg-teal-50/70 p-5 shadow-sm">
              <div className="flex items-center gap-2"><BrainCircuit size={19} className="text-teal-800" /><h2 className="text-sm font-extrabold text-teal-950">AI Insights / Smart Summary</h2></div>
              <p className="mt-1 text-xs text-teal-800/75">Temuan otomatis berdasarkan agregasi data pada periode ini.</p>
              <ul className="mt-4 space-y-3">
                {data.insights.map((insight, index) => <li key={`${index}-${insight}`} className="flex gap-3 border-t border-teal-200/80 pt-3 text-sm leading-6 text-slate-700"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal-700" />{insight}</li>)}
              </ul>
              <p className="mt-4 border-t border-teal-200/80 pt-3 text-[10px] leading-4 text-teal-900/70">Insight bersifat deskriptif dan mengikuti kelengkapan pencatatan; keputusan tetap memerlukan verifikasi manajemen.</p>
            </section>
          </div>
        </section>
      )}

      {data && activeTab === "operations" && (
        <section role="tabpanel" className="space-y-4">
          <ComplianceSection data={imutData} loading={imutLoading} error={imutError} />
          <AIInsightEfektivitasSDM professionMetrics={data.professionMetrics} />
          <CapacityLeaveRecommendation
            assignments={data.scheduleAssignments}
            professionMetrics={data.professionMetrics}
          />
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            <Kpi icon={UserRoundCheck} label="Kehadiran SDM" value={numberFormat.format(summary.attendanceCount)} note={`${numberFormat.format(summary.attendanceOnTime)} clock-in tepat waktu`} tone="lime" />
            <Kpi icon={Clock3} label="Kepatuhan clock-in" value={summary.attendanceCount ? `${Math.round(summary.attendanceOnTime / summary.attendanceCount * 100)}%` : "—"} note="Berdasarkan catatan absensi" tone="blue" />
            <Kpi icon={Users} label="Beban shift asisten" value={numberFormat.format(totalShifts)} note={`${numberFormat.format(summary.totalStaff)} SDM dalam cakupan`} />
            <Kpi icon={CalendarDays} label="SDM Absen/Cuti" value={numberFormat.format(summary.absentStaff)} note={`${summary.absenceRate}% dari SDM · ${numberFormat.format(summary.approvedLeaves)} catatan cuti`} tone="amber" />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartPanel title="Kehadiran SDM" subtitle="Jumlah catatan clock-in berdasarkan status kedisiplinan">
              <div className="grid min-h-64 grid-cols-1 items-center sm:grid-cols-[1fr_180px]">
                <div className="min-w-0">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={attendanceChart} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                        {attendanceChart.map((item, index) => <Cell key={item.name} fill={chartColors[index]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 text-xs">
                  {attendanceChart.map((item, index) => <p key={item.name} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: chartColors[index] }} />{item.name}<strong className="ml-auto">{numberFormat.format(item.value)}</strong></p>)}
                </div>
              </div>
            </ChartPanel>
            <ChartPanel title="Beban shift asisten" subtitle="SDM dengan jumlah shift terbanyak pada periode laporan">
              <div className="w-full">
                {data.staffWorkload.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.staffWorkload} layout="vertical" margin={{ top: 2, right: 12, left: 12, bottom: 2 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} />
                      <Tooltip />
                      <Bar dataKey="shifts" name="Jumlah shift" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="grid h-full place-items-center text-sm text-slate-500">Belum ada jadwal SDM pada periode ini.</div>}
              </div>
            </ChartPanel>
            <ChartPanel title="Rincian SDM Absen/Cuti" subtitle="Cuti SDM yang disetujui dan catatan berhalangan dokter">
              {data.leaveTypes.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.leaveTypes.map((item, index) => <li key={item.name} className="flex items-center gap-3 py-3 text-sm text-slate-700"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} />{item.name}<strong className="ml-auto text-slate-900">{numberFormat.format(item.value)}</strong></li>)}
                </ul>
              ) : <p className="py-8 text-center text-sm text-slate-500">Tidak ada catatan cuti dalam periode ini.</p>}
            </ChartPanel>
            <ChartPanel title="Ringkasan SDM" subtitle="Cakupan staf dan jadwal pada periode laporan">
              <dl className="divide-y divide-slate-100">
                <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-slate-600">Total SDM</dt><dd className="font-bold text-slate-900">{numberFormat.format(summary.totalStaff)}</dd></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-slate-600">Total shift tercatat</dt><dd className="font-bold text-slate-900">{numberFormat.format(totalShifts)}</dd></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-slate-600">SDM dengan cuti</dt><dd className="font-bold text-slate-900">{numberFormat.format(summary.absentStaff)}</dd></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-slate-600">Persentase SDM cuti</dt><dd className="font-bold text-slate-900">{summary.absenceRate}%</dd></div>
              </dl>
            </ChartPanel>
          </div>
        </section>
      )}

      {activeTab === "imut" && (
        <section role="tabpanel" className="space-y-4">
          <ComplianceSection data={imutData} loading={imutLoading} error={imutError} />
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Rekapitulasi Indikator Mutu</h2>
              <p className="mt-1 text-xs text-slate-500">Rekap per poliklinik pada periode bersama: {periodeLabel}.</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={() => { setShowMonitoringImut(true); void mutateMonitoring(); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-3 text-xs font-bold text-white hover:bg-red-800"><AlertCircle size={16} /> Cek Status Input Hari Ini</button>
              <button type="button" onClick={() => void mutateImut()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-teal-600 hover:text-teal-700"><RefreshCw size={15} /> Muat Ulang IMUT</button>
            </div>
          </div>

          {imutError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{imutError.message}</div>}
          {imutLoading && !imutData && <div className="grid min-h-40 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">Memuat rekap mutu...</div>}
          {imutData && <>
            <section className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-blue-50 p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-100 text-teal-800"><BrainCircuit size={21} /></span>
                <div><h3 className="text-sm font-black text-slate-900">Smart Summary · Mutu</h3><p className="mt-2 text-sm leading-6 text-slate-700">{imutData.aiInsight}</p></div>
              </div>
            </section>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                <h3 className="text-sm font-extrabold text-slate-900">Tabel Rekapitulasi Standar Akreditasi</h3>
                <p className="mt-1 text-xs text-slate-500">IMUT 3 mencakup kategori &lt;60, tepat 60, dan &gt;60 menit.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
                    <tr>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">Nama Poli</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">IMUT 1 · Tepat Waktu / Terlambat</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">IMUT 2 · Ya / Tidak</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">IMUT 3 · &lt;60 / 60 / &gt;60 Menit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imutData.rekap.map((row) => (
                      <tr key={row.klinik} className="odd:bg-white even:bg-slate-50/70">
                        <th scope="row" className="border-b border-slate-100 px-4 py-3 font-bold text-slate-800">{row.klinik}</th>
                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(row.tepatWaktu)} / <span className={row.terlambat > 0 ? "font-bold text-red-600" : ""}>{numberFormat.format(row.terlambat)}</span></td>
                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(row.identifikasiYa)} / {numberFormat.format(row.identifikasiTidak)}</td>
                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{numberFormat.format(row.waktuKurang60)} / {numberFormat.format(row.waktuTepat60)} / <span className={row.waktuLebih60 > 0 ? "font-bold text-red-600" : ""}>{numberFormat.format(row.waktuLebih60)}</span></td>
                      </tr>
                    ))}
                    {imutData.rekap.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada klinik atau rekap untuk periode ini.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>}
        </section>
      )}

      {showMonitoringImut && <ModalMonitoringImut data={monitoringData} isLoading={monitoringLoading} error={monitoringError} onClose={() => setShowMonitoringImut(false)} />}
    </main>
  );
}
