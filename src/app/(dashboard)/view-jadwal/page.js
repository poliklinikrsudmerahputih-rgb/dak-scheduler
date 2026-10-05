"use client";
import React, { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Search, Camera, Clock,
  UserCheck, AlertCircle, Save, CheckCircle2, Activity, Edit3, Medal, XCircle,
  RefreshCw, ArrowLeftRight, Loader2, TrendingUp, Download, Lock, Unlock, CalendarRange, Star, Calendar as CalendarIcon, FileText, Trash2, PieChart, MapPin, Bell,
  ShieldCheck, ShieldAlert, Scale, MinusCircle, PlusCircle, LogIn, LogOut, ClipboardList
} from "lucide-react"; 
import { simpanCuti } from "../cuti-sdm/actions"; 

const fetchJSONWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}.`);
    const result = await response.json();
    if (result?.error) throw new Error(result.error);
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Permintaan data melewati batas waktu 20 detik.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
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

const getBerhalanganLabel = (value) => {
  const labels = {
    CT: "Cuti Tahunan (CT)",
    CS: "Sakit (CS)",
    DL: "Dinas Luar (DL)",
    CM: "Melahirkan (CM)",
    TP: "Tutup Pendaftaran (TP)"
  };
  const status = String(value || "").trim();
  return labels[status.toUpperCase()] || status;
};

const normalisasiSimbolTampilan = (value) => String(value || "")
  .trim()
  .replace(/[^A-Za-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toUpperCase();

const ambilGrupSimbolDokter = (value) => {
  const normalized = normalisasiSimbolTampilan(value);
  if (!normalized) return "LAINNYA";

  const nersMatch = normalized.match(/NERS\s*\d+/i);
  if (nersMatch) return nersMatch[0].replace(/\s+/g, " ").trim().toUpperCase();

  const poliMatch = normalized.match(/POLI\s*[A-Z0-9]+/i);
  if (poliMatch) return poliMatch[0].replace(/\s+/g, " ").trim().toUpperCase();

  return normalized;
};
const getTanggalJakarta = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const getJamJakarta = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.hour}:${values.minute}`;
};
const getStatusMutuPraktik = (jamPraktik, jamMulaiAktual) => {
  const jadwal = String(jamPraktik || "08:00").match(/(?:^|\D)(\d{1,2})[:.](\d{2})/);
  const waktuAktual = new Date(jamMulaiAktual || "");
  if (!jadwal || Number.isNaN(waktuAktual.getTime())) return null;

  const jadwalMenit = Number(jadwal[1]) * 60 + Number(jadwal[2]);
  const waktuParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(waktuAktual);
  const waktuValues = Object.fromEntries(waktuParts.map(({ type, value }) => [type, value]));
  const aktualMenit = Number(waktuValues.hour) * 60 + Number(waktuValues.minute);

  return {
    terlambatMenit: Math.max(0, aktualMenit - jadwalMenit),
    jamAktual: `${waktuValues.hour}:${waktuValues.minute}`
  };
};

// ======================================================
// FUNGSI KALKULASI DINAMIS (JASPEL KUANTITATIF)
// ======================================================
const hitungPoinJaspel = (pasien, bobot, timAsisten) => {
  if (!timAsisten || timAsisten.length === 0) return 0;
  
  // Deteksi asisten yang hadir (TIDAK Cuti dan TIDAK Sakit)
  const asistenHadir = timAsisten.filter(as => !as.isCuti && !as.isSakit).length;
  
  if (asistenHadir === 0) return 0; // Mencegah error pembagian dengan nol
  
  // Rumus: (Pasien * Bobot) / Jumlah Hadir
  return ((pasien || 0) * parseFloat(bobot || 1.0)) / asistenHadir;
};

// ======================================================
// KOMPONEN BARU: JAM BERJALAN (LIVE CLOCK) TERPISAH
// ======================================================
const LiveClock = () => {
  const [liveTime, setLiveTime] = useState(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setLiveTime(new Date()), 0);
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  return (
    <p className="text-emerald-400 font-mono font-black text-xl tracking-widest leading-none">
       {liveTime ? format(liveTime, 'HH:mm:ss') : '--:--:--'} <span className="text-[10px] text-emerald-200/70">WIB</span>
    </p>
  );
};

const BannerPengingat = ({ doctors }) => {
  const belumDiisi = doctors.filter((doctor) =>
    !doctor.jam_mulai_aktual
    && !doctor.isCuti
    && String(doctor.ruangan || "POLIKLINIK").trim().toUpperCase() === "POLIKLINIK"
  );

  if (belumDiisi.length === 0) return null;

  return (
    <div role="status" className="rounded-2xl border border-red-200 bg-red-100 px-5 py-4 text-red-900 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide">
        ⚠️ Terdapat {belumDiisi.length} dokter yang belum diisi jam praktiknya pada tanggal ini.
      </p>
      <p className="mt-1 text-xs font-semibold">
        {belumDiisi.map((doctor) => `${doctor.nama_dokter} (Poli ${doctor.klinik})`).join(", ")}
      </p>
    </div>
  );
};

function ModalImutPasien({ modal, onClose, onSaved }) {
  const [noRM, setNoRM] = useState("");
  const [jamAsesmen, setJamAsesmen] = useState("");
  const [jamSelesai, setJamSelesai] = useState("");
  const [identifikasiPraTindakan, setIdentifikasiPraTindakan] = useState(true);
  const [saving, setSaving] = useState(false);
  const waktuTungguMenit = jamAsesmen && jamSelesai
    ? (() => {
        const [jamMulai, menitMulai] = jamAsesmen.split(":").map(Number);
        const [jamAkhir, menitAkhir] = jamSelesai.split(":").map(Number);
        return (jamAkhir * 60 + menitAkhir) - (jamMulai * 60 + menitMulai);
      })()
    : null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nomorRM = noRM.trim();
    if (!nomorRM || !jamAsesmen || !jamSelesai || !Number.isSafeInteger(waktuTungguMenit) || waktuTungguMenit < 0) {
      return alert("Isi Nomor RM dan pastikan Jam Selesai tidak mendahului Jam Asesmen.");
    }

    setSaving(true);
    try {
      const response = await fetch("/api/imut-pasien", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dokter_id: modal.dokter.id,
          tanggal: modal.tanggal,
          no_rm: nomorRM,
          jam_asesmen: jamAsesmen,
          jam_selesai: jamSelesai,
          waktu_tunggu_menit: waktuTungguMenit,
          identifikasi: identifikasiPraTindakan
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menyimpan sampel IMUT.");
      }

      setNoRM("");
      setJamAsesmen("");
      setJamSelesai("");
      setIdentifikasiPraTindakan(true);
      onSaved();
    } catch (error) {
      console.error("Gagal menyimpan sampel IMUT pasien:", error);
      alert(error.message || "Gagal menyimpan sampel IMUT.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-imut-pasien-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-6">
          <h2 id="modal-imut-pasien-title" className="text-lg font-black uppercase text-slate-900">
            Input Sampel IMUT 2 &amp; 3
          </h2>
          <p className="mt-2 text-xs font-bold text-slate-500">
            {modal.dokter.nama_dokter} · {modal.dokter.klinik} · {modal.tanggal}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-black uppercase text-slate-600">
            Nomor RM
            <input
              type="text"
              value={noRM}
              onChange={(event) => setNoRM(event.target.value)}
              autoComplete="off"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
              placeholder="Contoh: 17164"
              suppressHydrationWarning={true}
            />
          </label>

          <label className="block text-xs font-black uppercase text-slate-600">
            Jam Asesmen Perawat
            <input
              type="time"
              value={jamAsesmen}
              onChange={(event) => setJamAsesmen(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
              suppressHydrationWarning={true}
            />
          </label>

          <label className="block text-xs font-black uppercase text-slate-600">
            Jam Selesai Dilayani (Discharge)
            <input
              type="time"
              value={jamSelesai}
              onChange={(event) => setJamSelesai(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
              suppressHydrationWarning={true}
            />
          </label>

          {waktuTungguMenit !== null && (
            <p className={`rounded-lg px-3 py-2 text-xs font-black ${waktuTungguMenit < 0 ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
              {waktuTungguMenit < 0
                ? "Jam Selesai harus sama atau setelah Jam Asesmen."
                : `Waktu Tunggu: ${waktuTungguMenit} Menit`}
            </p>
          )}

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={identifikasiPraTindakan}
              onChange={(event) => setIdentifikasiPraTindakan(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
              suppressHydrationWarning={true}
            />
            Identifikasi Pasien Pra-Tindakan?
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              suppressHydrationWarning={true}
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-black uppercase text-white hover:bg-blue-800 disabled:opacity-60"
              suppressHydrationWarning={true}
            >
              {saving ? "Menyimpan..." : "Simpan Sampel"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ModalRiwayatImut({ modal, onClose }) {
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const isOpen = Boolean(modal);
  const apiUrl = isOpen
    ? `/api/imut-pasien?tanggal=${encodeURIComponent(modal.tanggal)}&dokter_id=${encodeURIComponent(modal.dokter.id)}`
    : null;
  const { data, error, isLoading, mutate } = useSWR(apiUrl, fetchJSONWithTimeout, {
    refreshInterval: isOpen ? 10000 : 0,
    revalidateOnFocus: true
  });
  const riwayat = Array.isArray(data?.data) ? data.data : [];

  const handleDelete = async (sampel) => {
    if (!window.confirm(`Hapus sampel IMUT untuk No RM ${sampel.no_rm}?`)) return;

    setDeletingId(sampel.id);
    setDeleteError("");
    try {
      const response = await fetch("/api/imut-pasien", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sampel.id })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menghapus sampel IMUT.");
      }

      await mutate();
    } catch (error) {
      console.error("Gagal menghapus sampel IMUT:", error);
      setDeleteError(error.message || "Gagal menghapus sampel IMUT.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-riwayat-imut-title"
        className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="modal-riwayat-imut-title" className="text-lg font-black uppercase text-slate-900">
              Riwayat Sampel IMUT
            </h2>
            <p className="mt-2 text-xs font-bold text-slate-500">
              {modal.dokter.nama_dokter} · {modal.dokter.klinik} · {modal.tanggal}
            </p>
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Muat Ulang
          </button>
        </div>

        {error ? (
          <p role="alert" className="py-10 text-center text-sm font-bold text-red-600">
            Gagal memuat riwayat: {error.message}
          </p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm font-bold text-slate-500">Memuat riwayat sampel...</p>
        ) : riwayat.length === 0 ? (
          <p className="py-10 text-center text-sm font-bold text-slate-500">
            Belum ada sampel IMUT yang diinput untuk sesi praktik ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">No RM</th>
                  <th className="px-4 py-3">Jam Asesmen</th>
                  <th className="px-4 py-3">Jam Selesai</th>
                  <th className="px-4 py-3">Waktu Tunggu (Menit)</th>
                  <th className="px-4 py-3">Identifikasi</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((sampel) => (
                  <tr key={sampel.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-bold">{sampel.no_rm}</td>
                    <td className="px-4 py-3">{sampel.jam_asesmen || "-"}</td>
                    <td className="px-4 py-3">{sampel.jam_selesai || "-"}</td>
                    <td className="px-4 py-3">{sampel.waktu_tunggu_menit ?? "-"}</td>
                    <td className="px-4 py-3">
                      {sampel.identifikasi_pra_tindakan ? "Ya" : "Tidak"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(sampel)}
                        disabled={deletingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Hapus sampel No RM ${sampel.no_rm}`}
                      >
                        <Trash2 size={14} />
                        {deletingId === sampel.id ? "Menghapus..." : "Hapus"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deleteError && (
          <p role="alert" className="mt-3 text-center text-sm font-bold text-red-600">
            {deleteError}
          </p>
        )}

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-black uppercase text-slate-600 hover:bg-slate-50"
          >
            Tutup Modal
          </button>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// 1. MODAL ABSENSI KAMERA & GPS (INTEGRASI LANGSUNG)
// ======================================================
function ModalAbsensiKamera({ isOpen, onClose, perawatSelected, ruanganAktif }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [errorKamera, setErrorKamera] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sukses, setSukses] = useState(false);
  
  const [lokasiGPS, setLokasiGPS] = useState(null);
  const [statusGPS, setStatusGPS] = useState('Mencari sinyal GPS...');
  const [shiftAktif, setShiftAktif] = useState('PAGI (07:15 - 14:00)');
  const [tipeAbsen, setTipeAbsen] = useState('MASUK'); 
  const [previewFoto, setPreviewFoto] = useState(null);

  const capturePreviewFoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const fotoBase64 = canvas.toDataURL('image/jpeg', 0.6);
    setPreviewFoto(fotoBase64);
  };

  const handleKirimAbsensi = async () => {
    if (!previewFoto && tipeAbsen === 'MASUK') {
      return alert('Silakan ambil foto terlebih dahulu untuk pratinjau sebelum mengirim.');
    }

    setLoading(true);
    try {
      const res = await fetch('/api/absensi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdm_id: perawatSelected.id,
          nama_sdm: perawatSelected.nama,
          ruangan: ruanganAktif,
          shift: shiftAktif,
          tipe_absen: tipeAbsen,
          lokasi: lokasiGPS || 'Akses GPS Ditolak/Gagal',
          catatan: previewFoto ? `Clock-${tipeAbsen} Dengan Preview` : `Clock-${tipeAbsen} Sistem`,
          foto_base64: previewFoto || null
        })
      });

      if (res.ok) {
        setSukses(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        const errorData = await res.json();
        alert('Gagal mencatat absensi: ' + (errorData.error || 'Kesalahan Server'));
      }
    } catch (err) {
      alert('Koneksi jaringan bermasalah.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let streamReference = null;

    if (isOpen) {
      setSukses(false);
      setPreviewFoto(null);
      setLokasiGPS(null);
      setStatusGPS('Mencari sinyal GPS...');
      setErrorKamera(null);

      // Inisialisasi Kamera — prefer rear camera on mobile but fall back to front camera
      // Use front camera (selfie) for attendance on mobile
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          streamReference = stream;
        })
        .catch(err => {
          console.error("Gagal akses kamera:", err);
          setErrorKamera("Kamera ditolak. Pastikan akses HTTPS dan beri izin kamera di browser.");
        });

      // Inisialisasi GPS
      if (navigator.geolocation) {
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
      } else {
        setStatusGPS("GPS tidak didukung di perangkat ini.");
      }
    } else {
      // Matikan kamera jika modal ditutup
      if (streamReference) {
        streamReference.getTracks().forEach(track => track.stop());
      }
    }

    return () => {
      if (streamReference) {
        streamReference.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen]);

  const handleClockIn = async (mode) => {
    if (!lokasiGPS && mode !== 'MANUAL') {
        const paksa = window.confirm("Sinyal GPS belum terkunci. Lanjutkan absensi tanpa data lokasi?");
        if (!paksa) return;
    }

    setLoading(true);
    let fotoBase64 = null;

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
          sdm_id: perawatSelected.id,
          nama_sdm: perawatSelected.nama,
          ruangan: ruanganAktif,
          shift: shiftAktif,
          tipe_absen: tipeAbsen, 
          lokasi: lokasiGPS || "Akses GPS Ditolak/Gagal",
          catatan: mode === 'MANUAL' ? `Clock-${tipeAbsen} Manual` : `Clock-${tipeAbsen} Sistem`,
          foto_base64: fotoBase64
        })
      });

      if (res.ok) {
        setSukses(true);
        setTimeout(() => {
          onClose(); // Tutup pop-up setelah sukses
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

  if (!isOpen || !perawatSelected) return null;

  if (sukses) {
    return (
      <div className="fixed inset-0 z-[10006] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
        <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl border-4 border-emerald-500/20 text-center">
          <CheckCircle2 size={80} className="text-emerald-500 mx-auto mb-6 animate-bounce" />
          <h2 className="text-2xl font-black uppercase text-slate-800 tracking-widest italic">Berhasil!</h2>
          <p className="text-emerald-600 font-bold mt-2 text-sm">Data kehadiran & lokasi terkunci.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10006] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-6 md:p-8 shadow-2xl relative border-4 border-emerald-500/20">
        
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full" suppressHydrationWarning={true}>
            <XCircle size={20} />
        </button>

        <div className="text-center mt-4 mb-6">
            <h1 className="text-2xl font-black uppercase text-slate-800 italic border-b-4 border-emerald-500 inline-block pb-1">TERMINAL ABSEN</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-3">{perawatSelected.nama}</p>
            <p className="text-[10px] text-emerald-600 font-black bg-emerald-50 w-fit mx-auto px-3 py-1 rounded-full mt-1 border border-emerald-200">{ruanganAktif}</p>
        </div>

        <div className={`mb-6 p-3 rounded-2xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider ${lokasiGPS ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'}`}>
            <MapPin size={16} className={lokasiGPS ? 'text-blue-500' : 'text-amber-500'} />
            {statusGPS}
        </div>

        <div className="flex gap-2 mb-6">
            <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl p-2 relative">
                <label className="text-[8px] font-black uppercase text-slate-400 ml-1 block mb-1">Pilih Shift</label>
                <select 
                    value={shiftAktif} 
                    onChange={(e) => setShiftAktif(e.target.value)}
                    className="w-full bg-transparent text-[10px] font-black text-slate-800 outline-none appearance-none cursor-pointer"
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
                 suppressHydrationWarning={true}>
                    <LogIn size={14} className="mb-1" /> MASUK
                </button>
                <button 
                    onClick={() => setTipeAbsen('PULANG')} 
                    className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-[9px] font-black transition-all ${tipeAbsen === 'PULANG' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}
                 suppressHydrationWarning={true}>
                    <LogOut size={14} className="mb-1" /> PULANG
                </button>
            </div>
        </div>

        {errorKamera ? (
           <div className="w-full bg-red-50 p-6 rounded-3xl border-2 border-red-200 text-center mb-6">
               <AlertCircle size={30} className="text-red-400 mx-auto mb-3" />
               <p className="text-[10px] font-black text-red-700 leading-relaxed uppercase">{errorKamera}</p>
           </div>
        ) : (
           <div className="w-full bg-slate-900 rounded-3xl mb-6 relative overflow-hidden shadow-inner border-4 border-slate-100 flex items-center justify-center min-h-[220px]">
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto object-cover transform scale-x-[-1]"></video>
               <canvas ref={canvasRef} className="hidden"></canvas>
               
               <div className={`absolute inset-0 border-[3px] border-dashed m-6 rounded-2xl pointer-events-none ${tipeAbsen === 'MASUK' ? 'border-emerald-400/40' : 'border-red-400/40'}`}></div>
               <div className={`absolute bottom-3 text-[8px] font-black px-2 py-1 rounded bg-black/50 text-white ${tipeAbsen === 'MASUK' ? 'text-emerald-400' : 'text-red-400'}`}>
                   MODE: ABSEN {tipeAbsen}
               </div>
           </div>
        )}

        <div className="space-y-3">
            {!errorKamera && (
              <>
                <button 
                    onClick={capturePreviewFoto} 
                    disabled={loading}
                    className="w-full text-white py-4 rounded-2xl font-black uppercase text-[11px] shadow-xl italic tracking-widest border-b-4 bg-blue-600 border-blue-800 hover:bg-blue-700 transition-all flex justify-center items-center gap-2"
                 suppressHydrationWarning={true}>
                    <Camera size={16} />
                    AMBIL FOTO PRATINJAU
                </button>

                {previewFoto ? (
                  <div className="rounded-3xl border border-slate-200 overflow-hidden bg-slate-950 p-2">
                    <p className="text-[10px] uppercase font-black text-slate-300 mb-2">Pratinjau Foto</p>
                    <Image src={previewFoto} alt="Pratinjau Absen" width={720} height={480} className="w-full h-auto rounded-[1.5rem] object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[10px] font-black uppercase text-slate-500">
                    Foto pratinjau akan tampil di sini setelah Anda menekan tombol Ambil Foto.
                  </div>
                )}

                <button 
                    onClick={handleKirimAbsensi} 
                    disabled={loading || (tipeAbsen === 'MASUK' && !previewFoto)}
                    className={`w-full text-white py-4 rounded-2xl font-black uppercase text-[11px] shadow-xl italic tracking-widest border-b-4 transition-all flex justify-center items-center gap-2 ${tipeAbsen === 'MASUK' ? 'bg-emerald-600 border-emerald-800 hover:bg-emerald-700' : 'bg-red-600 border-red-800 hover:bg-red-700'}`}
                 suppressHydrationWarning={true}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {loading ? 'MEMPROSES...' : `KIRIM ABSEN ${tipeAbsen === 'MASUK' ? 'MASUK' : 'PULANG'}`}
                </button>
              </>
            )}
            
            <button onClick={() => handleClockIn('MANUAL')} disabled={loading} className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[9px] border-2 border-slate-200 hover:bg-slate-200 transition-all" suppressHydrationWarning={true}>
                Absen Manual (Gagal Kamera)
            </button>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// 2. MODAL LAPORAN ABSEN HARIAN
// ======================================================
function ModalLaporanAbsen({ isOpen, onClose, dataAbsen, loading, tanggalLabel, onDeleteAbsen }) {
    const [previewImage, setPreviewImage] = useState(null);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] p-8 md:p-10 shadow-2xl border-4 border-emerald-500/20 max-h-[90vh] flex flex-col relative">
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-emerald-500 pl-4 flex items-center gap-3"><UserCheck size={24} className="text-emerald-500"/> Laporan Absensi Harian</h3>
              <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200" suppressHydrationWarning={true}><XCircle size={20}/></button>
            </div>

            <div className="mb-6 bg-emerald-50 p-4 rounded-2xl text-[10px] font-black uppercase text-emerald-800 border border-emerald-100">
                <p>Tanggal: <span className="italic font-black text-slate-900">{tanggalLabel}</span></p>
                <p>Total Terdaftar: <span className="italic font-black text-emerald-700">{dataAbsen.length} SDM</span></p>
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center items-center p-12"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>
            ) : dataAbsen.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center">
                        <AlertCircle size={40} className="text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-400 font-black uppercase text-sm italic">Belum ada data absensi untuk tanggal ini</p>
                    </div>
                </div>
            ) : (
                <div className="overflow-y-auto custom-scrollbar border rounded-[2rem] border-slate-200 bg-white flex-1">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-900 text-white text-[9px] font-black uppercase italic tracking-widest z-10 shadow-md">
                            <tr>
                                <th className="p-5 text-left">No</th>
                                <th className="p-5 text-left">Nama SDM</th>
                                <th className="p-5 text-left">Ruangan</th>
                                <th className="p-5 text-left">Shift</th>
                                <th className="p-5 text-center bg-emerald-600/30">Jam Masuk</th>
                                <th className="p-5 text-center bg-blue-600/30">Status Disiplin</th>
                                <th className="p-5 text-center bg-red-600/30">Potongan Absen</th>
                                <th className="p-5 text-left">Lokasi (GPS)</th>
                                <th className="p-5 text-left">Foto</th>
                                <th className="p-5 text-left">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-bold uppercase tracking-tighter text-slate-700">
                            {dataAbsen.map((row, i) => (
                                <tr key={`absen-${row.id || i}`} className="border-b border-slate-100 hover:bg-emerald-50/50 transition-colors">
                                    <td className="p-5 text-slate-900 font-extrabold">{i + 1}</td>
                                    <td className="p-5 font-black italic text-emerald-900">{row.nama_sdm}</td>
                                    <td className="p-5"><span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] text-slate-600">{row.ruangan}</span></td>
                                    <td className="p-5 text-slate-800 font-black">{row.shift_pilihan}</td>
                                    <td className="p-5 text-center text-emerald-700 bg-emerald-50/30 font-black text-sm">{row.jam_masuk}</td>
                                    <td className="p-5 text-center">
                                        {(() => {
                                          const statusValue = String(row.status || '').toUpperCase();
                                          return (
                                            <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black ${
                                                statusValue === 'TEPAT WAKTU' ? 'bg-emerald-100 text-emerald-700' :
                                                statusValue === 'TERLAMBAT RINGAN' ? 'bg-amber-100 text-amber-700' :
                                                statusValue === 'TERLAMBAT SEDANG' ? 'bg-orange-100 text-orange-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                              {row.status}
                                            </span>
                                          );
                                        })()}
                                    </td>
                                    <td className="p-5 text-center font-black bg-red-50/30">
                                        <span className="text-red-600">-{row.potongan_absen || row.penalti_mutu || 0} Pts</span>
                                    </td>
                                    <td className="p-5 text-[9px] text-slate-500 max-w-xs">
                                        {row.lokasi_masuk && row.lokasi_masuk.includes('maps') ? (
                                            <a href={row.lokasi_masuk} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                                <MapPin size={12} /> Lihat Maps
                                            </a>
                                        ) : (
                                            <span>{row.lokasi_masuk || '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-5 text-left">
                                        {row.foto_masuk ? (
                                          <button type="button" onClick={() => setPreviewImage(row.foto_masuk)} className="group block rounded-xl overflow-hidden border border-slate-200 hover:border-emerald-500 transition-all" suppressHydrationWarning={true}>
                                            <Image src={row.foto_masuk} alt={`Foto ${row.nama_sdm}`} width={220} height={154} className="rounded-xl object-cover transition-transform duration-200 group-hover:scale-105" unoptimized />
                                          </button>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 uppercase font-black">Tidak ada</span>
                                        )}
                                    </td>
                                    <td className="p-5 text-left flex flex-col gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!confirm('Yakin ingin menghapus data absen ini?')) return;
                                            onDeleteAbsen(row.id, false, row);
                                          }}
                                          className="text-[10px] font-black uppercase tracking-[.2em] px-3 py-2 rounded-2xl bg-red-500 hover:bg-red-600 text-white"
                                         suppressHydrationWarning={true}>
                                          Hapus Absen
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!confirm('Ulang absen? Data ini akan dihapus sehingga bisa diinput ulang.')) return;
                                            onDeleteAbsen(row.id, true, row);
                                          }}
                                          className="text-[10px] font-black uppercase tracking-[.2em] px-3 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white"
                                         suppressHydrationWarning={true}>
                                          Ulang Absen
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {previewImage && (
              <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/95 p-4">
                <div className="relative max-w-[95vw] max-h-[95vh]">
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="absolute top-3 right-3 z-20 rounded-full bg-white/90 p-2 shadow-lg text-slate-700"
                    aria-label="Tutup pratinjau foto"
                   suppressHydrationWarning={true}>
                    <XCircle size={20} />
                  </button>
                  <Image
                    src={previewImage}
                    alt="Pratinjau Foto Absen"
                    width={1200}
                    height={900}
                    className="max-w-full max-h-[95vh] rounded-[2rem] object-contain shadow-2xl"
                    unoptimized
                  />
                </div>
              </div>
            )}
          </div>
        </div>
    );
}

// ======================================================
// 3. KOMPONEN UTAMA
// ======================================================
export default function ViewJadwalPublic() {
  const [submitting, setSubmitting] = useState(false);
  const [pasienInputValues, setPasienInputValues] = useState({});
  const [editingStatus, setEditingStatus] = useState({});
  
  const [selectedDateFull, setSelectedDateFull] = useState(getTanggalJakarta());
  const [startingDoctorId, setStartingDoctorId] = useState(null);
  const [manualDoctorId, setManualDoctorId] = useState(null);
  const [manualStartTime, setManualStartTime] = useState("");
  const [jamPraktikInputValues, setJamPraktikInputValues] = useState({});
  const [editingJamPraktik, setEditingJamPraktik] = useState({});
  const [savingJamPraktikId, setSavingJamPraktikId] = useState(null);
  
  const tanggal = parseInt(selectedDateFull.split('-')[2], 10);
  const bulan = parseInt(selectedDateFull.split('-')[1], 10);
  const tahun = parseInt(selectedDateFull.split('-')[0], 10);
  const ruanganShare = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("ruangan");
  const shareQuery = ruanganShare ? `&ruangan=${encodeURIComponent(ruanganShare)}` : "";
  const dashboardUrl = `/api/dashboard?tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}${shareQuery}`;
  const swrOptions = { revalidateOnFocus: true, refreshInterval: 60000, dedupingInterval: 60000 };
  const { data, error: dashboardError, isLoading: loading, mutate: mutateDashboard } = useSWR(
    dashboardUrl,
    fetchJSONWithTimeout,
    swrOptions
  );
  const { data: sdmData } = useSWR("/api/sdm", fetchJSONWithTimeout, swrOptions);
  const daftarSDM = Array.isArray(sdmData) ? sdmData : [];
  
  const [searchTerm, setSearchTerm] = useState("");
  const [searchCutiTerm, setSearchCutiTerm] = useState("");
  const [searchMissingTerm, setSearchMissingTerm] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [showCutiModal, setShowCutiModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  
  // State untuk Laporan Absen Harian
  const [showLaporanAbsenModal, setShowLaporanAbsenModal] = useState(false);
  const [dataLaporanAbsen, setDataLaporanAbsen] = useState([]);
  const [loadingAbsen, setLoadingAbsen] = useState(false);
  
  // State: Modal Absensi Kamera Langsung
  const [showKameraModal, setShowKameraModal] = useState(false);
  const [perawatTarget, setPerawatTarget] = useState(null);
  const [ruanganAktifGlobal, setRuanganAktifGlobal] = useState('POLIKLINIK');
  const [modalImutOpen, setModalImutOpen] = useState(null);
  const [modalRiwayatOpen, setModalRiwayatOpen] = useState(null);
  const [imutSaveNotice, setImutSaveNotice] = useState("");

  useEffect(() => {
    if (!imutSaveNotice) return undefined;
    const timeoutId = window.setTimeout(() => setImutSaveNotice(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [imutSaveNotice]);

  const [isDownloading, setIsDownloading] = useState(false);
  const [rentangDownload, setRentangDownload] = useState({
    awal: format(new Date(tahun, bulan - 1, 1), "yyyy-MM-dd"), 
    akhir: format(new Date(), "yyyy-MM-dd") 
  });
  const [swapData, setSwapData] = useState({ sdmA: "", sdmB: "" });

  useEffect(() => {
    const sidebar = document.querySelector('aside'); 
    const mainContent = document.querySelector('main');
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.marginLeft = '0';
    
    return () => {
      if (sidebar) sidebar.style.display = 'block';
      if (mainContent) mainContent.style.marginLeft = '';
    };
  }, []);

  useEffect(() => {
    if (ruanganShare) setRuanganAktifGlobal(ruanganShare);
    if (!data) return;
    if (data.summary?.ruangan) setRuanganAktifGlobal(data.summary.ruangan);

    setPasienInputValues((previous) => {
      const next = { ...previous };
      data.dokterPraktik?.forEach((dok) => {
        const doctorKey = dok.id || `${dok.nama_dokter}-${dok.klinik}`;
        const cardKey = `${doctorKey}_${selectedDateFull}`;
        if (next[cardKey] === undefined) {
          next[cardKey] = getPatientCount(dok);
        }
      });
      return next;
    });
  }, [data, ruanganShare, selectedDateFull]);
  const handleMulaiPraktik = async (dok, jamMulaiManual = "") => {
    const dokterId = Number(dok.id);
    if (!Number.isSafeInteger(dokterId) || dokterId <= 0) {
      alert("ID dokter tidak valid.");
      return;
    }

    let waktuManual = jamMulaiManual;
    if (selectedDateFull < getTanggalJakarta() && !waktuManual) {
      waktuManual = window.prompt("Masukkan jam mulai praktik pada tanggal tersebut (HH:mm):") || "";
      if (!waktuManual) return;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(waktuManual)) {
        alert("Format jam praktik harus HH:mm.");
        return;
      }
    }

    setStartingDoctorId(dokterId);
    try {
      const res = await fetch("/api/mulai-praktik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dokter_id: dokterId,
          tanggal: selectedDateFull,
          ...(waktuManual ? { jam_mulai_manual: waktuManual } : {})
        })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Gagal mencatat waktu mulai praktik.");
      }

      await mutateDashboard((current) => current ? {
        ...current,
        dokterPraktik: current.dokterPraktik.map((item) =>
          Number(item.id) === dokterId
            ? { ...item, jam_mulai_aktual: result.jam_mulai_aktual }
            : item
        )
      } : current, { revalidate: false });
      setManualDoctorId(null);
      setManualStartTime("");
    } catch (error) {
      alert(error.message || "Gagal mencatat waktu mulai praktik.");
    } finally {
      setStartingDoctorId(null);
    }
  };

  const handleUpdateJamPraktik = async (dok) => {
    const dokterId = Number(dok.id);
    const doctorKey = dok.id || `${dok.nama_dokter}-${dok.klinik}`;
    const cardKey = `${doctorKey}_${selectedDateFull}`;
    const jamPraktik = editingJamPraktik[cardKey]
      ? manualStartTime
      : jamPraktikInputValues[cardKey] || "";

    if (!Number.isSafeInteger(dokterId) || dokterId <= 0) {
      alert("ID dokter tidak valid.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(jamPraktik)) {
      alert("Pilih jam praktik yang valid.");
      return;
    }

    setSavingJamPraktikId(dokterId);
    try {
      const res = await fetch("/api/mulai-praktik", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dokter_id: dokterId,
          tanggal: selectedDateFull,
          jam_mulai_manual: jamPraktik
        })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Gagal menyimpan jam praktik.");
      }

      await mutateDashboard((current) => current && Array.isArray(current.dokterPraktik) ? {
        ...current,
        dokterPraktik: current.dokterPraktik.map((item) =>
          Number(item.id) === dokterId
            ? { ...item, jam_mulai_aktual: result.jam_mulai_aktual }
            : item
        )
      } : current, { revalidate: false });
      setEditingJamPraktik((previous) => ({ ...previous, [cardKey]: false }));
      setManualDoctorId(null);
      setManualStartTime("");
      setJamPraktikInputValues((previous) => {
        const next = { ...previous };
        delete next[cardKey];
        return next;
      });
      void mutateDashboard().catch((error) => {
        console.error("Gagal memperbarui data dashboard:", error);
      });
    } catch (error) {
      alert(error.message || "Gagal menyimpan jam praktik.");
    } finally {
      setSavingJamPraktikId(null);
    }
  };

  const handleUpdatePasienSpesifik = async (dok) => {
    const doctorKey = dok.id || `${dok.nama_dokter}-${dok.klinik}`;
    const cardKey = `${doctorKey}_${selectedDateFull}`;
    const inputValue = pasienInputValues[cardKey];
    if (inputValue === "" || inputValue == null) return alert("Isi jumlah pasien dengan benar!");
    const jmlTotal = Number(inputValue);
    if (!Number.isSafeInteger(jmlTotal) || jmlTotal < 0) return alert("Isi jumlah pasien dengan benar!");

    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard?isPublic=true", {
        method: "PATCH",
        headers: { 
            "Content-Type": "application/json",
            "x-public-access": "true" 
        },
        body: JSON.stringify({
          nama_dokter: dok.nama_dokter,
          klinik: dok.klinik,
          tanggal, bulan, tahun,
          jumlah: jmlTotal
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        alert(`✅ TERSIMPAN!\n${dok.nama_dokter}\nJumlah: ${jmlTotal} Pasien`);
        setPasienInputValues((previous) => ({ ...previous, [cardKey]: jmlTotal }));
        setEditingStatus((previous) => ({ ...previous, [cardKey]: false }));
        await mutateDashboard((current) => {
          if (!current || !Array.isArray(current.dokterPraktik)) return current;
          return {
            ...current,
            dokterPraktik: current.dokterPraktik.map((item) => {
              const itemKey = item.id || `${item.nama_dokter}-${item.klinik}`;
              return itemKey === doctorKey ? { ...item, jumlah_pasien_poli: jmlTotal } : item;
            })
          };
        }, { revalidate: false });
        void mutateDashboard().catch((error) => {
          console.error("Gagal memperbarui data dashboard:", error);
        });
      } else {
        alert("❌ Gagal menyimpan total pasien. " + (result.error || result.message || "Periksa koneksi dan akses publik."));
      }
    } catch (e) {
      alert("❌ Gagal menyimpan data ke tabel poli.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAbsen = async (absenId, isRepeat = false, row = null) => {
    if (!absenId) return;
    setLoadingAbsen(true);
    try {
      const res = await fetch('/api/absensi', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: absenId })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Gagal menghapus data absen.');
      }
      setDataLaporanAbsen(prev => prev.filter(item => item.id !== absenId));
      alert(isRepeat ? 'Absen dihapus. Silakan ulangi absen.' : 'Absen berhasil dihapus.');
      if (isRepeat) {
        setShowLaporanAbsenModal(false);
        setPerawatTarget({ id: row?.sdm_id || null, nama: row?.nama_sdm || '' });
        setShowKameraModal(true);
      }
    } catch (err) {
      console.error('Gagal menghapus absen:', err);
      alert(err?.message || 'Gagal menghapus data absen.');
    } finally {
      setLoadingAbsen(false);
    }
  };

  const handleSwapDB = async () => {
    if (!swapData.sdmA || !swapData.sdmB) return alert("Pilih kedua perawat!");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jadwal/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdmA: swapData.sdmA,
          sdmB: swapData.sdmB,
          tanggal, bulan, tahun
        })
      });
      if (res.ok) {
        alert("🔄 Penugasan & Beban Berhasil Ditukar!");
        setShowSwap(false);
        setSwapData({ sdmA: "", sdmB: "" });
        mutateDashboard();
      }
    } catch (e) { 
      alert("❌ Gagal tukar asisten."); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleSimpanCutiForm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target);
    const res = await simpanCuti(formData);
    if (res.success) {
      alert("✅ Pengajuan Berhasil!");
      e.target.reset();
      setShowCutiModal(false);
      mutateDashboard();
    } else {
      alert("❌ Gagal: " + res.error);
    }
    setSubmitting(false);
  };

  const executeDownloadLaporan = async () => {
    if (!rentangDownload.awal || !rentangDownload.akhir) return alert("Pilih rentang tanggal terlebih dahulu!");
    
    setIsDownloading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const ruanganShare = urlParams.get('ruangan');
      const shareQuery = ruanganShare ? `&ruangan=${ruanganShare}` : '';

      const res = await fetch(`/api/dashboard?tglAwal=${rentangDownload.awal}&tglAkhir=${rentangDownload.akhir}${shareQuery}`);
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

            <p><b>B. REKAPITULASI BEBAN KERJA ASISTEN (BOBOT KLINIK)</b></p>
            <table>
              <tr>
                <th style="width: 8%;">NO</th>
                <th>NAMA PERAWAT / ASISTEN</th>
                <th style="width: 25%;">TOTAL POIN KERJA BULAN INI</th>
              </tr>
              ${dataLaporan.leaderboard.map((item, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${item.nama}</td>
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

  const labelHariIni = format(parseISO(selectedDateFull), "eeee, dd MMMM yyyy", { locale: id });

  const groupedDokter = data?.dokterPraktik?.reduce((acc, dok) => {
    const simbol = ambilGrupSimbolDokter(dok.simbol_praktik || dok.simbol || dok.klinik);
    if (!acc[simbol]) acc[simbol] = [];
    acc[simbol].push(dok);
    return acc;
  }, {});
  const hariPraktikTerpilih = format(parseISO(selectedDateFull), "eeee", { locale: id }).toUpperCase();
  const dokterPraktikTanggalIni = Array.isArray(data?.dokterPraktik)
    ? data.dokterPraktik.filter((dokter) =>
      String(dokter.jadwal_hari || "").trim().toUpperCase() === hariPraktikTerpilih
    )
    : [];

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-50 font-sans z-[9999] pb-20 scrollbar-hide">
      
      {/* RENDER MODALS */}
      <ModalLaporanAbsen isOpen={showLaporanAbsenModal} onClose={() => setShowLaporanAbsenModal(false)} dataAbsen={dataLaporanAbsen} loading={loadingAbsen} tanggalLabel={labelHariIni} onDeleteAbsen={handleDeleteAbsen} />
      <ModalAbsensiKamera isOpen={showKameraModal} onClose={() => setShowKameraModal(false)} perawatSelected={perawatTarget} ruanganAktif={ruanganAktifGlobal} />
      {modalImutOpen && (
        <ModalImutPasien
          modal={modalImutOpen}
          onClose={() => setModalImutOpen(null)}
          onSaved={() => {
            setModalImutOpen(null);
            setImutSaveNotice("Sampel IMUT sudah tersimpan.");
          }}
        />
      )}
      {modalRiwayatOpen && <ModalRiwayatImut modal={modalRiwayatOpen} onClose={() => setModalRiwayatOpen(null)} />}
      {imutSaveNotice && (
        <div
          role="status"
          className="fixed right-5 top-5 z-[10060] flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-lg"
        >
          <CheckCircle2 size={18} />
          {imutSaveNotice}
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="bg-slate-900 text-white p-8 md:p-16 rounded-b-[4rem] shadow-2xl relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><Activity size={300} /></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
          <div className="flex items-center gap-6">
             <div className="p-5 bg-emerald-600 rounded-[2rem] shadow-2xl rotate-3">
                <Medal size={40} className="text-white" />
             </div>
             <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none italic text-white">
                  DAK-<span className="text-emerald-500">SYSTEMS</span>
                </h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-3 italic leading-none">
                  Polyclinic Resource Transparency v.4.0
                </p>
             </div>
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            <button 
              onClick={async () => {
                setLoadingAbsen(true);
                try {
                  const res = await fetch(`/api/absensi?tanggal=${selectedDateFull}`);
                  const result = await res.json();
                  if (!res.ok || !result.success || !Array.isArray(result.data)) {
                    throw new Error(result.error || 'Gagal mengambil laporan absensi.');
                  }
                  setDataLaporanAbsen(result.data);
                } catch (err) {
                  console.error("Gagal fetch laporan absen:", err);
                  alert(err?.message || 'Gagal mengambil laporan absensi.');
                  setDataLaporanAbsen([]);
                } finally {
                  setLoadingAbsen(false);
                }
                setShowLaporanAbsenModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-emerald-800 text-white"
             suppressHydrationWarning={true}>
              <UserCheck size={18} /> Laporan Absen
            </button>
            
            <button onClick={() => setShowLeaderboardModal(true)} className="bg-amber-500 hover:bg-amber-600 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase text-white border-b-4 border-amber-700" suppressHydrationWarning={true}>
                <Star size={18} className="fill-white" /> Cek Poin Asisten
            </button>

            {data?.missingPasien?.length > 0 && (
              <button onClick={() => setShowMissingModal(true)} className="bg-red-500 hover:bg-red-600 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-red-700 text-white" suppressHydrationWarning={true}>
                <Bell size={18} /> {data.missingPasien.length} Belum Isi Point
              </button>
            )}

            <button onClick={() => setShowCutiModal(true)} className="bg-blue-600 hover:bg-blue-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-blue-800" suppressHydrationWarning={true}>
                <Edit3 size={18} /> Ajukan Cuti Staf
            </button>
            <button onClick={() => setShowSwap(true)} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-5 rounded-2xl flex items-center gap-3 transition-all shadow-xl font-black text-[10px] uppercase border-b-4 border-emerald-800" suppressHydrationWarning={true}>
                <RefreshCw size={18} /> Tukar Asisten
            </button>
            
            <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-md text-center md:text-right shadow-inner flex flex-col justify-center">
              <p className="text-lg font-black uppercase text-white leading-none tracking-tighter">{labelHariIni}</p>
              <div className="mt-3 flex items-center justify-center md:justify-end gap-2">
                 <Clock size={14} className="text-emerald-400" />
                 <LiveClock />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 -mt-16 space-y-8">
        {/* FILTER CONTROL (INPUT DATE TUNGGAL) */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[3rem] shadow-2xl border border-white flex flex-col lg:flex-row gap-6 items-center">
          <div className="flex-1 flex items-center gap-4 bg-slate-100/50 px-8 py-5 rounded-[2rem] w-full border border-slate-100">
            <Search size={22} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari Nama Dokter atau Klinik..." 
              autoComplete="off"
              spellCheck="false"
              className="bg-transparent border-none outline-none text-xs font-black w-full uppercase text-slate-900 placeholder:text-slate-400"
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
             suppressHydrationWarning={true}/>
          </div>
          <div className="flex gap-4 w-full lg:w-auto items-center">
            
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <CalendarIcon size={16} className="text-emerald-200 group-hover:text-white transition-colors" />
              </div>
              <input 
                type="date" 
                value={selectedDateFull}
                onChange={(e) => setSelectedDateFull(e.target.value)}
                className="bg-emerald-600 text-white text-[11px] font-black pl-12 pr-6 py-5 rounded-2xl uppercase shadow-lg outline-none cursor-pointer appearance-none hover:bg-emerald-700 transition-colors [&::-webkit-calendar-picker-indicator]:invert"
               suppressHydrationWarning={true}/>
            </div>

            <button 
              onClick={() => setShowDownloadModal(true)}
              className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white text-[11px] font-black px-8 py-5 rounded-2xl uppercase shadow-lg flex items-center gap-2"
             suppressHydrationWarning={true}>
              <Download size={14}/> Laporan
            </button>
          </div>
        </div>

        {!loading && !dashboardError && (
          <BannerPengingat doctors={dokterPraktikTanggalIni} />
        )}

        {/* GRID UNIT CONTAINER (GROUPED CARD) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {loading ? Array.from({ length: 4 }).map((_, cardIndex) => (
            <section key={`dokter-skeleton-${cardIndex}`} aria-label="Memuat jadwal dokter" className="bg-white p-8 md:p-10 rounded-[4rem] border-2 border-white shadow-xl space-y-6">
              <div className="animate-pulse rounded-[2.5rem] bg-slate-200 h-24" />
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <div key={`dokter-skeleton-${cardIndex}-${rowIndex}`} className="animate-pulse rounded-[2.5rem] border-2 border-slate-100 bg-slate-50 p-6 space-y-4">
                  <div className="h-4 w-2/5 rounded bg-slate-200" />
                  <div className="h-3 w-1/3 rounded bg-slate-200" />
                  <div className="h-10 w-full rounded-2xl bg-slate-200" />
                </div>
              ))}
            </section>
          )) : dashboardError ? (
            <div role="alert" className="col-span-full flex flex-col items-center gap-4 rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-center text-red-800 shadow-sm">
              <AlertCircle size={28} className="text-red-600" />
              <p className="max-w-xl text-sm font-bold">Gagal memuat data dari server. Periksa koneksi internet Anda atau klik tombol Muat Ulang.</p>
              <button
                type="button"
                onClick={() => mutateDashboard()}
                className="rounded-xl bg-red-600 px-5 py-3 text-[10px] font-black uppercase text-white transition hover:bg-red-700"
               suppressHydrationWarning={true}>
                Muat Ulang
              </button>
            </div>
          ) : Object.entries(groupedDokter || {}).map(([simbol, listDokter]) => {
            const filteredDokter = listDokter.filter(d => 
              d.nama_dokter.toLowerCase().includes(searchTerm.toLowerCase()) ||
              d.klinik.toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (filteredDokter.length === 0) return null;

            return (
              <div key={simbol} className="bg-white p-8 md:p-10 rounded-[4rem] border-2 border-white shadow-xl space-y-6 relative overflow-hidden">
                
                <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-lg italic">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                      {simbol}
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider">STASIUN UTAMA {simbol}</h3>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Sektor Pelayanan Rawat Jalan</p>
                    </div>
                  </div>
                  <span className="bg-white/10 text-white text-[8px] font-black px-3 py-1.5 rounded-full uppercase">
                    {filteredDokter.length} Dokter Aktif
                  </span>
                </div>

                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredDokter.map((dok, idx) => {
                    const doctorKey = dok.id || `${dok.nama_dokter}-${dok.klinik}`;
                    const cardKey = `${doctorKey}_${selectedDateFull}`;
                    const patientCount = getPatientCount(dok);
                    const monthlyPatientCount = getMonthlyPatientCount(dok);
                    const isEditing = Boolean(editingStatus[cardKey]);
                    const isBerhalangan = dok.is_berhalangan === true;
                    const keteranganBerhalangan = getBerhalanganLabel(dok.keterangan_berhalangan);
                    const mutuPraktik = getStatusMutuPraktik(dok.jam_praktik, dok.jam_mulai_aktual);

                    return (
                      <div key={cardKey} className={`p-6 rounded-[2.5rem] border-2 transition-all ${isBerhalangan ? 'border-red-100 bg-red-50/30 opacity-75' : 'border-slate-100 bg-slate-50/50 hover:border-blue-400'}`}>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div>
                            <h4 className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{dok.nama_dokter}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5 tracking-wider">{dok.klinik} • {dok.jam_praktik || "Jam Pelayanan"}</p>
                            {isBerhalangan && (
                              <span className="mt-2 inline-flex rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-red-800">
                                🚫 {keteranganBerhalangan || "Dokter Berhalangan"}
                              </span>
                            )}

                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {!isBerhalangan && mutuPraktik && (
                                <span className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-full border ${mutuPraktik.terlambatMenit <= 15 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                                  {mutuPraktik.terlambatMenit <= 15 ? `Tepat Waktu · ${mutuPraktik.jamAktual}` : `Terlambat ${mutuPraktik.terlambatMenit} menit`}
                                </span>
                              )}
                              {!isBerhalangan && dok.jam_mulai_aktual && !mutuPraktik && (
                                <span className="text-[8px] font-bold uppercase px-2.5 py-1 rounded-full border border-slate-200 bg-slate-100 text-slate-500">
                                  Waktu tercatat · jadwal tidak valid
                                </span>
                              )}
                              {!dok.jam_mulai_aktual && !isBerhalangan && String(dok.ruangan || ruanganAktifGlobal).trim().toUpperCase() === "POLIKLINIK" && (
                                <button
                                  type="button"
                                  onClick={() => handleMulaiPraktik(dok)}
                                  disabled={startingDoctorId === Number(dok.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[8px] font-black uppercase text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                                 suppressHydrationWarning={true}>
                                  {startingDoctorId === Number(dok.id) ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                                  Mulai Praktik
                                </button>
                              )}
                              {!isBerhalangan && String(dok.ruangan || ruanganAktifGlobal).trim().toUpperCase() === "POLIKLINIK" && (
                                <div className="flex flex-wrap items-center gap-2">
                                  {dok.jam_mulai_aktual && !editingJamPraktik[cardKey] ? (
                                    <>
                                      <span className="text-[9px] font-black uppercase text-slate-600">
                                        Mulai: {getJamJakarta(dok.jam_mulai_aktual) || "--:--"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setManualDoctorId(Number(dok.id));
                                          setManualStartTime(getJamJakarta(dok.jam_mulai_aktual));
                                          setEditingJamPraktik((previous) => ({ ...previous, [cardKey]: true }));
                                        }}
                                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[8px] font-black uppercase text-slate-600 hover:border-blue-300 hover:text-blue-700"
                                       suppressHydrationWarning={true}>
                                        <Edit3 size={11} /> Edit Jam
                                      </button>
                                    </>
                                  ) : (
                                    <form
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        handleUpdateJamPraktik(dok);
                                      }}
                                      className="inline-flex flex-wrap items-center gap-2"
                                    >
                                      <input
                                        aria-label={`Jam mulai praktik ${dok.nama_dokter}`}
                                        type="time"
                                        required
                                        value={editingJamPraktik[cardKey]
                                          ? manualStartTime
                                          : jamPraktikInputValues[cardKey] || ""}
                                        onChange={(event) => {
                                          if (editingJamPraktik[cardKey]) {
                                            setManualStartTime(event.target.value);
                                          } else {
                                            setJamPraktikInputValues((previous) => ({
                                              ...previous,
                                              [cardKey]: event.target.value
                                            }));
                                          }
                                        }}
                                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700"
                                       suppressHydrationWarning={true}/>
                                      <button
                                        type="submit"
                                        disabled={savingJamPraktikId === Number(dok.id)}
                                        className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-[8px] font-black uppercase text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                                       suppressHydrationWarning={true}>
                                        {savingJamPraktikId === Number(dok.id)
                                          ? <Loader2 size={12} className="animate-spin" />
                                          : <Save size={12} />}
                                        Simpan Jam
                                      </button>
                                      {editingJamPraktik[cardKey] && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingJamPraktik((previous) => ({ ...previous, [cardKey]: false }));
                                            if (manualDoctorId === Number(dok.id)) {
                                              setManualDoctorId(null);
                                              setManualStartTime("");
                                            }
                                            setJamPraktikInputValues((previous) => {
                                              const next = { ...previous };
                                              delete next[cardKey];
                                              return next;
                                            });
                                          }}
                                          disabled={savingJamPraktikId === Number(dok.id)}
                                          className="text-[8px] font-black uppercase text-slate-500 hover:text-slate-800"
                                         suppressHydrationWarning={true}>
                                          Batal
                                        </button>
                                      )}
                                    </form>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {!isBerhalangan && (
                              <p className="text-[8px] font-black text-blue-600 uppercase mt-2 bg-blue-50 w-fit px-2 py-0.5 rounded border border-blue-100 italic">
                                Kunjungan Bulan Ini: {monthlyPatientCount} Pasien
                              </p>
                            )}
                          </div>

                        </div>

                        {!isBerhalangan ? (
                          <div className="mt-4 pt-4 border-t border-slate-200/40 space-y-4">
                            
                            {/* --- INTEGRASI PEMBAGI DINAMIS & POTONGAN ABSENSI --- */}
                            <div className="flex flex-wrap gap-2">
                              {dok.timAsisten && dok.timAsisten.length > 0 ? dok.timAsisten.map((as, i) => {
                                // Eksekusi Kalkulasi Poin Dinamis
                                const bobotDokter = dok.bobot_jaspel || 1.0;
                                const totalPasien = dok.jumlah_pasien_poli || 0;
                                const poinPerAsisten = hitungPoinJaspel(totalPasien, bobotDokter, dok.timAsisten);
                                
                                // Cek Status Kehadiran & Pemotongan
                                const isAbsen = as.isCuti || as.isSakit;
                                const totalPotonganAbsen = as.potongan_absen || as.penalti_absen || 0;

                                return (
                                  <div key={i} className={`flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase italic text-slate-700 bg-white px-2 py-1.5 rounded-xl border shadow-sm transition-all ${isAbsen ? 'border-red-200 bg-red-50/50 opacity-70' : 'border-slate-200'}`}>
                                    {isAbsen ? <XCircle size={12} className="text-red-400" /> : <UserCheck size={12} className="text-emerald-500" />} 
                                    
                                    <span className={`mr-1 ${isAbsen ? 'line-through text-red-500' : ''}`}>{as.nama}</span>
                                    
                                    {/* Indikator Poin & Pemotongan Absensi dari Master SDM */}
                                    {!isAbsen && (
                                      <div className="flex items-center gap-1.5 mr-2">
                                        <div className="flex items-center gap-1" title="Saldo Aman & Poin Terdistribusi">
                                          <ShieldCheck size={12} className="text-emerald-500" />
                                          <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-200 not-italic tracking-wider">
                                            +{poinPerAsisten.toFixed(1)} Pts
                                          </span>
                                        </div>
                                        
                                        {/* INTEGRASI PEMOTONGAN ABSENSI */}
                                        {totalPotonganAbsen > 0 && (
                                            <div className="flex items-center gap-1" title="Potongan Kedisiplinan / Absensi">
                                                <MinusCircle size={12} className="text-red-500" />
                                                <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold border border-red-200 not-italic tracking-wider">
                                                  -{totalPotonganAbsen} Pts
                                                </span>
                                            </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {isAbsen && (
                                      <div className="flex items-center gap-1 mr-2" title="Perawat Absen - Poin Terkunci">
                                        <ShieldAlert size={12} className="text-red-400" />
                                        <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold border border-red-200 not-italic tracking-wider">
                                          0 Pts (ABSEN)
                                        </span>
                                      </div>
                                    )}
                                    
                                    {/* Tombol Absensi Kamera Saja */}
                                    {!isAbsen && (
                                      <button 
                                        type="button"
                                        onClick={() => { 
                                          setPerawatTarget(as); 
                                          setRuanganAktifGlobal(simbol); 
                                          setShowKameraModal(true); 
                                        }} 
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-500 hover:text-white border border-slate-200 rounded-lg transition-all text-slate-600 shadow-sm ml-1" 
                                        title="Terminal Absensi Kamera"
                                       suppressHydrationWarning={true}>
                                          <Camera size={12} /> <span className="text-[8px] not-italic font-black">ABSEN</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              }) : <p className="text-[10px] font-black text-slate-300 italic">--- Belum Ada Asisten Ditugaskan ---</p>}
                            </div>

                            {patientCount > 0 && !isEditing ? (
                              <div className="flex items-center justify-between gap-3 pt-2">
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] font-black uppercase text-emerald-700">
                                  <CheckCircle2 size={13} /> Tercatat: {patientCount} Pasien
                                </span>
                                <div className="flex items-center gap-2">
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
                                  <button
                                    type="button"
                                    onClick={() => setModalImutOpen({ dokter: dok, tanggal: selectedDateFull })}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[9px] font-black uppercase text-blue-700 hover:border-blue-400 hover:bg-blue-50"
                                    title="Input sampel IMUT pasien"
                                    suppressHydrationWarning={true}
                                  >
                                    📊 Input Sampel IMUT
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setModalRiwayatOpen({ dokter: dok, tanggal: selectedDateFull })}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-transparent px-3 text-[9px] font-black uppercase text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                                    title="Lihat riwayat sampel IMUT"
                                    suppressHydrationWarning={true}
                                  >
                                    📋 Riwayat Sampel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  handleUpdatePasienSpesifik(dok);
                                }}
                                className="flex gap-3 items-end pt-2"
                              >
                                <label className="flex-1">
                                  <span className="mb-1.5 ml-1 block text-[7px] font-black uppercase tracking-widest text-slate-400 italic">Input Kunjungan</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    inputMode="numeric"
                                    className="w-full rounded-xl border-2 border-blue-200 bg-white px-4 py-2.5 text-xs font-black text-blue-900 outline-none transition-colors"
                                    value={pasienInputValues[cardKey] !== undefined ? pasienInputValues[cardKey] : patientCount}
                                    onChange={(event) => {
                                      setPasienInputValues((previous) => ({ ...previous, [cardKey]: event.target.value }));
                                      setEditingStatus((previous) => ({ ...previous, [cardKey]: true }));
                                    }}
                                    placeholder="Total pasien"
                                   suppressHydrationWarning={true}/>
                                </label>
                                <button
                                  type="submit"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onTouchStart={(event) => event.preventDefault()}
                                  disabled={submitting}
                                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[9px] font-black uppercase text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                                 suppressHydrationWarning={true}>
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
                                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[9px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                                 suppressHydrationWarning={true}>
                                  Batal
                                </button>
                              </form>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 p-4 bg-red-50 rounded-2xl text-center border border-dashed border-red-200 flex items-center justify-center gap-2">
                              <AlertCircle size={14} className="text-red-400" />
                              <p className="text-[10px] font-black text-red-600 uppercase italic">{keteranganBerhalangan || "Dokter Berhalangan Praktik"}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>

        {/* BOTTOM SECTION: MONITOR IZIN CUTI */}
        <div className="mt-12 bg-white rounded-[3.5rem] shadow-xl p-8 border border-slate-100 flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 px-4 mb-6">
                <div className="w-2 h-6 bg-amber-500 rounded-full shadow-lg"></div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin & Cuti SDM</h3>
              </div>

              <div className="flex flex-wrap gap-3 px-4 mb-6">
                <div className="rounded-3xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-[10px] font-black uppercase text-emerald-700">Disetujui: {data?.sdmCuti?.filter(c => c.status_acc === 'Disetujui').length || 0}</div>
                <div className="rounded-3xl bg-amber-50 border border-amber-100 px-4 py-3 text-[10px] font-black uppercase text-amber-700">Menunggu: {data?.sdmCuti?.filter(c => c.status_acc === 'Menunggu').length || 0}</div>
                <div className="rounded-3xl bg-red-50 border border-red-100 px-4 py-3 text-[10px] font-black uppercase text-red-700">Ditolak: {data?.sdmCuti?.filter(c => c.status_acc === 'Ditolak').length || 0}</div>
              </div>

              <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-[2rem] px-4 py-3 flex items-center gap-3 mb-8">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama pengajuan cuti..."
                  className="bg-transparent w-full text-[10px] font-black uppercase outline-none placeholder:text-slate-400"
                  value={searchCutiTerm}
                  onChange={(e) => setSearchCutiTerm(e.target.value)}
                 suppressHydrationWarning={true}/>
              </div>

              {data?.sdmIzinList?.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {data?.sdmIzinList?.filter(s => s.nama_sdm.toLowerCase().includes(searchCutiTerm.toLowerCase()) || s.jenis_cuti.toLowerCase().includes(searchCutiTerm.toLowerCase())).map((s, i) => (
                    <div key={`s-${i}`} className={`p-6 rounded-[2rem] border-l-8 flex justify-between items-center shadow-sm border transition-all ${s.status_acc === 'Disetujui' || s.status_acc === 'Tercatat' ? 'bg-white border-emerald-100 border-l-emerald-500' : s.status_acc === 'Ditolak' ? 'bg-red-50 border-red-100 border-l-red-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                      <div className="max-w-[220px]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-md italic">{s.jenis_cuti}</span>
                          <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none truncate italic">{s.nama_sdm}</h4>
                        </div>
                        <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{format(parseISO(s.tgl_mulai), 'dd MMM yyyy')} - {format(parseISO(s.tgl_selesai), 'dd MMM yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase ${s.status_acc === 'Disetujui' || s.status_acc === 'Tercatat' ? 'bg-emerald-100 text-emerald-700' : s.status_acc === 'Ditolak' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{s.status_acc}</span>
                      </div>
                    </div>
                  ))}

                  {data?.sdmIzinList?.filter(s => s.nama_sdm.toLowerCase().includes(searchCutiTerm.toLowerCase()) || s.jenis_cuti.toLowerCase().includes(searchCutiTerm.toLowerCase())).length === 0 && (
                    <div className="col-span-1 lg:col-span-2 text-center text-xs font-black text-slate-400 uppercase italic py-12 border border-dashed border-slate-200 rounded-[2rem]">
                      Tidak ditemukan pengajuan atau catatan sakit/DL dengan kata kunci tersebut.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-xs font-black text-slate-400 italic py-8 uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-3xl">Tidak ada pengajuan izin/cuti/sakit di bulan ini.</p>
              )}
            </div>

        </div>
      </div>

      {/* ======================================================
          MODAL LEADERBOARD (DUA PILAR POIN TERINTEGRASI ABSENSI)
          ====================================================== */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl rounded-[3rem] p-6 md:p-10 shadow-2xl border-4 border-amber-500/20 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-amber-500 pl-4 flex items-center gap-3">
                <TrendingUp size={24} className="text-amber-500" /> Akumulasi Poin Terintegrasi
              </h3>
              <button onClick={() => setShowLeaderboardModal(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 text-slate-600" suppressHydrationWarning={true}>
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar border rounded-[2rem] border-slate-100">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-900 z-10 shadow-md">
                      <tr className="text-[9px] font-black uppercase italic tracking-widest text-white">
                        <th className="p-5">Nama Staf & Status</th>
                        <th className="p-5 text-center bg-blue-600/20 border-x border-slate-700">Poin Jaspel<br/>(Kuantitatif)</th>
                        <th className="p-5 text-center bg-emerald-600/20 border-r border-slate-700">Saldo Disiplin<br/>(Kehadiran)</th>
                        <th className="p-5 text-center text-amber-400 bg-amber-500/10">GRAND TOTAL POIN<br/>(Bulan Ini)</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-bold uppercase tracking-tighter">
                        {data?.leaderboard?.map((item, i) => {
                            // Penyesuaian Saldo Kedisiplinan
                            const saldoMutu = item.saldo_mutu !== undefined ? item.saldo_mutu : 400; 
                            const poinJaspel = item.total_pasien_bulanan || item.total_pasien || 0;
                            const grandTotal = poinJaspel + saldoMutu;

                            // Pewarnaan Dinamis Kedisiplinan
                            let colorClassMutu = "bg-emerald-100 text-emerald-700 border-emerald-200";
                            let iconMutu = <ShieldCheck size={14} />;
                            if (saldoMutu < 400 && saldoMutu >= 300) {
                                colorClassMutu = "bg-amber-100 text-amber-700 border-amber-200";
                                iconMutu = <ShieldAlert size={14} />;
                            } else if (saldoMutu < 300) {
                                colorClassMutu = "bg-red-100 text-red-700 border-red-200";
                                iconMutu = <ShieldAlert size={14} />;
                            }

                            return (
                            <tr key={i} className="border-b border-slate-100 hover:bg-amber-50/50 transition-all">
                                <td className="p-5">
                                  <p className="text-slate-800 font-black italic text-sm">{item.nama}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[8px] text-white bg-slate-800 px-2 py-0.5 rounded uppercase font-black tracking-widest leading-none">Rank #{i+1}</span>
                                    <span className="text-slate-400 text-[9px] uppercase tracking-wider">{item.detail_poli || "OFF / LIBUR"}</span>
                                  </div>
                                </td>
                                
                                {/* KOLOM 1: POIN KUANTITATIF (JASPEL) */}
                                <td className="p-5 text-center border-x border-slate-100 bg-blue-50/30">
                                  <div className="flex flex-col items-center justify-center">
                                      <span className="text-blue-700 font-black text-base">{poinJaspel} Pts</span>
                                      {item.total_pasien_hari_ini > 0 && (
                                        <span className="text-[8px] text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full mt-1 flex items-center gap-1 font-black tracking-wider">
                                          +{item.total_pasien_hari_ini} HARI INI
                                        </span>
                                      )}
                                  </div>
                                </td>

                                {/* KOLOM 2: SALDO DISIPLIN (ABSENSI) */}
                                <td className="p-5 text-center border-r border-slate-100 bg-slate-50/30">
                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border ${colorClassMutu}`} title="Saldo Poin Kedisiplinan Absen">
                                        {iconMutu} {saldoMutu}
                                    </div>
                                </td>

                                {/* KOLOM 3: GRAND TOTAL */}
                                <td className="p-5 text-center bg-amber-50/30">
                                  <div className="inline-block px-5 py-2.5 rounded-[1rem] bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black text-xl shadow-lg border-b-4 border-amber-700 italic">
                                    {grandTotal.toFixed(1)}
                                  </div>
                                </td>
                            </tr>
                            )
                        })}
                    </tbody>
                  </table>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP CUTI SDM REAL-TIME */}
      {showMissingModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] p-8 md:p-10 shadow-2xl border-4 border-red-500/20 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 mb-6">
              <div>
                <h3 className="text-xl font-black uppercase tracking-widest text-slate-900">Detail Entri Belum Input Point</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] mt-2">Dokter dan perawat yang terjadwal bulan ini tetapi belum mengisi jumlah pasien.</p>
              </div>
              <button onClick={() => setShowMissingModal(false)} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-600" suppressHydrationWarning={true}>
                <XCircle size={20} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6 bg-slate-50 border border-slate-200 rounded-3xl px-4 py-3">
              <Search size={18} className="text-slate-400" />
              <input
                type="text"
                value={searchMissingTerm}
                onChange={(e) => setSearchMissingTerm(e.target.value)}
                placeholder="Cari nama / klinik / tanggal..."
                className="w-full bg-transparent outline-none text-[10px] font-black uppercase placeholder:text-slate-400"
               suppressHydrationWarning={true}/>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.missingPasien?.filter(entry => {
                  const keyword = searchMissingTerm.toLowerCase();
                  return (
                    entry.nama.toLowerCase().includes(keyword) ||
                    (entry.klinik || '').toLowerCase().includes(keyword) ||
                    entry.tanggal.toLowerCase().includes(keyword) ||
                    (entry.role || '').toLowerCase().includes(keyword)
                  );
                }).map((entry, idx) => (
                  <div key={`${entry.nama}-${entry.tanggal}-${idx}`} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] font-black text-slate-400">{entry.role}</p>
                        <h4 className="text-sm font-black uppercase tracking-tight text-slate-900">{entry.nama}</h4>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-600">{entry.tanggal.split('-').reverse().join('/')}</span>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Belum Mengisi Total Pasien</p>
                  </div>
                ))}
                {data?.missingPasien?.filter(entry => {
                  const keyword = searchMissingTerm.toLowerCase();
                  return (
                    entry.nama.toLowerCase().includes(keyword) ||
                    (entry.klinik || '').toLowerCase().includes(keyword) ||
                    entry.tanggal.toLowerCase().includes(keyword) ||
                    (entry.role || '').toLowerCase().includes(keyword)
                  );
                }).length === 0 && (
                  <div className="col-span-1 md:col-span-2 rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                    Tidak ada entri yang cocok dengan kata kunci pencarian.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCutiModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-600/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-600 pl-4 flex items-center gap-3">
              <ClipboardList size={24} className="text-blue-600" /> Form Pengajuan Izin
            </h3>
            <form onSubmit={handleSimpanCutiForm} className="space-y-6">
              
              <input type="hidden" name="ruangan" value={ruanganAktifGlobal}  suppressHydrationWarning={true}/>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Nama Staf (Real-time)</label>
                <select 
                  name="nama" 
                  required 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-sm font-black uppercase shadow-inner cursor-pointer appearance-none outline-none focus:border-blue-500 transition-all text-slate-800"
                >
                  <option value="">-- PILIH STAF SDM --</option>
                  {daftarSDM.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <select name="jenis_cuti" className="w-1/3 bg-slate-900 text-white rounded-2xl px-4 py-5 text-xs font-black uppercase italic shadow-lg">
                  {["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input name="alasan" required className="w-2/3 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-xs font-black uppercase shadow-inner outline-none focus:border-blue-500 text-slate-800" placeholder="KEPERLUAN"  suppressHydrationWarning={true}/>
              </div>
              <div className="flex gap-2">
                <input name="tgl_mulai" type="date" required className="w-1/2 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-[10px] font-black shadow-inner text-slate-700"  suppressHydrationWarning={true}/>
                <input name="tgl_selesai" type="date" required className="w-1/2 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-[10px] font-black shadow-inner text-slate-700"  suppressHydrationWarning={true}/>
              </div>
              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowCutiModal(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors" suppressHydrationWarning={true}>Batal</button>
                <button disabled={submitting} type="submit" className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl italic tracking-widest border-b-4 border-blue-800 active:border-b-0 active:mt-1" suppressHydrationWarning={true}>KIRIM FORM</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SWAP ASISTEN */}
      {showSwap && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-emerald-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-emerald-500 pl-4 flex items-center gap-3">
              <RefreshCw size={24} className="text-emerald-500" /> Manajemen Tukar Tugas
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat A (Asal)</label>
                <select 
                  value={swapData.sdmA} 
                  onChange={(e) => setSwapData({...swapData, sdmA: e.target.value})} 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none focus:border-emerald-500 text-slate-800"
                >
                  <option value="">-- PILIH SEMUA PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (
                    <option key={`swap-A-${item.id}`} value={item.id}>{item.nama} (Tugas: {item.detail_poli || "Cadangan"})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center py-2 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-dashed border-slate-100"></div></div>
                <div className="relative bg-white p-2 rounded-full border-2 border-emerald-500 shadow-lg"><ArrowLeftRight size={24} className="text-emerald-500 animate-pulse" /></div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Pilih Perawat B (Tujuan)</label>
                <select 
                  value={swapData.sdmB} 
                  onChange={(e) => setSwapData({...swapData, sdmB: e.target.value})} 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-[10px] border-2 border-slate-100 outline-none focus:border-emerald-500 text-slate-800"
                >
                  <option value="">-- PILIH SEMUA PERAWAT DINAS --</option>
                  {data?.leaderboard?.map((item) => (
                    <option key={`swap-B-${item.id}`} value={item.id}>{item.nama} (Tugas: {item.detail_poli || "Cadangan"})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setShowSwap(false); setSwapData({ sdmA: "", sdmB: "" }); }} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors" suppressHydrationWarning={true}>Batal</button>
                <button type="button" onClick={handleSwapDB} disabled={submitting || !swapData.sdmA || !swapData.sdmB} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-emerald-700" suppressHydrationWarning={true}>EKSEKUSI TUKAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DOWNLOAD RENTANG TANGGAL */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border-4 border-blue-500/20">
            <h3 className="text-xl font-black italic uppercase text-slate-800 mb-8 border-l-8 border-blue-500 pl-4 flex items-center gap-3">
              <CalendarRange size={24} className="text-blue-500" /> Filter Data Laporan
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Mulai (Awal)</label>
                <input type="date" value={rentangDownload.awal} onChange={(e) => setRentangDownload({...rentangDownload, awal: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none text-slate-700"  suppressHydrationWarning={true}/>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase italic ml-2 block">Tanggal Selesai (Akhir)</label>
                <input type="date" value={rentangDownload.akhir} onChange={(e) => setRentangDownload({...rentangDownload, akhir: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase text-sm border-2 border-slate-100 outline-none text-slate-700"  suppressHydrationWarning={true}/>
              </div>
              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowDownloadModal(false)} className="flex-1 py-5 font-black uppercase text-[10px] text-slate-400 hover:text-red-500 transition-colors" suppressHydrationWarning={true}>Batal</button>
                <button type="button" onClick={executeDownloadLaporan} disabled={isDownloading} className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl disabled:opacity-50 transition-all italic tracking-widest border-b-4 border-blue-800 active:border-b-0 active:mt-1 flex items-center justify-center gap-2" suppressHydrationWarning={true}>
                  {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isDownloading ? "MENYUSUN..." : "DOWNLOAD WORD"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center py-12 opacity-30 text-[9px] font-black uppercase italic tracking-[0.6em] text-slate-900">
        DAK-SYSTEMS INTELLIGENCE v.4.0 | RSUD MERAH PUTIH MAGELANG
      </footer>
    </div>
  );
}