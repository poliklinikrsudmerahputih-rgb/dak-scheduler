"use client";
import React, { useEffect, useRef, useState } from "react";
import { Lock, User, ShieldCheck, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lampOn, setLampOn] = useState(false);
  const [cordPull, setCordPull] = useState(0);
  const pullStartY = useRef(null);
  const pullStartedLit = useRef(false);
  const suppressPullClick = useRef(false);
  const usernameInputRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLampOn(true);
    }
  }, []);

  useEffect(() => {
    if (!lampOn) return undefined;
    const timer = window.setTimeout(() => usernameInputRef.current?.focus(), 850);
    return () => window.clearTimeout(timer);
  }, [lampOn]);

  function startPull(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pullStartY.current = event.clientY;
    pullStartedLit.current = lampOn;
  }

  function movePull(event) {
    if (pullStartY.current === null) return;
    const distance = Math.max(-64, Math.min(64, event.clientY - pullStartY.current));
    setCordPull(distance);
  }

  function endPull(event) {
    if (pullStartY.current === null) return;
    const distance = event.clientY - pullStartY.current;
    if ((!pullStartedLit.current && distance >= 24) || (pullStartedLit.current && distance <= -24)) {
      setLampOn(!pullStartedLit.current);
      suppressPullClick.current = true;
    }
    pullStartY.current = null;
    setCordPull(0);
  }

  function cancelPull() {
    pullStartY.current = null;
    setCordPull(0);
  }

  function toggleLamp() {
    if (suppressPullClick.current) {
      suppressPullClick.current = false;
      return;
    }
    setLampOn((current) => !current);
  }

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
    <div className={`login-page${lampOn ? " is-lit" : ""}`}>
      <svg className="login-night-city" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="night-sky" x1="720" y1="0" x2="720" y2="900" gradientUnits="userSpaceOnUse">
            <stop stopColor="#07111F" />
            <stop offset="0.68" stopColor="#102641" />
            <stop offset="1" stopColor="#1B3551" />
          </linearGradient>
          <linearGradient id="road-glow" x1="720" y1="600" x2="720" y2="900" gradientUnits="userSpaceOnUse">
            <stop stopColor="#213B56" />
            <stop offset="1" stopColor="#07111F" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#night-sky)" />
        <circle cx="1120" cy="150" r="55" fill="#D8E6F0" opacity=".72" />
        <circle cx="1143" cy="132" r="55" fill="#0B1B2F" />
        <g fill="#DAE9F5" opacity=".75">
          <circle cx="170" cy="118" r="2" /><circle cx="300" cy="204" r="1.5" />
          <circle cx="468" cy="92" r="2" /><circle cx="605" cy="172" r="1.5" />
          <circle cx="785" cy="88" r="1.5" /><circle cx="934" cy="226" r="2" />
          <circle cx="1285" cy="250" r="1.5" /><circle cx="1360" cy="92" r="2" />
          <circle cx="92" cy="285" r="1.5" /><circle cx="735" cy="265" r="1.5" />
        </g>
        <path d="M0 690h75v-93h38v52h55V548h54v102h44V575h62v104h53v-72h37v83h77v-135h58v61h43V548h61v136h64v-82h48v60h63V545h55v103h51v-70h63v110h46v-90h58v74h62V560h48v130h78v-91h48v88h58v-122h52v120h42v-96h55v117h49v-72h66v162H0V690Z" fill="#0A1929" />
        <path d="M0 756h94v-57h48v45h78v-95h70v89h57v-54h62v73h78v-111h66v76h58v-49h66v112h82v-87h64v65h67v-106h70v90h52v-45h73v95h75v-67h58v52h70v-93h67v98h76v-74h75v133H0V756Z" fill="#0D2034" />
        <g fill="#F5C976" opacity=".52">
          <path d="M193 614h8v13h-8zM285 601h8v13h-8zM445 637h8v13h-8zM544 606h8v13h-8zM720 583h8v13h-8zM871 630h8v13h-8zM1001 585h8v13h-8zM1177 624h8v13h-8zM1321 600h8v13h-8z" />
        </g>
        <path d="M0 818c265-40 483-35 720 0 237-35 455-40 720 0v82H0v-82Z" fill="url(#road-glow)" />
        <path d="M720 827v73" stroke="#F2C879" strokeOpacity=".2" strokeWidth="3" strokeDasharray="18 24" />
      </svg>
      <div className="login-city-haze" />
      <div className="login-streetlamp">
        <svg className="login-streetlamp-art" viewBox="0 0 180 520" fill="none">
          <path d="M91 520V83c0-25-18-43-43-43H30" stroke="#687B8D" strokeWidth="12" strokeLinecap="round" />
          <path d="M26 31h24c30 0 51 22 51 52v12" stroke="#A8B7C4" strokeWidth="7" strokeLinecap="round" />
          <path d="M18 31h42l-8 19H26l-8-19Z" fill="#394D60" stroke="#C6D2DC" strokeWidth="2" strokeLinejoin="round" />
          <path className="login-streetlamp-bulb" d="M28 51h23l-4 10H32l-4-10Z" fill="#F9D992" />
          <path d="M91 520h-28" stroke="#687B8D" strokeWidth="12" strokeLinecap="round" />
        </svg>
        <div className="login-streetlamp-beam" />
        <div
          className="login-streetlamp-cord"
          style={{ height: `${104 + cordPull}px` }}
        />
        <button
          type="button"
          className="login-streetlamp-pull"
          style={{ top: `${134 + cordPull}px` }}
          onPointerDown={startPull}
          onPointerMove={movePull}
          onPointerUp={endPull}
          onPointerCancel={cancelPull}
          onClick={toggleLamp}
          aria-label={lampOn
            ? "Tarik tali lampu jalan ke atas untuk mematikan lampu dan menutup login"
            : "Tarik tali lampu jalan ke bawah untuk membuka kolom login"}
        />
        <span className={`login-streetlamp-hint${lampOn ? " is-visible" : ""}`} aria-hidden={!lampOn}>
          Tarik ke atas untuk mematikan lampu
        </span>
      </div>
      <div className="login-page-content">
      <div className="login-card-enter relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_32px_100px_-40px_rgba(15,35,59,0.45)] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden min-h-[650px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b1729] via-[#12304a] to-[#087e8b] p-10 text-white lg:flex xl:p-14">
          <div className="login-orbit login-orbit-outer absolute -right-28 top-24 h-80 w-80 rounded-full border border-white/10" />
          <div className="login-orbit login-orbit-inner absolute -right-12 top-40 h-48 w-48 rounded-full border border-white/10" />
          <div className="login-glow absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-teal-400/10 blur-2xl" />
          <div className="login-copy-enter relative z-10">
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
          <div className="login-copy-enter login-copy-delayed relative z-10 flex items-center gap-3 border-t border-white/15 pt-6">
            <div className="login-status-dot h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.8)]" />
            <p className="text-xs font-semibold text-slate-200">Ruang kerja Anda, dalam satu sistem.</p>
          </div>
          <div className="login-watermark absolute bottom-24 right-10 text-[110px] font-black tracking-[-0.1em] text-white/[0.035]">PRO</div>
        </section>

        <section className="login-form-reveal flex min-h-[620px] flex-col justify-center px-6 py-10 sm:px-12 lg:px-14">
          <div className="login-field-enter mb-9 lg:hidden">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#10233d] to-[#087e8b] text-teal-100 shadow-lg shadow-teal-900/20">
              <ShieldCheck size={25} />
            </div>
            <h1 className="text-3xl font-black tracking-[-0.05em] text-[#10233d]">DAK<span className="text-[#087e8b]">-PRO</span></h1>
          </div>

          <div className="login-field-enter login-delay-1 mb-8">
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

            {!lampOn && (
              <button
                type="button"
                onClick={() => setLampOn(true)}
                className="login-pull-prompt"
              >
                <span className="login-prompt-cord" aria-hidden="true" />
                <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-700">✦</span>
                <span className="text-left">
                  <span className="block text-sm font-bold text-slate-800">Tarik tali lampu jalan</span>
                  <span className="mt-0.5 block text-xs font-medium text-slate-500">untuk membuka kolom login</span>
                </span>
              </button>
            )}

            <div
              className={`login-credentials${lampOn ? " is-revealed" : ""}`}
              aria-hidden={!lampOn}
              inert={!lampOn}
            >
            <div className="login-field-enter login-delay-2 space-y-2">
              <label className="text-xs font-bold text-slate-700" htmlFor="login-username">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  suppressHydrationWarning
                  required
                  disabled={!lampOn}
                  id="login-username"
                  ref={usernameInputRef}
                  name="username"
                  type="text"
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            <div className="login-field-enter login-delay-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700" htmlFor="login-password">Password</label>
                <Link href="/forgot-password" className="text-xs font-bold text-[#087e8b] transition hover:text-[#10233d]">Lupa password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  suppressHydrationWarning
                  required
                  disabled={!lampOn}
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-[#087e8b] focus:bg-white focus:ring-4 focus:ring-teal-600/10"
                  placeholder="Masukkan password"
                />
              </div>
            </div>
            </div>

            <button
              suppressHydrationWarning
              disabled={loading || !lampOn}
              type="submit"
              className="login-field-enter login-delay-4 mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10233d] py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-[#087e8b] hover:shadow-teal-900/20 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={17} /> : <>Masuk ke DAK-PRO <ChevronRight size={17} /></>}
            </button>
          </form>

          <div className="login-field-enter login-delay-5 mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-slate-500">
              Belum punya akun?{" "}
              <Link href="/signup" className="font-bold text-[#087e8b] transition hover:text-[#10233d]">Daftar sekarang</Link>
            </p>
          </div>
          <p className="login-field-enter login-delay-5 mt-8 text-center text-[10px] font-semibold tracking-wide text-slate-400">DAK-PRO · Ruang kerja operasional Anda</p>
        </section>
      </div>
      </div>
    </div>
  );
}