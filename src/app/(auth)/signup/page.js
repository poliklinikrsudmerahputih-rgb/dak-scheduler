"use client";
import React, { useState } from "react";
import { UserPlus, ShieldCheck, ArrowLeft, Loader2, Hospital } from "lucide-react";
import Link from "next/link";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Daftar ruangan sesuai unit kerja di RS
  const daftarRuangan = ["POLIKLINIK", "IGD", "ICU", "RAWAT INAP", "KAMAR OPERASI", "LABORATORIUM", "FARMASI"];

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });

    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (result.success) {
        setMsg({ type: "success", text: "✅ PENDAFTARAN BERHASIL! SILAKAN LOGIN." });
        setTimeout(() => window.location.href = "/login", 2000);
      } else {
        setMsg({ type: "error", text: "❌ " + result.error });
      }
    } catch (err) {
      setMsg({ type: "error", text: "❌ GAGAL TERHUBUNG KE SERVER" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf3f7] p-4 font-sans text-slate-900 sm:p-8">
      <div className="pointer-events-none absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-teal-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[34rem] w-[34rem] rounded-full bg-blue-200/40 blur-3xl" />
      <div className="relative w-full max-w-[480px] space-y-6">
        
        <div className="text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#10233d] to-[#087e8b] text-teal-100 shadow-lg shadow-teal-900/20">
            <UserPlus size={25} />
          </div>
          <h1 className="text-3xl font-black tracking-[-0.05em]">
            DAK<span className="text-[#087e8b]">-PRO</span>
          </h1>
          <p className="mt-2 text-xs font-semibold tracking-wide text-slate-500">Buat akun ruang kerja Anda</p>
        </div>

        <div className="rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_28px_80px_-36px_rgba(15,35,59,0.35)] sm:p-8">
          <form onSubmit={handleSignup} className="space-y-4">
            
            {msg.text && (
              <div role="status" className={`${msg.type === "success" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"} rounded-xl border p-3 text-xs font-bold text-center`}>
                {msg.text}
              </div>
            )}

            <div className="space-y-1">
              <label className="mb-2 block text-xs font-bold text-slate-700">Informasi akun</label>
              <input name="nama" placeholder="Nama lengkap" className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10" required />
              <input name="username" placeholder="Username / ID" autoComplete="username" className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10" required />
              <input name="password" type="password" placeholder="Buat password" autoComplete="new-password" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10" required />
            </div>

            {/* TAMBAHAN: PILIHAN RUANGAN (PENGGANTI RLS) */}
            <div className="space-y-1">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Hospital size={10} /> Pilih Unit Kerja / Ruangan
              </label>
              <select name="ruangan" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10" required>
                {daftarRuangan.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            
            <div className="pt-4 border-t border-slate-50">
              <label className="mb-2 block text-xs font-bold text-slate-700">
                <ShieldCheck size={10} className="inline mr-1" /> * Pengaman Reset Password
              </label>
              <select name="pertanyaan" className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800 outline-none transition focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10">
                <option value="Nama Ibu Kandung?">Nama Ibu Kandung?</option>
                <option value="Nama Sekolah SD Anda?">Nama Sekolah SD Anda?</option>
                <option value="Kota Kelahiran Anda?">Kota Kelahiran Anda?</option>
              </select>
              <input name="jawaban" placeholder="Jawaban rahasia Anda" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10" required />
            </div>

            <button disabled={loading} type="submit" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10233d] py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-[#087e8b] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 className="animate-spin" size={16} /> : "Konfirmasi Pendaftaran"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-50 text-center">
            <Link href="/login" className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#087e8b]">
              <ArrowLeft size={12} /> Sudah punya akun? Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}