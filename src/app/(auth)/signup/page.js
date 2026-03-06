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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
      <div className="w-full max-w-[420px] space-y-6">
        
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-blue-600 rounded-3xl shadow-xl text-white mb-2">
            <UserPlus size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic">
            DAK-<span className="text-blue-600">REGISTER</span>
          </h1>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Create Your Staff Account</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-white">
          <form onSubmit={handleSignup} className="space-y-4">
            
            {msg.text && (
              <div className={`${msg.type === "success" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"} p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center border animate-pulse`}>
                {msg.text}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest italic">Informasi Akun</label>
              <input name="nama" placeholder="NAMA LENGKAP" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 outline-none" required />
              <input name="username" placeholder="USERNAME / ID" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 outline-none" required />
              <input name="password" type="password" placeholder="BUAT PASSWORD" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>

            {/* TAMBAHAN: PILIHAN RUANGAN (PENGGANTI RLS) */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-blue-600 uppercase ml-2 tracking-widest italic flex items-center gap-1">
                <Hospital size={10} /> Pilih Unit Kerja / Ruangan
              </label>
              <select name="ruangan" className="w-full bg-blue-50 border-none rounded-2xl p-4 text-xs font-black uppercase focus:ring-2 focus:ring-blue-500 outline-none text-blue-700" required>
                {daftarRuangan.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            
            <div className="pt-4 border-t border-slate-50">
              <label className="text-[9px] font-black text-amber-600 uppercase mb-2 block tracking-widest leading-none italic font-bold">
                <ShieldCheck size={10} className="inline mr-1" /> * Pengaman Reset Password
              </label>
              <select name="pertanyaan" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-[10px] font-bold uppercase mb-3 outline-none focus:ring-2 focus:ring-amber-500">
                <option value="Nama Ibu Kandung?">Nama Ibu Kandung?</option>
                <option value="Nama Sekolah SD Anda?">Nama Sekolah SD Anda?</option>
                <option value="Kota Kelahiran Anda?">Kota Kelahiran Anda?</option>
              </select>
              <input name="jawaban" placeholder="JAWABAN RAHASIA ANDA" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase focus:ring-2 focus:ring-amber-500 outline-none" required />
            </div>

            <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-900 transition-all active:scale-95 mt-4 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={16} /> : "Konfirmasi Pendaftaran"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-50 text-center">
            <Link href="/login" className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 flex items-center justify-center gap-2">
              <ArrowLeft size={12} /> Sudah punya akun? Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}