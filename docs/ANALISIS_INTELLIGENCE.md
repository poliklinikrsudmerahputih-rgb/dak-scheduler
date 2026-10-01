# Dokumentasi Analisis & Intelligence

## 1. Tujuan dan cakupan

Sub-menu **Analisis & Intelligence** menyediakan ringkasan operasional berdasarkan data dokter, pasien, jadwal SDM, absensi, mulai praktik, dan catatan cuti yang tersedia di Turso. Halaman ini bersifat baca-saja: tidak menulis, mengubah, atau menghapus data dari modul jadwal, absensi, pasien, maupun cuti.

Alamat halaman: `/analisis`

Endpoint data: `GET /api/analytics`

Visualisasi memakai Recharts yang sudah tersedia sebagai dependensi aplikasi (`recharts`). SWR yang juga sudah tersedia mengelola pemuatan dan refresh data. Tidak ada tabel, migrasi database, atau dependensi baru yang ditambahkan.

## 2. Perubahan implementasi

| File | Tanggung jawab |
| --- | --- |
| `src/app/(dashboard)/analisis/page.js` | Halaman interaktif, filter, KPI, diagram, wawasan, CSV, dan cetak. |
| `src/app/api/analytics/route.js` | Validasi sesi dan rentang tanggal, query agregasi Turso, perhitungan metrik, dan respons JSON. |
| `src/app/(dashboard)/layout.js` | Menambahkan tautan sidebar **Analisis & Intelligence** ke `/analisis`. |

Route API bersifat dinamis (`force-dynamic`) agar data tidak disajikan dari cache halaman statis.

## 3. Alur permintaan dan filter

1. Halaman membuat permintaan ke `/api/analytics` menggunakan SWR.
2. API membaca cookie `session_dak_pro`. Jika cookie hilang atau tidak dapat diparse, API mengembalikan `401`.
3. Nilai `ruangan` diambil dari sesi, dinormalisasi dengan trim dan huruf kapital. Nilai dari query string tidak dapat mengganti ruangan sesi.
4. API memvalidasi rentang waktu dan klinik, lalu menjalankan query untuk sumber data operasional.
5. API mengembalikan agregat yang dikonsumsi diagram dan KPI.

Parameter query:

| Parameter | Nilai | Perilaku |
| --- | --- | --- |
| `preset` | `month` | Awal bulan berjalan sampai hari ini. Ini pilihan awal halaman. |
| `preset` | `year` | 1 Januari tahun berjalan sampai hari ini. |
| `preset` | `custom` | Memerlukan `start=YYYY-MM-DD` dan `end=YYYY-MM-DD`. |
| `clinic` | `all` | Semua klinik yang tersedia dalam master dokter pada ruangan sesi. |
| `clinic` | Nama klinik | Klinik tunggal; API menolak klinik yang tidak ada pada ruangan sesi dengan `400`. |

Tanggal kustom harus valid, tidak terbalik, dan maksimal 366 hari. Rentang kosong/tidak valid menghasilkan `400`. Halaman tidak meminta data kustom sampai kedua tanggal dipilih.

Contoh:

```text
/api/analytics?preset=month&clinic=all
/api/analytics?preset=year&clinic=all
/api/analytics?preset=custom&start=2026-09-01&end=2026-09-30&clinic=POLI%20UMUM
```

Status respons utama:

| Status | Makna |
| --- | --- |
| `200` | Agregasi berhasil. |
| `400` | Filter/rentang tanggal tidak valid atau klinik tidak tersedia. |
| `401` | Sesi tidak ditemukan atau tidak valid. |
| `500` | Kesalahan pemrosesan/query yang tidak tertangani; pesan database internal tidak dikirim ke UI. |

## 4. Sumber data dan batas ruang lingkup

| Tabel | Data yang dipakai |
| --- | --- |
| `master_dokter` | ID, nama dokter, klinik, hari praktik, jam praktik, dan ruangan. Menentukan daftar dokter/klinik dan perkiraan sesi praktik. |
| `sdm` | Jumlah staf pada ruangan sesi dan nama staf untuk agregasi jadwal. |
| `jadwal_dinas` | Jadwal per tanggal, simbol, dan SDM; dihitung menjadi jumlah shift per staf. |
| `jumlah_pasien_poli` | Jumlah pasien per dokter/klinik/tanggal. Baris dijumlahkan di SQL sebelum dikirim ke aplikasi. |
| `cuti_sdm` | Jenis cuti dan tanggal; hanya status `Disetujui` dimasukkan dalam komposisi cuti dan jumlah SDM cuti. |
| `cuti_dokter` | Jenis dan periode catatan dokter berhalangan yang tumpang tindih dengan rentang laporan. Tabel ini tidak memiliki kolom status persetujuan yang dipakai fitur ini. |
| `indikator_mutu_praktik` | Waktu mulai praktik aktual untuk mengukur pencatatan mulai dan ketepatan waktu dokter. |
| `absensi` | Log clock-in, ruangan, dan `status_kedisiplinan`; digunakan menghitung jumlah kehadiran dan clock-in berstatus tepat waktu. |

Untuk query ruangan, data berisi ruangan kosong/NULL tetap diikutsertakan pada tabel yang menerapkan pola kompatibilitas data lama, mengikuti konvensi aplikasi yang sudah ada. Join jadwal SDM juga membatasi nama staf ke ruangan sesi.

**Batas isolasi data pasien:** `jumlah_pasien_poli` saat ini tidak memiliki kolom `ruangan`. Query hanya mengambil klinik yang berasal dari `master_dokter` pada ruangan sesi. Jika nama klinik yang sama dipakai lintas ruangan, total pasien dapat tercampur karena sumber pasien tidak menyimpan pemisah ruangan. Isolasi pasien lintas ruangan yang kuat memerlukan kolom `ruangan` pada tabel tersebut (beserta pengisian data dan filter query), atau relasi pemetaan unik klinik-ke-ruangan.

## 5. KPI, diagram, dan definisi perhitungan

### KPI

- **Kunjungan pasien:** jumlah `jumlah` dari baris pasien pada klinik/rentang terpilih.
- **Dokter terjadwal:** jumlah baris master dokter dalam cakupan klinik.
- **Kehadiran SDM:** jumlah record clock-in dalam rentang. Catatan “clock-in tepat waktu” menghitung record dengan status `TEPAT WAKTU`.
- **Beban SDM:** jumlah staf dalam ruangan; catatan tambahan di kartu adalah total shift dari daftar staf yang ditampilkan di diagram beban (maksimal 8 staf teratas).
- **Mulai praktik:** persentase jumlah pencatatan mulai praktik dibanding estimasi sesi terjadwal. Persentase dibatasi maksimum 100%.
- **Tepat waktu praktik:** persentase pencatatan mulai valid yang dimulai maksimal 15 menit setelah jam praktik master.
- **Cuti tercatat:** jumlah cuti SDM disetujui ditambah seluruh catatan cuti dokter yang bertumpang tindih dengan periode. Catatan jumlah SDM cuti adalah jumlah nama SDM unik dengan cuti disetujui dalam rentang.

### Grafik tren kunjungan

- Rentang hingga 62 hari ditampilkan per hari, termasuk hari tanpa kunjungan sebagai nol.
- Rentang lebih panjang digabung per bulan.
- Grafik menggunakan total pasien dari tabel `jumlah_pasien_poli`; bukan data antrean real-time.

### Grafik kunjungan dan praktik dokter

Bar membandingkan total pasien aktual per dokter dengan estimasi jumlah sesi terjadwal. Grafik menampilkan maksimal 10 dokter, diurutkan dari pasien terbanyak.

Angka sesi berasal dari `master_dokter.jadwal_hari`, dengan menghitung hari dalam kalender rentang yang cocok dengan hari praktik mingguan. Angka ini **bukan kuota pasien** dan bukan jumlah kehadiran dokter yang terverifikasi.

### Komposisi cuti

Donut mengelompokkan `jenis_cuti` pada cuti SDM berstatus disetujui dan catatan cuti dokter yang bertumpang tindih dengan rentang. Kode yang dikenal diberi label seperti `CS` (sakit), `CT` (cuti tahunan), `CM` (melahirkan), `DL` (dinas luar), dan `L` (libur). Kode lain tetap ditampilkan sesuai data.

### Beban shift SDM

Grafik batang horizontal menjumlahkan baris jadwal per nama SDM dalam rentang, menampilkan maksimal 8 staf dengan shift terbanyak. Metrik ini menghitung shift terjadwal, bukan durasi jam kerja atau beban klinis berbobot.

### Heatmap praktik

Heatmap menghitung dokter pada setiap kombinasi hari mingguan dan blok waktu `07-09`, `09-11`, `11-13`, `13-15`, `15-17`. Sumbernya hari dan jam praktik master dokter, bukan volume pasien aktual per jam. Karena data pasien menyimpan tanggal tetapi tidak jam pelayanan, jam sibuk berbasis kunjungan belum dapat dihitung dari sumber yang ada.

## 6. Wawasan otomatis

Bagian **AI Insights Analyst** saat ini merupakan analitik berbasis aturan deterministik di endpoint, bukan panggilan ke model bahasa atau layanan AI eksternal. Wawasan yang dapat muncul:

- Klinik dengan total pasien tertinggi dan proporsinya dari seluruh kunjungan terdata.
- Perubahan total pasien 7 hari terakhir dibanding 7 hari sebelumnya bila rentang sedikitnya 14 hari dan periode pembanding memiliki pasien.
- Jumlah cuti SDM disetujui dan catatan dokter berhalangan pada rentang.
- Persentase tepat waktu praktik jika ada pencatatan valid.
- Pesan bahwa data belum cukup bila tidak ada kondisi di atas.

Wawasan bersifat deskriptif. Sistem belum menyimpulkan sebab-akibat, belum mengaitkan cuti dokter dengan perubahan jumlah pasien per klinik, dan belum membuat rekomendasi staf otomatis. Temuan harus diverifikasi manajemen sebelum menjadi keputusan operasional.

## 7. Ekspor dan tampilan cetak

- **CSV:** menghasilkan file UTF-8 dengan BOM agar lebih mudah dibuka di aplikasi spreadsheet. Kolomnya `Bagian`, `Nama`, `Nilai`, dan `Keterangan`; isinya mencakup tren, daftar dokter yang digrafikkan, daftar staf yang digrafikkan, jenis cuti, dan teks insight.
- **Cetak:** memanggil dialog cetak browser. Tombol dan beberapa area layout bertanda `print:hidden` tidak ikut dicetak.
- CSV saat ini mengekspor daftar yang dipakai visualisasi, bukan seluruh baris mentah pasien/jadwal dan bukan seluruh ringkasan KPI sebagai satu baris terpisah.

## 8. Keamanan dan kinerja

- API hanya menerima ruangan dari cookie `session_dak_pro`; query tidak mempercayai parameter ruangan dari klien.
- Nilai filter klinik divalidasi terhadap daftar klinik yang diambil dari master dokter pada ruangan sesi.
- Query parameter menggunakan argumen terikat untuk tanggal, ruangan, dan klinik.
- Pembacaan master dokter, SDM, jadwal, cuti SDM, cuti dokter, indikator praktik, dan absensi dijalankan paralel memakai `Promise.all`.
- Data pasien baru dapat difilter setelah daftar klinik diketahui; satu query terikat dijalankan dan dijumlahkan dengan `SUM`/`GROUP BY` di Turso. Tidak ada query per dokter atau per staf (N+1).
- Pembacaan `indikator_mutu_praktik` dan `absensi` memiliki fallback ke daftar kosong bila tabel/query opsional tidak tersedia. Dalam kondisi itu grafik/KPI terkait dapat menampilkan nol atau tanda kosong; hal ini tidak membuktikan bahwa kejadian operasional memang tidak ada.
- Endpoint tidak mengubah tabel atau menjalankan operasi tulis.

## 9. Perbaikan yang dilakukan

### Kolom `status_acc` pada cuti dokter

**Gejala:** `/api/analytics` gagal dengan `SQL_INPUT_ERROR: no such column: status_acc`.

**Penyebab:** query analitik memilih `status_acc` dari `cuti_dokter`, padahal pola penyimpanan cuti dokter di aplikasi mencatat nama, jenis, rentang, simbol, dan metadata lainnya tanpa alur status persetujuan tersebut.

**Perbaikan:** query cuti dokter hanya memilih kolom yang digunakan dan tersedia. Cuti SDM tetap difilter menggunakan `status_acc = Disetujui`. UI memakai istilah **Cuti tercatat**, bukan menyebut semua catatan dokter sebagai cuti disetujui.

### Filter klinik `all`

**Gejala:** pilihan “Semua poliklinik” dikirim sebagai `clinic=all`, tetapi API menolaknya sebagai nama klinik yang tidak dikenal.

**Perbaikan:** endpoint menormalisasi sentinel `ALL` menjadi filter kosong, sehingga semua klinik yang diizinkan dipakai. Validasi klinik spesifik tetap berjalan.

### Validasi dan lifecycle frontend

- Fetch halaman menggunakan SWR, konsisten dengan halaman analitik yang sudah ada.
- Error `401` mengarahkan pengguna ke `/login`.
- Tanggal kustom tidak memicu fetch sebelum tanggal awal dan akhir dipilih.
- Lint React menemukan dan mendorong penghapusan setState sinkron di dalam efek ketika pola fetch awal dibuat.

## 10. Cara menggunakan dan memverifikasi

1. Login ke aplikasi, buka sidebar, lalu pilih **Analisis & Intelligence**.
2. Pilih Bulan ini, Tahun ini, atau Rentang kustom; untuk rentang kustom isi tanggal awal dan akhir.
3. Pilih Semua poliklinik atau satu poliklinik yang tersedia pada sesi.
4. Gunakan tombol muat ulang, **CSV**, atau **Cetak** sesuai kebutuhan.
5. Jika terjadi kegagalan, periksa status respons di Network browser dan log server Next.js. `401` berarti sesi tidak tersedia; `400` berarti filter/rentang tidak valid; `500` disertai detail aman pada UI dan rincian teknis pada log server.

Pemeriksaan yang sudah dijalankan saat implementasi/perbaikan: ESLint terarah untuk file analitik dan `npm run build`; keduanya berhasil. Build menampilkan peringatan deprekasi konvensi `middleware` milik Next.js, yang tidak terkait perubahan fitur ini.