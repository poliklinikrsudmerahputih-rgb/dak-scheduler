"use client"; 
import { useState } from "react";
import Link from "next/link"; 
import { usePathname, useRouter } from "next/navigation";
import { 
  Users, Stethoscope, Calendar, PlaneTakeoff, Timer, Sparkles,
  LayoutDashboard, Menu, X, Code, Cpu, LogOut, BrainCircuit, ChevronRight, ShieldCheck
} from "lucide-react";

export default function DashboardLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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

  const menuGroups = [
    {
      title: "Ruang kerja",
      items: [
        { name: "Dashboard", icon: <LayoutDashboard size={19}/>, href: "/" },
        { name: "Analisis & Intelegensi", icon: <BrainCircuit size={19}/>, href: "/analisis" },
      ],
    },
    {
      title: "Data & jadwal",
      items: [
        { name: "Master SDM", icon: <Users size={19}/>, href: "/sdm" },
        { name: "Master Dokter", icon: <Stethoscope size={19}/>, href: "/dokter" },
        { name: "Buat Jadwal", icon: <Calendar size={19}/>, href: "/buat-jadwal" },
        { name: "Cuti SDM", icon: <PlaneTakeoff size={19}/>, href: "/cuti-sdm" },
        { name: "Cuti Dokter", icon: <PlaneTakeoff size={19}/>, href: "/cuti-dokter" },
      ],
    },
    {
      title: "Dokumen & evaluasi",
      items: [
        { name: "Manajemen SPO + AI", icon: <Sparkles size={19}/>, href: "/spo-generator" },
        { name: "Observasi & TLX", icon: <Timer size={19}/>, href: "/observasi-kerja" },
      ],
    },
  ];

  return (
    <div className="dak-dashboard flex h-screen overflow-hidden bg-[#f3f6fb] font-sans antialiased">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
        aria-expanded={isOpen}
        className="fixed left-4 top-4 z-[100] grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-[#10233d] text-white shadow-xl shadow-slate-900/20 transition hover:bg-[#087e8b] hover:shadow-teal-900/20 print:hidden sm:left-6 sm:top-5"
       suppressHydrationWarning={true}>
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`
        fixed inset-y-0 left-0 z-[90] flex w-[min(19rem,calc(100vw-2rem))] flex-col border-r border-white/10 bg-[#0b1729] text-white shadow-[24px_0_70px_-25px_rgba(2,12,27,0.7)] transition-transform duration-300 ease-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} 
        print:hidden
      `}>
        <div className="relative overflow-hidden border-b border-white/10 px-6 pb-6 pt-6">
          <div className="absolute -right-4 -top-8 text-white/[0.035]">
            <Cpu size={130} />
          </div>
          <div className="relative z-10 flex items-center gap-3 pl-14">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-teal-400/20 to-blue-400/10 text-teal-200 ring-1 ring-white/10">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-[-0.06em] text-white">DAK<span className="text-teal-300">-PRO</span></h1>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Workspace</p>
            </div>
          </div>
        </div>
        
        <nav aria-label="Menu utama" className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                        isActive
                          ? "border-teal-300/20 bg-gradient-to-r from-teal-500/20 to-blue-500/10 text-white shadow-inner shadow-teal-950/10"
                          : "border-transparent text-slate-400 hover:border-white/5 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                        isActive ? "bg-teal-300/15 text-teal-200" : "text-slate-500 group-hover:text-teal-200"
                      }`}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] font-semibold">{item.name}</span>
                      {isActive && <ChevronRight size={15} className="text-teal-300" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <button 
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-red-300 transition hover:border-red-300/10 hover:bg-red-400/10"
           suppressHydrationWarning={true}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-400/10"><LogOut size={17} /></span>
            <span className="text-[13px] font-semibold">Keluar dari akun</span>
          </button>
        </nav>

        <div className="border-t border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-300/10 text-teal-200">
              <Code size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-white">Daniel Ari Kristianto</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">DAK-PRO · v2.5</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="custom-scrollbar relative flex-1 overflow-y-auto bg-[#f3f6fb]">
        {isOpen && (
          <div 
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-[80] cursor-pointer bg-slate-950/55 backdrop-blur-sm print:hidden"
          ></div>
        )}
        
        <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 pb-6 pt-4 sm:px-7 sm:pb-8 sm:pt-5 xl:px-10">
          <header className="sticky top-0 z-40 -mx-4 mb-6 flex min-h-[4.5rem] items-center justify-between border-b border-slate-200/80 bg-[#f3f6fb]/90 pl-[4.5rem] pr-4 backdrop-blur-xl sm:-mx-7 sm:pl-[5.25rem] sm:pr-7 xl:-mx-10 xl:pr-10 print:hidden">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#087e8b]">DAK-PRO · Workspace</p>
              <p className="mt-0.5 truncate text-sm font-bold text-[#10233d]">
                {menuGroups.flatMap((group) => group.items).find((item) => item.href === pathname)?.name || "Ruang kerja"}
              </p>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-slate-600">Sistem aktif</span>
            </div>
          </header>
          <div className="flex-1">
            {children}
          </div>
          
          <footer className="mt-12 border-t border-slate-200/80 py-6 text-center print:hidden">
             <p className="text-[10px] font-semibold tracking-wide text-slate-400">
               DAK-PRO <span className="mx-1.5 text-slate-300">·</span> Dikembangkan oleh <span className="font-bold text-slate-500">Daniel Ari Kristianto</span>
             </p>
          </footer>
        </div>
      </main>
    </div>
  );
}