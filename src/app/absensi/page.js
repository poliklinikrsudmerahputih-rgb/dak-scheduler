"use client";
import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Camera, Loader2, ArrowLeft, AlertCircle, CheckCircle2, MapPin, LogIn, LogOut, Clock } from 'lucide-react';

function KameraKomponen() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const nama = searchParams.get('nama') || 'Staf Medis';
  const sdm_id = searchParams.get('sdm_id');
  const ruangan = searchParams.get('ruangan') || 'Poliklinik';

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [errorKamera, setErrorKamera] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sukses, setSukses] = useState(false);
  
  // State Baru: GPS dan Shift
  const [lokasiGPS, setLokasiGPS] = useState(null);
  const [statusGPS, setStatusGPS] = useState('Mencari sinyal GPS...');
  const [shiftAktif, setShiftAktif] = useState('PAGI (07:15 - 14:00)');
  const [tipeAbsen, setTipeAbsen] = useState('MASUK'); // MASUK atau PULANG

  // 1. Inisialisasi Kamera & GPS
  useEffect(() => {
    let streamReference = null;

    // Menyalakan Kamera
    async function jalankanKamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        streamReference = stream;
        setErrorKamera(null);
      } catch (err) {
        console.error("Gagal akses kamera:", err);
        setErrorKamera("Kamera ditolak. Pastikan akses HTTPS dan beri izin kamera di browser.");
      }
    }

    // Mendapatkan Lokasi GPS
    function dapatkanLokasi() {
      if (!navigator.geolocation) {
        setStatusGPS("GPS tidak didukung di perangkat ini.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLokasiGPS(`${position.coords.latitude}, ${position.coords.longitude}`);
          setStatusGPS("Titik Koordinat Terkunci ✅");
        },
        (err) => {
          console.error(err);
          setStatusGPS("Gagal melacak lokasi. Pastikan GPS / Location Services menyala.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    jalankanKamera();
    dapatkanLokasi();

    return () => {
      if (streamReference) {
        streamReference.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleClockIn = async (mode) => {
    if (!lokasiGPS && mode !== 'MANUAL') {
        const paksa = confirm("Sinyal GPS belum terkunci. Lanjutkan absensi tanpa data lokasi?");
        if (!paksa) return;
    }

    setLoading(true);
    let fotoBase64 = null;

    // Ambil gambar dari canvas jika pakai kamera
    if (mode === 'KAMERA' && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      fotoBase64 = canvas.toDataURL('image/jpeg', 0.5); 
    }

    try {
      const res = await fetch('/api/absensi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdm_id,
          nama_sdm: nama,
          ruangan,
          shift: shiftAktif,
          tipe_absen: tipeAbsen, // "MASUK" atau "PULANG"
          lokasi: lokasiGPS || "Akses GPS Ditolak/Gagal",
          catatan: mode === 'MANUAL' ? `Clock-${tipeAbsen} Manual` : `Clock-${tipeAbsen} Sistem`,
          foto_base64: fotoBase64
        })
      });

      if (res.ok) {
        setSukses(true);
        setTimeout(() => {
          router.back();
        }, 1500);
      } else {
        const errorData = await res.json();
        alert("Gagal mencatat absensi: " + (errorData.error || "Kesalahan Server"));
      }
    } catch (err) {
      alert("Koneksi jaringan bermasalah.");
    } finally {
      setLoading(false);
    }
  };

  if (sukses) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 size={80} className="text-emerald-500 mb-6 animate-bounce" />
        <h2 className="text-3xl font-black uppercase text-white tracking-widest italic">Absensi Berhasil!</h2>
        <p className="text-emerald-400 font-bold mt-2">Data kehadiran & lokasi telah terkunci.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-4 py-8">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-6 md:p-8 shadow-2xl relative border-4 border-emerald-500/20">
        
        <button onClick={() => router.back()} className="absolute top-6 left-6 text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full">
            <ArrowLeft size={20} />
        </button>

        <div className="text-center mt-12 mb-6">
            <h1 className="text-2xl font-black uppercase text-slate-800 italic border-b-4 border-emerald-500 inline-block pb-1">TERMINAL ABSEN</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-3">{nama}</p>
            <p className="text-[10px] text-emerald-600 font-black bg-emerald-50 w-fit mx-auto px-3 py-1 rounded-full mt-1 border border-emerald-200">{ruangan}</p>
        </div>

        {/* INDIKATOR LOKASI GPS */}
        <div className={`mb-6 p-3 rounded-2xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider ${lokasiGPS ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'}`}>
            <MapPin size={16} className={lokasiGPS ? 'text-blue-500' : 'text-amber-500'} />
            {statusGPS}
        </div>

        {/* INPUT SHIFT & TIPE ABSEN */}
        <div className="flex gap-2 mb-6">
            <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl p-2 relative">
                <label className="text-[8px] font-black uppercase text-slate-400 ml-1 block mb-1">Pilih Shift</label>
                <select 
                    value={shiftAktif} 
                    onChange={(e) => setShiftAktif(e.target.value)}
                    className="w-full bg-transparent text-[10px] font-black text-slate-800 outline-none appearance-none"
                >
                    <option value="PAGI (07:15 - 14:00)">PAGI (07:15 - 14:00)</option>
                    <option value="MID 1 (09:00 - 16:00)">MID 1 (09:00 - 16:00)</option>
                    <option value="MID 2 (10:00 - 17:00)">MID 2 (10:00 - 17:00)</option>
                    <option value="MID 3 (11:00 - 18:00)">MID 3 (11:00 - 18:00)</option>
                    <option value="MID 4 (12:00 - 19:00)">MID 4 (12:00 - 19:00)</option>
                </select>
                <Clock size={12} className="absolute right-3 top-6 text-slate-300 pointer-events-none" />
            </div>

            <div className="flex-1 flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button 
                    onClick={() => setTipeAbsen('MASUK')} 
                    className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-[9px] font-black transition-all ${tipeAbsen === 'MASUK' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                    <LogIn size={14} className="mb-1" /> MASUK
                </button>
                <button 
                    onClick={() => setTipeAbsen('PULANG')} 
                    className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-[9px] font-black transition-all ${tipeAbsen === 'PULANG' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                    <LogOut size={14} className="mb-1" /> PULANG
                </button>
            </div>
        </div>

        {/* AREA KAMERA */}
        {errorKamera ? (
           <div className="w-full bg-red-50 p-6 rounded-3xl border-2 border-red-200 text-center mb-6">
               <AlertCircle size={30} className="text-red-400 mx-auto mb-3" />
               <p className="text-[10px] font-black text-red-700 leading-relaxed uppercase">{errorKamera}</p>
           </div>
        ) : (
           <div className="w-full bg-slate-900 rounded-3xl mb-6 relative overflow-hidden shadow-inner border-4 border-slate-100 flex items-center justify-center min-h-[220px]">
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto object-cover transform scale-x-[-1]"></video>
               <canvas ref={canvasRef} className="hidden"></canvas>
               
               {/* Frame Kamera Dinamis Tergantung Tipe Absen */}
               <div className={`absolute inset-0 border-[3px] border-dashed m-6 rounded-2xl pointer-events-none ${tipeAbsen === 'MASUK' ? 'border-emerald-400/40' : 'border-red-400/40'}`}></div>
               <div className={`absolute bottom-3 text-[8px] font-black px-2 py-1 rounded bg-black/50 text-white ${tipeAbsen === 'MASUK' ? 'text-emerald-400' : 'text-red-400'}`}>
                   MODE: ABSEN {tipeAbsen}
               </div>
           </div>
        )}

        {/* AREA TOMBOL */}
        <div className="space-y-3">
            {!errorKamera && (
                <button 
                    onClick={() => handleClockIn('KAMERA')} 
                    disabled={loading} 
                    className={`w-full text-white py-4 rounded-2xl font-black uppercase text-[11px] shadow-xl italic tracking-widest border-b-4 transition-all flex justify-center items-center gap-2 ${tipeAbsen === 'MASUK' ? 'bg-emerald-600 border-emerald-800 hover:bg-emerald-700' : 'bg-red-600 border-red-800 hover:bg-red-700'}`}
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    {loading ? 'MEMPROSES...' : `REKAM WAJAH & CLOCK-${tipeAbsen === 'MASUK' ? 'IN' : 'OUT'}`}
                </button>
            )}
            
            <button onClick={() => handleClockIn('MANUAL')} disabled={loading} className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[9px] border-2 border-slate-200 hover:bg-slate-200 transition-all">
                Absen Manual (Gagal Kamera)
            </button>
        </div>
      </div>
    </div>
  );
}

export default function PageAbsensi() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex justify-center items-center"><Loader2 className="animate-spin text-emerald-500" size={40}/></div>}>
      <KameraKomponen />
    </Suspense>
  );
}