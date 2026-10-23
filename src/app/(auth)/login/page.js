"use client";
import React, { useState } from "react";
import { Lock, User, ShieldCheck, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const payload = {
      username: e.target.username.value,
      password: e.target.password.value,
    };

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (result.success) {
        // Redirect ke Dashboard Utama jika login berhasil
        window.location.href = "/";
      } else {
        // Tampilkan pesan error jika ditolak
        setErrorMsg(result.error || "Akses Ditolak");
      }
    } catch (err) {
      setErrorMsg("Masalah koneksi ke server DAK-AUTH");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf3f7] p-4 font-sans sm:p-8">
      <div className="pointer-events-none absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-teal-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[34rem] w-[34rem] rounded-full bg-blue-200/40 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_32px_100px_-40px_rgba(15,35,59,0.45)] animate-in fade-in zoom-in duration-500 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden min-h-[650px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b1729] via-[#12304a] to-[#087e8b] p-10 text-white lg:flex xl:p-14">
          <div className="absolute -right-28 top-24 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-12 top-40 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-teal-400/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-14 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-teal-200 shadow-lg shadow-slate-950/10">
              <ShieldCheck size={28} />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-teal-200">Sistem operasional cerdas</p>
            <h1 className="mt-4 text-5xl font-black tracking-[-0.06em] text-white xl:text-6xl">
              DAK<span className="text-teal-300">-PRO</span>
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-slate-200">
              Kelola jadwal dan operasional dengan lebih terarah, efisien, dan terintegrasi.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3 border-t border-white/15 pt-6">
            <div className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.8)]" />
            <p className="text-xs font-semibold text-slate-200">Ruang kerja Anda, dalam satu sistem.</p>
          </div>
          <div className="absolute bottom-24 right-10 text-[110px] font-black tracking-[-0.1em] text-white/[0.035]">PRO</div>
        </section>

        <section className="flex min-h-[620px] flex-col justify-center px-6 py-10 sm:px-12 lg:px-14">
          <div className="mb-9 lg:hidden">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#10233d] to-[#087e8b] text-teal-100 shadow-lg shadow-teal-900/20">
              <ShieldCheck size={25} />
            </div>
            <h1 className="text-3xl font-black tracking-[-0.05em] text-[#10233d]">DAK<span className="text-[#087e8b]">-PRO</span></h1>
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#087e8b]">Selamat datang kembali</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-[#10233d]">Masuk ke akun Anda</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Gunakan akun terdaftar untuk melanjutkan ke ruang kerja DAK-PRO.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {errorMsg && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                ❌ {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700" htmlFor="login-username">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  suppressHydrationWarning
                  required
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700" htmlFor="login-password">Password</label>
                <Link href="/forgot-password" className="text-xs font-bold text-[#087e8b] transition hover:text-[#10233d]">Lupa password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  suppressHydrationWarning
                  required
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10"
                  placeholder="Masukkan password"
                />
              </div>
            </div>

            <button
              suppressHydrationWarning
              disabled={loading}
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10233d] py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-[#087e8b] hover:shadow-teal-900/20 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={17} /> : <>Masuk ke DAK-PRO <ChevronRight size={17} /></>}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-slate-500">
              Belum punya akun?{" "}
              <Link href="/signup" className="font-bold text-[#087e8b] transition hover:text-[#10233d]">Daftar sekarang</Link>
            </p>
          </div>
          <p className="mt-8 text-center text-[10px] font-semibold tracking-wide text-slate-400">DAK-PRO · Ruang kerja operasional Anda</p>
        </section>
      </div>
    </div>
  );
}