"use client"; // Kita butuh use client untuk fitur Burger Menu
import { useState } from "react";
import Link from "next/link"; 
import "./globals.css";
import { 
  Users, Stethoscope, Calendar, PlaneTakeoff, 
  LayoutDashboard, Menu, X, ShieldCheck, Code, Cpu 
} from "lucide-react";

// Metadata dipindah ke file layout terpisah jika perlu, 
// tapi untuk kemudahan branding kita set di sini jika bukan file metadata khusus.
const siteConfig = {
  title: "DAK-SCHEDULER PRO | Daniel Ari Kristianto",
  description: "Advanced Hospital Scheduling System by Daniel Ari Kristianto",
};

export default function RootLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const menu = [
    { name: "Dashboard", icon: <LayoutDashboard size={20}/>, href: "/" },
    { name: "Master SDM", icon: <Users size={20}/>, href: "/sdm" },
    { name: "Master Dokter", icon: <Stethoscope size={20}/>, href: "/dokter" },
    { name: "Buat Jadwal", icon: <Calendar size={20}/>, href: "/buat-jadwal" },
    { name: "Cuti SDM", icon: <PlaneTakeoff size={20}/>, href: "/cuti-sdm" },
    { name: "Cuti Dokter", icon: <PlaneTakeoff size={20}/>, href: "/cuti-dokter" },
  ];

  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <title>{siteConfig.title}</title>
        <meta name="description" content={siteConfig.description} />
      </head>
      <body className="flex h-screen bg-gray-100 font-sans antialiased overflow-hidden">
        
        {/* --- BURGER BUTTON (Hanya muncul di Mobile) --- */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-4 right-4 z-[100] p-3 bg-blue-600 text-white rounded-2xl shadow-lg md:hidden hover:bg-blue-700 transition-all"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* --- SIDEBAR DENGAN BRANDING DANIEL --- */}
        <aside className={`
          fixed inset-y-0 left-0 z-[90] w-72 bg-slate-900 text-white flex flex-col shadow-2xl transition-all duration-500 ease-in-out transform
          ${isOpen ? "translate-x-0" : "-translate-x-full"} 
          md:relative md:translate-x-0 print:hidden
        `}>
          
          {/* Logo & Brand */}
          <div className="p-8 border-b border-slate-800 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10 text-blue-400">
               <Cpu size={100} />
            </div>
            <h1 className="text-2xl font-black text-blue-500 tracking-tighter uppercase leading-none italic">
              DAK-<span className="text-white">PRO</span>
            </h1>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] mt-3 leading-none">
              System Engineering
            </p>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 px-4 py-8 overflow-y-auto space-y-1">
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
          </nav>

          {/* DEVELOPER SIGNATURE (Identitas Bapak) */}
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
        <main className="flex-1 overflow-y-auto relative print:overflow-visible bg-slate-50">
          {/* Overlay saat Sidebar terbuka di Mobile */}
          {isOpen && (
            <div 
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] md:hidden transition-opacity"
            ></div>
          )}
          
          <div className="p-4 md:p-10 max-w-[1600px] mx-auto">
            {children}
            
            {/* Footer Copyright */}
            <footer className="mt-20 py-10 border-t border-slate-200 text-center print:hidden">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                 Developed with Precision by <span className="text-blue-600 underline">Daniel Ari Kristianto</span>
               </p>
            </footer>
          </div>
        </main>

      </body>
    </html>
  );
}