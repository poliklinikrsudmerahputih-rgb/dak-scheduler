"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Hospital, Lock, User, ArrowLeft, Building, Loader2, HelpCircle, KeyRound } from "lucide-react";

export default function Register() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    kode_rs: "", // Tambahan untuk Multi-Tenant Turso
    nama: "",
    username: "",
    password: "",
    ruangan: "POLIKLINIK",
    role: "admin_ruangan",
    pertanyaan: "Apa nama hewan peliharaan pertama anda?", // Tambahan untuk keamanan
    jawaban: "" // Tambahan untuk keamanan
  });

  const daftarRuangan = [
    "POLIKLINIK", "IGD", "ICU", "RAWAT INAP", "KAMAR OPERASI", "LABORATORIUM", "FARMASI"
  ];

  const daftarPertanyaan = [
    "Apa nama hewan peliharaan pertama anda?",
    "Di kota mana ibu anda lahir?",
    "Siapa nama teman sebangku saat SD?",
    "Apa makanan favorit anda saat kecil?"
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
        alert("✅ " + (data.message || "Akun berhasil dibuat! Silakan Login."));
        // Otomatis kembali ke layar Login setelah berhasil
        router.push("/login");
      } else {
        alert("❌ Gagal: " + data.error);
      }
    } catch (err) {
      alert("❌ Terjadi kesalahan koneksi server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans py-12">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-blue-600 p-8 text-white text-center">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">DAK-PRO REGISTER</h1>
          <p className="text-xs font-bold text-blue-100 mt-2 tracking-widest uppercase">Pendaftaran Akun Ruangan</p>
        </div>

        <form onSubmit={handleRegister} className="p-8 space-y-5">
          
          {/* Kode Rumah Sakit / Faskes */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-blue-600 uppercase ml-2 tracking-widest">Kode Faskes / RS</label>
            <div className="relative">
              <Building className="absolute left-4 top-3.5 text-blue-600" size={18} />
              <input 
                required
                type="text" 
                placeholder="Contoh: RSUDMP"
                className="w-full pl-12 pr-4 py-3.5 bg-blue-50 border-none rounded-2xl text-sm font-black text-blue-800 uppercase focus:ring-2 focus:ring-blue-500"
                value={formData.kode_rs}
                onChange={(e) => setFormData({...formData, kode_rs: e.target.value.toUpperCase()})}
              />
            </div>
          </div>

          {/* Nama Lengkap */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nama Lengkap</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input 
                required
                type="text" 
                placeholder="NAMA LENGKAP & GELAR"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold uppercase focus:ring-2 focus:ring-blue-500"
                value={formData.nama}
                onChange={(e) => setFormData({...formData, nama: e.target.value.toUpperCase()})}
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

          {/* Pilihan Ruangan */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Unit Kerja / Ruangan</label>
            <div className="relative">
              <Hospital className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <select 
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500"
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

          {/* Pertanyaan Keamanan */}
          <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-4">
            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest text-center">Pemulihan Akun</p>
            <div className="space-y-1">
              <div className="relative">
                <HelpCircle className="absolute left-3 top-3 text-orange-400" size={16} />
                <select 
                  className="w-full pl-10 pr-3 py-2.5 bg-white border-none rounded-xl text-xs font-bold text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-orange-400"
                  value={formData.pertanyaan}
                  onChange={(e) => setFormData({...formData, pertanyaan: e.target.value})}
                >
                  {daftarPertanyaan.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 text-orange-400" size={16} />
                <input 
                  required
                  type="text" 
                  placeholder="Jawaban keamanan..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-orange-400"
                  value={formData.jawaban}
                  onChange={(e) => setFormData({...formData, jawaban: e.target.value})}
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 disabled:opacity-50"
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