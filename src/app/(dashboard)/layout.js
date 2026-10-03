"use client"; 
import { useState } from "react";
import Link from "next/link"; 
import { useRouter } from "next/navigation"; 
import { 
  Users, Stethoscope, Calendar, PlaneTakeoff, 
  LayoutDashboard, Menu, X, Code, Cpu, LogOut, TrendingUp, BrainCircuit
} from "lucide-react";

const siteConfig = {
  title: "DAK-SCHEDULER PRO | Daniel Ari Kristianto",
  description: "Advanced Hospital Scheduling System by Daniel Ari Kristianto",
};

export default function DashboardLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    const confirmLogout = confirm("Apakah Anda yakin ingin keluar dari DAK-PRO?");
    if (confirmLogout) {
      try {
        const res = await fetch("/api/logout", { method: "POST" });
        if (res.ok) {
          window.location.replace("/login"); 
        }
      } catch (error) {
        console.error("Logout gagal:", error);
      }
    }
  };

  const menu = [
    { name: "Dashboard", icon: <LayoutDashboard size={20}/>, href: "/" },
    { name: "Analisis & Intelligence", icon: <BrainCircuit size={20}/>, href: "/analisis" },
    { name: "Master SDM", icon: <Users size={20}/>, href: "/sdm" },
    { name: "Master Dokter", icon: <Stethoscope size={20}/>, href: "/dokter" },
    { name: "Buat Jadwal", icon: <Calendar size={20}/>, href: "/buat-jadwal" },
    { name: "Cuti SDM", icon: <PlaneTakeoff size={20}/>, href: "/cuti-sdm" },
    { name: "Cuti Dokter", icon: <PlaneTakeoff size={20}/>, href: "/cuti-dokter" },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans antialiased overflow-hidden">
      
      {/* --- BURGER BUTTON (Tampil di Semua Layar: HP & Desktop) --- */}
      {/* PERUBAHAN: Menghilangkan 'md:hidden' agar tombol burger selalu muncul */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-6 left-6 z-[100] p-3 md:p-4 bg-slate-900 text-white rounded-2xl shadow-2xl hover:bg-slate-800 hover:scale-105 transition-all print:hidden"
       suppressHydrationWarning={true}>
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* --- SIDEBAR (Model Drawer/Melayang) --- */}
      {/* PERUBAHAN: Menghilangkan 'md:relative md:translate-x-0' agar sidebar tidak permanen di desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-[90] w-72 bg-slate-900 text-white flex flex-col shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${isOpen ? "translate-x-0" : "-translate-x-full"} 
        print:hidden
      `}>
        
        {/* Logo & Brand (Diberi padding atas ekstra agar tidak tertutup tombol burger) */}
        <div className="pt-24 pb-8 px-8 border-b border-slate-800 relative overflow-hidden">
          <div className="absolute -right-4 top-10 opacity-10 text-blue-400">
             <Cpu size={100} />
          </div>
          <h1 className="text-2xl font-black text-blue-500 tracking-tighter uppercase leading-none italic relative z-10">
            DAK-<span className="text-white">PRO</span>
          </h1>
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] mt-3 leading-none relative z-10">
            System Engineering
          </p>
        </div>
        
        <nav className="flex-1 px-4 py-8 overflow-y-auto space-y-1 custom-scrollbar">
          {menu.map((item) => (
            <Link key={item.name} href={item.href} onClick={() => setIsOpen(false)}>
              <div className="flex items-center gap-4 w-full p-4 hover:bg-blue-600/10 rounded-2xl transition-all text-slate-400 hover:text-blue-400 group cursor-pointer border border-transparent hover:border-blue-500/20">
                <span className="group-hover:scale-110 transition-transform duration-300">
                  {item.icon}
                </span>
                <span className="text-sm font-bold tracking-wide">{item.name}</span>
              </div>
            </Link>
          ))}

          <button 
            onClick={handleLogout}
            className="flex items-center gap-4 w-full p-4 mt-10 text-red-400 hover:bg-red-600/10 rounded-2xl transition-all group border border-transparent hover:border-red-500/20"
           suppressHydrationWarning={true}>
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
            <span className="text-sm font-bold tracking-wide uppercase">Logout System</span>
          </button>
        </nav>

        <div className="p-6 border-t border-slate-800 bg-slate-950/50">
          <div className="flex flex-col items-center">
            <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 mb-3">
               <Code size={20} className="text-blue-500" />
            </div>
            <p className="text-[8px] text-slate-500 uppercase font-black tracking-[0.2em] mb-1">Lead Developer</p>
            <p className="text-xs font-black text-white text-center leading-tight">
              DANIEL ARI KRISTIANTO
            </p>
            <div className="mt-4 flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
               <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter italic">Version 2.5 Active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* --- AREA KONTEN UTAMA --- */}
      <main className="flex-1 w-full overflow-y-auto relative bg-slate-50 custom-scrollbar">
        
        {/* Overlay Gelap di Layar (Klik di luar menu untuk menutup) */}
        {isOpen && (
          <div 
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] cursor-pointer"
          ></div>
        )}
        
        {/* Padding atas ekstra di konten utama untuk memberi ruang bagi tombol burger yang mengambang di pojok kiri atas */}
        <div className="p-4 md:p-10 pt-24 md:pt-28 max-w-[1600px] mx-auto min-h-screen flex flex-col">
          
          <div className="flex-1">
            {children}
          </div>
          
          <footer className="mt-20 py-10 border-t border-slate-200 text-center print:hidden">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
               Developed with Precision by <span className="text-blue-600 underline">Daniel Ari Kristianto</span>
             </p>
          </footer>
        </div>
      </main>
    </div>
  );
}