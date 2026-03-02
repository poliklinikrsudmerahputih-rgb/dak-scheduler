"use client";
import React, { useState } from "react";
import { KeyRound, User, ShieldAlert, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  async function handleReset(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });

    const payload = {
      username: e.target.username.value,
      jawaban: e.target.jawaban.value,
      passwordBaru: e.target.passwordBaru.value,
    };

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (result.success) {
        setMsg({ type: "success", text: "✅ Berhasil! Silakan Login kembali." });
        setTimeout(() => window.location.href = "/login", 2000);
      } else {
        setMsg({ type: "error", text: "❌ " + result.error });
      }
    } catch (err) {
      setMsg({ type: "error", text: "❌ Gangguan koneksi ke Turso" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
      <div className="w-full max-w-[420px] space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
        
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-amber-500 rounded-3xl shadow-xl text-white mb-4">
            <ShieldAlert size={40} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">
            DAK-<span className="text-amber-600">RECOVERY</span>
          </h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Reset Access Credentials</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-white">
          <form onSubmit={handleReset} className="space-y-4">
            
            {msg.text && (
              <div className={`${msg.type === "success" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"} p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center border animate-pulse`}>
                {msg.text}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest italic">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-4 text-slate-300" size={18} />
                <input required name="username" className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all uppercase" placeholder="ID PEGAWAI" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest italic">Jawaban Rahasia Anda</label>
              <input required name="jawaban" className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all uppercase" placeholder="APA JAWABAN ANDA?" />
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-1">
              <label className="text-[9px] font-black text-amber-600 uppercase ml-2 tracking-widest italic font-bold">Password Baru</label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-4 text-slate-300" size={18} />
                <input required name="passwordBaru" type="password" className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all" placeholder="MIN. 8 KARAKTER" />
              </div>
            </div>

            <button disabled={loading} type="submit" className="w-full bg-amber-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 mt-4">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <><RefreshCw size={16} /> Update Password</>}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-50 text-center">
            <Link href="/login" className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Kembali ke Login</Link>
          </div>
        </div>

        <p className="text-center text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] italic">
          DAK-SYSTEM v.2.5 | Daniel Ari Kristianto
        </p>
      </div>
    </div>
  );
}