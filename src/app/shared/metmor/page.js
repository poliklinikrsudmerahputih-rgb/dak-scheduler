"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { AlertCircle, ClipboardCheck, Loader2 } from "lucide-react";

export default function SharedMetmorPage() {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    fetch(`/api/metmor/public?token=${encodeURIComponent(token || "")}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success !== true || !result.data) {
          throw new Error(result.error || "Informasi Metmor tidak ditemukan.");
        }
        setRecord(result.data);
      })
      .catch((fetchError) => setError(fetchError.message || "Gagal memuat informasi Metmor."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="bg-gradient-to-br from-slate-950 to-teal-900 p-6 text-white sm:p-9">
          <div className="flex items-center gap-3 text-teal-200"><ClipboardCheck size={24} /><span className="text-xs font-black uppercase tracking-[0.18em]">Meeting Morning · {record?.ruangan || "Informasi"}</span></div>
          <h1 className="mt-5 text-2xl font-black sm:text-3xl">Informasi Metmor</h1>
          {record && <p className="mt-2 text-sm font-semibold text-teal-100">{format(parseISO(record.tanggal), "EEEE, dd MMMM yyyy", { locale: id })}</p>}
        </header>
        <section className="p-6 sm:p-9">
          {loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-teal-700" /></div> : error ? (
            <div role="alert" className="flex gap-2 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"><AlertCircle size={18} className="shrink-0" />{error}</div>
          ) : <p className="whitespace-pre-wrap break-words text-base leading-8 text-slate-700">{record.informasi}</p>}
        </section>
        <footer className="border-t border-slate-100 px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:px-9">Jadwal Praktik Poliklinik Rawat Jalan</footer>
      </article>
    </main>
  );
}
