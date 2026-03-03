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
      const res = await fetch("/api/auth/login", {
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-[400px] space-y-8 animate-in fade-in zoom-in duration-500">
        
        {/* HEADER LOGO */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-slate-900 rounded-3xl shadow-2xl text-blue-500 mb-4">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            DAK-<span className="text-blue-600">AUTH</span>
          </h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Access Control Management</p>
        </div>

        {/* BOX LOGIN */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-white">
          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* ALERT ERROR */}
            {errorMsg && (
              <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center border border-red-100 animate-bounce">
                ❌ {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest leading-none">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-4 text-slate-300" size={18} />
                <input 
                  required 
                  name="username"
                  type="text" 
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-xs font-bold focus:ring-2 focus:ring-blue-600 outline-none transition-all uppercase" 
                  placeholder="ID PEGAWAI" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest leading-none">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-4 text-slate-300" size={18} />
                <input 
                  required 
                  name="password"
                  type="password" 
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-xs font-bold focus:ring-2 focus:ring-blue-600 outline-none transition-all" 
                  placeholder="••••••••" 
                />
              </div>
            </div>

            <button 
              disabled={loading} 
              type="submit" 
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <ChevronRight size={16} /> Verifikasi Akses
                </>
              )}
            </button>
          </form>

          {/* FOOTER BOX */}
          <div className="mt-8 pt-6 border-t border-slate-50 flex flex-col gap-3 text-center">
            <Link 
              href="/forgot-password" 
              className="text-[10px] font-black text-blue-600 uppercase tracking-tighter hover:underline"
            >
              Masalah Akses / Lupa Password?
            </Link>
            <p className="text-[9px] font-bold text-slate-300 uppercase">
              Belum punya akun? <Link href="/signup" className="text-slate-900 underline decoration-blue-500 decoration-2">Daftar Sekarang</Link>
            </p>
          </div>
        </div>

        {/* WATERMARK DEVELOPER */}
        <p className="text-center text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] italic">
          DAK-SYSTEM v.2.5 | Daniel Ari Kristianto
        </p>
      </div>
    </div>
  );
}