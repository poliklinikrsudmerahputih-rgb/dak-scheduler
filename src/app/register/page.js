"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Hospital, Lock, User, ArrowLeft } from "lucide-react";

export default function Register() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nama: "",
    username: "",
    password: "",
    ruangan: "POLIKLINIK", // Default
    role: "admin_ruangan"
  });

  const daftarRuangan = [
    "POLIKLINIK", "IGD", "ICU", "RAWAT INAP", "KAMAR OPERASI", "LABORATORIUM", "FARMASI"
  ];

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        alert("✅ Akun berhasil dibuat! Silakan Login.");
        // Otomatis kembali ke layar Login setelah berhasil
        router.push("/login");
      } else {
        alert("❌ Gagal: " + data.error);
      }
    } catch (err) {
      alert("❌ Terjadi kesalahan koneksi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-blue-600 p-8 text-white text-center">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">DAK-PRO REGISTER</h1>
          <p className="text-xs font-bold text-blue-100 mt-2 tracking-widest uppercase">Pendaftaran Akun Ruangan</p>
        </div>

        <form onSubmit={handleRegister} className="p-8 space-y-5">
          {/* Nama Lengkap */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nama Lengkap</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input 
                required
                type="text" 
                placeholder="DANIEL ARI, S.KEP.NS"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
                value={formData.nama}
                onChange={(e) => setFormData({...formData, nama: e.target.value})}
              />
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">ID Pegawai / Username</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input 
                required
                type="text" 
                placeholder="Masukkan username"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
              />
            </div>
          </div>

          {/* Pilihan Ruangan (PENGGANTI RLS) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-blue-600 uppercase ml-2 tracking-widest">Unit Kerja / Ruangan</label>
            <div className="relative">
              <Hospital className="absolute left-4 top-3.5 text-blue-600" size={18} />
              <select 
                className="w-full pl-12 pr-4 py-3.5 bg-blue-50 border-none rounded-2xl text-sm font-black text-blue-700 appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500"
                value={formData.ruangan}
                onChange={(e) => setFormData({...formData, ruangan: e.target.value})}
              >
                {daftarRuangan.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Kata Sandi</label>
            <input 
              required
              type="password" 
              placeholder="••••••••"
              className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" /> : <UserPlus size={18} />}
            Daftar Akun Sekarang
          </button>

          <button 
            type="button"
            onClick={() => router.push("/login")}
            className="w-full text-slate-400 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={14} /> Kembali ke Login
          </button>
        </form>
      </div>
    </div>
  );
}