"use client";
import React, { useState, useEffect } from "react";
import { format, getDaysInMonth } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { 
  Users, Stethoscope, Share2, ChevronDown, ShieldCheck, 
  Activity, UserCheck, Clock, AlertCircle, Cpu, Calendar, 
  HeartPulse, Save, RefreshCw, ArrowLeftRight, TrendingUp,
  CheckCircle2, Loader2, Search, Medal,
  FileText, CalendarRange, Download, ClipboardList, Edit3
} from "lucide-react";

const getDashboardCacheScope = () => {
  if (typeof document === "undefined") return "server";
  const cookieValue = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("session_dak_pro="))
    ?.slice("session_dak_pro=".length);
  if (!cookieValue) return "unauthenticated";

  try {
    const session = JSON.parse(decodeURIComponent(cookieValue));
    return String(session?.ruangan || "POLIKLINIK").trim().toUpperCase();
  } catch {
    return "invalid-session";
  }
};

const getPatientCount = (doctor) => {
  const value = doctor?.jumlah_pasien_poli
    || doctor?.jumlah_pasien
    || doctor?.total_pasien_hari_ini
    || doctor?.total_pasien
    || 0;
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
};

const getMonthlyPatientCount = (doctor) => {
  const count = Number(doctor?.total_pasien_bulanan || doctor?.total_pasien || 0);
  return Number.isFinite(count) ? count : 0;
};

const getPatientDoctorKey = (doctor) => {
  const id = String(doctor?.id ?? "").trim();
  if (id) return `id:${id}`;

  const namaDokter = String(doctor?.nama_dokter ?? "").trim().toUpperCase();
  const klinik = String(doctor?.klinik ?? "").trim().toUpperCase();
  return `doctor:${namaDokter}|clinic:${klinik}`;
};

export default function DashboardUtama() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [pasienInputValues, setPasienInputValues] = useState({});
  const [editingStatus, setEditingStatus] = useState({});
  
  // State Filter Waktu (Dropdown Tanggal di Dashboard)
  const [tanggal, setTanggal] = useState(new Date().getDate());
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const tanggalPasienKey = `${tahun}-${String(bulan).padStart(2, "0")}-${String(tanggal).padStart(2, "0")}`;
  const dashboardUrl = `/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}`;
  const dashboardCacheScope = getDashboardCacheScope();
  const {
    data,
    error: dashboardError,
    isLoading: loading,
    mutate: mutateDashboard
  } = useSWR([dashboardUrl, dashboardCacheScope], async ([url]) => {
    const response = await fetch(url);
    if (response.status === 401) {
      router.push("/login");
      return null;
    }
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}.`);
    return response.json();
  }, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    refreshInterval: 300000
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [swapData, setSwapData] = useState({ sdmA: "", sdmB: "" });

  // STATE BARU: MODAL DOWNLOAD LAPORAN
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [rentangDownload, setRentangDownload] = useState({
    awal: format(new Date(tahun, bulan - 1, 1), "yyyy-MM-dd"), // Default 1 bulan ini
    akhir: format(new Date(), "yyyy-MM-dd") // Default hari ini
  });

  useEffect(() => {
    if (!data?.dokterPraktik) return;
    setPasienInputValues((previous) => {
      const next = { ...previous };
      data.dokterPraktik.forEach((dok) => {
        const doctorKey = getPatientDoctorKey(dok);
        const cardKey = `${doctorKey}_${tanggalPasienKey}`;
        if (next[cardKey] === undefined) {
          next[cardKey] = getPatientCount(dok);
        }
      });
      return next;
    });
  }, [data, tanggalPasienKey]);

  useEffect(() => {
    if (dashboardError) console.error("Gagal sinkronisasi dashboard:", dashboardError);
  }, [dashboardError]);

  const handleUpdatePasienSpesifik = async (dok) => {
    const doctorKey = getPatientDoctorKey(dok);
    const cardKey = `${doctorKey}_${tanggalPasienKey}`;
    const inputValue = pasienInputValues[cardKey];
    const jmlTotal = Number(inputValue);
    const namaDokter = String(dok?.nama_dokter || "").trim();
    const klinik = String(dok?.klinik || "").trim();
    const payload = { nama_dokter: namaDokter, klinik, tanggal, bulan, tahun, jumlah: jmlTotal };

    console.log("PAYLOAD SIMPAN:", payload);

    const tanggalValid = Number.isInteger(tanggal) && Number.isInteger(bulan) && Number.isInteger(tahun)
      && bulan >= 1 && bulan <= 12 && tanggal >= 1
      && tanggal <= getDaysInMonth(new Date(tahun, bulan - 1)) && tahun > 0;
    if (!namaDokter || !klinik || !tanggalValid) {
      return alert("Data dokter atau tanggal tidak valid. Muat ulang halaman lalu coba lagi.");
    }
    if (inputValue === "" || inputValue == null || !Number.isSafeInteger(jmlTotal) || jmlTotal < 0) {
      return alert("Isi jumlah pasien!");
    }
    
    setSubmitting(true);
    try {
      const res = await fetch("/api/jadwal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login");
        throw new Error("Sesi berakhir. Silakan login kembali.");
      }
      if (!res.ok || result.success !== true) {
        throw new Error(result.error || result.message || `Server merespons dengan status ${res.status}.`);
      }

      setPasienInputValues((previous) => ({ ...previous, [cardKey]: jmlTotal }));
      setEditingStatus((previous) => ({ ...previous, [cardKey]: false }));
      await mutateDashboard((current) => {
        if (!current || !Array.isArray(current.dokterPraktik)) return current;
        return {
          ...current,
          dokterPraktik: current.dokterPraktik.map((item) => {
            const itemKey = getPatientDoctorKey(item);
            return itemKey === doctorKey ? { ...item, jumlah_pasien_poli: jmlTotal } : item;
          })
        };
      }, { revalidate: false });
      void mutateDashboard().catch((error) => {
        console.error("Gagal memperbarui data dashboard:", error);
      });
      alert(`✅ TERSIMPAN: ${namaDokter} - ${jmlTotal} Pasien`);
    } catch (error) {
      console.error("Error Simpan Pasien:", error);
      alert("Gagal menyimpan!");
    }
    finally { setSubmitting(false); }
  };

  const handleSwapDB = async () => {
    if (!swapData.sdmA || !swapData.sdmB) return alert("Pilih kedua perawat!");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jadwal/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...swapData, tanggal, bulan, tahun })
      });
      if (res.ok) {
        alert("🔄 Penugasan Berhasil Ditukar!");
        setShowSwap(false);
        setSwapData({ sdmA: "", sdmB: "" });
        void mutateDashboard().catch((error) => {
          console.error("Gagal memperbarui data dashboard:", error);
        });
      }
    } catch (e) { alert("Gagal swap."); }
    finally { setSubmitting(false); }
  };

  const shareLink = () => {
    const link = window.location.origin + "/view-jadwal";
    navigator.clipboard.writeText(link);
    alert("✅ Link Monitoring Online Berhasil Disalin!");
  };

  // --- FITUR BARU: EKSEKUSI DOWNLOAD DENGAN RENTANG WAKTU & BOBOT ---
  const executeDownloadLaporan = async () => {
    if (!rentangDownload.awal || !rentangDownload.akhir) return alert("Pilih rentang tanggal terlebih dahulu!");
    
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/dashboard?tglAwal=${rentangDownload.awal}&tglAkhir=${rentangDownload.akhir}`);
      const dataLaporan = await res.json();

      if (!dataLaporan || !dataLaporan.dokterPraktik || !dataLaporan.leaderboard) {
        throw new Error("Gagal mengambil data dari server");
      }

      const tglAwalIndo = format(new Date(rentangDownload.awal), "dd MMMM yyyy", { locale: id });
      const tglAkhirIndo = format(new Date(rentangDownload.akhir), "dd MMMM yyyy", { locale: id });

      const wordHeader = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <style>
            @page Section1 { size: 595.3pt 841.9pt; mso-page-orientation: portrait; margin: 2cm; }
            div.Section1 { page: Section1; font-family: 'Arial', sans-serif; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 11pt; }
            th, td { border: 1pt solid black; padding: 6px; text-align: left; }
            th { background-color: #e2e8f0; text-align: center; font-weight: bold; }
            .center { text-align: center; }
            .title { font-size: 14pt; font-weight: bold; text-align: center; }
            .subtitle { font-size: 12pt; text-align: center; margin-bottom: 25px; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <div class="title">RSUD MERAH PUTIH KABUPATEN MAGELANG</div>
            <div class="subtitle">
              LAPORAN KINERJA RUANG RAWAT JALAN<br/>
              PERIODE: ${tglAwalIndo.toUpperCase()} s.d ${tglAkhirIndo.toUpperCase()}
            </div>

            <p><b>A. REKAPITULASI KUNJUNGAN PASIEN PER KLINIK</b></p>
            <table>
              <tr>
                <th style="width: 8%;">NO</th>
                <th>NAMA DOKTER</th>
                <th>UNIT KLINIK</th>
                <th style="width: 25%;">TOTAL PASIEN</th>
              </tr>
              ${dataLaporan.dokterPraktik.map((dok, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${dok.nama_dokter}</td>
                  <td>${dok.klinik}</td>
                  <td class="center"><b>${dok.total_pasien_bulanan || 0}</b> Pasien</td>
                </tr>
              `).join('')}
            </table>

            <br/>

            <p><b>B. REKAPITULASI BEBAN KERJA ASISTEN (BOBOT KLINIK)</b></p>
            <table>
              <tr>
                <th style="width: 8%;">NO</th>
                <th>NAMA PERAWAT / ASISTEN</th>
                <th>UNIT POLI DIBANTU</th>
                <th style="width: 25%;">SKOR BEBAN KERJA</th>
              </tr>
              ${dataLaporan.leaderboard.map((item, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${item.nama}</td>
                  <td>${item.detail_poli || "Cadangan/Lainnya"}</td>
                  <td class="center"><b>${item.total_pasien_bulanan || item.total_pasien || 0}</b> Poin</td>
                </tr>
              `).join('')}
            </table>

            <br/><br/>
            
            <table style="border:none; width:100%;">
              <tr>
                <td style="border:none; text-align:center; width:50%;"></td>
                <td style="border:none; text-align:center; width:50%;">
                  Magelang, ${tglAkhirIndo}<br/>
                  Koordinator Rawat Jalan<br/><br/><br/><br/><br/>
                  <u><b>DANIEL ARI KRISTIANTO, S.Kep., Ns</b></u><br/>
                  NIP. 199303042019031006
                </td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff', wordHeader], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Laporan_Kinerja_Poli_${rentangDownload.awal}_to_${rentangDownload.akhir}.doc`;
      link.click();
      
      setShowDownloadModal(false);
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat memproses data laporan. Coba lagi.");
    } finally {
      setIsDownloading(false);
    }
  };

  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const jumlahHari = getDaysInMonth(new Date(tahun, bulan - 1));
  const daftarHari = Array.from({ length: jumlahHari }, (_, i) => i + 1);
  const labelHariIni = format(new Date(tahun, bulan-1, tanggal), "eeee, dd MMMM yyyy", { locale: id });

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 font-black text-blue-400 uppercase text-[10px] tracking-[0.5em] animate-pulse">
      <Cpu size={40} className="mb-4 animate-spin" />
      Syncing Intelligence System...
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-8 bg-slate-50 min-h-screen pb-20 font-sans">
      
      {/* --- HEADER DASHBOARD --- */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900 p-8 md:p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Activity size={250} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 text-blue-400">
            <ShieldCheck size={18}/>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic leading-none text-blue-300">Central Intelligence Dashboard</p>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none italic drop-shadow-lg text-white">
            DAK-<span className="text-blue-500">SYSTEMS</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 mt-6 flex items-center gap-2 uppercase tracking-widest leading-none bg-white/5 w-fit px-4 py-2 rounded-full border border-white/10 italic">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Unit: {data?.summary?.ruangan || "POLIKLINIK"} • {labelHariIni}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto relative z-10">
          <div className="flex gap-2 w-full lg:w-auto">
             <select 
                value={tanggal} 
                onChange={(e) => setTanggal(parseInt(e.target.value))}
                className="bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-xs font-black uppercase text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
             >
                {daftarHari.map(d => <option key={d} value={d} className="text-slate-800">Tgl {d}</option>)}
             </select>
             <select 
                value={bulan} 
                onChange={(e) => setBulan(parseInt(e.target.value))}
                className="bg-white/10 border border-white/20 rounded-2xl px-8 py-4 text-xs font-black uppercase text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
             >
                {namaBulan.map((nama, idx) => (
                  <option key={idx} value={idx + 1} className="text-slate-800">{nama}</option>
                ))}
             </select>
          </div>
          <button onClick={shareLink} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center gap-2" suppressHydrationWarning={true}>
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      {/* --- STATS GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Users />} label="Total SDM" value={data?.summary?.totalSDM} color="blue" sub="Personil" />
        <StatCard icon={<Stethoscope />} label="Dokter Unik" value={data?.summary?.totalDokter} color="indigo" sub="Master" />
        <StatCard icon={<Activity />} label="Perawat Masuk" value={data?.summary?.perawatMasuk} color="emerald" sub="Dinas" />
        <StatCard icon={<AlertCircle />} label="Izin/Cuti" value={data?.summary?.sdmIzinCount} color="red" sub="Bulan Ini" />
      </div>

      {/* --- CONTROL PANEL --- */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col lg:flex-row gap-6 items-center">
        <div className="flex-1 flex items-center gap-4 bg-slate-50 px-8 py-4 rounded-2xl w-full">
          <Search size={20} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search Polyclinic Activity..." 
            className="bg-transparent border-none outline-none text-xs font-black w-full uppercase"
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            suppressHydrationWarning={true}
          />
        </div>
        <button onClick={() => setShowSwap(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200" suppressHydrationWarning={true}>
           <RefreshCw size={18} /> Tukar Asisten
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* --- KOLOM KIRI: TIM PELAYANAN & INPUT --- */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data?.dokterPraktik?.filter(d => d.nama_dokter.toLowerCase().includes(searchTerm.toLowerCase())).map((dok) => {
              const doctorKey = getPatientDoctorKey(dok);
              const cardKey = `${doctorKey}_${tanggalPasienKey}`;
              const patientCount = getPatientCount(dok);
              const monthlyPatientCount = getMonthlyPatientCount(dok);
              const isEditing = Boolean(editingStatus[cardKey]);
              return (
              <div key={cardKey} className={`bg-white p-8 rounded-[3.5rem] border-2 transition-all hover:shadow-2xl relative overflow-hidden group ${dok.isCuti ? 'border-red-100 opacity-60 bg-red-50/20' : 'border-white hover:border-blue-500'}`}>
                <div className="flex justify-between items-start mb-6">
                   <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xs italic shadow-lg ${dok.isCuti ? 'bg-red-400 text-white' : 'bg-slate-900 text-white'}`}>
                    {dok.simbol_praktik}
                   </div>
                </div>

                <h4 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter leading-tight">{dok.nama_dokter}</h4>
                <p className="text-[10px] font-bold text-blue-600 uppercase mt-1 tracking-widest">{dok.klinik}</p>
                
                {/* FITUR BARU: TOTAL PASIEN BULANAN */}
                {!dok.isCuti && (
                  <div className="mt-3 inline-block bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg">
                    <p className="text-[9px] font-black text-blue-700 uppercase italic tracking-widest">
                      Kunjungan Bulan Ini: {monthlyPatientCount} Pasien
                    </p>
                  </div>
                )}
                
                {!dok.isCuti ? (
                  <div className="mt-6 space-y-4">
                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 group-hover:bg-slate-100/50 transition-colors">
                      <p className="text-[8px] font-black text-slate-400 uppercase italic mb-3 flex items-center gap-1">
                        <UserCheck size={12} className="text-blue-500" /> Tim Asisten:
                      </p>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {dok.timAsisten?.map((as, i) => (
                          <div key={i} className="text-[9px] font-black uppercase italic text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1 shadow-sm">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> {as.nama}
                          </div>
                        ))}
                      </div>

                      {patientCount > 0 && !isEditing ? (
                        <div className="flex items-center justify-between gap-2 border-t border-slate-200/50 pt-4">
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] font-black uppercase text-emerald-700">
                            <CheckCircle2 size={13} /> Tercatat: {patientCount} Pasien
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStatus((previous) => ({ ...previous, [cardKey]: true }));
                              setPasienInputValues((previous) => ({ ...previous, [cardKey]: patientCount }));
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-600"
                            title="Edit jumlah pasien"
                            aria-label={`Edit jumlah pasien ${dok.nama_dokter}`}
                            suppressHydrationWarning={true}
                          >
                            <Edit3 size={15} />
                          </button>
                        </div>
                      ) : (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleUpdatePasienSpesifik(dok);
                          }}
                          className="flex items-end gap-2 border-t border-slate-200/50 pt-4"
                        >
                          <label className="flex-1">
                            <span className="mb-2 ml-1 block text-[8px] font-black uppercase tracking-widest text-slate-400">Jumlah Pasien</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-bold text-blue-900 outline-none focus:border-blue-500"
                              value={pasienInputValues[cardKey] !== undefined ? pasienInputValues[cardKey] : patientCount}
                              onChange={(event) => {
                                setPasienInputValues((previous) => ({ ...previous, [cardKey]: event.target.value }));
                                setEditingStatus((previous) => ({ ...previous, [cardKey]: true }));
                              }}
                              placeholder="Total pasien"
                              suppressHydrationWarning={true}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleUpdatePasienSpesifik(dok)}
                            disabled={submitting}
                            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-[9px] font-black uppercase text-white hover:bg-blue-800 disabled:opacity-60"
                            title="Simpan jumlah pasien"
                            suppressHydrationWarning={true}
                          >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPasienInputValues((previous) => ({ ...previous, [cardKey]: patientCount }));
                              setEditingStatus((previous) => ({ ...previous, [cardKey]: false }));
                            }}
                            disabled={submitting}
                            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-[9px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            suppressHydrationWarning={true}
                          >
                            Batal
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 p-10 bg-red-100/30 rounded-[2.5rem] text-center border-2 border-dashed border-red-200">
                      <AlertCircle size={40} className="mx-auto text-red-300 mb-4" />
                      <p className="text-[11px] font-black text-red-600 uppercase italic tracking-widest">Dokter Izin / Berhalangan</p>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* FITUR BARU: PUSAT UNDUHAN LAPORAN */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-[3.5rem] p-8 mt-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 border border-blue-700">
            <div className="absolute -left-10 -top-10 opacity-10"><ClipboardList size={150} /></div>
            <div className="relative z-10 flex-1 text-center md:text-left">
              <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-2 flex items-center justify-center md:justify-start gap-3">
                <Download size={20} className="text-blue-400"/> Laporan Kinerja
              </h3>
              <p className="text-[10px] text-blue-200 font-bold leading-relaxed">
                Export data beban kerja staf (Telah terhitung Bobot Tindakan Klinik) berdasarkan rentang waktu yang disesuaikan untuk lampiran SKP bulanan.
              </p>
            </div>
            <button 
              onClick={() => setShowDownloadModal(true)}
              className="relative z-10 whitespace-nowrap bg-white text-blue-900 px-8 py-5 rounded-[2rem] font-black uppercase text-[10px] shadow-xl hover:scale-105 transition-transform flex items-center gap-2 border-b-4 border-blue-200"
              suppressHydrationWarning={true}
            >
               <FileText size={16} className="text-blue-600"/> Generate Rekap
            </button>
          </div>

          {/* --- LEADERBOARD BEBAN KERJA (POOLING) --- */}
          <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100 mt-6">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center italic">
              <h3 className="text-sm font-black uppercase tracking-widest pl-4 border-l-4 border-blue-500 flex items-center gap-3">
                <TrendingUp size={18} /> Skor Beban Kerja Hari Ini
              </h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black uppercase italic tracking-widest text-slate-400">
                  <th className="p-8">Nama Staf</th>
                  <th className="p-8 text-center">Skor Beban</th>
                  <th className="p-8 text-left">Unit Dibantu</th>
                  <th className="p-8 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs font-bold uppercase tracking-tighter">
                {data?.leaderboard?.map((item, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/30 transition-all">
                    <td className="p-8">
                      <p className="text-slate-800 font-black italic">{item.nama}</p>
                      <p className="text-[7px] text-slate-400 mt-1 uppercase italic font-black tracking-widest">Rank #{i+1}</p>
                    </td>
                    <td className="p-8 text-center">
                      <span className={`px-5 py-3 rounded-2xl font-black text-sm ${(item.total_pasien_bulanan || item.total_pasien) > 0 ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-slate-100 text-slate-300'}`}>
                        {item.total_pasien_bulanan || item.total_pasien || 0}
                      </span>
                    </td>
                    <td className="p-8 max-w-[200px]">
                      <p className="text-[8px] text-blue-600 font-black italic uppercase leading-relaxed bg-blue-50 p-3 rounded-xl border border-blue-100">
                        協助 {item.detail_poli || "---"}
                      </p>
                    </td>
                    <td className="p-8 text-center">
                      {(item.total_pasien_bulanan || item.total_pasien) > 0 ? (
                        <span className="text-emerald-500 flex items-center justify-center gap-2 italic text-[8px] font-black tracking-widest"><CheckCircle2 size={12}/> UPDATED</span>
                      ) : (
                        <span className="text-red-400 flex items-center justify-center gap-2 animate-pulse italic text-[8px] font-black tracking-widest"><AlertCircle size={12}/> PENDING</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- KOLOM KANAN: MONITOR IZIN --- */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-4">
            <div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div>
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin Bulan Ini</h3>
          </div>
          <div className="bg-white p-2 rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
            <div className="max-h-[800px] overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {data?.sdmCuti?.map((s, i) => (
                <div key={i} className={`p-6 rounded-[2.5rem] border-l-8 flex justify-between items-center shadow-lg border transition-all ${s.status_acc === 'Disetujui' ? 'bg-white border-emerald-100 border-l-emerald-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                  <div className="max-w-[180px]">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-md italic">{s.jenis_cuti}</span>
                        <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none truncate italic">{s.nama_sdm}</h4>
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{s.tgl_mulai} - {s.tgl_selesai}</p>
                    <p className="text-[8px] text-slate-400 mt-2 italic font-bold tracking-tight uppercase truncate">Ket: {s.alasan || "-"}</p>
                  </div>
                  {s.status_acc === 'Disetujui' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Clock size={16} className="text-amber-500 animate-spin-slow" />}
                </div>
              ))}
            </div>
          </div>

          <div className="p-10 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group border border-white/5">
            <Cpu className="absolute -right-8 -bottom-8 text-white/5 group-hover:text-blue-500/10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-1000" size={180} />
            <div className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em] mb-6 italic leading-none flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div> CORE SYSTEM
            </div>
            <p className="text-xs font-medium text-slate-300 leading-relaxed mb-10 italic">
              Sistem diproses menggunakan enkripsi <span className="text-white font-black underline decoration-blue-500">TURSO DB</span> untuk akurasi penjadwalan personil poliklinik secara real-time.
            </p>
            <div className="flex items-center gap-4 pt-8 border-t border-white/10 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-blue-500 flex items-center justify-center font-black text-white text-xs shadow-lg shadow-blue-500/20">DAK</div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest leading-none mb-1 text-white">Daniel Ari Kristianto</p>
                <p className="text-[9px] font-bold text-blue-400 uppercase italic leading-none tracking-tighter">Coordinator of Outpatient Unit</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODAL SWAP LUAS --- */}
      {showSwap && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-500 pl-4 flex items-center gap-3">
              <RefreshCw size={24} className="text-blue-500" /> Manajemen Tukar Tugas
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat A (Asal)</label>
                <select value={swapData.sdmA} onChange={(e) => setSwapData({...swapData, sdmA: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none">
                  <option value="">-- PILIH PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (<option key={`A-${item.id}`} value={item.id}>{item.nama} ({item.detail_poli || "Cadangan"})</option>))}
                </select>
              </div>
              <div className="flex justify-center py-2"><ArrowLeftRight size={30} className="text-blue-500 animate-pulse" /></div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat B (Tujuan)</label>
                <select value={swapData.sdmB} onChange={(e) => setSwapData({...swapData, sdmB: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none">
                  <option value="">-- PILIH PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (<option key={`B-${item.id}`} value={item.id}>{item.nama} ({item.detail_poli || "Cadangan"})</option>))}
                </select>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowSwap(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors" suppressHydrationWarning={true}>Batal</button>
                <button onClick={handleSwapDB} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl italic tracking-widest border-b-4 border-blue-700" suppressHydrationWarning={true}>EKSEKUSI TUKAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DOWNLOAD RENTANG TANGGAL --- */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-500 pl-4 flex items-center gap-3">
              <CalendarRange size={24} className="text-blue-500" /> Filter Data Laporan
            </h3>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Mulai (Awal)</label>
                <input 
                  type="date"
                  value={rentangDownload.awal}
                  onChange={(e) => setRentangDownload({...rentangDownload, awal: e.target.value})}
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none focus:border-blue-500 transition-all shadow-inner text-slate-700"
                  suppressHydrationWarning={true}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Selesai (Akhir)</label>
                <input 
                  type="date"
                  value={rentangDownload.akhir}
                  onChange={(e) => setRentangDownload({...rentangDownload, akhir: e.target.value})}
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none focus:border-blue-500 transition-all shadow-inner text-slate-700"
                  suppressHydrationWarning={true}
                />
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setShowDownloadModal(false)} 
                  className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                  suppressHydrationWarning={true}
                >
                  Batal
                </button>
                <button 
                  onClick={executeDownloadLaporan} 
                  disabled={isDownloading} 
                  className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-blue-800 flex items-center justify-center gap-2"
                  suppressHydrationWarning={true}
                >
                  {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isDownloading ? "MENYUSUN..." : "DOWNLOAD WORD"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center pt-12 pb-6 opacity-30">
        <p className="text-[9px] font-black uppercase tracking-[0.5em] italic">DAK-SYSTEMS INTELLIGENCE v.4.0 | RSUD MERAH PUTIH PRODUCTION</p>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  const colors = { 
    blue: "bg-blue-600 text-white shadow-blue-200", 
    emerald: "bg-emerald-600 text-white shadow-emerald-200", 
    indigo: "bg-slate-900 text-white shadow-slate-200",
    red: "bg-red-500 text-white shadow-red-200" 
  };
  const bgSoft = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    indigo: "bg-slate-100",
    red: "bg-red-50"
  };

  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex items-center gap-6 transition-all hover:-translate-y-3 hover:shadow-2xl hover:border-blue-100 group">
      <div className={`p-6 rounded-[2rem] shadow-lg transition-all duration-500 group-hover:rotate-12 ${colors[color]}`}>
        {React.cloneElement(icon, { size: 30 })}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-3 italic">{label}</p>
        <p className="text-5xl font-black text-slate-900 tracking-tighter mb-2 leading-none group-hover:text-blue-600 transition-colors">{value || 0}</p>
        <div className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none italic ${bgSoft[color]} ${color === 'blue' ? 'text-blue-600' : color === 'emerald' ? 'text-emerald-600' : color === 'red' ? 'text-red-600' : 'text-slate-500'}`}>
          {sub}
        </div>
      </div>
    </div>
  );
}