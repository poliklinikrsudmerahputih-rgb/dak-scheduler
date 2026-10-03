"use client";

import { CalendarDays } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const weekdays = [
  { label: "Senin", index: 1 },
  { label: "Selasa", index: 2 },
  { label: "Rabu", index: 3 },
  { label: "Kamis", index: 4 },
  { label: "Jumat", index: 5 },
  { label: "Sabtu", index: 6 }
];
const numberFormat = new Intl.NumberFormat("id-ID");

function calculateProfessionCapacity(assignments, professionMetrics) {
  const dailyByProfession = new Map();
  const workloadGroups = new Map();

  for (const assignment of assignments || []) {
    const date = String(assignment.tanggal || "");
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (!date || weekday < 1 || weekday > 6) continue;

    const profession = String(assignment.jabatan || "Jabatan belum diisi").trim();
    const professionKey = profession.toUpperCase();
    const groupKey = assignment.bebanPoliGroupKey
      || `${date}|${String(assignment.simbolPraktik || assignment.poli || "").trim().toUpperCase()}`;
    const assistantId = String(assignment.sdmId || assignment.asisten);
    const uniqueWorkKey = `${date}|${professionKey}|${groupKey}|${assistantId}`;
    if (workloadGroups.has(uniqueWorkKey)) continue;
    workloadGroups.set(uniqueWorkKey, {
      date,
      weekday,
      profession,
      professionKey,
      groupKey,
      assistantId,
      doctorId: String(assignment.dokterId),
      points: Number(assignment.bebanPoin) || 0
    });
  }

  for (const workload of workloadGroups.values()) {
    const dayKey = `${workload.date}|${workload.professionKey}`;
    if (!dailyByProfession.has(dayKey)) {
      dailyByProfession.set(dayKey, {
        date: workload.date,
        weekday: workload.weekday,
        profession: workload.profession,
        professionKey: workload.professionKey,
        workload: 0,
        staff: new Set(),
        doctors: new Set()
      });
    }
    const day = dailyByProfession.get(dayKey);
    day.workload += workload.points;
    day.staff.add(workload.assistantId);
    day.doctors.add(workload.doctorId);
  }

  return weekdays.map(({ label, index }) => {
    const professions = (professionMetrics || []).map((metric) => {
      const key = String(metric.jabatan || "").toUpperCase();
      const samples = [...dailyByProfession.values()].filter((day) =>
        day.weekday === index && day.professionKey === key);
      const activeStaff = Number(metric.totalSdmAktif) || 0;

      if (!samples.length || !activeStaff) {
        return {
          jabatan: metric.jabatan,
          kebutuhan: null,
          bolehCuti: null,
          dokterBuka: 0,
          hasData: false
        };
      }

      const totalWorkload = samples.reduce((total, day) => total + day.workload, 0);
      const totalStaffDays = samples.reduce((total, day) => total + day.staff.size, 0);
      const averageWorkloadPerDay = totalWorkload / samples.length;
      const idealWorkloadPerAssistant = totalStaffDays
        ? totalWorkload / totalStaffDays
        : 0;
      const hasValidWorkload = idealWorkloadPerAssistant > 0;
      const required = hasValidWorkload
        ? Math.ceil(averageWorkloadPerDay / idealWorkloadPerAssistant)
        : null;
      const leaveQuota = required === null
        ? null
        : Math.max(0, activeStaff - required);
      const averageDoctorsOpen = samples.reduce((total, day) => total + day.doctors.size, 0) / samples.length;

      return {
        jabatan: metric.jabatan,
        kebutuhan: required,
        bolehCuti: leaveQuota,
        dokterBuka: Math.round(averageDoctorsOpen),
        hasData: required !== null
      };
    });

    const validProfessions = professions.filter((profession) => profession.hasData);
    return {
      hari: label,
      kebutuhan: validProfessions.length
        ? validProfessions.reduce((total, profession) => total + profession.kebutuhan, 0)
        : null,
      bolehCuti: validProfessions.length
        ? validProfessions.reduce((total, profession) => total + profession.bolehCuti, 0)
        : null,
      dokterBuka: validProfessions.reduce((total, profession) => total + profession.dokterBuka, 0),
      professions
    };
  });
}

function chartTooltip(value, name) {
  return value === null || value === undefined
    ? ["Data belum cukup", name]
    : [`${numberFormat.format(Number(value))} orang`, name];
}

export default function CapacityLeaveRecommendation({ assignments = [], professionMetrics = [] }) {
  const days = calculateProfessionCapacity(assignments, professionMetrics);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><CalendarDays size={18} /></span>
        <div>
          <h2 className="text-sm font-black text-slate-950">📅 Perencanaan Cuti &amp; Kapasitas Layanan Harian per Profesi</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Estimasi memakai poin operasional berbobot per poli dan rata-rata kebutuhan asisten pada hari sejenis dalam periode terpilih. Kuota = SDM aktif profesi − kebutuhan estimasi.</p>
        </div>
      </header>

      <div className="h-[260px] min-w-0 sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 8, right: 8, left: -18, bottom: 2 }} barGap={4}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="hari" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip formatter={chartTooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="kebutuhan" name="Kebutuhan staf" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="bolehCuti" name="Kuota cuti tersedia" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => (
          <article key={day.hari} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">📆 {day.hari}</h3>
              <span className="text-[10px] font-semibold text-slate-500">👨‍⚕️ {numberFormat.format(day.dokterBuka)} dokter buka</span>
            </div>
            <ul className="mt-2 space-y-2">
              {day.professions.map((profession) => (
                <li key={profession.jabatan} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate font-semibold text-slate-700">{profession.jabatan}</span>
                  {profession.hasData ? (
                    <span className={`shrink-0 font-bold ${profession.bolehCuti === 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {profession.bolehCuti === 0 ? "0 org · 🔴 Kritis" : `Maks ${profession.bolehCuti} org`}
                    </span>
                  ) : (
                    <span className="shrink-0 text-slate-400">Data belum cukup</span>
                  )}
                </li>
              ))}
              {day.professions.length === 0 && <li className="py-2 text-center text-[10px] text-slate-500">Belum ada data profesi aktif.</li>}
            </ul>
          </article>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-amber-800">Rekomendasi ini bersifat perencanaan dan bukan persetujuan cuti otomatis. Nilai hanya dihitung bila tersedia jadwal dan poin beban historis yang memadai.</p>
    </section>
  );
}
