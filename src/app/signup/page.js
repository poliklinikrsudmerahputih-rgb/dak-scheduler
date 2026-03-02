// ... (Bagian Header & Icon sama dengan Login)
<div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-white">
  <form className="space-y-4">
    <input name="nama" placeholder="NAMA LENGKAP" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase" required />
    <input name="username" placeholder="USERNAME" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase" required />
    <input name="password" type="password" placeholder="BUAT PASSWORD" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase" required />
    
    <div className="pt-4 border-t border-slate-50">
      <label className="text-[9px] font-black text-amber-600 uppercase mb-2 block tracking-widest leading-none">* Pengaman Reset Password</label>
      <select name="pertanyaan" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-[10px] font-bold uppercase mb-3">
        <option>Nama Ibu Kandung?</option>
        <option>Nama Sekolah SD Anda?</option>
        <option>Kota Kelahiran Anda?</option>
      </select>
      <input name="jawaban" placeholder="JAWABAN ANDA" className="w-full bg-slate-50 border-none rounded-2xl p-4 text-xs font-bold uppercase" required />
    </div>

    <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-900 transition-all active:scale-95 mt-4">
      Konfirmasi Pendaftaran
    </button>
  </form>
</div>