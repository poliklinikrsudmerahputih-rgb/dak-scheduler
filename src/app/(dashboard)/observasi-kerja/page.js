"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Activity, AlertCircle, CheckCircle2, Clock3, Download, Loader2, Save, Timer } from "lucide-react";
import {
  BorderStyle,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";

const fetcher = async (url) => {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Data observasi gagal dimuat.");
    error.status = response.status;
    throw error;
  }
  return result;
};

const tlxDimensions = [
  { key: "mental", label: "Kebutuhan Mental" },
  { key: "fisik", label: "Kebutuhan Fisik" },
  { key: "waktu", label: "Kebutuhan Waktu" },
  { key: "performa", label: "Performa Kinerja" },
  { key: "usaha", label: "Tingkat Usaha" },
  { key: "frustrasi", label: "Tingkat Frustrasi" },
];

function formatColumnName(name) {
  return name.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function makeWordCell(value, width, isHeader = false) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    shading: isHeader ? { fill: "E2E8F0" } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
    children: [new Paragraph({
      children: [new TextRun({
        text: String(value ?? ""),
        bold: isHeader,
        size: 16,
        font: "Arial",
      })],
    })],
  });
}

async function downloadHistoryWord(tableName, rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const pageWidth = 15800;
  const columnWidth = Math.floor(pageWidth / Math.max(columns.length, 1));
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: columns.map((column) => makeWordCell(formatColumnName(column), columnWidth, true)),
    }),
    ...rows.map((row) => new TableRow({
      children: columns.map((column) => makeWordCell(row[column], columnWidth)),
    })),
  ];
  const document = new Document({
    sections: [{
      properties: {
        page: { size: { orientation: PageOrientation.LANDSCAPE } },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: `Data Historis: ${tableName}`, bold: true, size: 28, font: "Arial" })],
          spacing: { after: 180 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Jumlah data: ${rows.length}`, size: 18, font: "Arial" })],
          spacing: { after: 240 },
        }),
        new Table({ width: { size: pageWidth, type: WidthType.DXA }, rows: tableRows }),
      ],
    }],
  });
  const blob = await Packer.toBlob(document);
  saveAs(blob, `${tableName}.docx`);
}

function HistoryTable({ title, tableName, rows, onDownload }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900">{title} <span className="text-slate-400">({rows.length})</span></h3>
          <p className="mt-1 font-mono text-xs text-slate-500">{tableName}</p>
        </div>
        <button type="button" disabled={!rows.length} onClick={() => onDownload(tableName, rows)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700 transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
          <Download size={16} /> Download Word
        </button>
      </div>
      {!rows.length ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Belum ada data pada tabel ini untuk ruangan Anda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              {columns.map((column) => <th key={column} className="px-3 py-3">{formatColumnName(column)}</th>)}
            </tr></thead>
            <tbody>{rows.map((row, index) => (
              <tr key={row.id ?? index} className="border-b border-slate-100 last:border-0">
                {columns.map((column) => (
                  <td key={column} className="max-w-48 truncate px-3 py-3 text-slate-700">
                    {String(row[column] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummaryCard({ icon: Icon, label, value, suffix, color }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{Number(value || 0).toLocaleString("id-ID")}<span className="ml-1 text-xs font-bold text-slate-500">{suffix}</span></p></div>
        <span className={`rounded-xl p-3 ${color}`}><Icon size={20} /></span>
      </div>
    </article>
  );
}

export default function ObservasiKerjaPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR("/api/observasi-kerja", fetcher);
  const [activeTab, setActiveTab] = useState("history");
  const [demographic, setDemographic] = useState({
    tanggal: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
    stasiun: "NERS 3",
    inisialPerawat: "",
    shift: "Midel 1",
  });
  const [event, setEvent] = useState({ kategoriBlok: "A", waktuMulai: "", waktuSelesai: "", detail: "" });
  const [scores, setScores] = useState(Object.fromEntries(tlxDimensions.map(({ key }) => [key, 50])));
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (error?.status === 401) router.push("/login");
  }, [error, router]);

  const duration = (() => {
    if (!event.waktuMulai || !event.waktuSelesai) return 0;
    const [startHour, startMinute] = event.waktuMulai.split(":").map(Number);
    const [endHour, endMinute] = event.waktuSelesai.split(":").map(Number);
    let result = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (result < 0) result += 24 * 60;
    return result;
  })();

  const submit = async (type) => {
    setSubmitting(true);
    setNotice(null);
    try {
      const payload = type === "time-motion"
        ? { type, ...demographic, ...event, durasiMenit: duration }
        : { type, ...demographic, ...scores };
      const response = await fetch("/api/observasi-kerja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || "Data gagal disimpan.");
      setNotice({ success: true, text: `${result.message}${result.metadataNotStored?.length ? ` Catatan: kolom ${result.metadataNotStored.join(" dan ")} belum tersedia di tabel lama.` : ""}` });
      await mutate();
      if (type === "time-motion") setEvent((current) => ({ ...current, waktuMulai: "", waktuSelesai: "", detail: "" }));
    } catch (submitError) {
      setNotice({ success: false, text: submitError.message });
    } finally {
      setSubmitting(false);
    }
  };

  const downloadWord = async (tableName, rows) => {
    setDownloadError("");
    try {
      await downloadHistoryWord(tableName, rows);
    } catch (downloadFailure) {
      console.error("Gagal membuat dokumen Word:", downloadFailure);
      setDownloadError(`Dokumen ${tableName} gagal dibuat. Silakan coba kembali.`);
    }
  };

  const tabs = [
    ["history", "Data Historis (Database Lama)"],
    ["time", "Input Time & Motion"],
    ["tlx", "Input NASA-TLX"],
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg sm:p-8">
        <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Activity size={16} /> Event-Centric Research Module</p>
        <h1 className="text-xl font-black sm:text-2xl">🔬 Instrumen Observasi Kinerja &amp; Beban Kerja (Event-Centric)</h1>
        <p className="mt-2 text-sm text-slate-300">Time-Motion Study dan pengukuran beban kerja NASA-TLX.</p>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} />{error.message}</div>}
      {data?.warnings?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Sebagian tabel historis belum dapat dibaca; tabel yang tersedia tetap ditampilkan.</div>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Clock3} label="Rata-rata Waktu Asesmen" value={data?.summary?.averageAssessmentMinutes} suffix="menit" color="bg-blue-50 text-blue-700" />
        <SummaryCard icon={Timer} label="Rata-rata Waktu Edukasi" value={data?.summary?.averageEducationMinutes} suffix="menit" color="bg-emerald-50 text-emerald-700" />
        <SummaryCard icon={Activity} label="Rata-rata Waktu Tindakan" value={data?.summary?.averageActionMinutes} suffix="menit" color="bg-amber-50 text-amber-700" />
        <SummaryCard icon={Activity} label="Rata-rata Skor TLX" value={data?.summary?.averageTlxScore} suffix="/ 100" color="bg-violet-50 text-violet-700" />
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Navigasi modul observasi">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => { setActiveTab(key); setNotice(null); }}
          className={`shrink-0 rounded-xl px-4 py-3 text-xs font-black transition ${activeTab === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
          {label}
        </button>)}
      </nav>

      {notice && <div role="status" className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${notice.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
        {notice.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{notice.text}
      </div>}
      {downloadError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} />{downloadError}</div>}

      {activeTab === "history" && (
        <div className="space-y-5">
          {isLoading ? <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />Memuat data historis...</div> : <>
            {data && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Riwayat lama dari Turso sudah dimuat sesuai ruangan akun Anda:
                <strong className="ml-1">{data.historyTimeMotion?.length || 0} observasi</strong>
                <span> dan </span>
                <strong>{data.historyNasaTlx?.length || 0} isian NASA-TLX</strong>.
              </div>
            )}
            <HistoryTable title="Riwayat Time-Motion" tableName="log_observasi_kerja" rows={data?.historyTimeMotion || []} onDownload={downloadWord} />
            <HistoryTable title="Riwayat NASA-TLX" tableName="log_nasa_tlx" rows={data?.historyNasaTlx || []} onDownload={downloadWord} />
          </>}
        </div>
      )}

      {activeTab !== "history" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-black text-slate-900">{activeTab === "time" ? "Pencatatan Kejadian Time & Motion" : "Kuesioner NASA-TLX"}</h2>
          <p className="mt-1 text-sm text-slate-500">Lengkapi identitas observasi sebelum mengirim data.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">Tanggal
              <input type="date" value={demographic.tanggal} onChange={(e) => setDemographic({ ...demographic, tanggal: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900" />
            </label>
            <label className="text-xs font-bold text-slate-600">Nama Stasiun
              <select value={demographic.stasiun} onChange={(e) => setDemographic({ ...demographic, stasiun: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900">
                <option>NERS 3</option><option>NERS 4</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">Inisial Perawat
              <input required maxLength={12} value={demographic.inisialPerawat} onChange={(e) => setDemographic({ ...demographic, inisialPerawat: e.target.value.toUpperCase() })} placeholder="Contoh: AR" className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
            </label>
            <label className="text-xs font-bold text-slate-600">Shift
              <select value={demographic.shift} onChange={(e) => setDemographic({ ...demographic, shift: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900">
                {[1, 2, 3, 4].map((number) => <option key={number}>Midel {number}</option>)}
              </select>
            </label>
          </div>

          {activeTab === "time" ? (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-bold text-slate-600">Kategori Blok
                  <select value={event.kategoriBlok} onChange={(e) => setEvent({ ...event, kategoriBlok: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900">
                    <option value="A">Blok A</option><option value="B">Blok B</option><option value="C">Blok C</option><option value="D">Blok D</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Waktu Mulai
                  <input type="time" value={event.waktuMulai} onChange={(e) => setEvent({ ...event, waktuMulai: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
                </label>
                <label className="text-xs font-bold text-slate-600">Waktu Selesai
                  <input type="time" value={event.waktuSelesai} onChange={(e) => setEvent({ ...event, waktuSelesai: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
                </label>
                <div className="rounded-xl bg-slate-100 p-3 text-xs font-bold text-slate-600">Durasi otomatis
                  <p className="mt-2 text-lg font-black text-slate-900">{duration} menit</p>
                </div>
              </div>
              <label className="block text-xs font-bold text-slate-600">Detail Aktivitas (opsional)
                <input value={event.detail} onChange={(e) => setEvent({ ...event, detail: e.target.value })} maxLength={250} placeholder="Deskripsi singkat aktivitas" className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900" />
              </label>
              <button type="button" disabled={submitting || !demographic.inisialPerawat.trim() || !event.waktuMulai || !event.waktuSelesai || !duration} onClick={() => submit("time-motion")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}Simpan Kejadian
              </button>
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              {tlxDimensions.map(({ key, label }) => <label key={key} className="block">
                <span className="flex items-center justify-between text-sm font-bold text-slate-700"><span>{label}</span><span className="rounded-lg bg-slate-100 px-3 py-1 font-black text-slate-900">{scores[key]}</span></span>
                <input type="range" min="0" max="100" step="1" value={scores[key]} onChange={(e) => setScores({ ...scores, [key]: Number(e.target.value) })} className="mt-3 h-2 w-full cursor-pointer accent-blue-600" />
                <span className="flex justify-between text-[10px] text-slate-400"><span>0 — Rendah</span><span>100 — Tinggi</span></span>
              </label>)}
              <button type="button" disabled={submitting || !demographic.inisialPerawat.trim()} onClick={() => submit("nasa-tlx")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}Simpan Skor NASA-TLX
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
