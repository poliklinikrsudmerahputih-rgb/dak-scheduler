"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Activity, AlertCircle, CalendarDays, Download, FileText, RefreshCw,
  Stethoscope, Users, UserRoundCheck, Clock3, Sparkles
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const palette = ["#0f766e", "#2563eb", "#65a30d", "#0891b2", "#d97706", "#db2777", "#4f46e5"];
const numberFormat = new Intl.NumberFormat("id-ID");

async function fetchAnalytics(url) {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Analisis gagal dimuat.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function downloadCsv(data) {
  const rows = [
    ["Bagian", "Nama", "Nilai", "Keterangan"],
    ...data.trend.map((row) => ["Tren pasien", row.tanggal || row.label, row.pasien, "kunjungan"]),
    ...data.doctorWorkload.map((row) => ["Beban dokter", row.name, row.pasien, `${row.sesi} sesi praktik terjadwal`]),
    ...data.staffWorkload.map((row) => ["Beban SDM", row.name, row.shifts, "shift terjadwal"]),
    ...data.leaveTypes.map((row) => ["Jenis cuti disetujui", row.name, row.value, "pengajuan"]),
    ...data.insights.map((row, index) => ["Wawasan", `Insight ${index + 1}`, "", row])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `laporan-analisis-${data.range.start}-${data.range.end}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Kpi({ icon: Icon, label, value, note, tone = "teal" }) {
  const tones = {
    teal: "text-teal-700 bg-teal-50",
    blue: "text-blue-700 bg-blue-50",
    lime: "text-lime-700 bg-lime-50",
    amber: "text-amber-700 bg-amber-50"
  };
  return (
    <article className="min-w-0 border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center ${tones[tone]}`}><Icon size={19} /></span>
      </div>
    </article>
  );
}

function ChartPanel({ title, subtitle, children, className = "" }) {
  return (
    <section className={`min-w-0 border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-5">
        <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

export default function AnalisisPage() {
  const router = useRouter();
  const [preset, setPreset] = useState("month");
  const [clinic, setClinic] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const params = new URLSearchParams({ preset, clinic });
  if (preset === "custom" && start && end) {
    params.set("start", start);
    params.set("end", end);
  }
  const apiUrl = preset === "custom" && (!start || !end) ? null : `/api/analytics?${params}`;
  const { data, error, isLoading, mutate } = useSWR(apiUrl, fetchAnalytics, { revalidateOnFocus: false, dedupingInterval: 30000 });
  useEffect(() => {
    if (error?.status === 401) router.push("/login");
  }, [error, router]);
  const summary = data?.summary;
  const maxHeat = Math.max(1, ...(data?.heatmap || []).flatMap((day) => day.slots.map((slot) => slot.value)));

  return (
    <main className="space-y-5 pb-10 print:space-y-4">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">DAK-SYSTEMS / Intelligence</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Analisis &amp; Intelligence</h1>
          <p className="mt-2 text-sm text-slate-600">Gambaran operasional rumah sakit dari kunjungan, praktik dokter, jadwal SDM, dan cuti.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={() => mutate()} aria-label="Muat ulang analisis" title="Muat ulang" className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 bg-white text-slate-700 hover:border-teal-600 hover:text-teal-700"><RefreshCw size={16} /></button>
          <button disabled={!data} onClick={() => data && downloadCsv(data)} className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:opacity-40"><Download size={16} /> CSV</button>
          <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900"><FileText size={16} /> Cetak</button>
        </div>
      </header>

      <section className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
        <label className="grid gap-1 text-xs font-bold text-slate-600">Periode
          <select value={preset} onChange={(event) => setPreset(event.target.value)} className="h-10 min-w-40 border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-700">
            <option value="month">Bulan ini</option><option value="year">Tahun ini</option><option value="custom">Rentang kustom</option>
          </select>
        </label>
        {preset === "custom" && <>
          <label className="grid gap-1 text-xs font-bold text-slate-600">Dari tanggal<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm text-slate-800" /></label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">Sampai tanggal<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm text-slate-800" /></label>
        </>}
        <label className="grid gap-1 text-xs font-bold text-slate-600">Poliklinik
          <select value={clinic} onChange={(event) => setClinic(event.target.value)} className="h-10 min-w-48 border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-700">
            <option value="all">Semua poliklinik</option>
            {(data?.filters?.clinics || []).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <p className="ml-auto inline-flex items-center gap-2 pb-2 text-xs font-semibold text-slate-500"><CalendarDays size={15} />{data ? `${data.range.start} – ${data.range.end} · ${data.filters.ruangan}` : "Ruangan mengikuti sesi akun"}</p>
      </section>

      {error && <div role="alert" className="flex items-center gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"><AlertCircle size={18} />{error.message}</div>}
      {isLoading && !data && <div className="grid min-h-52 place-items-center text-sm font-semibold text-slate-500"><span className="inline-flex items-center gap-2"><Activity className="animate-pulse" size={18} />Memuat data operasional…</span></div>}
      {preset === "custom" && (!start || !end) && <div className="border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Pilih tanggal awal dan akhir untuk menampilkan laporan kustom.</div>}

      {data && <>
        <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 ${isLoading ? "opacity-60" : ""}`}>
          <Kpi icon={Users} label="Kunjungan pasien" value={numberFormat.format(summary.totalPatients)} note="Total pasien terdata" tone="teal" />
          <Kpi icon={Stethoscope} label="Dokter terjadwal" value={numberFormat.format(summary.totalDoctors)} note="Poli dalam cakupan" tone="blue" />
          <Kpi icon={UserRoundCheck} label="Kehadiran SDM" value={numberFormat.format(summary.attendanceCount)} note={`${summary.attendanceOnTime} clock-in tepat waktu`} tone="lime" />
          <Kpi icon={Users} label="Beban SDM" value={numberFormat.format(summary.totalStaff)} note={`${numberFormat.format(data.staffWorkload.reduce((sum, row) => sum + row.shifts, 0))} shift tercatat`} tone="lime" />
          <Kpi icon={Activity} label="Mulai praktik" value={summary.practiceCoverage === null ? "—" : `${summary.practiceCoverage}%`} note={`${summary.practiceStarts} dari ${summary.expectedSessions} sesi terjadwal tercatat`} tone="blue" />
          <Kpi icon={Clock3} label="Tepat waktu praktik" value={summary.punctuality === null ? "—" : `${summary.punctuality}%`} note={`${summary.onTime} tepat · ${summary.late} terlambat`} tone="blue" />
          <Kpi icon={CalendarDays} label="Cuti tercatat" value={numberFormat.format(summary.approvedLeaves)} note={`${summary.absentStaff} SDM cuti · ${summary.absenceRate}% dari staf`} tone="amber" />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartPanel title="Tren kunjungan pasien" subtitle={data.range.days <= 62 ? "Kunjungan harian pada klinik terpilih" : "Kunjungan bulanan pada klinik terpilih"}>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend} margin={{ top: 8, right: 12, left: -18, bottom: 2 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={14} /><YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey="pasien" name="Pasien" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart></ResponsiveContainer>
            </div>
          </ChartPanel>
          <ChartPanel title="Kunjungan & sesi praktik dokter" subtitle="Volume pasien aktual dibanding sesi praktik terjadwal, bukan kuota pasien.">
            <div className="h-72 w-full">
              {data.doctorWorkload.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.doctorWorkload} margin={{ top: 8, right: 8, left: -18, bottom: 35 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" interval={0} /><YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="pasien" name="Pasien aktual" fill="#0f766e" radius={[2, 2, 0, 0]} /><Bar dataKey="sesi" name="Sesi terjadwal" fill="#93c5fd" radius={[2, 2, 0, 0]} />
              </BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-500">Belum ada data dokter pada poliklinik ini.</div>}
            </div>
          </ChartPanel>
          <ChartPanel title="Komposisi cuti tercatat" subtitle="Cuti SDM yang disetujui dan catatan berhalangan dokter.">
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 sm:flex-row">
              {data.leaveTypes.length ? <>
                <div className="h-56 w-full max-w-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.leaveTypes} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>{data.leaveTypes.map((item, index) => <Cell key={item.name} fill={palette[index % palette.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                <ul className="grid gap-2 text-xs text-slate-600">{data.leaveTypes.map((item, index) => <li key={item.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5" style={{ backgroundColor: palette[index % palette.length] }} />{item.name}<strong className="ml-auto pl-4 text-slate-900">{item.value}</strong></li>)}</ul>
              </> : <p className="text-sm text-slate-500">Tidak ada cuti disetujui dalam rentang ini.</p>}
            </div>
          </ChartPanel>
          <ChartPanel title="Distribusi beban shift SDM" subtitle="Staf dengan jumlah shift terbanyak pada periode laporan.">
            <div className="h-72 w-full">
              {data.staffWorkload.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.staffWorkload} layout="vertical" margin={{ top: 2, right: 10, left: 12, bottom: 2 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="shifts" name="Jumlah shift" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-500">Belum ada jadwal SDM di periode ini.</div>}
            </div>
          </ChartPanel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
          <ChartPanel title="Peta kepadatan jadwal praktik" subtitle="Jumlah dokter terjadwal per hari dan blok waktu berdasarkan jadwal mingguan master.">
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[74px_repeat(5,minmax(0,1fr))] gap-1.5 pb-2 text-center text-[10px] font-bold text-slate-500"><span />{["07-09", "09-11", "11-13", "13-15", "15-17"].map((slot) => <span key={slot}>{slot}</span>)}</div>
                <div className="grid gap-1.5">{data.heatmap.map((day) => <div key={day.day} className="grid grid-cols-[74px_repeat(5,minmax(0,1fr))] items-center gap-1.5"><span className="text-[10px] font-bold text-slate-600">{day.day.slice(0, 3)}</span>{day.slots.map((slot) => <div key={slot.label} title={`${day.day} ${slot.label}: ${slot.value} dokter`} className="grid h-8 place-items-center text-[10px] font-bold text-slate-700" style={{ backgroundColor: `rgba(13, 148, 136, ${0.08 + 0.82 * slot.value / maxHeat})` }}>{slot.value || ""}</div>)}</div>)}</div>
              </div>
            </div>
          </ChartPanel>
          <section className="border border-teal-200 bg-teal-50/70 p-4 sm:p-5">
            <div className="flex items-center gap-2"><Sparkles size={18} className="text-teal-800" /><h2 className="text-sm font-extrabold text-teal-950">AI Insights Analyst</h2></div>
            <p className="mt-1 text-xs text-teal-800/75">Temuan otomatis berbasis agregasi data periode ini.</p>
            <ul className="mt-4 space-y-3">{data.insights.map((insight, index) => <li key={`${index}-${insight}`} className="flex gap-3 border-t border-teal-200/80 pt-3 text-sm leading-6 text-slate-700"><span className="mt-2 h-2 w-2 shrink-0 bg-teal-700" />{insight}</li>)}</ul>
            <p className="mt-4 border-t border-teal-200/80 pt-3 text-[10px] leading-4 text-teal-900/70">Wawasan bersifat deskriptif dan mengikuti kelengkapan pencatatan. Keputusan operasional tetap memerlukan verifikasi manajemen.</p>
          </section>
        </section>
      </>}
    </main>
  );
}