"use client";

import React, { useState, useEffect, useMemo } from "react";
import { getDaysInMonth, startOfMonth, getDay, format } from "date-fns";
import { Save, Loader2, FileText, AlertTriangle, Undo2, Redo2, Settings, X, Plus, Trash2, ArrowUp, ArrowDown, Users, Sparkles } from "lucide-react";
import { id } from "date-fns/locale";

const statusAbsensi = ["L", "CT", "CM", "CS", "DD", "DL", "CAP", "CLTN", "TB"];
const namaHariLengkap = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const normalizeScheduleLabel = value => String(value || "").trim().toLocaleUpperCase("id-ID");

function doctorWorksOnDate(doctor, day, month, year) {
  const weekday = namaHariLengkap[getDay(new Date(year, month - 1, day))].toLocaleUpperCase("id-ID");
  return String(doctor.jadwal_hari || "")
    .split(/[,;/|&]+|\s+dan\s+/i)
    .map(value => value.trim().toLocaleUpperCase("id-ID"))
    .includes(weekday);
}

function doctorLeaveMatches(doctor, leave, date) {
  if (normalizeScheduleLabel(leave.jenis_cuti) === "TP") return false;
  if (date < String(leave.tgl_mulai || "") || date > String(leave.tgl_selesai || "")) return false;
  const doctorName = normalizeScheduleLabel(doctor.nama_dokter);
  const doctorSymbol = normalizeScheduleLabel(doctor.simbol_praktik);
  const doctorClinic = normalizeScheduleLabel(doctor.klinik);
  const leaveName = normalizeScheduleLabel(leave.nama_dokter);
  const leaveSymbol = normalizeScheduleLabel(leave.simbol);
  const leaveClinic = normalizeScheduleLabel(leave.klinik);
  if (leaveName) return leaveName === doctorName;
  return leaveSymbol && leaveSymbol === doctorSymbol && (!leaveClinic || leaveClinic === doctorClinic);
}

export default function BuatJadwal() {
  // --- 1. STATE & HYDRATION ---
  const [hasMounted, setHasMounted] = useState(false);
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [daftarSDM, setDaftarSDM] = useState([]);
  const [dataCutiSDM, setDataCutiSDM] = useState([]); 
  const [dataMasterDokter, setDataMasterDokter] = useState([]);
  const [dataCutiDokter, setDataCutiDokter] = useState([]);
  const [bebanDokter, setBebanDokter] = useState([]);
  const [isiJadwal, setIsiJadwal] = useState({});
  const [kelompokJadwal, setKelompokJadwal] = useState([]);
  const [anggotaKelompok, setAnggotaKelompok] = useState({});
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [approvingDraft, setApprovingDraft] = useState(false);
  const [scheduleGenerationError, setScheduleGenerationError] = useState("");
  const [scheduleGenerationReport, setScheduleGenerationReport] = useState(null);
  const [scheduleGenerationDraft, setScheduleGenerationDraft] = useState(null);
  const [scheduleAdditionalInstructions, setScheduleAdditionalInstructions] = useState("");

  // STATE UNTUK MODAL PENGATURAN HEADER (POP-UP)
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRole, setShareRole] = useState("");
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);

  // STATE UNTUK UNDO & REDO
  const [history, setHistory] = useState([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [header, setHeader] = useState({
    institusi: "RSUD MERAH PUTIH",
    judul_bebas: "JADWAL DINAS POLIKLINIK",
    ruangan: "POLIKLINIK",
    atasan_nama: "RIANA, S.TR.KEB.",
    atasan_jabatan: "KASI PELAYANAN KEPERAWATAN DAN KEBIDANAN",
    atasan_nip: "197510272003122005",
    pembuat_nama: "DANIEL ARI KRISTIANTO, S.KEP.NS",
    pembuat_jabatan: "KOORDINATOR RUANGAN",
    pembuat_nip: "199303042019031006",
    tgl_cetak: format(new Date(), "yyyy-MM-dd"),
    tempat_cetak: "MAGELANG" // FITUR BARU: Tempat Cetak Bebas
  });

  // --- 2. DATA MASTER ---
  const urutanProfesi = useMemo(() => ({
    "Bidan": 1,
    "Psikologi Klinis": 2,
    "Perawat": 3,
    "Terapis Gigi": 4,
    "Fisioterapis": 5,
    "Admin": 6,
  }), []);
  const namaHariSingkat = ["M", "SN", "SL", "R", "K", "J", "S"];
  const daftarBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const hariLibur2026 = ["2026-01-01", "2026-01-16", "2026-02-16", "2026-02-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", "2026-03-23", "2026-03-24", "2026-04-03", "2026-04-05", "2026-05-01", "2026-05-14", "2026-05-15", "2026-05-27", "2026-05-28", "2026-03-31", "2026-06-01", "2026-06-16", "2026-08-17", "2026-08-25", "2026-12-24", "2026-12-25"];

  const tanggalPilihan = new Date(tahun, bulan - 1);
  const jumlahHari = getDaysInMonth(tanggalPilihan);
  const hariPertama = getDay(startOfMonth(tanggalPilihan));

  // --- 3. FETCHING DATA ---
  useEffect(() => { setHasMounted(true); }, []);

  useEffect(() => {
    if (!hasMounted) return;
    let active = true;
    async function fetchData() {
      setLoading(true);
      setScheduleGenerationReport(null);
      setScheduleGenerationDraft(null);
      setScheduleGenerationError("");
      setDataCutiDokter([]);
      setBebanDokter([]);
      try {
        const previousMonthDate = new Date(tahun, bulan - 2, 1);
        const analyticsParams = new URLSearchParams({
          tipe: "bulanan",
          bulan: String(previousMonthDate.getMonth() + 1),
          tahun: String(previousMonthDate.getFullYear()),
          clinic: "all",
        });
        Promise.all([
          fetch("/api/cuti-dokter", { signal: AbortSignal.timeout(15000) }).catch(() => null),
          fetch(`/api/analytics?${analyticsParams}`, { signal: AbortSignal.timeout(15000) }).catch(() => null),
        ]).then(async ([resCutiDokter, resAnalytics]) => {
          const dCutiDokter = resCutiDokter ? await resCutiDokter.json().catch(() => []) : [];
          const dAnalytics = resAnalytics ? await resAnalytics.json().catch(() => ({})) : {};
          if (!active) return;
          setDataCutiDokter(Array.isArray(dCutiDokter) ? dCutiDokter : []);
          setBebanDokter(Array.isArray(dAnalytics?.doctorWorkloadAll)
            ? dAnalytics.doctorWorkloadAll
            : Array.isArray(dAnalytics?.doctorWorkload) ? dAnalytics.doctorWorkload : []);
        }).catch(error => console.error("Gagal memuat konteks rekomendasi dokter:", error));

        const [resSDM, resDkt, resJadwal, resCuti] = await Promise.all([
          fetch("/api/sdm"), fetch("/api/dokter"),
          fetch(`/api/jadwal?bulan=${bulan}&tahun=${tahun}&ruangan=${header.ruangan}`),
          fetch("/api/cuti-sdm"),
        ]);
        const dSDM = await resSDM.json();
        const dDkt = await resDkt.json();
        const dJadwal = await resJadwal.json();
        const dCuti = await resCuti.json();

        // Build daftar SDM to show in the schedule editor:
        // - Active SDM (is_aktif == 1) are used for automatic scheduling
        // - Historical SDM that appear in the jadwal for the selected month
        //   are appended so past months keep the names visible even if
        //   the person is no longer active.
        const allSdm = Array.isArray(dSDM) ? dSDM : [];
        // Determine viewing month boundaries based on selected bulan/tahun
        const viewingFirstDay = new Date(tahun, bulan - 1, 1);
        const viewingLastDay = new Date(tahun, bulan, 0);

        // Include SDM for scheduling if:
        // - they are active and their end-date (tanggal_akhir_kerja) is not before the month start
        // - OR they were mutated/non-aktif but the mutation happened during the month (> firstDay)
        const activeSdm = allSdm.filter(s => {
          // Respect the tampil_di_jadwal flag: if explicitly hidden, exclude from daftar
          if (s.tampil_di_jadwal === 0 || s.tampil_di_jadwal === '0') return false;
          const isAktifFlag = s.is_aktif === 1 || s.is_aktif === '1' || s.is_aktif === true;
          const tanggalAkhir = s.tanggal_akhir_kerja ? new Date(s.tanggal_akhir_kerja) : null;
          const lastMutasi = s.last_mutasi ? new Date(s.last_mutasi) : null;

          // If active flag true and no end-date before month start => include
          if (isAktifFlag) {
            if (!tanggalAkhir) return true;
            // keep in month if their end date is after or within the month
            return tanggalAkhir >= viewingFirstDay;
          }

          // If not active or status changed, keep only when last_mutasi is during the month
          if (lastMutasi && lastMutasi > viewingFirstDay) return true;

          return false;
        });

        const sortedActive = activeSdm.sort((a, b) => (urutanProfesi[a.jabatan] || 99) - (urutanProfesi[b.jabatan] || 99));

        // Map active IDs for quick lookup
        const activeIds = new Set(sortedActive.map(s => String(s.id)));

        // Find SDM IDs referenced in jadwal and add their metadata if missing
        // but only include historical (inactive) entries when viewing
        // a month that is NOT the current month. For the active/current
        // month (creation flow) we show active SDM only.
        const historicalExtras = [];
        const viewingDate = new Date(tahun, bulan - 1);
        const now = new Date();
        const isViewingCurrentMonth = (viewingDate.getMonth() === now.getMonth() && viewingDate.getFullYear() === now.getFullYear());

        if (!isViewingCurrentMonth && Array.isArray(dJadwal)) {
          const seen = new Set();
          dJadwal.forEach(j => {
            const sid = String(j.sdm_id || '');
            if (!sid) return;
            if (activeIds.has(sid)) return;
            if (seen.has(sid)) return;
            seen.add(sid);
            historicalExtras.push({
              id: sid,
              nama: j.sdm_nama || `ID:${sid}`,
              jabatan: j.sdm_jabatan || '',
              is_aktif: j.sdm_is_aktif === 1 || j.sdm_is_aktif === '1' || j.sdm_is_aktif === true,
            });
          });
        }

        const merged = isViewingCurrentMonth ? sortedActive : [...sortedActive, ...historicalExtras];
        setDaftarSDM(merged);

        const groupStorageKey = `jadwal-kelompok-v1:${String(header.ruangan || "POLIKLINIK").trim().toUpperCase()}`;
        let savedGroupConfig = null;
        try {
          savedGroupConfig = JSON.parse(localStorage.getItem(groupStorageKey) || "null");
        } catch {}

        const roleNames = [...new Set(merged.map(person => String(person.jabatan || "Lainnya").trim() || "Lainnya"))];
        const savedGroups = Array.isArray(savedGroupConfig?.groups)
          ? savedGroupConfig.groups.filter(group => group?.id && group?.nama)
          : [];
        const nextGroups = savedGroups.length ? savedGroups : roleNames.map(role => ({
          id: `jabatan:${role.toLocaleLowerCase()}`,
          nama: role,
          jabatanAsal: role,
          keterangan: "",
          penanggungJawab: "",
          jabatanPenanggungJawab: "",
          nipPenanggungJawab: "",
        }));
        const nextAssignments = { ...(savedGroupConfig?.assignments || {}) };

        merged.forEach(person => {
          const personId = String(person.id);
          const assignedGroupExists = nextGroups.some(group => group.id === nextAssignments[personId]);
          if (assignedGroupExists) return;

          const role = String(person.jabatan || "Lainnya").trim() || "Lainnya";
          let roleGroup = nextGroups.find(group =>
            String(group.jabatanAsal || group.nama).trim().toLocaleLowerCase() === role.toLocaleLowerCase()
          );
          if (!roleGroup) {
            roleGroup = {
              id: `jabatan:${role.toLocaleLowerCase()}`,
              nama: role,
              jabatanAsal: role,
              keterangan: "",
              penanggungJawab: "",
              jabatanPenanggungJawab: "",
              nipPenanggungJawab: "",
            };
            nextGroups.push(roleGroup);
          }
          nextAssignments[personId] = roleGroup.id;
        });

        setKelompokJadwal(nextGroups);
        setAnggotaKelompok(nextAssignments);
        try {
          localStorage.setItem(groupStorageKey, JSON.stringify({ groups: nextGroups, assignments: nextAssignments }));
        } catch {}

        setDataMasterDokter(Array.isArray(dDkt) ? dDkt : []);
        setDataCutiSDM(Array.isArray(dCuti) ? dCuti : []);

        const mapJadwal = {};
        if (Array.isArray(dJadwal)) {
          dJadwal.forEach(item => { mapJadwal[`${item.sdm_id}-${item.tanggal}`] = item.simbol; });
        }
        setIsiJadwal(mapJadwal);
        // Reset History saat ganti bulan/pertama load
        setHistory([mapJadwal]);
        setHistoryIndex(0);
      } catch (error) { console.error("Gagal sinkronisasi data:", error); }
      finally { setLoading(false); }
    }
    fetchData();
    return () => { active = false; };
  }, [bulan, tahun, hasMounted, header.ruangan, urutanProfesi]);

  // --- 4. LOGIKA HELPER & UNDO/REDO ---
  const updateIsiJadwal = (newIsiJadwal) => {
    setIsiJadwal(newIsiJadwal);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newIsiJadwal);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setIsiJadwal(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setIsiJadwal(history[historyIndex + 1]);
    }
  };

  const simpanKonfigurasiKelompok = (groups, assignments) => {
    setKelompokJadwal(groups);
    setAnggotaKelompok(assignments);
    try {
      const key = `jadwal-kelompok-v1:${String(header.ruangan || "POLIKLINIK").trim().toUpperCase()}`;
      localStorage.setItem(key, JSON.stringify({ groups, assignments }));
    } catch {}
  };

  const ubahKelompok = (groupId, updates) => {
    simpanKonfigurasiKelompok(
      kelompokJadwal.map(group => group.id === groupId ? { ...group, ...updates } : group),
      anggotaKelompok
    );
  };

  const tambahKelompok = () => {
    const id = `kelompok:${Date.now()}`;
    const groups = [...kelompokJadwal, {
      id,
      nama: `Kelompok ${kelompokJadwal.length + 1}`,
      keterangan: "",
      penanggungJawab: "",
      jabatanPenanggungJawab: "",
      nipPenanggungJawab: "",
    }];
    simpanKonfigurasiKelompok(groups, anggotaKelompok);
  };

  const hapusKelompok = (groupId) => {
    if (kelompokJadwal.length <= 1) return;
    const groups = kelompokJadwal.filter(group => group.id !== groupId);
    const fallbackId = groups[0].id;
    const assignments = Object.fromEntries(Object.entries(anggotaKelompok).map(([personId, assignedId]) => [
      personId,
      assignedId === groupId ? fallbackId : assignedId,
    ]));
    simpanKonfigurasiKelompok(groups, assignments);
  };

  const pindahKelompok = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= kelompokJadwal.length) return;
    const groups = [...kelompokJadwal];
    [groups[index], groups[targetIndex]] = [groups[targetIndex], groups[index]];
    simpanKonfigurasiKelompok(groups, anggotaKelompok);
  };

  const kelompokDenganAnggota = kelompokJadwal.map(group => ({
    ...group,
    anggota: daftarSDM.filter(person => String(anggotaKelompok[String(person.id)]) === group.id),
  })).filter(group => group.anggota.length > 0);

  const approvedStaffLeaveByPersonDay = useMemo(() => {
    const leaveByPersonDay = new Map();
    for (const leave of dataCutiSDM) {
      if (normalizeScheduleLabel(leave.status_acc) !== "DISETUJUI") continue;
      const personName = normalizeScheduleLabel(leave.nama_sdm);
      for (let day = 1; day <= jumlahHari; day++) {
        const date = format(new Date(tahun, bulan - 1, day), "yyyy-MM-dd");
        if (date >= String(leave.tgl_mulai || "") && date <= String(leave.tgl_selesai || "")) {
          leaveByPersonDay.set(`${personName}|${day}`, leave.jenis_cuti);
        }
      }
    }
    return leaveByPersonDay;
  }, [dataCutiSDM, bulan, tahun, jumlahHari]);

  const getAutoCutiValue = (namaSdm, day) =>
    approvedStaffLeaveByPersonDay.get(`${normalizeScheduleLabel(namaSdm)}|${day}`) || null;

  const doctorContextByDay = useMemo(() => {
    const contextByDay = new Map();
    for (let day = 1; day <= jumlahHari; day++) {
      const date = format(new Date(tahun, bulan - 1, day), "yyyy-MM-dd");
      const scheduledDoctors = dataMasterDokter.filter(doctor => doctorWorksOnDate(doctor, day, bulan, tahun));
      const doctorsBySymbol = new Map();
      for (const doctor of scheduledDoctors) {
        const symbol = normalizeScheduleLabel(doctor.simbol_praktik);
        if (!symbol) continue;
        const doctors = doctorsBySymbol.get(symbol) || [];
        doctors.push(doctor);
        doctorsBySymbol.set(symbol, doctors);
      }

      const unavailableSymbols = new Set();
      const absentDoctorsBySymbol = new Map();
      const absentDoctorIds = new Set();
      for (const [symbol, doctors] of doctorsBySymbol) {
        const absentDoctors = doctors.filter(doctor =>
          dataCutiDokter.some(leave => doctorLeaveMatches(doctor, leave, date)),
        );
        absentDoctors.forEach(doctor => absentDoctorIds.add(String(doctor.id)));
        if (absentDoctors.length) absentDoctorsBySymbol.set(symbol, absentDoctors);
        if (absentDoctors.length === doctors.length) unavailableSymbols.add(symbol);
      }

      contextByDay.set(day, { doctorsBySymbol, unavailableSymbols, absentDoctorsBySymbol, absentDoctorIds, scheduledDoctors });
    }
    return contextByDay;
  }, [dataMasterDokter, dataCutiDokter, bulan, tahun, jumlahHari]);

  const getDoctorLeaveRecord = (doctor, day) => {
    const symbol = normalizeScheduleLabel(doctor.simbol_praktik);
    return doctorContextByDay.get(day)?.absentDoctorsBySymbol.get(symbol)
      ?.find(item => String(item.id) === String(doctor.id)) || null;
  };

  const isDoctorSymbolUnavailable = (symbol, day) =>
    doctorContextByDay.get(day)?.unavailableSymbols.has(normalizeScheduleLabel(symbol)) || false;

  const getScheduleSymbol = (personId, day) => {
    const symbol = isiJadwal[`${personId}-${day}`] || "";
    return symbol && !isDoctorSymbolUnavailable(symbol, day) ? symbol : "";
  };

  const removeUnavailableDoctorAssignments = schedule => Object.fromEntries(
    Object.entries(schedule).filter(([key, symbol]) => {
      if (!symbol || statusAbsensi.includes(normalizeScheduleLabel(symbol))) return true;
      const day = Number(key.slice(key.lastIndexOf("-") + 1));
      return !Number.isInteger(day) || !isDoctorSymbolUnavailable(symbol, day);
    }),
  );

  const symbolAssistantCountsByDay = useMemo(() => {
    const counts = new Map();
    const staffById = new Map(daftarSDM.map(person => [String(person.id), person]));
    for (const [key, symbol] of Object.entries(isiJadwal)) {
      const separator = key.lastIndexOf("-");
      const personId = key.slice(0, separator);
      const day = Number(key.slice(separator + 1));
      const person = staffById.get(personId);
      if (!person || !Number.isInteger(day)) continue;
      if (approvedStaffLeaveByPersonDay.has(`${normalizeScheduleLabel(person.nama)}|${day}`)) continue;
      if (!symbol || statusAbsensi.includes(normalizeScheduleLabel(symbol))) continue;
      if (doctorContextByDay.get(day)?.unavailableSymbols.has(normalizeScheduleLabel(symbol))) continue;
      const countKey = `${day}|${normalizeScheduleLabel(symbol)}`;
      counts.set(countKey, (counts.get(countKey) || 0) + 1);
    }
    return counts;
  }, [isiJadwal, daftarSDM, approvedStaffLeaveByPersonDay, doctorContextByDay]);

  const doctorLeaveImpacts = useMemo(() => {
    const staffById = new Map(daftarSDM.map(person => [String(person.id), person]));
    const workloadByDoctor = new Map(bebanDokter.map(item => [
      `${normalizeScheduleLabel(item.name)}|${normalizeScheduleLabel(item.clinic)}`,
      Number(item.pasien) || 0,
    ]));

    return Object.entries(isiJadwal).flatMap(([key, symbol]) => {
      if (!symbol || statusAbsensi.includes(normalizeScheduleLabel(symbol))) return [];
      const separator = key.lastIndexOf("-");
      const personId = key.slice(0, separator);
      const day = Number(key.slice(separator + 1));
      const dayContext = doctorContextByDay.get(day);
      const normalizedSymbol = normalizeScheduleLabel(symbol);
      if (!Number.isInteger(day) || !dayContext?.unavailableSymbols.has(normalizedSymbol)) return [];

      const person = staffById.get(personId);
      if (!person || approvedStaffLeaveByPersonDay.has(`${normalizeScheduleLabel(person.nama)}|${day}`)) return [];
      const absentDoctors = dayContext.absentDoctorsBySymbol.get(normalizedSymbol) || [];
      const clinic = normalizeScheduleLabel(absentDoctors[0]?.klinik);
      const candidates = dayContext.scheduledDoctors
        .filter(doctor => normalizeScheduleLabel(doctor.klinik) === clinic)
        .filter(doctor => !dayContext.absentDoctorIds.has(String(doctor.id)))
        .map(doctor => {
          const doctorSymbol = normalizeScheduleLabel(doctor.simbol_praktik);
          const assistants = symbolAssistantCountsByDay.get(`${day}|${doctorSymbol}`) || 0;
          const patients = workloadByDoctor.get(`${normalizeScheduleLabel(doctor.nama_dokter)}|${clinic}`) || 0;
          return {
            name: doctor.nama_dokter,
            symbol: doctor.simbol_praktik,
            clinic: doctor.klinik,
            patients,
            assistants,
            loadPerAssistant: patients / Math.max(assistants, 1),
          };
        })
        .sort((first, second) => second.loadPerAssistant - first.loadPerAssistant || second.patients - first.patients);

      return [{
        key,
        personId,
        day,
        personName: person.nama || `SDM ${personId}`,
        symbol,
        absentDoctors: absentDoctors.map(doctor => doctor.nama_dokter),
        recommendation: candidates[0] || null,
      }];
    });
  }, [isiJadwal, daftarSDM, bebanDokter, doctorContextByDay, approvedStaffLeaveByPersonDay, symbolAssistantCountsByDay]);

  const getSimbolHarian = (day, currentVal) => {
    const dayContext = doctorContextByDay.get(day);
    const symbols = [...(dayContext?.doctorsBySymbol.keys() || [])];
    const currentSymbol = normalizeScheduleLabel(currentVal);
    if (currentSymbol && !dayContext?.unavailableSymbols.has(currentSymbol) && !symbols.includes(currentSymbol)) {
      symbols.push(currentSymbol);
    }
    return symbols.filter(symbol => !statusAbsensi.includes(symbol));
  };

  const getSymbolAssistantCount = (symbol, day) =>
    symbolAssistantCountsByDay.get(`${day}|${normalizeScheduleLabel(symbol)}`) || 0;

  const getDoctorsOnLeaveForSymbol = (symbol, day) =>
    doctorContextByDay.get(day)?.absentDoctorsBySymbol.get(normalizeScheduleLabel(symbol)) || [];

  const handleGenerateSchedule = async () => {
    if (generatingSchedule || loading) return;
    if (daftarSDM.length === 0 || dataMasterDokter.length === 0) {
      setScheduleGenerationError("Data SDM atau jadwal praktik dokter belum tersedia.");
      return;
    }

    setGeneratingSchedule(true);
    setScheduleGenerationError("");
    setScheduleGenerationReport(null);
    setScheduleGenerationDraft(null);
    try {
      const previousDate = new Date(tahun, bulan - 2, 1);
      const previousMonth = previousDate.getMonth() + 1;
      const previousYear = previousDate.getFullYear();
      const previousResponse = await fetch(
        `/api/jadwal?bulan=${previousMonth}&tahun=${previousYear}&ruangan=${encodeURIComponent(header.ruangan)}`,
      );
      if (!previousResponse.ok) {
        throw new Error(previousResponse.status === 401
          ? "Sesi Anda berakhir. Silakan masuk kembali."
          : "Gagal mengambil jadwal bulan sebelumnya.");
      }
      const previousRows = await previousResponse.json();
      if (!Array.isArray(previousRows) || previousRows.length === 0) {
        throw new Error("Jadwal bulan sebelumnya belum tersedia untuk membentuk pola.");
      }

      const people = daftarSDM.map((person, index) => ({
        id: String(person.id),
        code: `P${index + 1}`,
        role: String(person.jabatan || "Tidak diketahui").slice(0, 60),
        name: person.nama,
      }));
      const peopleById = new Map(people.map(person => [person.id, person]));
      const daysInPreviousMonth = getDaysInMonth(previousDate);
      const lastDateByWeekday = {};
      for (let day = 1; day <= daysInPreviousMonth; day++) {
        lastDateByWeekday[getDay(new Date(previousYear, previousMonth - 1, day))] = day;
      }

      const previousAssignmentsByDate = new Map();
      const previousMonthEndAssignments = [];
      previousRows.forEach(row => {
        const date = Number(row.tanggal);
        const person = peopleById.get(String(row.sdm_id));
        if (!person || !Number.isInteger(date)) return;
        if (date === daysInPreviousMonth && row.simbol && !statusAbsensi.includes(String(row.simbol).toLocaleUpperCase("id-ID"))) {
          previousMonthEndAssignments.push({ person: person.code, symbol: String(row.simbol).trim() });
        }
        const key = `${getDay(new Date(previousYear, previousMonth - 1, date))}-${date}`;
        if (!previousAssignmentsByDate.has(key)) previousAssignmentsByDate.set(key, []);
        previousAssignmentsByDate.get(key).push({ person: person.code, symbol: String(row.simbol || "").trim() });
      });

      const targetDays = [];
      const symbolsByWeekday = new Map();
      for (let day = 1; day <= jumlahHari; day++) {
        const weekdayIndex = getDay(new Date(tahun, bulan - 1, day));
        const weekday = namaHariLengkap[weekdayIndex].toLocaleUpperCase("id-ID");
        const symbols = [...new Set(dataMasterDokter
          .filter(doctor => {
            return doctorWorksOnDate(doctor, day, bulan, tahun)
              && doctor.simbol_praktik
              && !getDoctorLeaveRecord(doctor, day);
          })
          .map(doctor => String(doctor.simbol_praktik).trim())
          .filter(Boolean))];
        targetDays.push({ day, weekday, symbols });
        if (symbols.length) {
          const existing = symbolsByWeekday.get(weekday) || new Set();
          symbols.forEach(symbol => existing.add(symbol));
          symbolsByWeekday.set(weekday, existing);
        }
      }
      if (symbolsByWeekday.size === 0) {
        throw new Error("Tidak ada simbol dokter yang terjadwal pada bulan terpilih.");
      }

      const previousPatterns = [...symbolsByWeekday.keys()].map(weekday => {
        const weekdayIndex = namaHariLengkap.findIndex(day => day.toLocaleUpperCase("id-ID") === weekday);
        const sourceDay = lastDateByWeekday[weekdayIndex];
        const sourceRows = previousAssignmentsByDate.get(`${weekdayIndex}-${sourceDay}`) || [];
        return {
          weekday,
          assignments: sourceRows
            .filter(row => row.symbol && !statusAbsensi.includes(row.symbol.toLocaleUpperCase("id-ID")))
            .map(row => ({ person: row.person, symbol: row.symbol })),
        };
      });
      if (!previousPatterns.some(pattern => pattern.assignments.length > 0)) {
        throw new Error("Tidak ditemukan pola kerja yang dapat digunakan pada hari praktik bulan sebelumnya.");
      }

      const response = await fetch("/api/ai-scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periode: `${daftarBulan[bulan - 1]} ${tahun}`,
          bulan,
          tahun,
          ruangan: header.ruangan,
          people: people.map(person => ({
            sdmId: person.id,
            code: person.code,
            name: person.name,
            role: person.role,
            leaveDays: targetDays
              .filter(day => getAutoCutiValue(person.name, day.day))
              .map(day => day.day),
            leaveDetails: targetDays
              .map(day => ({
                day: day.day,
                symbol: getAutoCutiValue(person.name, day.day),
              }))
              .filter(leave => leave.symbol),
          })),
          additionalInstructions: scheduleAdditionalInstructions,
          previousDayAssignments: previousMonthEndAssignments,
          existingAssignments: Object.entries(removeUnavailableDoctorAssignments(isiJadwal)).flatMap(([key, symbol]) => {
            const separator = key.lastIndexOf("-");
            const person = people.find(item => item.id === key.slice(0, separator));
            const day = Number(key.slice(separator + 1));
            return person && Number.isInteger(day) && symbol && !statusAbsensi.includes(normalizeScheduleLabel(symbol))
              ? [{ person: person.code, day, symbol }]
              : [];
          }),
          weekdays: [...symbolsByWeekday].map(([weekday, symbols]) => ({
            weekday,
            symbols: [...symbols],
            days: targetDays.filter(day => day.weekday === weekday && day.symbols.length > 0).map(day => day.day),
            calendar: targetDays
              .filter(day => day.weekday === weekday && day.symbols.length > 0)
              .map(day => ({ day: day.day, symbols: day.symbols })),
          })),
          previousPatterns,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal membuat draft jadwal dengan Groq.");
      }
      if (!Array.isArray(result.assignments)) {
        throw new Error("Format hasil draft dari Groq tidak valid.");
      }
      if (result.assignments.length === 0) {
        throw new Error("AI belum menghasilkan penugasan. Coba hasilkan draft kembali.");
      }
      const hasInvalidDateSymbol = result.assignments.some(assignment => {
        const targetDates = Number.isInteger(Number(assignment.day))
          ? targetDays.filter(day => day.day === Number(assignment.day))
          : targetDays.filter(day => day.weekday === assignment.weekday && day.symbols.length > 0);
        return targetDates.some(day =>
          day.weekday !== assignment.weekday
            || !day.symbols.some(symbol =>
              symbol.toLocaleUpperCase("id-ID") === String(assignment.symbol || "").toLocaleUpperCase("id-ID"),
            ),
        );
      });
      if (hasInvalidDateSymbol) {
        throw new Error("Draft ditolak karena memuat simbol yang tidak praktik pada salah satu tanggal target.");
      }

      const codeToPerson = new Map(people.map(person => [person.code, person]));
      const assignmentsByWeekday = new Map();
      const assignmentsByDate = new Map();
      result.assignments.forEach(assignment => {
        const assignments = assignmentsByWeekday.get(assignment.weekday) || [];
        assignments.push(assignment);
        assignmentsByWeekday.set(assignment.weekday, assignments);
        if (Number.isInteger(Number(assignment.day))) {
          const dateAssignments = assignmentsByDate.get(Number(assignment.day)) || [];
          dateAssignments.push(assignment);
          assignmentsByDate.set(Number(assignment.day), dateAssignments);
        }
      });

      const nextSchedule = removeUnavailableDoctorAssignments({ ...isiJadwal });
      const clearedDoctorLeaveCount = Object.keys(isiJadwal).length - Object.keys(nextSchedule).length;
      let assignedCount = 0;
      let skippedOnLeave = 0;
      let clearedNoPracticeCount = 0;
      const draftAssignments = [];
      const clearedKeys = [];
      targetDays.forEach(({ day, symbols }) => {
        if (symbols.length > 0) return;
        daftarSDM.forEach(person => {
          const key = `${person.id}-${day}`;
          const current = nextSchedule[key];
          if (current && !statusAbsensi.includes(String(current).toLocaleUpperCase("id-ID"))) {
            delete nextSchedule[key];
            clearedKeys.push(key);
            clearedNoPracticeCount++;
          }
        });
      });
      targetDays.forEach(({ day, weekday, symbols }) => {
        if (symbols.length === 0) return;
        const dailyAssignments = assignmentsByDate.get(day) || assignmentsByWeekday.get(weekday) || [];
        for (const assignment of dailyAssignments) {
          const matchedPerson = codeToPerson.get(assignment.person);
          const personId = matchedPerson?.id;
          const person = daftarSDM.find(item => String(item.id) === String(personId));
          if (!person || !symbols.some(symbol => symbol.toLocaleUpperCase("id-ID") === assignment.symbol.toLocaleUpperCase("id-ID"))) continue;
          const key = `${personId}-${day}`;
          if (nextSchedule[key]) continue;
          if (getAutoCutiValue(person.nama, day)) {
            skippedOnLeave++;
            continue;
          }
          nextSchedule[key] = assignment.symbol;
          draftAssignments.push({
            personId: String(personId),
            day,
            weekday: namaHariLengkap[getDay(new Date(tahun, bulan - 1, day))],
            nama: person.nama,
            jabatan: person.jabatan || "Tidak diketahui",
            symbol: assignment.symbol,
          });
          assignedCount++;
        }
      });

      const coverage = new Map();
      targetDays.forEach(({ day, symbols }) => {
        symbols.forEach(symbol => {
          const key = symbol.toLocaleUpperCase("id-ID");
          const item = coverage.get(key) || { symbol, expectedDays: 0, usedDays: 0, uncoveredDays: [] };
          item.expectedDays++;
          const isUsed = daftarSDM.some(person => {
            const value = getAutoCutiValue(person.nama, day) || nextSchedule[`${person.id}-${day}`];
            return value && !statusAbsensi.includes(String(value).toLocaleUpperCase("id-ID"))
              && String(value).toLocaleUpperCase("id-ID") === key;
          });
          if (isUsed) item.usedDays++;
          else item.uncoveredDays.push(day);
          coverage.set(key, item);
        });
      });

      const scheduledPeople = new Set(draftAssignments.map(assignment => assignment.personId));
      daftarSDM.forEach(person => {
        for (let day = 1; day <= jumlahHari; day++) {
          const value = nextSchedule[`${person.id}-${day}`];
          if (value && !statusAbsensi.includes(String(value).toLocaleUpperCase("id-ID"))) {
            scheduledPeople.add(String(person.id));
            break;
          }
        }
      });
      const unassignedPeople = daftarSDM
        .filter(person => !scheduledPeople.has(String(person.id)))
        .map(person => person.nama);

      setScheduleGenerationDraft({ assignments: draftAssignments, clearedKeys, previewSchedule: nextSchedule });
      setScheduleGenerationReport({
        assignedCount,
        coveredPeopleCount: scheduledPeople.size,
        totalPeopleCount: daftarSDM.length,
        unassignedPeople,
        skippedOnLeave,
        clearedDoctorLeaveCount,
        clearedNoPracticeCount,
        noPracticeDays: targetDays.filter(day => day.symbols.length === 0).map(day => day.day),
        coverage: [...coverage.values()].sort((a, b) => a.symbol.localeCompare(b.symbol, "id")),
        midelCounts: Object.entries(result.midelCounts || {})
          .map(([code, count]) => ({
            name: codeToPerson.get(code)?.name || code,
            count: Number(count) || 0,
          }))
          .sort((first, second) => first.count - second.count || first.name.localeCompare(second.name, "id")),
        summary: String(result.summary || ""),
      });
    } catch (error) {
      setScheduleGenerationError(error instanceof Error ? error.message : "Gagal membuat draft jadwal.");
    } finally {
      setGeneratingSchedule(false);
    }
  };

  const handleResetSchedule = async () => {
    if (loading || generatingSchedule || approvingDraft) return;
    const confirmed = window.confirm(
      `Kosongkan seluruh jadwal manual ${daftarBulan[bulan - 1]} ${tahun} untuk ${header.ruangan}? Tindakan ini langsung menghapus jadwal bulan tersebut dari database.`,
    );
    if (!confirmed) return;

    setLoading(true);
    setScheduleGenerationError("");
    try {
      const response = await fetch("/api/jadwal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan, tahun, ruangan: header.ruangan, dataJadwal: {} }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Jadwal gagal dikosongkan.");
      }

      updateIsiJadwal({});
      setScheduleGenerationDraft(null);
      setScheduleGenerationReport(null);
    } catch (error) {
      setScheduleGenerationError(error instanceof Error ? error.message : "Jadwal gagal dikosongkan.");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDraft = async () => {
    if (approvingDraft || !scheduleGenerationReport || !scheduleGenerationDraft) return;
    if (scheduleGenerationDraft.assignments.length === 0 && scheduleGenerationDraft.clearedKeys.length === 0) {
      setScheduleGenerationError("Draft tidak memiliki perubahan untuk diterapkan.");
      return;
    }

    setApprovingDraft(true);
    setScheduleGenerationError("");
    try {
      const approvedSchedule = { ...isiJadwal };
      const scheduleWithoutAbsentDoctors = removeUnavailableDoctorAssignments(approvedSchedule);
      Object.keys(approvedSchedule).forEach(key => delete approvedSchedule[key]);
      Object.assign(approvedSchedule, scheduleWithoutAbsentDoctors);
      scheduleGenerationDraft.clearedKeys.forEach(key => {
        const current = approvedSchedule[key];
        if (current && !statusAbsensi.includes(String(current).toLocaleUpperCase("id-ID"))) {
          delete approvedSchedule[key];
        }
      });

      let appliedCount = 0;
      scheduleGenerationDraft.assignments.forEach(assignment => {
        const key = `${assignment.personId}-${assignment.day}`;
        if (approvedSchedule[key] || getAutoCutiValue(assignment.nama, assignment.day)) return;
        approvedSchedule[key] = assignment.symbol;
        appliedCount++;
      });

      const response = await fetch("/api/jadwal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulan,
          tahun,
          ruangan: header.ruangan,
          dataJadwal: approvedSchedule,
          custom_judul: header.judul_bebas,
          source: "ai-draft",
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Draft AI gagal disimpan ke database.");
      }

      updateIsiJadwal(approvedSchedule);
      setScheduleGenerationReport((current) => ({
        ...(current || {}),
        approved: true,
        approvedCount: appliedCount,
      }));
    } catch (error) {
      setScheduleGenerationError(error instanceof Error ? error.message : "Gagal menyimpan draft AI ke database.");
    } finally {
      setApprovingDraft(false);
    }
  };

  const getKeteranganSimbolTerkelompok = (anggota = null) => {
    const simbolTerpakai = anggota ? new Set() : null;
    if (anggota) {
      anggota.forEach(person => {
        for (let tgl = 1; tgl <= jumlahHari; tgl++) {
          const simbol = getAutoCutiValue(person.nama, tgl) || getScheduleSymbol(person.id, tgl);
          if (simbol) simbolTerpakai.add(String(simbol).trim().toLocaleUpperCase());
        }
      });
    }

    const groups = new Map();
    dataMasterDokter.forEach(dokter => {
      const simbol = String(dokter.simbol_praktik || "").trim();
      const keterangan = String(dokter.keterangan_simbol || "").trim();
      if (!simbol || !keterangan) return;

      const key = simbol.toLocaleUpperCase();
      if (simbolTerpakai && !simbolTerpakai.has(key)) return;
      if (!groups.has(key)) groups.set(key, { simbol, keterangan: [] });
      const group = groups.get(key);
      if (!group.keterangan.some(value => value.toLocaleLowerCase() === keterangan.toLocaleLowerCase())) {
        group.keterangan.push(keterangan);
      }
    });
    return [...groups.values()].sort((a, b) => a.simbol.localeCompare(b.simbol, "id"));
  };

  const cekTanggalMerah = (tgl) => {
    const d = new Date(tahun, bulan - 1, tgl);
    return getDay(d) === 0 || hariLibur2026.includes(format(d, "yyyy-MM-dd"));
  };

  const hitungTotalMasuk = (tgl, kategori, anggota = daftarSDM) => {
    let total = 0;
    anggota.forEach(sdm => {
      const val = getAutoCutiValue(sdm.nama, tgl) || getScheduleSymbol(sdm.id, tgl);
      if (val && !statusAbsensi.includes(val)) {
        const isPerawat = sdm.jabatan?.toLowerCase().includes("perawat");
        if (kategori === "perawat" && isPerawat) total++;
        if (kategori === "lain" && !isPerawat) total++;
      }
    });
    return total;
  };

  // --- 5. FUNGSI AKSI ---
  const handleSimpan = async () => {
    // FITUR ALERT JADWAL KOSONG
    let missingCount = 0;
    const noPracticeDays = new Set(scheduleGenerationReport?.noPracticeDays || []);
    daftarSDM.forEach(sdm => {
      for (let tgl = 1; tgl <= jumlahHari; tgl++) {
        if (noPracticeDays.has(tgl)) continue;
        const autoVal = getAutoCutiValue(sdm.nama, tgl);
        const currentVal = autoVal || getScheduleSymbol(sdm.id, tgl);
        if (!currentVal) missingCount++;
      }
    });

    if (missingCount > 0) {
      const lanjut = window.confirm(`⚠️ PERINGATAN: Masih ada ${missingCount} kotak jadwal yang KOSONG!\n\nKlik 'OK' jika Bapak ingin tetap menyimpannya sekarang, atau 'Batal' untuk melengkapi jadwal.`);
      if (!lanjut) return;
    }

    if (doctorLeaveImpacts.length > 0) {
      const lanjutDenganPenyesuaian = window.confirm(
        `${doctorLeaveImpacts.length} penugasan dokter berhalangan akan dikosongkan dari jadwal yang disimpan. Lanjutkan?`,
      );
      if (!lanjutDenganPenyesuaian) return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/jadwal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulan,
          tahun,
          ruangan: header.ruangan,
          dataJadwal: removeUnavailableDoctorAssignments(isiJadwal),
          custom_judul: header.judul_bebas,
        })
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) throw new Error(result.error || "Jadwal gagal disimpan.");
      updateIsiJadwal(removeUnavailableDoctorAssignments(isiJadwal));
      alert("✅ Jadwal Berhasil Disimpan!");
    } catch (e) { alert("❌ Koneksi Gagal."); }
    finally { setLoading(false); }
  };

  const downloadWord = () => {
    const areaJadwal = document.querySelector("#area-jadwal").cloneNode(true);
    const groupedTablesHtml = Array.from(areaJadwal.querySelectorAll(".schedule-section")).map(section => {
      const sectionCopy = section.cloneNode(true);
      sectionCopy.querySelectorAll(".no-print").forEach(el => el.remove());
      sectionCopy.querySelectorAll(".schedule-signatures").forEach(el => el.remove());
      sectionCopy.querySelectorAll(".schedule-recap-column").forEach(el => el.remove());
      sectionCopy.querySelectorAll("label").forEach(label => {
        if (label.querySelector('input[type="checkbox"]')) label.remove();
      });
      sectionCopy.querySelectorAll("input, select, button").forEach(el => el.remove());
      return sectionCopy.outerHTML;
    }).join("");
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
    const signatureHtml = `
      <table class="final-signatures" style="width:100%; border-collapse:collapse; table-layout:fixed; margin-top:24pt; page-break-inside:avoid;">
        <tbody><tr>
          <td style="width:50%; border:none; text-align:center; vertical-align:top; font-size:9pt;">
            Mengetahui,<br/>${escapeHtml(header.atasan_jabatan)}<br/><br/><br/><br/><span class="underline">${escapeHtml(header.atasan_nama)}</span><br/>NIP. ${escapeHtml(header.atasan_nip)}
          </td>
          <td style="width:50%; border:none; text-align:center; vertical-align:top; font-size:9pt;">
            ${escapeHtml(header.tempat_cetak)}, ${format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>${escapeHtml(header.pembuat_jabatan)}<br/><br/><br/><br/><span class="underline">${escapeHtml(header.pembuat_nama)}</span><br/>NIP. ${escapeHtml(header.pembuat_nip)}
          </td>
        </tr></tbody>
      </table>
    `;
    const wordHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
        @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 0.5cm; }
        div.Section1 { page: Section1; }
        table { border-collapse: collapse; width: 100%; font-family: 'Arial Narrow', Arial; table-layout: fixed; }
        th, td { border: 0.5pt solid black; padding: 2px; font-size: 7.5pt; text-align: center; overflow: hidden; word-wrap: break-word; }
        .bg-red-word { background-color: #FFDADA !important; mso-shading: red; mso-pattern: gray-15 auto; }
        .underline { text-decoration: underline; font-weight: bold; }
        .schedule-section + .schedule-section { page-break-before: always; }
        .schedule-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; border-bottom: 1pt solid #222; padding-bottom: 4pt; margin-bottom: 4pt; }
        .schedule-description { font-size: 9pt; margin: 2pt 0 8pt; }
        .compact-legend { font-size: 6pt !important; line-height: 1.1; margin-top: 8pt; }
        .compact-legend > div { margin-top: 1pt; }
        .final-signatures td { padding: 0 12pt; }
      </style></head><body><div class="Section1">
        <div style="text-align:center;"><b>${header.institusi}</b><br/><b>${header.judul_bebas.toUpperCase()}</b><br/>PERIODE: ${daftarBulan[bulan-1].toUpperCase()} ${tahun}</div><br/>
        ${groupedTablesHtml}
        ${signatureHtml}
      </div></body></html>
    `;
    const blob = new Blob(['\ufeff', wordHeader], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${header.judul_bebas}.doc`;
    link.click();
  };

  if (!hasMounted) return null;

  return (
    <div className="bg-slate-100 min-h-screen font-sans print:bg-white text-slate-900" suppressHydrationWarning>
      <style jsx global>{`
        .cell-input { min-width: 32px; max-width: 45px; width: 100%; }
        .dropdown-select { width: 100%; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
        .schedule-signature-name { display: inline-block; min-width: 200px; border-bottom: 1px solid #111; padding: 0 10px 2px; }
        @media print {
          @page { size: landscape; margin: 3mm; }
          .no-print { display: none !important; }
          .schedule-section + .schedule-section { break-before: page; page-break-before: always; }
          .schedule-signatures { width: 100%; margin: 24px auto 0; text-align: center; font-size: 10px; font-weight: 700; break-inside: avoid; page-break-inside: avoid; }
          .compact-legend { margin-top: 12px; font-size: 6px !important; line-height: 1.1; }
          .compact-legend > div { margin-top: 1px; }
          table { width: 100% !important; border: 1pt solid black !important; table-layout: fixed; }
          th, td { border: 0.5pt solid black !important; font-size: 6px !important; padding: 1px !important; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-white/70 z-[100] flex items-center justify-center no-print">
          <Loader2 className="animate-spin text-blue-600" size={50} />
        </div>
      )}

      {/* POP-UP MODAL PENGATURAN HEADER */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
              <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-3">
                <Settings size={20} className="text-blue-400" />
                Pengaturan Identitas Cetak
              </h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px] font-bold uppercase">
                {/* KOLOM KIRI */}
                <div className="space-y-6">
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-blue-600 italic border-b border-blue-200 pb-2 block">Unit & Judul Utama</label>
                    <input type="text" className="w-full p-3 bg-white border rounded-xl" value={header.institusi} onChange={e => setHeader({...header, institusi: e.target.value.toUpperCase()})} />
                    <input type="text" placeholder="JUDUL JADWAL (FREE TEXT)" className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-black" value={header.judul_bebas} onChange={e => setHeader({...header, judul_bebas: e.target.value.toUpperCase()})} />
                  </div>

                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-slate-500 italic border-b border-slate-200 pb-2 block">Identitas Atasan (Mengetahui)</label>
                    <input type="text" placeholder="Nama Atasan" className="w-full p-3 bg-white border rounded-xl" value={header.atasan_nama} onChange={e => setHeader({...header, atasan_nama: e.target.value})} />
                    <input type="text" placeholder="Jabatan Atasan" className="w-full p-3 bg-white border rounded-xl" value={header.atasan_jabatan} onChange={e => setHeader({...header, atasan_jabatan: e.target.value})} />
                    <input type="text" placeholder="NIP Atasan" className="w-full p-3 bg-white border rounded-xl" value={header.atasan_nip} onChange={e => setHeader({...header, atasan_nip: e.target.value})} />
                  </div>
                </div>

                {/* KOLOM KANAN */}
                <div className="space-y-6">
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-emerald-600 italic border-b border-emerald-200 pb-2 block">Identitas Pembuat Jadwal</label>
                    <input type="text" placeholder="Nama Pembuat" className="w-full p-3 bg-white border rounded-xl" value={header.pembuat_nama} onChange={e => setHeader({...header, pembuat_nama: e.target.value})} />
                    <input type="text" placeholder="Jabatan Pembuat" className="w-full p-3 bg-white border rounded-xl" value={header.pembuat_jabatan} onChange={e => setHeader({...header, pembuat_jabatan: e.target.value})} />
                    <input type="text" placeholder="NIP Pembuat" className="w-full p-3 bg-white border rounded-xl" value={header.pembuat_nip} onChange={e => setHeader({...header, pembuat_nip: e.target.value})} />
                  </div>

                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label className="text-slate-500 italic border-b border-slate-200 pb-2 block">Tempat & Tanggal Pengesahan</label>
                    <input type="text" placeholder="Tempat (Contoh: MAGELANG)" className="w-full p-3 bg-white border rounded-xl" value={header.tempat_cetak} onChange={e => setHeader({...header, tempat_cetak: e.target.value.toUpperCase()})} />
                    <input type="date" className="w-full p-3 bg-white border rounded-xl" value={header.tgl_cetak} onChange={e => setHeader({...header, tgl_cetak: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowSettingsModal(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black text-xs uppercase transition-all shadow-md">
                Tutup & Simpan Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-slate-900 p-5 flex justify-between items-center text-white shrink-0">
              <h2 className="font-black uppercase text-sm flex items-center gap-2"><Users size={18} /> Atur Kelompok Jadwal</h2>
              <button onClick={() => setShowGroupModal(false)} aria-label="Tutup pengaturan kelompok" className="text-slate-300 hover:text-white"><X size={22} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-slate-600">Atur judul, keterangan, urutan, penanggung jawab, dan penempatan SDM. Pengaturan tersimpan di browser untuk ruangan ini.</p>
                <button onClick={tambahKelompok} className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Plus size={16} /> Tambah kelompok</button>
              </div>

              <div className="space-y-3">
                {kelompokJadwal.map((group, index) => (
                  <div key={group.id} className="border border-slate-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1 pt-1">
                        <button onClick={() => pindahKelompok(index, -1)} disabled={index === 0} aria-label="Naikkan urutan kelompok" className="p-1 text-slate-500 hover:text-blue-700 disabled:opacity-30"><ArrowUp size={16} /></button>
                        <button onClick={() => pindahKelompok(index, 1)} disabled={index === kelompokJadwal.length - 1} aria-label="Turunkan urutan kelompok" className="p-1 text-slate-500 hover:text-blue-700 disabled:opacity-30"><ArrowDown size={16} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                        <label className="text-xs font-bold text-slate-600">Judul bagian
                          <input value={group.nama} onChange={e => ubahKelompok(group.id, { nama: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                        </label>
                        <label className="text-xs font-bold text-slate-600">Keterangan bagian
                          <input value={group.keterangan || ""} onChange={e => ubahKelompok(group.id, { keterangan: e.target.value })} placeholder="Opsional" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                        </label>
                      </div>
                      <button onClick={() => hapusKelompok(group.id)} disabled={kelompokJadwal.length <= 1} aria-label={`Hapus kelompok ${group.nama}`} className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"><Trash2 size={17} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="font-black text-sm text-slate-800 mb-2">Penempatan SDM</h3>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {daftarSDM.map(person => (
                    <label key={person.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{person.nama}<span className="block text-xs font-normal text-slate-500">{person.jabatan}</span></span>
                      <select value={anggotaKelompok[String(person.id)] || ""} onChange={e => simpanKonfigurasiKelompok(kelompokJadwal, { ...anggotaKelompok, [String(person.id)]: e.target.value })} className="w-full sm:w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                        {kelompokJadwal.map(group => <option key={group.id} value={group.id}>{group.nama}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button onClick={() => setShowGroupModal(false)} className="px-6 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold">Selesai</button>
            </div>
          </div>
        </div>
      )}

      {showLegendModal && (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black">Keterangan Simbol</h3>
              <button onClick={() => setShowLegendModal(false)} className="text-sm px-3 py-1 bg-slate-100 rounded">Tutup</button>
            </div>
            <div className="text-sm max-h-80 overflow-auto">
              {getKeteranganSimbolTerkelompok().map(item => (
                <div key={item.simbol} className="mb-2">
                  <span className="font-bold">{item.simbol}:</span> <span className="text-slate-600">{item.keterangan.join("; ")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-black mb-3">Bagikan Jadwal</h3>
            <p className="text-sm text-slate-600 mb-4">Pilih filter yang ingin Anda sertakan di link. Link akan bersifat tampilan (view-only) dan responsif untuk HP.</p>
            <div className="mb-4">
              <label className="block text-xs font-black uppercase">Filter Nama atau Jabatan (akan disertakan di link)</label>
              <input value={shareRole} onChange={e => setShareRole(e.target.value)} placeholder="Perawat atau Nama" className="w-full p-3 border rounded mt-2" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowShareModal(false)} className="px-4 py-2 rounded bg-slate-100">Batal</button>
              <button onClick={() => {
                const base = window.location.origin;
                const url = `${base}/shared/jadwal?bulan=${bulan}&tahun=${tahun}&ruangan=${header.ruangan}${shareRole ? `&filter=${encodeURIComponent(shareRole)}` : ''}`;
                navigator.clipboard.writeText(url).then(() => { setShareLinkCopied(true); setTimeout(() => setShareLinkCopied(false), 2000); });
              }} className="px-4 py-2 rounded bg-blue-600 text-white">Salin Link</button>
            </div>
            {shareLinkCopied && <div className="mt-3 text-sm text-green-600">Link tersalin ke clipboard.</div>}
          </div>
        </div>
      )}

      <div className="p-2 lg:p-6">
        
        {/* ACTION BAR ATAS (PENGGANTI FORM HEADER) */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={() => setShowGroupModal(true)}
              className="bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-emerald-800 w-full md:w-auto justify-center transition-all"
            >
              <Users size={16} />
              Atur Kelompok
            </button>
            <button 
              onClick={() => setShowSettingsModal(true)} 
              className="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-700 w-full md:w-auto justify-center transition-all"
            >
              <Settings size={16} className="text-blue-400" />
              Atur Identitas & Header
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden md:block">Pilih Periode:</span>
            <select value={bulan} onChange={e => setBulan(parseInt(e.target.value))} className="p-3 border-2 border-blue-100 bg-blue-50 text-blue-900 rounded-xl font-black text-xs uppercase w-full md:w-auto">
              {daftarBulan.map((b, i) => <option key={i} value={i+1}>{b}</option>)}
            </select>
            <input type="number" value={tahun} onChange={e => setTahun(parseInt(e.target.value))} className="p-3 border-2 border-blue-100 bg-blue-50 text-blue-900 rounded-xl font-black text-xs uppercase w-24 text-center" />
            <button onClick={() => setShowShareModal(true)} className="ml-3 bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase">Bagikan Jadwal</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 no-print">
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-bold text-slate-700">Instruksi tambahan untuk AI (opsional)</span>
            <textarea
              value={scheduleAdditionalInstructions}
              onChange={event => setScheduleAdditionalInstructions(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Contoh: Bulan ini, [nama SDM] ditugaskan khusus untuk dokter [nama dokter] (simbol [simbol]) pada hari praktiknya."
              disabled={generatingSchedule || loading || approvingDraft}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
            />
            <span className="mt-1 block text-right text-[10px] text-slate-500">{scheduleAdditionalInstructions.length}/2000 karakter</span>
          </label>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-900 flex items-center gap-2"><Sparkles size={18} className="text-violet-600" /> Draft Jadwal dengan Groq</h2>
              <p className="text-xs text-slate-600 mt-1">AI mempertimbangkan pola kerja, cuti yang disetujui, dan riwayat simbol enam bulan terakhir. Tinjau draft sebelum menerapkannya.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateSchedule}
                disabled={generatingSchedule || loading}
                className="bg-violet-700 text-white px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2 justify-center hover:bg-violet-800 disabled:opacity-50"
              >
                {generatingSchedule ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generatingSchedule ? "Menyusun Draft..." : "✨ Hasilkan Jadwal AI"}
              </button>
              <button
                type="button"
                onClick={handleResetSchedule}
                disabled={loading || generatingSchedule || approvingDraft}
                className="bg-red-700 text-white px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 justify-center hover:bg-red-800 disabled:opacity-50"
              >
                <Trash2 size={16} />
                {loading ? "Mengosongkan..." : "Kosongkan Bulan"}
              </button>
            </div>
          </div>
          {scheduleGenerationError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{scheduleGenerationError}</p>}
          {scheduleGenerationReport && (
            <div className="mt-4 border-t pt-4 text-sm text-slate-700 space-y-3">
              <p className="font-semibold">
                Draft berisi {scheduleGenerationReport.assignedCount} usulan penugasan
                {scheduleGenerationReport.clearedNoPracticeCount > 0 && ` dan akan mengosongkan ${scheduleGenerationReport.clearedNoPracticeCount} sel pada hari tanpa praktik`}
                {scheduleGenerationReport.clearedDoctorLeaveCount > 0 && `; ${scheduleGenerationReport.clearedDoctorLeaveCount} penugasan dokter cuti akan dihapus`}
                {scheduleGenerationReport.skippedOnLeave > 0 && `; ${scheduleGenerationReport.skippedOnLeave} penugasan dilewati karena cuti disetujui`}.
              </p>
              {scheduleGenerationReport.summary && <p>{scheduleGenerationReport.summary}</p>}
              {scheduleGenerationReport.midelCounts?.length > 0 && (
                <p>
                  Rekap midel bulan ini: {scheduleGenerationReport.midelCounts
                    .map(item => `${item.name} ${item.count} kali`)
                    .join("; ")}.
                </p>
              )}
              <p className={scheduleGenerationReport.unassignedPeople.length ? "text-amber-800" : "text-emerald-700"}>
                SDM yang terjadwal setelah draft: {scheduleGenerationReport.coveredPeopleCount}/{scheduleGenerationReport.totalPeopleCount}.
                {scheduleGenerationReport.unassignedPeople.length > 0 && ` Belum tercakup: ${scheduleGenerationReport.unassignedPeople.join(", ")}.`}
              </p>
              {scheduleGenerationReport.noPracticeDays.length > 0 && (
                <p className="text-amber-800">Tidak ada dokter praktik (dibiarkan kosong): tanggal {scheduleGenerationReport.noPracticeDays.join(", ")}.</p>
              )}
              <div>
                <h3 className="font-black text-xs uppercase tracking-wide mb-2">Pratinjau Jadwal Bulanan Sebelum Diterapkan</h3>
                <p className="mb-2 text-[10px] text-slate-600">Cuti SDM yang disetujui ditampilkan sesuai kode cuti dan tidak akan diganti oleh usulan AI.</p>
                <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-max border-collapse text-center text-[10px]">
                    <thead className="sticky top-0 z-10 bg-slate-800 text-white">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-36 bg-slate-800 p-1 text-left">Nama SDM</th>
                        {Array.from({ length: jumlahHari }).map((_, index) => (
                          <th key={index} className="min-w-8 border-l border-slate-600 p-1">{index + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daftarSDM.map(person => (
                        <tr key={person.id} className="border-t border-slate-200 odd:bg-white even:bg-slate-50">
                          <th className="sticky left-0 z-[1] bg-inherit p-1 text-left font-semibold">{person.nama}</th>
                          {Array.from({ length: jumlahHari }).map((_, index) => {
                            const day = index + 1;
                            const leave = getAutoCutiValue(person.nama, day);
                            const symbol = scheduleGenerationDraft.previewSchedule?.[`${person.id}-${day}`] || "";
                            return (
                              <td
                                key={day}
                                title={leave ? `Cuti disetujui: ${leave}` : symbol ? `Usulan jadwal: ${symbol}` : "Belum ada jadwal"}
                                className={`border-l border-slate-100 p-1 font-bold ${leave ? "bg-blue-100 text-blue-900" : symbol ? "text-slate-800" : "text-slate-300"}`}
                              >
                                {leave || symbol || "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="font-black text-xs uppercase tracking-wide mb-2">Pratinjau Penugasan</h3>
              {doctorLeaveImpacts.length > 0 && (
                <section role="alert" className="mt-4 border border-amber-300 bg-amber-50 p-4 rounded-xl text-sm text-amber-950">
                  <h3 className="font-black">Penugasan terdampak dokter berhalangan</h3>
                  <ul className="mt-2 space-y-2">
                    {doctorLeaveImpacts.slice(0, 12).map(impact => (
                      <li key={impact.key} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-t border-amber-200 pt-2">
                        <span>
                          Tanggal {impact.day}: {impact.personName} ({impact.symbol}) untuk {impact.absentDoctors.join(", ")}.
                          {impact.recommendation
                            ? ` Saran: ${impact.recommendation.name} (${impact.recommendation.symbol}), ${impact.recommendation.patients} pasien periode sebelumnya dan ${impact.recommendation.assistants} asisten terjadwal.`
                            : " Belum ada dokter pengganti yang praktik di klinik yang sama pada tanggal ini."}
                        </span>
                        {impact.recommendation && (
                          <button
                            type="button"
                            onClick={() => updateIsiJadwal({ ...isiJadwal, [impact.key]: impact.recommendation.symbol })}
                            className="shrink-0 bg-amber-800 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-amber-900"
                          >
                            Terapkan Saran
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {doctorLeaveImpacts.length > 12 && <p className="mt-2 text-xs">Masih ada {doctorLeaveImpacts.length - 12} penugasan terdampak lainnya.</p>}
                </section>
              )}
                {scheduleGenerationDraft?.assignments.length ? (
                  <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-slate-800 text-white">
                        <tr>
                          <th className="p-2">Tanggal</th>
                          <th className="p-2">Nama SDM</th>
                          <th className="p-2">Jabatan</th>
                          <th className="p-2">Simbol</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleGenerationDraft.assignments.map((assignment, index) => (
                          <tr key={`${assignment.personId}-${assignment.day}-${index}`} className="border-t border-slate-200 odd:bg-white even:bg-slate-50">
                            <td className="whitespace-nowrap p-2">{assignment.day} {assignment.weekday}</td>
                            <td className="p-2 font-semibold">{assignment.nama}</td>
                            <td className="p-2">{assignment.jabatan}</td>
                            <td className="p-2 font-bold">{assignment.symbol}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-amber-800">Belum ada penugasan baru untuk diterapkan.</p>
                )}
              </div>
              <div>
                <h3 className="font-black text-xs uppercase tracking-wide mb-2">Cakupan Simbol Praktik</h3>
                <div className="flex flex-wrap gap-2">
                  {scheduleGenerationReport.coverage.map(item => (
                    <span key={item.symbol} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.uncoveredDays.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                      {item.symbol}: dipakai {item.usedDays}/{item.expectedDays} hari
                      {item.uncoveredDays.length > 0 && ` · belum: ${item.uncoveredDays.join(", ")}`}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleApproveDraft}
                  disabled={approvingDraft || scheduleGenerationReport.approved || !scheduleGenerationDraft}
                  className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase hover:bg-emerald-700 disabled:opacity-60"
                >
                  {approvingDraft ? "Menyimpan..." : scheduleGenerationReport.approved ? "Sudah Disetujui" : "Setujui & Terapkan Draft"}
                </button>
                {scheduleGenerationReport.approved && (
                  <span role="status" className="text-xs font-bold text-emerald-700">
                    Draft tersimpan; {scheduleGenerationReport.approvedCount} penugasan baru diterapkan ke tabel.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AREA TABEL JADWAL */}
        <div id="area-jadwal" className="bg-white p-2 md:p-5 rounded-[2rem] shadow-xl overflow-hidden print-area">
          <div className="text-center mb-5 uppercase font-bold hidden print:block">
            <h1 className="text-xl font-black">{header.institusi}</h1>
            <h2 className="text-lg text-blue-600">{header.judul_bebas}</h2>
            <p className="text-sm">PERIODE: {daftarBulan[bulan-1].toUpperCase()} {tahun}</p>
          </div>

          <div className="flex justify-between items-center mb-3 no-print">
            <div />
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLegendModal(true)} className="text-sm bg-slate-100 px-3 py-2 rounded-xl border">Keterangan Simbol</button>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 no-print">
            <p className="mb-2 text-xs font-black text-blue-900">Petunjuk warna opsi simbol dokter</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-red-300 bg-red-200" />
                Merah: belum ada asisten
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-emerald-300 bg-emerald-100" />
                Hijau: tepat satu asisten
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-amber-300 bg-amber-100" />
                Kuning: lebih dari satu asisten
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-violet-300 bg-violet-200" />
                Ungu: ada dokter dengan simbol ini yang sedang cuti; arahkan kursor untuk melihat namanya.
              </span>
            </div>
          </div>

          <div id="grouped-schedule-tables" className="space-y-5">
            {kelompokDenganAnggota.map((group, groupIndex) => {
              const groupLegend = getKeteranganSimbolTerkelompok(group.anggota);
              return (
              <section key={group.id} className="schedule-section" style={groupIndex > 0 ? { breakBefore: "page" } : undefined}>
                <div className="mb-2 border-b-2 border-slate-800 pb-2">
                  <h2 className="schedule-title text-sm font-black uppercase text-slate-900">{group.nama || "Kelompok tanpa nama"}</h2>
                  {group.keterangan?.trim() && <p className="schedule-description mt-1 text-xs text-slate-600">{group.keterangan}</p>}
                </div>
                <div className="overflow-x-auto border-t border-l border-black">
                  <table className="schedule-table w-full border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="border border-black p-1 text-[10px] w-8" rowSpan="2">NO</th>
                        <th className="border border-black p-1 text-[10px] w-48" rowSpan="2">NAMA & JABATAN</th>
                        <th className="border border-black p-1 text-[10px]" colSpan={jumlahHari}>TANGGAL</th>
                        <th className="schedule-recap-column border border-black p-1 text-[10px] w-32" rowSpan="2">REKAP</th>
                      </tr>
                      <tr className="bg-slate-700 text-white">
                        {Array.from({ length: jumlahHari }).map((_, i) => (
                          <th key={i} className={`border border-black p-1 text-[9px] cell-input ${cekTanggalMerah(i+1) ? 'text-red-300 bg-red-word' : ''}`}>
                            {i+1}<br/>{namaHariSingkat[(hariPertama + i) % 7]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.anggota.map((sdm, idx) => {
                        const rekap = {};
                        return (
                          <tr key={sdm.id} className="text-center">
                            <td className="border border-black p-1 text-[9px]">{idx+1}</td>
                            <td className="border border-black p-1 text-left whitespace-nowrap bg-slate-50 truncate">
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-[10px] uppercase truncate">{sdm.nama}</div>
                                {sdm.status_kerja !== 'AKTIF' && (
                                  <label className="ml-2 flex items-center gap-1 text-[9px]">
                                    <input type="checkbox" checked={sdm.tampil_di_jadwal !== 0} onChange={async (e) => {
                                      const show = e.target.checked ? 1 : 0;
                                      setToggling(true);
                                      try {
                                        const res = await fetch('/api/sdm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_tampil', id: sdm.id, tampil: show }) });
                                        const json = await res.json();
                                        if (res.ok && json.success) {
                                          if (show === 0) {
                                            setDaftarSDM(prev => prev.filter(x => String(x.id) !== String(sdm.id)));
                                          } else {
                                            const d = await fetch('/api/sdm');
                                            const arr = await d.json();
                                            setDaftarSDM(arr.filter(a => a.is_aktif === 1 || a.is_aktif === '1'));
                                          }
                                        } else {
                                          alert('Gagal mengubah tampilan.');
                                        }
                                      } catch (err) { console.error(err); alert('Kesalahan jaringan'); }
                                      setToggling(false);
                                    }} />
                                    <span className="text-slate-500">Tampil</span>
                                  </label>
                                )}
                              </div>
                              <div className="text-[8px] text-blue-600 italic font-semibold truncate">{sdm.jabatan}</div>
                            </td>
                            {Array.from({ length: jumlahHari }).map((_, i) => {
                              const tgl = i + 1;
                              const autoVal = getAutoCutiValue(sdm.nama, tgl);
                              const currentVal = autoVal || getScheduleSymbol(sdm.id, tgl) || "";
                              if (currentVal) rekap[currentVal] = (rekap[currentVal] || 0) + 1;

                              const targetDateObj = new Date(tahun, bulan - 1, tgl);
                              let sdmActiveUntil = null;
                              if (sdm.tanggal_akhir_kerja) sdmActiveUntil = new Date(sdm.tanggal_akhir_kerja);
                              else if (sdm.last_mutasi) sdmActiveUntil = new Date(sdm.last_mutasi);
                              const isAfterActive = sdmActiveUntil ? (targetDateObj > sdmActiveUntil) : false;

                              if (isAfterActive) {
                                return (
                                  <td key={i} className="border border-black p-1 cell-input bg-slate-100 text-[10px]">
                                    <div className="text-slate-400 italic text-[10px]">-</div>
                                    <span className="hidden print:block font-bold text-[9px] truncate"></span>
                                  </td>
                                );
                              }

                              return (
                                <td key={i} className="border border-black p-0 cell-input">
                                  <div className="no-print">
                                    <div className="relative inline-block group">
                                      <select
                                        value={currentVal}
                                        title={currentVal
                                          ? `${currentVal}: dipakai ${getSymbolAssistantCount(currentVal, tgl)} SDM pada tanggal ${tgl}`
                                          : "Pilih simbol dokter"}
                                        disabled={!!autoVal}
                                        onChange={e => {
                                          const key = `${sdm.id}-${tgl}`;
                                          if (e.target.value === "__HAPUS__") {
                                            const nextIsiJadwal = { ...isiJadwal };
                                            delete nextIsiJadwal[key];
                                            updateIsiJadwal(nextIsiJadwal);
                                            return;
                                          }
                                          updateIsiJadwal({ ...isiJadwal, [key]: e.target.value.toUpperCase() });
                                        }}
                                        className={`dropdown-select bg-transparent text-center font-bold text-[10px] h-8 outline-none appearance-none cursor-pointer ${autoVal ? 'text-red-600 font-black' : 'text-slate-900'}`}
                                      >
                                        <option value="">-</option>
                                        <option value="__HAPUS__">Hapus simbol</option>
                                        <optgroup label="ABSENSI">
                                          {statusAbsensi.map(s => <option key={s} value={s}>{s}</option>)}
                                        </optgroup>
                                        <optgroup label="DOKTER (CERDAS)">
                                          {getSimbolHarian(tgl, currentVal).map(s => {
                                            const assistantCount = getSymbolAssistantCount(s, tgl);
                                            const doctorsOnLeave = getDoctorsOnLeaveForSymbol(s, tgl);
                                            const optionColor = doctorsOnLeave.length
                                              ? { backgroundColor: "#e9d5ff", color: "#581c87" }
                                              : assistantCount === 0
                                                ? { backgroundColor: "#fecaca", color: "#7f1d1d" }
                                                : assistantCount === 1
                                                  ? { backgroundColor: "#d1fae5", color: "#064e3b" }
                                                  : { backgroundColor: "#fef3c7", color: "#78350f" };
                                            const optionTitle = [
                                              `Dipakai ${assistantCount} SDM pada tanggal ${tgl}`,
                                              doctorsOnLeave.length
                                                ? `Dokter cuti: ${doctorsOnLeave.map(doctor => doctor.nama_dokter).join(", ")}`
                                                : "",
                                              isDoctorSymbolUnavailable(s, tgl)
                                                ? "Tidak dapat dipilih karena semua dokter dengan simbol ini sedang cuti"
                                                : "",
                                            ].filter(Boolean).join(". ");
                                            return (
                                              <option
                                                key={s}
                                                value={s}
                                                title={optionTitle}
                                                style={optionColor}
                                                disabled={isDoctorSymbolUnavailable(s, tgl)}
                                              >
                                                {s}
                                              </option>
                                            );
                                          })}
                                          <option value="M">M</option>
                                          <option value="T">T</option>
                                        </optgroup>
                                      </select>
                                    </div>
                                  </div>
                                  <span className="hidden print:block font-bold text-[9px] truncate">{currentVal}</span>
                                </td>
                              );
                            })}
                            <td className="schedule-recap-column border border-black p-1 text-[8px] text-left font-bold italic truncate">
                              {Object.entries(rekap).map(([k, v]) => `${k}:${v} `)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-[9px]">
                      <tr>
                        <td colSpan="2" className="border border-black p-1 text-right italic uppercase">Jumlah Perawat Masuk</td>
                        {Array.from({ length: jumlahHari }).map((_, i) => (
                          <td key={i} className="border border-black text-center text-blue-600 font-black cell-input">{hitungTotalMasuk(i+1, "perawat", group.anggota) || ""}</td>
                        ))}
                        <td className="schedule-recap-column border border-black"></td>
                      </tr>
                      <tr>
                        <td colSpan="2" className="border border-black p-1 text-right italic uppercase">Jumlah Tenaga Lain Masuk</td>
                        {Array.from({ length: jumlahHari }).map((_, i) => (
                          <td key={i} className="border border-black text-center text-emerald-600 font-black cell-input">{hitungTotalMasuk(i+1, "lain", group.anggota) || ""}</td>
                        ))}
                        <td className="schedule-recap-column border border-black"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {groupLegend.length > 0 && (
                  <div className="compact-legend mt-2 mb-1">
                    <strong>Keterangan Simbol:</strong>
                    {groupLegend.map(item => (
                      <div key={item.simbol}><strong>{item.simbol}:</strong> {item.keterangan.join("; ")}</div>
                    ))}
                  </div>
                )}
              </section>
              );
            })}
          </div>

          <div className="schedule-signatures hidden print:grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="schedule-signature-cell">Mengetahui,<br/>{header.atasan_jabatan}<br/><br/><br/><br/><span className="schedule-signature-name">{header.atasan_nama}</span><br/>NIP. {header.atasan_nip}</div>
            <div className="schedule-signature-cell">{header.tempat_cetak}, {format(new Date(header.tgl_cetak), 'dd MMMM yyyy', { locale: id })}<br/>{header.pembuat_jabatan}<br/><br/><br/><br/><span className="schedule-signature-name">{header.pembuat_nama}</span><br/>NIP. {header.pembuat_nip}</div>
          </div>

        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="fixed bottom-6 right-6 flex gap-3 no-print z-[90]">
          {/* TOMBOL UNDO */}
          <button onClick={handleUndo} disabled={historyIndex === 0} className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg hover:bg-amber-600 disabled:opacity-50 transition-all hidden md:block">
            <Undo2 size={18} />
          </button>
          {/* TOMBOL REDO */}
          <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg hover:bg-amber-600 disabled:opacity-50 transition-all hidden md:block">
            <Redo2 size={18} />
          </button>

          <button onClick={downloadWord} className="bg-emerald-600 text-white px-4 md:px-6 py-4 rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
            <FileText size={18} /> <span className="hidden md:inline">Word Pro</span>
          </button>
          <button onClick={handleSimpan} className="bg-blue-600 text-white px-6 md:px-10 py-4 rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all">
            {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />} <span className="hidden md:inline">Simpan Jadwal</span>
          </button>
        </div>
      </div>
    </div>
  );
}