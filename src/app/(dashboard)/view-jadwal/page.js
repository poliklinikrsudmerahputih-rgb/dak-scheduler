"use client";
import React, { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Lottie } from "lottie-react";
import catAnimationData from "@/assets/cat-animation.json";
import dogAnimationData from "@/assets/dog-animation.json";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { daftarKlinikSop } from "@/lib/sop-constants";
import {
  applyImutSampleLimits,
  getMonthlyImutSampleCount,
  getPoliSampleLimit,
  inferImutTargetsFromPicTarget,
  IMUT_REPORT_TARGETS
} from "@/lib/imut-indicators";
import { 
  Search, Camera, Clock, X, BookOpen, Package,
  UserCheck, AlertCircle, Save, CheckCircle2, Activity, Edit3, Hospital, XCircle,
  RefreshCw, ArrowLeftRight, Loader2, TrendingUp, Lock, Unlock, Star, Calendar as CalendarIcon, FileText, Trash2, PieChart, MapPin, Bell,
  ShieldCheck, ShieldAlert, Scale, MinusCircle, PlusCircle, LogIn, LogOut, ClipboardList, ThumbsUp, ClipboardCheck
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

const getClientSessionRoom = () => {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split("; ").find((item) => item.startsWith("session_dak_pro="));
  if (!cookie) return "";

  try {
    const session = JSON.parse(decodeURIComponent(cookie.slice("session_dak_pro=".length)));
    return String(session?.ruangan || "").trim().toUpperCase();
  } catch {
    return "";
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

function ModalImutPasien({
  modal,
  onClose,
  onSaved,
  monthlySampleCount,
  sampleLimit,
  targets,
  targetsLoading,
  quotaReady,
  quotaError
}) {
  const [noRM, setNoRM] = useState("");
  const [jamAsesmen, setJamAsesmen] = useState("");
  const [jamSelesai, setJamSelesai] = useState("");
  const [identifikasiPraTindakan, setIdentifikasiPraTindakan] = useState("");
  const [saving, setSaving] = useState(false);
  const waktuTungguMenit = jamAsesmen && jamSelesai
    ? (() => {
        const [jamMulai, menitMulai] = jamAsesmen.split(":").map(Number);
        const [jamAkhir, menitAkhir] = jamSelesai.split(":").map(Number);
        return (jamAkhir * 60 + menitAkhir) - (jamMulai * 60 + menitMulai);
      })()
    : null;
  const isQuotaCheckPending = sampleLimit !== null && !quotaReady;
  const isWaitQuotaReached = sampleLimit !== null
    && (isQuotaCheckPending || monthlySampleCount >= sampleLimit);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nomorRM = noRM.trim();
    if (
      !nomorRM ||
      !["Ya", "Tidak"].includes(identifikasiPraTindakan) ||
      (!isWaitQuotaReached && (
        !jamAsesmen || !jamSelesai ||
        !Number.isSafeInteger(waktuTungguMenit) || waktuTungguMenit < 0
      ))
    ) {
      return alert("Isi Nomor RM, pilih identifikasi Ya atau Tidak, dan pastikan Jam Selesai tidak mendahului Jam Asesmen.");
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
          identifikasi_pra_tindakan: identifikasiPraTindakan,
          ...(isWaitQuotaReached
            ? { identifikasi_saja: true }
            : {
                jam_asesmen: jamAsesmen,
                jam_selesai: jamSelesai,
                waktu_tunggu_menit: waktuTungguMenit
              })
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menyimpan sampel IMUT.");
      }

      setNoRM("");
      setJamAsesmen("");
      setJamSelesai("");
      setIdentifikasiPraTindakan("");
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
            {isWaitQuotaReached ? "Input Sampel IMUT 2" : "Input Sampel IMUT 2 & 3"}
          </h2>
          <p className="mt-2 text-xs font-bold text-slate-500">
            {modal.dokter.nama_dokter} · {modal.dokter.klinik} · {modal.tanggal}
          </p>
          <div className="mt-3 space-y-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">
            {targets ? (
              <>
                <p>Target Pengumpulan Data · PIC: {targets.targetPIC.toLocaleString("id-ID")} Sampel</p>
                <p>Target Validasi · Kepala Ruang / Koordinator: {targets.targetValidasi.toLocaleString("id-ID")} Sampel</p>
              </>
            ) : (
              <p>{targetsLoading ? "Menghitung target sampel IMUT..." : "Target sampel IMUT belum tersedia."}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isWaitQuotaReached && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              {quotaError
                ? "Kuota sampel IMUT gagal dimuat. Sampel waktu tunggu dikunci; input indikator 2 tetap tersedia."
                : isQuotaCheckPending
                  ? "Kuota sampel IMUT sedang diperiksa. Sampel waktu tunggu tidak dapat ditambahkan saat ini."
                  : "Kuota sampel IMUT untuk poli ini telah terpenuhi. Input indikator 2 tetap tersedia."}
            </p>
          )}
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

          <fieldset className="space-y-2">
            <legend className="text-xs font-black uppercase text-slate-600">
              Dilakukan Identifikasi Pra-Tindakan?
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {["Ya", "Tidak"].map((value) => {
                const isSelected = identifikasiPraTindakan === value;
                const activeStyle = value === "Ya"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-red-500 bg-red-50 text-red-800";
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm font-black transition-colors ${
                      isSelected ? activeStyle : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="identifikasi-pra-tindakan"
                      value={value}
                      checked={isSelected}
                      required
                      onChange={() => setIdentifikasiPraTindakan(value)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    {value}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {!isWaitQuotaReached && (
            <>
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
            </>
          )}

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
                      {["ya", "1", "true"].includes(
                        String(sampel.identifikasi_pra_tindakan).trim().toLowerCase()
                      ) ? "Ya" : "Tidak"}
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
function ModalAbsensiKamera({ isOpen, onClose, onSaved, perawatSelected, ruanganAktif }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [errorKamera, setErrorKamera] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sukses, setSukses] = useState(false);
  
  const [lokasiGPS, setLokasiGPS] = useState(null);
  const [statusGPS, setStatusGPS] = useState('Mencari sinyal GPS...');
  const [shiftAktif, setShiftAktif] = useState('PAGI (07:00 - 07:30)');
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
        onSaved?.();
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
    let cancelled = false;

    if (isOpen) {
      setSukses(false);
      setPreviewFoto(null);
      setTipeAbsen('MASUK');
      setLokasiGPS(null);
      setStatusGPS('Mencari sinyal GPS...');
      setErrorKamera(null);

      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
          .then(stream => {
            if (cancelled) {
              stream.getTracks().forEach(track => track.stop());
              return;
            }
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
            streamReference = stream;
          })
          .catch(err => {
            if (cancelled) return;
            console.error("Gagal akses kamera:", err);
            setErrorKamera("Kamera ditolak. Pastikan akses HTTPS dan beri izin kamera di browser.");
          });
      } else {
        setErrorKamera("Kamera tidak didukung di perangkat/browser ini. Pastikan akses melalui HTTPS.");
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) return;
            setLokasiGPS(`${position.coords.latitude}, ${position.coords.longitude}`);
            setStatusGPS("Titik Koordinat Terkunci ✅");
          },
          (err) => {
            if (cancelled) return;
            if (err?.code === 1) {
              setStatusGPS("Akses lokasi ditolak. Izinkan lokasi di browser untuk mencatat GPS.");
              return;
            }
            console.warn("Gagal GPS:", err?.message || err);
            setStatusGPS("Gagal melacak lokasi. Pastikan GPS / Location Services menyala.");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        setStatusGPS("GPS tidak didukung di perangkat ini.");
      }
    }

    return () => {
      cancelled = true;
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
        onSaved?.();
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
      <div className="fixed inset-0 z-[10006] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-3">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 sm:rounded-[3rem] sm:p-10 shadow-2xl border-4 border-emerald-500/20 text-center">
          <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-3 sm:mb-6 animate-bounce sm:h-20 sm:w-20" />
          <h2 className="text-xl sm:text-2xl font-black uppercase text-slate-800 tracking-widest italic">Berhasil!</h2>
          <p className="text-emerald-600 font-bold mt-2 text-xs sm:text-sm">Data kehadiran & lokasi terkunci.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10006] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/90 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-4">
      <div className="relative my-auto max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border-2 border-emerald-500/20 bg-white p-3 shadow-2xl sm:rounded-[3rem] sm:border-4 sm:p-6 md:p-8">
        
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 p-1.5 text-slate-500 hover:text-slate-700 sm:right-6 sm:top-6 sm:p-2" aria-label="Tutup terminal absen" suppressHydrationWarning={true}>
            <XCircle size={18} />
        </button>

        <div className="mb-3 mt-1 pr-8 text-left sm:mb-6 sm:mt-4 sm:pr-0 sm:text-center">
            <h1 className="inline-block border-b-2 border-emerald-500 pb-0.5 text-lg font-black uppercase italic text-slate-800 sm:border-b-4 sm:pb-1 sm:text-2xl">TERMINAL ABSEN</h1>
            <p className="mt-1 truncate text-xs font-bold uppercase text-slate-600 sm:mt-3 sm:tracking-widest">{perawatSelected.nama}</p>
            <p className="mt-1 inline-block max-w-full truncate rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[9px] font-black text-emerald-700 sm:px-3 sm:py-1 sm:text-[10px]">{ruanganAktif}</p>
        </div>

        <div className={`mb-3 flex items-center gap-2 rounded-xl border p-2 text-[9px] font-black uppercase sm:mb-6 sm:justify-center sm:rounded-2xl sm:p-3 sm:text-[10px] sm:tracking-wider ${lokasiGPS ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'}`}>
            <MapPin size={14} className={`shrink-0 ${lokasiGPS ? 'text-blue-500' : 'text-amber-500'}`} />
            <span className="truncate">{statusGPS}</span>
        </div>

        <div className="mb-3 flex gap-2 sm:mb-6">
            <div className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:rounded-2xl sm:border-2">
                <label className="mb-0.5 ml-1 block text-[8px] font-black uppercase text-slate-400 sm:mb-1">Pilih Shift</label>
                <select 
                    value={shiftAktif} 
                    onChange={(e) => setShiftAktif(e.target.value)}
                    className="w-full appearance-none bg-transparent pr-4 text-[9px] font-black text-slate-800 outline-none sm:text-[10px]"
                >
                    <option value="PAGI (07:00 - 07:30)">PAGI (07:00 - 07:30)</option>
                    <option value="MID 1 (09:00 - 16:00)">MID 1 (09:00 - 16:00)</option>
                    <option value="MID 2 (10:00 - 17:00)">MID 2 (10:00 - 17:00)</option>
                    <option value="MID 3 (11:00 - 18:00)">MID 3 (11:00 - 18:00)</option>
                    <option value="MID 4 (12:00 - 19:00)">MID 4 (12:00 - 19:00)</option>
                </select>
                <Clock size={12} className="pointer-events-none absolute right-2 top-5 text-slate-300 sm:right-3 sm:top-6" />
            </div>

            <div className="flex flex-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:rounded-2xl">
                <button 
                    onClick={() => setTipeAbsen('MASUK')} 
                    className={`flex-1 rounded-lg py-2 text-[9px] font-black transition-all sm:rounded-xl ${tipeAbsen === 'MASUK' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}
                 suppressHydrationWarning={true}>
                    <LogIn size={14} className="mr-1 inline" /> MASUK
                </button>
                <button 
                    onClick={() => setTipeAbsen('PULANG')} 
                    className={`flex-1 rounded-lg py-2 text-[9px] font-black transition-all sm:rounded-xl ${tipeAbsen === 'PULANG' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}
                 suppressHydrationWarning={true}>
                    <LogOut size={14} className="mr-1 inline" /> PULANG
                </button>
            </div>
        </div>

        {errorKamera ? (
           <div className="mb-3 w-full rounded-2xl border border-red-200 bg-red-50 p-3 text-center sm:mb-6 sm:rounded-3xl sm:border-2 sm:p-6">
               <AlertCircle size={24} className="mx-auto mb-2 text-red-400 sm:mb-3" />
               <p className="text-[10px] font-black uppercase leading-relaxed text-red-700">{errorKamera}</p>
           </div>
        ) : (
           <div className="relative mb-3 flex aspect-[4/3] max-h-[30dvh] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-900 shadow-inner sm:mb-6 sm:aspect-auto sm:min-h-[220px] sm:max-h-none sm:rounded-3xl sm:border-4">
               <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"></video>
               <canvas ref={canvasRef} className="hidden"></canvas>
               
               <div className={`pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed sm:inset-6 sm:rounded-2xl sm:border-[3px] ${tipeAbsen === 'MASUK' ? 'border-emerald-400/40' : 'border-red-400/40'}`}></div>
               <div className={`absolute bottom-2 rounded bg-black/50 px-2 py-1 text-[8px] font-black text-white sm:bottom-3 ${tipeAbsen === 'MASUK' ? 'text-emerald-400' : 'text-red-400'}`}>
                   MODE: ABSEN {tipeAbsen}
               </div>
           </div>
        )}

        <div className="space-y-2 sm:space-y-3">
            {!errorKamera && (
              <>
                <button 
                    onClick={capturePreviewFoto} 
                    disabled={loading}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-b-[3px] border-blue-800 bg-blue-600 py-2.5 text-[10px] font-black uppercase italic tracking-wider text-white shadow-xl transition-all hover:bg-blue-700 disabled:opacity-60 sm:rounded-2xl sm:border-b-4 sm:py-4 sm:text-[11px] sm:tracking-widest"
                 suppressHydrationWarning={true}>
                    <Camera size={16} />
                    {previewFoto ? 'AMBIL ULANG FOTO' : 'AMBIL FOTO PRATINJAU'}
                </button>

                {previewFoto ? (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:rounded-3xl sm:bg-slate-950 sm:p-2">
                    <Image src={previewFoto} alt="Pratinjau foto absen" width={160} height={100} className="h-14 w-20 shrink-0 rounded-lg object-cover sm:h-20 sm:w-28" unoptimized />
                    <p className="text-[9px] font-black uppercase text-emerald-700 sm:text-slate-200">Foto siap dikirim</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-center text-[9px] font-bold text-slate-500 sm:rounded-3xl sm:p-6 sm:text-[10px] sm:font-black sm:uppercase">
                    Ambil foto sebelum mengirim absensi masuk.
                  </div>
                )}

                <button 
                    onClick={handleKirimAbsensi} 
                    disabled={loading || (tipeAbsen === 'MASUK' && !previewFoto)}
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-b-[3px] py-2.5 text-[10px] font-black uppercase italic tracking-wider text-white shadow-xl transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:border-b-4 sm:py-4 sm:text-[11px] sm:tracking-widest ${tipeAbsen === 'MASUK' ? 'bg-emerald-600 border-emerald-800 hover:bg-emerald-700' : 'bg-red-600 border-red-800 hover:bg-red-700'}`}
                 suppressHydrationWarning={true}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {loading ? 'MEMPROSES...' : `KIRIM ABSEN ${tipeAbsen === 'MASUK' ? 'MASUK' : 'PULANG'}`}
                </button>
              </>
            )}
            
            <button onClick={() => handleClockIn('MANUAL')} disabled={loading} className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2 text-[9px] font-black uppercase text-slate-600 transition-all hover:bg-slate-200 disabled:opacity-60 sm:rounded-2xl sm:border-2 sm:py-4" suppressHydrationWarning={true}>
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
function ModalLaporanAbsen({ isOpen, onClose, dataAbsen, loading, tanggalLabel, isToday, onClockIn, onDeleteAbsen }) {
    const [previewImage, setPreviewImage] = useState(null);
    const [searchAbsen, setSearchAbsen] = useState('');

    if (!isOpen) return null;

    const normalizedSearchAbsen = searchAbsen.trim().toLowerCase();
    const filteredAbsen = normalizedSearchAbsen
      ? dataAbsen.filter((row) => {
          const nama = String(row.nama_sdm || '').toLowerCase();
          const jabatan = String(row.jabatan || '').toLowerCase();
          const shift = String(row.shift_pilihan || '').toLowerCase();
          return nama.includes(normalizedSearchAbsen) || jabatan.includes(normalizedSearchAbsen) || shift.includes(normalizedSearchAbsen);
        })
      : dataAbsen;

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] p-8 md:p-10 shadow-2xl border-4 border-emerald-500/20 max-h-[90vh] flex flex-col relative">
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black italic uppercase text-slate-800 border-l-8 border-emerald-500 pl-4 flex items-center gap-3"><UserCheck size={24} className="text-emerald-500"/> Laporan Absensi Harian</h3>
              <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200" suppressHydrationWarning={true}><XCircle size={20}/></button>
            </div>

            <div className="mb-6 bg-emerald-50 p-4 rounded-2xl text-[10px] font-black uppercase text-emerald-800 border border-emerald-100">
                <p>Tanggal: <span className="italic font-black text-slate-900">{tanggalLabel}</span></p>
                <p>Total Terjadwal: <span className="italic font-black text-emerald-700">{filteredAbsen.length}{normalizedSearchAbsen ? ` / ${dataAbsen.length}` : ''} SDM</span></p>
                <p>Sudah Absen: <span className="italic font-black text-emerald-700">{filteredAbsen.filter((row) => row.jam_masuk).length} SDM</span></p>
            </div>

            <div className="mb-6 flex items-center gap-3 bg-slate-100/60 px-5 py-4 rounded-2xl border border-slate-200">
                <Search size={18} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Cari nama SDM, jabatan, atau shift..."
                  autoComplete="off"
                  spellCheck="false"
                  className="bg-transparent border-none outline-none text-xs font-black w-full uppercase text-slate-900 placeholder:text-slate-400"
                  value={searchAbsen}
                  onChange={(e) => setSearchAbsen(e.target.value)}
                  suppressHydrationWarning={true}
                />
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center items-center p-12"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>
            ) : dataAbsen.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center">
                        <AlertCircle size={40} className="text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-400 font-black uppercase text-sm italic">Tidak ada SDM terjadwal yang memenuhi syarat absensi pada tanggal ini</p>
                    </div>
                </div>
            ) : filteredAbsen.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center">
                        <AlertCircle size={40} className="text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-400 font-black uppercase text-sm italic">Tidak ada SDM yang cocok dengan pencarian</p>
                    </div>
                </div>
            ) : (
                <div className="overflow-y-auto custom-scrollbar border rounded-[2rem] border-slate-200 bg-white flex-1">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-900 text-white text-[9px] font-black uppercase italic tracking-widest z-10 shadow-md">
                            <tr>
                                <th className="p-5 text-left">No</th>
                                <th className="p-5 text-left">Nama SDM</th>
                                <th className="p-5 text-left">Jabatan</th>
                                <th className="p-5 text-left">Shift</th>
                                <th className="p-5 text-center bg-emerald-600/30">Jam Masuk</th>
                                <th className="p-5 text-center bg-sky-600/30">Status</th>
                                <th className="p-5 text-left">Lokasi (GPS)</th>
                                <th className="p-5 text-left">Foto</th>
                                <th className="p-5 text-left">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-bold uppercase tracking-tighter text-slate-700">
                            {filteredAbsen.map((row, i) => (
                                <tr key={`absen-${row.sdm_id}`} className="border-b border-slate-100 hover:bg-emerald-50/50 transition-colors">
                                    <td className="p-5 text-slate-900 font-extrabold">{i + 1}</td>
                                    <td className="p-5 font-black italic text-emerald-900">{row.nama_sdm}</td>
                                    <td className="p-5"><span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] text-slate-600">{row.jabatan || '-'}</span></td>
                                    <td className="p-5 text-slate-800 font-black">{row.shift_pilihan}</td>
                                    <td className="p-5 text-center text-emerald-700 bg-emerald-50/30 font-black text-sm">{row.jam_masuk || 'Belum Absen'}</td>
                                    <td className="p-5 text-center font-black bg-sky-50/30">
                                        {row.jam_masuk ? (
                                          <span className="inline-flex items-center gap-1 text-sky-700"><ThumbsUp size={18} /> Sudah</span>
                                        ) : <span className="text-amber-700">Belum</span>}
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
                                          <button type="button" onClick={() => setPreviewImage(row.foto_masuk)} className="group block w-56 overflow-hidden rounded-xl border border-slate-200 hover:border-emerald-500 transition-all sm:w-72" suppressHydrationWarning={true}>
                                            <Image src={row.foto_masuk} alt={`Foto ${row.nama_sdm}`} width={288} height={216} className="h-48 w-full rounded-xl object-cover transition-transform duration-200 group-hover:scale-105 sm:h-56" unoptimized />
                                          </button>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 uppercase font-black">Tidak ada</span>
                                        )}
                                    </td>
                                    <td className="p-5 text-left flex flex-col gap-2">
                                        {row.jam_masuk && isToday ? (
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
                                        ) : !row.jam_masuk && isToday ? (
                                          <button
                                            type="button"
                                            onClick={() => onClockIn(row)}
                                            className="text-[10px] font-black uppercase tracking-[.2em] px-3 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white"
                                            suppressHydrationWarning={true}>
                                            Absen Sekarang
                                          </button>
                                        ) : (
                                          <span className="text-[9px] font-black text-slate-400">Tidak ada catatan</span>
                                        )}
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

function ModalMetmor({ isOpen, onClose, selectedDate, entries, history, loading, error }) {
  if (!isOpen) return null;

  const historyDates = [...new Set(history.map((entry) => entry.tanggal))];

  return (
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="metmor-modal-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-slate-950 to-teal-900 p-5 text-white sm:p-7">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white/10 p-2 text-teal-200"><ClipboardCheck size={22} /></span>
            <div>
              <h2 id="metmor-modal-title" className="text-base font-black uppercase tracking-wide sm:text-lg">Meeting Morning</h2>
              <p className="mt-1 text-[10px] font-bold uppercase text-teal-100 sm:text-xs">
                Informasi tanggal {format(parseISO(selectedDate), "dd MMMM yyyy", { locale: id })}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup informasi Metmor" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" suppressHydrationWarning={true}>
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-7">
          <section>
            <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-teal-800">Informasi Tanggal Dipilih</h3>
            {entries.length ? (
              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <article key={`selected-${entry.id || index}`} className="rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-5">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{entry.informasi}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500">
                Belum ada informasi Metmor untuk tanggal ini.
              </p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Riwayat Metmor</h3>
              {!loading && <span className="text-[10px] font-bold text-slate-400">{historyDates.length} tanggal</span>}
            </div>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-teal-700" /></div>
            ) : error ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">{error}</p>
            ) : history.length ? (
              <div className="space-y-3">
                {history.map((entry, index) => (
                  <article key={`history-${entry.id || `${entry.tanggal}-${index}`}`} className={`rounded-2xl border p-4 ${entry.tanggal === selectedDate ? "border-teal-200 bg-teal-50/60" : "border-slate-200 bg-slate-50"}`}>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      {format(parseISO(entry.tanggal), "EEEE, dd MMMM yyyy", { locale: id })}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{entry.informasi}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500">Belum ada riwayat Metmor.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// 3. KOMPONEN UTAMA
// ======================================================
export default function ViewJadwalPublic() {
  const [submitting, setSubmitting] = useState(false);
  
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
  const tanggalLaporanImut = getTanggalJakarta();
  const [isModalImutOpen, setIsModalImutOpen] = useState(false);
  const [isModalSopOpen, setIsModalSopOpen] = useState(false);
  const [isModalSarprasOpen, setIsModalSarprasOpen] = useState(false);
  const [isQuickServicesOpen, setIsQuickServicesOpen] = useState(false);
  const [activeSopTab, setActiveSopTab] = useState("list");
  const [searchSopTerm, setSearchSopTerm] = useState("");
  const [sopSessionRoom, setSopSessionRoom] = useState("");
  const [sopForm, setSopForm] = useState({
    judul_sop: "",
    ruangan: "",
    klinik: "",
    tanggal_pembuatan: "",
    tanggal_pengesahan: "",
    link_gdrive: ""
  });
  const [sopSubmitError, setSopSubmitError] = useState("");
  const [sopSubmitNotice, setSopSubmitNotice] = useState("");
  const [sopSubmitting, setSopSubmitting] = useState(false);

  const imutParams = new URLSearchParams({
    tipe: "bulanan",
    bulan: String(Number(tanggalLaporanImut.slice(5, 7))),
    tahun: String(Number(tanggalLaporanImut.slice(0, 4))),
    tanggal_hari_ini: tanggalLaporanImut,
    ruangan: ruanganShare || "POLIKLINIK"
  });
  const imutQuotaParams = new URLSearchParams({
    tipe: "bulanan",
    bulan: String(Number(selectedDateFull.slice(5, 7))),
    tahun: String(Number(selectedDateFull.slice(0, 4))),
    tanggal_hari_ini: tanggalLaporanImut,
    ruangan: ruanganShare || "POLIKLINIK"
  });
  const { data: dataImut, error: errorImut, isLoading: loadingImut, mutate: mutateImut } = useSWR(
    isModalImutOpen ? `/api/analisis-imut?${imutParams}` : null,
    fetchJSONWithTimeout,
    { revalidateOnFocus: true, refreshInterval: 60000, dedupingInterval: 60000 }
  );
  const {
    data: dataImutQuota,
    error: errorImutQuota,
    isLoading: loadingImutQuota,
    mutate: mutateImutQuota
  } = useSWR(`/api/analisis-imut?${imutQuotaParams}`, fetchJSONWithTimeout, {
    revalidateOnFocus: true,
    refreshInterval: 60000,
    dedupingInterval: 60000
  });
  const quotaDataReady = Boolean(dataImutQuota && !errorImutQuota && !loadingImutQuota);
  const totalKunjunganImut = (Array.isArray(dataImut?.rekap) ? dataImut.rekap : [])
    .reduce((total, row) => total + (Number(row.kunjungan) || 0), 0);
  const indikatorMutuDisplayed = applyImutSampleLimits(
    Array.isArray(dataImut?.indikatorMutu) ? dataImut.indikatorMutu : [],
    Array.isArray(dataImut?.rekap) ? dataImut.rekap : []
  );
  const totalTargetsImut = IMUT_REPORT_TARGETS;
  const { data: dataSop, error: errorSop, isLoading: loadingSop, mutate: mutateSop } = useSWR(
    "/api/sop",
    fetchJSONWithTimeout,
    swrOptions
  );
  const { data, error: dashboardError, isLoading: loading, mutate: mutateDashboard } = useSWR(
    dashboardUrl,
    fetchJSONWithTimeout,
    swrOptions
  );
  const { data: sdmData } = useSWR("/api/sdm", fetchJSONWithTimeout, swrOptions);
  const daftarSDM = Array.isArray(sdmData) ? sdmData : [];
  const daftarSop = Array.isArray(dataSop) ? dataSop : [];
  const normalizedSearchSop = searchSopTerm.trim().toLowerCase();
  const filteredSop = daftarSop.filter((sop) => {
    const nomorSop = String(sop.no_sop ?? sop.nomor_sop ?? sop.nomor ?? "");
    const judulSop = String(sop.judul_sop ?? sop.judul_prosedur ?? sop.judul ?? sop.nama_sop ?? "");
    return `${nomorSop} ${judulSop}`.toLowerCase().includes(normalizedSearchSop);
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [searchCutiTerm, setSearchCutiTerm] = useState("");
  const [searchMissingTerm, setSearchMissingTerm] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [showCutiModal, setShowCutiModal] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  
  // State untuk Laporan Absen Harian
  const [showLaporanAbsenModal, setShowLaporanAbsenModal] = useState(false);
  const [dataLaporanAbsen, setDataLaporanAbsen] = useState([]);
  const [loadingAbsen, setLoadingAbsen] = useState(false);
  const [metmorEntries, setMetmorEntries] = useState([]);
  const [metmorError, setMetmorError] = useState("");
  const [isMetmorModalOpen, setIsMetmorModalOpen] = useState(false);
  const [metmorHistory, setMetmorHistory] = useState([]);
  const [loadingMetmorHistory, setLoadingMetmorHistory] = useState(false);
  const [metmorHistoryError, setMetmorHistoryError] = useState("");
  
  // State: Modal Absensi Kamera Langsung
  const [showKameraModal, setShowKameraModal] = useState(false);
  const [perawatTarget, setPerawatTarget] = useState(null);
  const [ruanganAktifGlobal, setRuanganAktifGlobal] = useState('POLIKLINIK');
  const [modalImutOpen, setModalImutOpen] = useState(null);
  const [modalRiwayatOpen, setModalRiwayatOpen] = useState(null);
  const [imutSaveNotice, setImutSaveNotice] = useState("");
  const modalImutPicTarget = modalImutOpen
    ? getPoliSampleLimit(modalImutOpen.dokter.klinik)
    : null;
  const modalImutTargets = modalImutOpen && modalImutPicTarget !== null
    ? inferImutTargetsFromPicTarget(modalImutPicTarget)
    : null;

  const handleCreateSopFromPublicModal = async (event) => {
    event.preventDefault();
    setSopSubmitError("");
    setSopSubmitNotice("");
    setSopSubmitting(true);
    try {
      const response = await fetch("/api/sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sopForm)
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || !result.data?.nomor_sop) {
        throw new Error(result.error || "Nomor SOP tidak berhasil dibuat.");
      }

      setSopSubmitNotice(
        `SUKSES! Nomor SOP Anda adalah: ${result.data.nomor_sop}. Silakan catat di dokumen Word Anda.`
      );
      await mutateSop();
      setSopForm((current) => ({
        ...current,
        judul_sop: "",
        klinik: "",
        tanggal_pembuatan: "",
        tanggal_pengesahan: "",
        link_gdrive: ""
      }));
      setSearchSopTerm("");
      setActiveSopTab("list");
    } catch (error) {
      setSopSubmitError(error.message || "Gagal membuat nomor SOP.");
    } finally {
      setSopSubmitting(false);
    }
  };

  useEffect(() => {
    if (!imutSaveNotice) return undefined;
    const timeoutId = window.setTimeout(() => setImutSaveNotice(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [imutSaveNotice]);

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
  }, [data, ruanganShare]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      tanggal: selectedDateFull,
      ruangan: String(ruanganShare || ruanganAktifGlobal || "POLIKLINIK").trim().toUpperCase(),
    });

    fetch(`/api/metmor/public?${params.toString()}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success !== true || !Array.isArray(result.data)) {
          throw new Error(result.error || "Gagal memuat informasi Meeting Morning.");
        }
        if (active) {
          setMetmorEntries(result.data);
          setMetmorError("");
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Gagal memuat informasi Meeting Morning:", error);
        setMetmorEntries([]);
        setMetmorError(error.message || "Gagal memuat informasi Meeting Morning.");
      });

    return () => {
      active = false;
    };
  }, [selectedDateFull, ruanganAktifGlobal, ruanganShare]);

  const handleOpenMetmor = async () => {
    setIsMetmorModalOpen(true);
    setLoadingMetmorHistory(true);
    setMetmorHistoryError("");
    const ruangan = String(ruanganShare || ruanganAktifGlobal || "POLIKLINIK").trim().toUpperCase();
    const params = new URLSearchParams({ ruangan, history: "true" });

    try {
      const response = await fetch(`/api/metmor/public?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || result.success !== true || !Array.isArray(result.data)) {
        throw new Error(result.error || "Gagal memuat riwayat Metmor.");
      }
      setMetmorHistory(result.data);
    } catch (error) {
      console.error("Gagal memuat riwayat Metmor:", error);
      setMetmorHistory([]);
      setMetmorHistoryError(error.message || "Gagal memuat riwayat Metmor.");
    } finally {
      setLoadingMetmorHistory(false);
    }
  };
  const handleMulaiPraktik = async (dok, jamMulaiManual = "") => {
    const dokterId = Number(dok.id);
    if (!Number.isSafeInteger(dokterId) || dokterId <= 0) {
      alert("ID dokter tidak valid.");
      return;
    }
    const sampleLimit = getPoliSampleLimit(dok.klinik);
    if (sampleLimit !== null) {
      if (!quotaDataReady) {
        alert(errorImutQuota?.message || "Kuota sampel IMUT belum dapat diverifikasi. Coba lagi sebentar.");
        return;
      }
      const sampleCount = getMonthlyImutSampleCount(dataImutQuota?.rekap, dok.klinik, "sampelKehadiran");
      if (sampleCount >= sampleLimit) {
        alert("Kuota sampel IMUT untuk poli ini telah terpenuhi.");
        return;
      }
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
      void mutateImutQuota().catch((error) => {
        console.error("Gagal memperbarui rekap kuota IMUT:", error);
      });
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
    if (!dok.jam_mulai_aktual) {
      const sampleLimit = getPoliSampleLimit(dok.klinik);
      if (sampleLimit !== null) {
        if (!quotaDataReady) {
          alert(errorImutQuota?.message || "Kuota sampel IMUT belum dapat diverifikasi. Coba lagi sebentar.");
          return;
        }
        const sampleCount = getMonthlyImutSampleCount(dataImutQuota?.rekap, dok.klinik, "sampelKehadiran");
        if (sampleCount >= sampleLimit) {
          alert("Kuota sampel IMUT untuk poli ini telah terpenuhi.");
          return;
        }
      }
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
      if (!dok.jam_mulai_aktual) {
        void mutateImutQuota().catch((error) => {
          console.error("Gagal memperbarui rekap kuota IMUT:", error);
        });
      }
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
        setRuanganAktifGlobal(row?.ruangan || ruanganAktifGlobal);
        setShowKameraModal(true);
      }
    } catch (err) {
      console.error('Gagal menghapus absen:', err);
      alert(err?.message || 'Gagal menghapus data absen.');
    } finally {
      setLoadingAbsen(false);
    }
  };

  const loadDataLaporanAbsen = async () => {
    setLoadingAbsen(true);
    try {
      const params = new URLSearchParams({
        tanggal: selectedDateFull,
        ruangan: ruanganAktifGlobal || "POLIKLINIK",
      });
      const res = await fetch(`/api/absensi?${params.toString()}`);
      const result = await res.json();
      if (!res.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || 'Gagal mengambil laporan absensi.');
      }
      setDataLaporanAbsen(result.data);
    } finally {
      setLoadingAbsen(false);
    }
  };

  const handleOpenAbsensiFromReport = (row) => {
    setPerawatTarget({ id: row.sdm_id, nama: row.nama_sdm });
    setRuanganAktifGlobal(row.ruangan || "POLIKLINIK");
    setShowLaporanAbsenModal(false);
    setShowKameraModal(true);
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
      <ModalMetmor
        isOpen={isMetmorModalOpen}
        onClose={() => setIsMetmorModalOpen(false)}
        selectedDate={selectedDateFull}
        entries={metmorEntries}
        history={metmorHistory}
        loading={loadingMetmorHistory}
        error={metmorHistoryError}
      />
      <ModalLaporanAbsen
        isOpen={showLaporanAbsenModal}
        onClose={() => setShowLaporanAbsenModal(false)}
        dataAbsen={dataLaporanAbsen}
        loading={loadingAbsen}
        tanggalLabel={labelHariIni}
        isToday={selectedDateFull === getTanggalJakarta()}
        onClockIn={handleOpenAbsensiFromReport}
        onDeleteAbsen={handleDeleteAbsen}
      />
      <ModalAbsensiKamera
        isOpen={showKameraModal}
        onClose={() => setShowKameraModal(false)}
        onSaved={() => {
          loadDataLaporanAbsen()
            .then(() => setShowLaporanAbsenModal(true))
            .catch((error) => {
              console.error("Gagal memperbarui laporan absensi:", error);
              alert(error.message || "Gagal memperbarui laporan absensi.");
            });
        }}
        perawatSelected={perawatTarget}
        ruanganAktif={ruanganAktifGlobal}
      />
      {modalImutOpen && (
        <ModalImutPasien
          modal={modalImutOpen}
          onClose={() => setModalImutOpen(null)}
          targets={modalImutTargets}
          targetsLoading={loadingImutQuota && !errorImutQuota}
          sampleLimit={getPoliSampleLimit(modalImutOpen.dokter.klinik)}
          monthlySampleCount={getMonthlyImutSampleCount(
            dataImutQuota?.rekap,
            modalImutOpen.dokter.klinik,
            "sampelWaktuTunggu"
          )}
          quotaReady={quotaDataReady}
          quotaError={errorImutQuota}
          onSaved={() => {
            setModalImutOpen(null);
            setImutSaveNotice("Sampel IMUT sudah tersimpan.");
            void mutateImutQuota().catch((error) => {
              console.error("Gagal memperbarui rekap kuota IMUT:", error);
            });
            void mutateImut().catch((error) => {
              console.error("Gagal memperbarui capaian mutu IMUT:", error);
            });
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
      {isModalImutOpen && (
        <div
          className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsModalImutOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-capaian-inm-title"
            className="max-h-[90vh] w-11/12 max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="modal-capaian-inm-title" className="text-lg font-black text-slate-900 sm:text-xl">
                  Laporan Indikator Mutu Rawat Jalan
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Periode {format(parseISO(`${tanggalLaporanImut.slice(0, 7)}-01`), "MMMM yyyy", { locale: id })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalImutOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-bold text-slate-600 hover:bg-slate-200"
                aria-label="Tutup pop-up capaian mutu"
              >
                ✕
              </button>
            </div>

            {dataImut && (
              <div className="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs font-semibold text-blue-950 sm:grid-cols-2">
                <p>Target Pengumpulan Data · PIC: {totalTargetsImut.targetPIC.toLocaleString("id-ID")} Sampel</p>
                <p>Target Validasi · Kepala Ruang / Koordinator: {totalTargetsImut.targetValidasi.toLocaleString("id-ID")} Sampel</p>
              </div>
            )}

            {loadingImut && !dataImut && (
              <div className="py-12 text-center text-sm font-semibold text-slate-500">
                <Loader2 className="mx-auto mb-2 animate-spin" size={22} />
                Memuat capaian mutu...
              </div>
            )}
            {errorImut && (
              <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                {errorImut.message.includes("status 401")
                  ? "Capaian mutu belum dapat dimuat."
                  : errorImut.message || "Capaian mutu belum dapat dimuat."}
              </div>
            )}
            {dataImut && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                    <tr>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">No</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">Indikator Mutu</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">Target</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">Capaian (%)</th>
                      <th scope="col" className="border-b border-slate-200 px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indikatorMutuDisplayed.map((indikator, index) => {
                      const hasSamples = Number(indikator.denominator) > 0 && indikator.capaian !== null;
                      const tercapai = hasSamples && Number(indikator.capaian) >= Number(indikator.target);
                      return (
                        <tr key={indikator.key || `${indikator.nama}-${index}`} className="odd:bg-white even:bg-slate-50/70">
                          <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{index + 1}</td>
                          <th scope="row" className="border-b border-slate-100 px-4 py-3 font-bold text-slate-800">{indikator.nama}</th>
                          <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{Number(indikator.target).toLocaleString("id-ID")}%</td>
                          <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-700">
                            {hasSamples ? `${Number(indikator.capaian).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—"}
                          </td>
                          <td className="border-b border-slate-100 px-4 py-3">
                            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black ${!hasSamples ? "bg-slate-100 text-slate-600" : tercapai ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                              {!hasSamples ? "Belum ada sampling" : tercapai ? "🟢 Tercapai" : "🔴 Belum"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {indikatorMutuDisplayed.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                          Belum ada data indikator mutu pada periode ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {dataImut && (
              <section aria-labelledby="ringkasan-perhitungan-imut" className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-4 sm:p-5">
                <h3 id="ringkasan-perhitungan-imut" className="text-sm font-black text-slate-900">
                  Ringkasan Perhitungan dan Target Sampel
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Capaian dihitung dengan rumus Numerator ÷ Denominator × 100. Target PIC laporan adalah 128 sampel; perhitungan target validasi: 128 × (48 ÷ 128) = 48 sampel. Target PIC poli mengikuti kuota sampel poli dan target validasinya dihitung dari target PIC poli × (48 ÷ 128), dibulatkan ke sampel terdekat. Sampel indikator 2 di atas kuota poli tidak diikutkan dalam rumus resmi.
                </p>
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-blue-100 bg-white p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Populasi · Kunjungan Pasien</dt>
                    <dd className="mt-1 text-lg font-black text-slate-900">{totalKunjunganImut.toLocaleString("id-ID")}</dd>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-white p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Target Pengumpulan Data · PIC</dt>
                    <dd className="mt-1 text-lg font-black text-slate-900">{totalTargetsImut.targetPIC.toLocaleString("id-ID")} sampel</dd>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-white p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Target Validasi</dt>
                    <dd className="mt-1 text-lg font-black text-slate-900">{totalTargetsImut.targetValidasi.toLocaleString("id-ID")} sampel</dd>
                  </div>
                </dl>
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-700">Rincian Numerator, Denominator, dan Rumus</h4>
                  {indikatorMutuDisplayed.map((indikator) => {
                    const numerator = Number(indikator.numerator) || 0;
                    const denominator = Number(indikator.denominator) || 0;
                    const capaian = indikator.capaian === null || indikator.capaian === undefined
                      ? null
                      : Number(indikator.capaian);
                    return (
                      <dl key={indikator.key} className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-blue-100 bg-white p-3 text-xs sm:grid-cols-[minmax(0,1.2fr)_minmax(5rem,0.6fr)_minmax(5rem,0.6fr)_minmax(0,1.5fr)] sm:items-center">
                        <dt className="font-bold text-slate-800">{indikator.nama}</dt>
                        <div><dt className="inline text-slate-500">Numerator: </dt><dd className="inline font-semibold text-slate-800">{numerator.toLocaleString("id-ID")}</dd></div>
                        <div><dt className="inline text-slate-500">Denominator: </dt><dd className="inline font-semibold text-slate-800">{denominator.toLocaleString("id-ID")}</dd></div>
                        <div>
                          <dt className="inline text-slate-500">Rumus: </dt>
                          <dd className="inline font-semibold text-slate-800">
                            {denominator > 0 && capaian !== null && Number.isFinite(capaian)
                              ? `${numerator.toLocaleString("id-ID")} ÷ ${denominator.toLocaleString("id-ID")} × 100 = ${capaian.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`
                              : "Belum dapat dihitung (belum ada sampling)"}
                          </dd>
                        </div>
                      </dl>
                    );
                  })}
                </div>
              </section>
            )}
            <p className="mt-4 text-[10px] leading-4 text-slate-500">
              Capaian ditampilkan dari rekap sampling indikator mutu bulan berjalan. Data diperbarui otomatis setiap menit.
            </p>
          </section>
        </div>
      )}
      {isModalSarprasOpen && (
        <div
          className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsModalSarprasOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-sarpras-title"
            className="max-h-[95vh] w-full max-w-[95vw] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="modal-sarpras-title" className="text-lg font-black text-slate-900 sm:text-xl">
                  Pencatatan Sarpras Rawat Jalan
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Kelola kebutuhan sarana-prasarana tanpa meninggalkan halaman jadwal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalSarprasOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Tutup pop-up Sarpras"
              >
                <X size={18} />
              </button>
            </div>
            <iframe
              title="Pencatatan Sarpras Rawat Jalan"
              src="/shared/sarpras"
              className="h-[78vh] min-h-[480px] w-full rounded-lg border border-slate-200 bg-white"
            />
          </section>
        </div>
      )}

      {isModalSopOpen && (
        <div
          className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsModalSopOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-sop-title"
            className={`max-h-[95vh] w-full ${activeSopTab === "ai" ? "max-w-[95vw]" : "max-w-4xl"} overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6`}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="modal-sop-title" className="text-lg font-black text-slate-900 sm:text-xl">
                  Buku Saku Digital &amp; SOP Unit Rawat Jalan
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Cari dokumen yang tersedia atau daftarkan SOP baru.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalSopOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Tutup pop-up SOP"
              >
                <X size={18} />
              </button>
            </div>

            <div role="tablist" aria-label="Menu Buku Saku SOP" className="mb-5 flex flex-wrap gap-2 border-b border-slate-200">
              <button
                type="button"
                role="tab"
                aria-selected={activeSopTab === "list"}
                onClick={() => setActiveSopTab("list")}
                className={`rounded-t-lg px-4 py-3 text-sm font-bold transition ${activeSopTab === "list" ? "border-b-2 border-green-600 text-green-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
              >
                🔍 Cari SOP
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSopTab === "input"}
                onClick={() => {
                  setSopSubmitError("");
                  setSopSubmitNotice("");
                  setActiveSopTab("input");
                }}
                className={`rounded-t-lg px-4 py-3 text-sm font-bold transition ${activeSopTab === "input" ? "border-b-2 border-green-600 text-green-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
              >
                ➕ Buat SOP Baru
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSopTab === "ai"}
                onClick={() => {
                  setSopSessionRoom(getClientSessionRoom());
                  setActiveSopTab("ai");
                }}
                className={`rounded-t-lg px-4 py-3 text-sm font-bold transition ${activeSopTab === "ai" ? "border-b-2 border-green-600 text-green-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
              >
                ✨ Buat/Revisi SPO + AI
              </button>
            </div>

            {sopSubmitNotice && (
              <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                {sopSubmitNotice}
              </p>
            )}

            {activeSopTab === "list" && (
              <>
                <label htmlFor="search-sop" className="mb-4 block">
                  <span className="sr-only">Cari SOP</span>
                  <input
                    id="search-sop"
                    type="text"
                    value={searchSopTerm}
                    onChange={(event) => setSearchSopTerm(event.target.value)}
                    placeholder="Cari judul SOP..."
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  />
                </label>

                {loadingSop && !dataSop && (
                  <div className="py-10 text-center text-sm font-semibold text-slate-500">
                    <Loader2 className="mx-auto mb-2 animate-spin" size={22} />
                    Memuat daftar SOP...
                  </div>
                )}
                {errorSop && (
                  <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Daftar SOP belum dapat dimuat. {errorSop.message || "Silakan coba kembali nanti."}
                  </div>
                )}
                {!loadingSop && !errorSop && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                      <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                        <tr>
                          <th scope="col" className="border-b border-slate-200 px-4 py-3">No. SOP</th>
                          <th scope="col" className="border-b border-slate-200 px-4 py-3">Judul</th>
                          <th scope="col" className="border-b border-slate-200 px-4 py-3">Klinik</th>
                          <th scope="col" className="border-b border-slate-200 px-4 py-3">Dokumen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSop.map((sop, index) => {
                          const nomorSop = sop.no_sop ?? sop.nomor_sop ?? sop.nomor ?? "—";
                          const judulSop = sop.judul_sop ?? sop.judul_prosedur ?? sop.judul ?? sop.nama_sop ?? "Tanpa judul";
                          return (
                            <tr key={sop.id ?? `${nomorSop}-${index}`} className="odd:bg-white even:bg-slate-50/70">
                              <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-700">{nomorSop}</td>
                              <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">{judulSop}</td>
                              <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                                {sop.klinik || sop.ruangan || sopSessionRoom || "POLIKLINIK"}
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3">
                                {sop.link_gdrive ? (
                                  <a
                                    href={sop.link_gdrive}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex whitespace-nowrap rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-green-700"
                                  >
                                    Buka Dokumen
                                  </a>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-400">Dokumen belum tersedia</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredSop.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                              {daftarSop.length === 0
                                ? "Belum ada data SOP."
                                : "Tidak ada SOP yang cocok dengan pencarian."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {activeSopTab === "input" && (
              <form onSubmit={handleCreateSopFromPublicModal} className="space-y-4">
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                  Nomor urut SOP akan dibuatkan otomatis oleh sistem setelah Anda menyimpan form ini.
                </p>
                <label className="block space-y-2 text-xs font-bold text-slate-600">
                  <span>Judul SOP</span>
                  <input
                    required
                    maxLength={255}
                    value={sopForm.judul_sop}
                    onChange={(event) => setSopForm((current) => ({ ...current, judul_sop: event.target.value }))}
                    placeholder="Masukkan judul prosedur"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  />
                </label>
                <label className="block space-y-2 text-xs font-bold text-slate-600">
                  <span>Klinik Tujuan</span>
                  <select
                    required
                    value={sopForm.klinik}
                    onChange={(event) => setSopForm((current) => ({ ...current, klinik: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 disabled:bg-slate-100"
                  >
                    <option value="" disabled>Pilih klinik</option>
                    {daftarKlinikSop.map((klinik) => (
                      <option key={klinik} value={klinik}>{klinik}</option>
                    ))}
                  </select>
                  <span className="block font-medium text-slate-400">Data SOP tersimpan pada ruangan {sopSessionRoom || "POLIKLINIK"}.</span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2 text-xs font-bold text-slate-600">
                    <span>Tanggal Pembuatan <span className="font-medium text-slate-400">(opsional)</span></span>
                    <input
                      type="date"
                      value={sopForm.tanggal_pembuatan}
                      onChange={(event) => setSopForm((current) => ({ ...current, tanggal_pembuatan: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                    />
                  </label>
                  <label className="block space-y-2 text-xs font-bold text-slate-600">
                    <span>Tanggal Pengesahan <span className="font-medium text-slate-400">(opsional)</span></span>
                    <input
                      type="date"
                      value={sopForm.tanggal_pengesahan}
                      onChange={(event) => setSopForm((current) => ({ ...current, tanggal_pengesahan: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                    />
                  </label>
                </div>
                <label className="block space-y-2 text-xs font-bold text-slate-600">
                  <span>Link Google Drive <span className="font-medium text-slate-400">(opsional)</span></span>
                  <input
                    type="url"
                    value={sopForm.link_gdrive}
                    onChange={(event) => setSopForm((current) => ({ ...current, link_gdrive: event.target.value }))}
                    placeholder="https://drive.google.com/..."
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  />
                </label>
                {sopSubmitError && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {sopSubmitError}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sopSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sopSubmitting && <Loader2 size={16} className="animate-spin" />}
                    {sopSubmitting ? "Menyimpan..." : "Simpan / Generate Nomor"}
                  </button>
                </div>
              </form>
            )}
            {activeSopTab === "ai" && (
              sopSessionRoom ? (
                <iframe
                  title="Manajemen SPO dan Asisten AI"
                  src="/shared/spo-generator"
                  className="h-[78vh] min-h-[480px] w-full rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                  <p className="font-bold">Masuk terlebih dahulu untuk menggunakan Manajemen SPO + AI.</p>
                  <a
                    href="/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-lg bg-amber-700 px-4 py-2 font-bold text-white hover:bg-amber-800"
                  >
                    Masuk ke akun
                  </a>
                  <p className="mt-3 text-xs">Setelah masuk, pilih kembali tab “Buat/Revisi SPO + AI”.</p>
                </div>
              )
            )}
          </section>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-xl">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pb-24">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/20 to-teal-300/10 text-emerald-200 shadow-lg shadow-emerald-950/20 sm:h-14 sm:w-14">
                <Hospital size={28} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300">Pusat Informasi Poliklinik</p>
                <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
                  Jadwal &amp; Informasi Poliklinik
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-300 sm:text-base">Informasi praktik dokter dan layanan poliklinik</p>
              </div>
            </div>
            <div className="flex w-full items-center justify-between gap-3 lg:w-auto lg:gap-4">
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 backdrop-blur sm:px-5 lg:flex-none">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tanggal terpilih</p>
                  <p className="mt-1 truncate text-sm font-bold text-white sm:text-base">{labelHariIni}</p>
                </div>
                <div className="h-9 w-px shrink-0 bg-white/10" />
                <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-emerald-200">
                  <Clock size={16} />
                  <LiveClock />
                </div>
              </div>
              <div
                aria-hidden="true"
                className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-200/20 bg-white/[0.06] shadow-inner"
                style={{ width: "clamp(4.5rem, 8vw, 7rem)", height: "clamp(4.5rem, 8vw, 7rem)" }}
              >
                <Lottie
                  src={dogAnimationData}
                  renderer="svg"
                  rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
                  speed={1}
                  autoplay
                  loop
                  aria-hidden="true"
                  className="block h-full w-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[10020] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
        {isQuickServicesOpen && (
          <section
            id="quick-services-panel"
            aria-label="Widget layanan"
            className="max-h-[min(72vh,36rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
          >
            <div className="sticky top-0 flex items-center justify-between bg-gradient-to-r from-slate-950 to-emerald-900 px-4 py-4 text-white">
              <div className="min-w-0">
                <div>
                  <h2 className="text-sm font-bold">Akses Cepat</h2>
                  <p className="mt-1 text-[11px] text-slate-300">Layanan informasi poliklinik</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickServicesOpen(false)}
                aria-label="Tutup widget layanan"
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                <X size={18} />
              </button>
            </div>
            <nav aria-label="Layanan informasi dan referensi" className="grid grid-cols-2 gap-2 p-3">
              <button
                type="button"
                onClick={() => {
                  setIsQuickServicesOpen(false);
                  setIsModalImutOpen(true);
                }}
                className="flex min-h-[5.25rem] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-haspopup="dialog"
                aria-expanded={isModalImutOpen}
                suppressHydrationWarning={true}
              >
                <PieChart size={19} className="text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">Capaian Mutu</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const room = getClientSessionRoom() || "POLIKLINIK";
                  setSopSessionRoom(room);
                  setSopForm((current) => ({ ...current, ruangan: room }));
                  setIsQuickServicesOpen(false);
                  setIsModalSopOpen(true);
                }}
                className="flex min-h-[5.25rem] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-haspopup="dialog"
                aria-expanded={isModalSopOpen}
                suppressHydrationWarning={true}
              >
                <BookOpen size={19} className="text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">Buku Saku SOP</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickServicesOpen(false);
                  setIsModalSarprasOpen(true);
                }}
                className="flex min-h-[5.25rem] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-haspopup="dialog"
                aria-expanded={isModalSarprasOpen}
                suppressHydrationWarning={true}
              >
                <Package size={19} className="text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">Sarpras Rawat Jalan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickServicesOpen(false);
                  handleOpenMetmor();
                }}
                className="flex min-h-[5.25rem] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-haspopup="dialog"
                aria-expanded={isMetmorModalOpen}
                suppressHydrationWarning={true}
              >
                <ClipboardCheck size={19} className="text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">Meeting Morning</span>
              </button>
            </nav>
          </section>
        )}
        <button
          type="button"
          onClick={() => setIsQuickServicesOpen((open) => !open)}
          aria-label={isQuickServicesOpen ? "Tutup menu layanan" : "Klik kucing untuk membuka layanan"}
          aria-expanded={isQuickServicesOpen}
          aria-controls={isQuickServicesOpen ? "quick-services-panel" : undefined}
          className="group flex min-h-0 w-28 flex-col items-center gap-0 rounded-2xl bg-transparent p-0 text-slate-800 drop-shadow-[0_2px_3px_rgba(255,255,255,0.9)] transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:w-32"
          suppressHydrationWarning={true}
        >
          <Lottie
            src={catAnimationData}
            renderer="svg"
            rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
            speed={1}
            autoplay
            loop
            aria-hidden="true"
            className="h-24 w-24 sm:h-28 sm:w-28"
          />
          <span className="pb-1 text-xs font-extrabold tracking-wide text-slate-900">
            {isQuickServicesOpen ? "Tutup menu" : "Klik kucing"}
          </span>
        </button>
      </div>

      {(metmorEntries.length > 0 || metmorError) && (
        <section className="mx-auto -mt-5 mb-6 w-[calc(100%-2rem)] max-w-7xl rounded-3xl border border-teal-100 bg-white p-5 shadow-xl sm:p-7">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><ClipboardCheck size={21} /></span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Informasi Meeting Morning</h2>
              <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">{format(parseISO(selectedDateFull), "EEEE, dd MMMM yyyy", { locale: id })}</p>
            </div>
          </div>
          {metmorError ? (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Informasi Meeting Morning belum dapat dimuat.</p>
          ) : (
            <div className="space-y-3">
              {metmorEntries.map((entry, index) => (
                <article key={`${entry.tanggal}-${index}`} className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 sm:p-5">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{entry.informasi}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 sm:px-6 lg:px-8 -mt-12 relative z-10">
        <section aria-label="Aksi cepat" className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-lg shadow-slate-900/5 sm:p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Aksi cepat</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Kelola aktivitas dan informasi staf</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={async () => {
                try {
                  await loadDataLaporanAbsen();
                } catch (err) {
                  console.error("Gagal fetch laporan absen:", err);
                  alert(err?.message || 'Gagal mengambil laporan absensi.');
                  setDataLaporanAbsen([]);
                }
                setShowLaporanAbsenModal(true);
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 sm:text-sm"
              suppressHydrationWarning={true}
            >
              <UserCheck size={17} /> Laporan Absen
            </button>
            <button
              type="button"
              onClick={() => setShowLeaderboardModal(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition hover:bg-amber-50 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 sm:text-sm"
              suppressHydrationWarning={true}
            >
              <Star size={17} className="text-amber-500" /> Poin Asisten
            </button>
            <button
              type="button"
              onClick={() => setShowCutiModal(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 sm:text-sm"
              suppressHydrationWarning={true}
            >
              <Edit3 size={17} className="text-blue-600" /> Ajukan Cuti
            </button>
            <button
              type="button"
              onClick={() => setShowSwap(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 sm:text-sm"
              suppressHydrationWarning={true}
            >
              <ArrowLeftRight size={17} className="text-violet-600" /> Tukar Asisten
            </button>
          </div>
        </section>

        <section aria-label="Filter jadwal" className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-xl bg-slate-50 px-4 ring-1 ring-inset ring-slate-200 transition focus-within:ring-2 focus-within:ring-emerald-500">
            <Search size={18} className="shrink-0 text-slate-400" />
            <span className="sr-only">Cari nama dokter, klinik, atau SDM</span>
            <input
              type="search"
              placeholder="Cari dokter, klinik, atau SDM..."
              autoComplete="off"
              spellCheck="false"
              className="w-full border-0 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              suppressHydrationWarning={true}
            />
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-4 ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500 sm:w-auto">
            <CalendarIcon size={17} className="shrink-0 text-emerald-700" />
            <span className="text-xs font-semibold text-slate-500">Tanggal</span>
            <input
              type="date"
              value={selectedDateFull}
              onChange={(e) => setSelectedDateFull(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-800 outline-none sm:flex-none"
              suppressHydrationWarning={true}
            />
          </label>
        </section>

        {!loading && !dashboardError && (
          <BannerPengingat doctors={dokterPraktikTanggalIni} />
        )}

        {/* GRID UNIT CONTAINER (GROUPED CARD) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          {loading ? Array.from({ length: 4 }).map((_, cardIndex) => (
            <section key={`dokter-skeleton-${cardIndex}`} aria-label="Memuat jadwal dokter" className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="animate-pulse h-20 rounded-2xl bg-slate-200" />
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <div key={`dokter-skeleton-${cardIndex}-${rowIndex}`} className="animate-pulse space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
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
            const term = searchTerm.toLowerCase().trim();
            const filteredDokter = listDokter.filter(d => 
              d.nama_dokter.toLowerCase().includes(term) ||
              d.klinik.toLowerCase().includes(term) ||
              (Array.isArray(d.timAsisten) && d.timAsisten.some((as) => String(as?.nama || '').toLowerCase().includes(term)))
            );

            if (filteredDokter.length === 0) return null;

            return (
              <div key={simbol} className="relative space-y-5 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-4 text-white shadow-sm sm:px-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-white shadow-sm">
                      {simbol}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider sm:text-sm">Stasiun {simbol}</h3>
                      <p className="mt-1 text-[10px] font-medium text-slate-400">Sektor pelayanan rawat jalan</p>
                    </div>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-slate-200">
                    {filteredDokter.length} Dokter Aktif
                  </span>
                </div>

                <div className="max-h-[600px] space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                  {filteredDokter.map((dok, idx) => {
                    const doctorKey = dok.id || `${dok.nama_dokter}-${dok.klinik}`;
                    const cardKey = `${doctorKey}_${selectedDateFull}`;
                    const patientCount = getPatientCount(dok);
                    const monthlyPatientCount = getMonthlyPatientCount(dok);
                    const isBerhalangan = dok.is_berhalangan === true;
                    const keteranganBerhalangan = getBerhalanganLabel(dok.keterangan_berhalangan);
                    const mutuPraktik = getStatusMutuPraktik(dok.jam_praktik, dok.jam_mulai_aktual);
                    const poliSampleLimit = getPoliSampleLimit(dok.klinik);
                    const monthlyLateSampleCount = getMonthlyImutSampleCount(
                      dataImutQuota?.rekap,
                      dok.klinik,
                      "sampelKehadiran"
                    );
                    const monthlyWaitSampleCount = getMonthlyImutSampleCount(
                      dataImutQuota?.rekap,
                      dok.klinik,
                      "sampelWaktuTunggu"
                    );
                    const lateQuotaReached = poliSampleLimit !== null
                      && quotaDataReady
                      && monthlyLateSampleCount >= poliSampleLimit;
                    const lateQuotaUnavailable = poliSampleLimit !== null && !quotaDataReady;

                    return (
                      <div key={cardKey} className={`rounded-2xl border p-4 transition-all sm:p-5 ${isBerhalangan ? 'border-red-200 bg-red-50/60 opacity-80' : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md hover:shadow-slate-900/5'}`}>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div>
                            <h4 className="text-sm font-bold tracking-tight text-slate-900">{dok.nama_dokter}</h4>
                            <p className="mt-1 text-xs font-medium text-slate-500">{dok.klinik} · {dok.jam_praktik || "Jam Pelayanan"}</p>
                            {isBerhalangan && (
                              <span className="mt-2 inline-flex rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-red-800">
                                🚫 {keteranganBerhalangan || "Dokter Berhalangan"}
                              </span>
                            )}
                            {poliSampleLimit !== null && (
                              <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Status kuota sampel IMUT ${dok.klinik}`}>
                                {[
                                  { label: "IMUT 1", count: monthlyLateSampleCount },
                                  { label: "IMUT 3", count: monthlyWaitSampleCount }
                                ].map(({ label, count }) => {
                                  const remaining = Math.max(0, poliSampleLimit - count);
                                  const overLimit = Math.max(0, count - poliSampleLimit);
                                  return (
                                    <span
                                      key={label}
                                      role="status"
                                      className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase ${
                                        !quotaDataReady
                                          ? "border-slate-200 bg-slate-100 text-slate-600"
                                          : remaining === 0
                                            ? "border-amber-200 bg-amber-50 text-amber-800"
                                            : "border-blue-200 bg-blue-50 text-blue-800"
                                      }`}
                                    >
                                      {quotaDataReady
                                        ? overLimit > 0
                                          ? `${label}: ${count}/${poliSampleLimit} · lebih ${overLimit}`
                                          : remaining > 0
                                            ? `${label}: ${count}/${poliSampleLimit} · kurang ${remaining}`
                                            : `${label}: terpenuhi ${count}/${poliSampleLimit}`
                                        : errorImutQuota
                                          ? `${label}: kuota gagal dimuat`
                                          : `${label}: memuat kuota...`}
                                    </span>
                                  );
                                })}
                              </div>
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
                                <>
                                  {(lateQuotaReached || lateQuotaUnavailable) && (
                                    <span
                                      role={lateQuotaReached ? "alert" : "status"}
                                      className={`rounded-full px-2.5 py-1 text-[8px] font-black uppercase ${
                                        lateQuotaReached ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {lateQuotaReached
                                        ? "Kuota sampel IMUT untuk poli ini telah terpenuhi."
                                        : errorImutQuota
                                          ? "Kuota IMUT gagal diverifikasi."
                                          : "Memeriksa kuota sampel IMUT..."}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleMulaiPraktik(dok)}
                                    disabled={startingDoctorId === Number(dok.id) || lateQuotaReached || lateQuotaUnavailable}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[8px] font-black uppercase text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                                    suppressHydrationWarning={true}
                                  >
                                    {startingDoctorId === Number(dok.id) ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                                    Mulai Praktik
                                  </button>
                                </>
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
                                        disabled={savingJamPraktikId === Number(dok.id) || (
                                          !dok.jam_mulai_aktual && (lateQuotaReached || lateQuotaUnavailable)
                                        )}
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
                                    
                                  </div>
                                );
                              }) : <p className="text-[10px] font-black text-slate-300 italic">--- Belum Ada Asisten Ditugaskan ---</p>}
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                              <CheckCircle2 size={15} className={patientCount > 0 ? "text-emerald-600" : "text-slate-400"} />
                              <span className="text-[9px] font-bold uppercase text-slate-600">
                                Kunjungan hari ini: {patientCount} pasien
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
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
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest italic leading-none">Monitor Izin & Cuti SDM</h3>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Pengajuan bulan ini dan bulan depan</p>
                </div>
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
                  {data?.sdmIzinList?.filter(s => String(s.nama_sdm || '').toLowerCase().includes(searchCutiTerm.toLowerCase()) || String(s.jenis_cuti || '').toLowerCase().includes(searchCutiTerm.toLowerCase())).map((s, i) => (
                    <div key={`s-${i}`} className={`p-6 rounded-[2rem] border-l-8 flex justify-between items-center shadow-sm border transition-all ${s.status_acc === 'Disetujui' || s.status_acc === 'Tercatat' ? 'bg-white border-emerald-100 border-l-emerald-500' : s.status_acc === 'Ditolak' ? 'bg-red-50 border-red-100 border-l-red-500' : 'bg-amber-50/50 border-amber-100 border-l-amber-500'}`}>
                      <div className="max-w-[220px]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-md italic">{s.jenis_cuti}</span>
                          <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none truncate italic">{s.nama_sdm}</h4>
                        </div>
                        <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{format(parseISO(s.tgl_mulai), 'dd MMM yyyy')} - {format(parseISO(s.tgl_selesai), 'dd MMM yyyy')}</p>
                        {s.alasan && <p className="mt-2 line-clamp-2 text-[9px] font-medium normal-case text-slate-500">{s.alasan}</p>}
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase ${s.status_acc === 'Disetujui' || s.status_acc === 'Tercatat' ? 'bg-emerald-100 text-emerald-700' : s.status_acc === 'Ditolak' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{s.status_acc}</span>
                      </div>
                    </div>
                  ))}

                  {data?.sdmIzinList?.filter(s => String(s.nama_sdm || '').toLowerCase().includes(searchCutiTerm.toLowerCase()) || String(s.jenis_cuti || '').toLowerCase().includes(searchCutiTerm.toLowerCase())).length === 0 && (
                    <div className="col-span-1 lg:col-span-2 text-center text-xs font-black text-slate-400 uppercase italic py-12 border border-dashed border-slate-200 rounded-[2rem]">
                      Tidak ditemukan pengajuan atau catatan sakit/DL dengan kata kunci tersebut.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-xs font-black text-slate-400 italic py-8 uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-3xl">Tidak ada pengajuan izin/cuti/sakit dalam bulan ini atau bulan depan.</p>
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
                <h3 className="text-xl font-black uppercase tracking-widest text-slate-900">Kunjungan Belum Tercatat</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] mt-2">Dokter dan perawat terjadwal yang belum memiliki catatan kunjungan harian. Rekap bulanan tidak dipakai untuk mengisi atau memperkirakan kunjungan harian.</p>
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
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Belum ada data kunjungan</p>
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

      <footer className="text-center py-12 opacity-30 text-[9px] font-black uppercase italic tracking-[0.6em] text-slate-900">
        DAK-SYSTEMS INTELLIGENCE v.4.0 | RSUD MERAH PUTIH MAGELANG
      </footer>
    </div>
  );
}