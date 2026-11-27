# Pencatatan Sarpras Rawat Jalan

Modul `/sarpras` memiliki tiga tab terpisah: **Usulan Sarpras**, **Inventaris KIR**, dan **Buku Alat Rusak**. Modul tersedia pada menu utama **Data & jadwal**. Tombol **Sarpras Rawat Jalan** di halaman Jadwal Praktik Poliklinik Rawat Jalan membuka workspace yang sama di pop-up tanpa berpindah halaman.

Workspace pada `/shared/sarpras` dibuka langsung dari halaman jadwal untuk data `POLIKLINIK`. Pengunjung tanpa login dapat mengirim usulan Sarpras, KIR, dan laporan alat rusak; semua usulan disimpan terpisah sebagai `PENDING` dan tidak mengubah data utama. Pengguna yang login dapat meninjau antrean di tab submenu **Sarpras Rawat Jalan** pada website utama, lalu menyetujui atau menolak usulan. Persetujuan menyalin data ke tabel utama dalam transaksi. Tampilan publik buku alat rusak menampilkan nama pelapor dan petugas IPSRS sebagaimana data laporan.

Tabel antrean usulan sarpras dibuat melalui `scripts/migrations/create_sarpras_usulan_publik.sql`. Antrean KIR dan buku alat rusak dibuat melalui `scripts/migrations/create_sarpras_kir_and_alat_rusak_usulan_publik.sql`. Jalankan migrasi sebelum menerima pengajuan publik.

**Usulan Sarpras** menyediakan pencarian, filter poli/kategori, tambah, ubah, dan hapus. Dropdown poli dibentuk dari semua nama poli/ruangan yang terpakai pada data, setelah spasi tepi dibersihkan. Data usulan awal tetap berasal dari tab **ALKES PER POLI** pada workbook pengajuan 2026.

**Inventaris KIR** menampilkan data inventaris dari setiap tab workbook KIR. Data disimpan terpisah dari usulan, dapat dicari dan difilter menurut tab/ruangan, kategori, dan kondisi aset. Dropdown ruangan mencakup semua tab sumber, termasuk tab kosong, serta tab yang ditemukan dari baris inventaris. Form menggunakan label yang mudah dipahami, bukan label kolom Excel. Nomor urut dibuat otomatis berdasarkan nomor tertinggi pada tab yang dipilih dan tidak dapat diubah saat input/edit. Kondisi aset dipilih melalui dropdown standar **Baik**, **Rusak Ringan**, atau **Rusak Berat**. Status lama **Rusak** tetap dapat disimpan saat mengedit data sumber; ejaan **BAIIK** ditampilkan sebagai **Baik**. Saat menambah inventaris, pilih **+ Tambahkan ruangan baru** pada dropdown **Tab / Ruangan** untuk menampilkan input nama ruangan. Sistem membuat tab manual di ruang kerja sesi; nama yang sudah terdaftar tidak dapat dibuat ulang. Kode, register, nomor seri, dan nilai sumber lainnya tetap disimpan tanpa kehilangan format. Input baru diberi sumber **Input manual**, sedangkan edit pada baris Excel ditandai **Diedit manual**; snapshot seluruh sel sumber tetap dipertahankan di metadata sheet. Judul/periode pada tiap kartu dipertahankan sesuai sumber; periode dalam workbook tidak seragam. Tab kosong dan tab yang tidak memiliki baris barang juga disimpan.

**Buku Alat Rusak** mencatat tanggal pelaporan, poli/ruangan, nama alat, deskripsi kerusakan, nama pelapor, nama petugas IPSRS penerima laporan, serta tanggal selesai penanganan. Pilihan poli/ruangan digabung dari poli pada Usulan Sarpras dan nama ruang/tab pada KIR untuk `ruangan` sesi login; pilihan **Lainnya - isi manual** tersedia bila lokasi belum terdaftar. Tanggal pelaporan terisi otomatis hari ini; tanggal selesai boleh kosong sampai penanganan tuntas. Status **Menunggu** atau **Selesai** dihitung dari tanggal selesai. Laporan dapat diperbarui untuk mengisi tanggal penyelesaian, tetapi tidak dapat dihapus permanen agar riwayat tetap tersedia. Data dan nomor laporan dipisahkan berdasarkan `ruangan` sesi login.

API mewajibkan sesi login dan membatasi baca/tulis berdasarkan `ruangan` dari cookie sesi. Data awal usulan dan inventaris KIR berada pada ruang kerja `POLIKLINIK`; inventaris menyimpan nama dan kode ruang sumber secara terpisah.

## Pemetaan kolom Excel

| Kolom Excel | Kolom Turso |
|---|---|
| No. | `nomor` |
| Kategori bagian | `kategori` |
| Nama Barang | `nama_barang` |
| Poli Klinik/Ruangan | `klinik` |
| Kebutuhan | `kebutuhan` |
| Keadaan | `keadaan` |
| Kekurangan | `kekurangan` |
| Permintaan | `permintaan` |
| Spesifikasi/Keterangan | `spesifikasi` |
| Tahun pada judul dokumen | `tahun` |

Tabel `sarpras_rawat_jalan` dibuat melalui `scripts/migrations/create_sarpras_rawat_jalan.sql`. Migrasi awal memakai tab **ALKES PER POLI** dari pengajuan tahun 2026 agar setiap item mempertahankan poli tujuannya. Tab **PER ALAT** tidak diimpor karena berisi daftar yang tumpang tindih dengan nilai yang berbeda. Migrasi menyimpan kunci sumber berdasarkan baris Excel agar dapat dijalankan ulang tanpa menggandakan item.

Tabel `sarpras_kir_sheets` dan `sarpras_kir_inventory` pada berkas migrasi yang sama menyimpan daftar sheet beserta metadata/isi sumber dan item inventarisnya. Tabel `sarpras_alat_rusak` menyimpan buku alat rusak. Pembuatan tabel baru tersedia di `scripts/migrations/create_sarpras_alat_rusak.sql`; peningkatan tabel yang sudah ada untuk menambahkan poli/ruangan dan nama pelapor tersedia di `scripts/migrations/add_sarpras_alat_rusak_poli_ruangan_and_reporter.sql`. Untuk menyiapkan seed dari file Excel, jalankan PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\prepare_sarpras_kir_seed.ps1 `
  -WorkbookPath "E:\RAJAL\SARPRAS\KIR JANUARI 2026.xlsx" `
  -OutputPath "$env:TEMP\sarpras-kir-seed.json"
```

Setelah seed diverifikasi, impor ke Turso:

```powershell
node scripts\migrate_sarpras_kir.mjs "$env:TEMP\sarpras-kir-seed.json"
```

Migrasi memeriksa 49 sheet, 1.284 catatan inventaris, jumlah tiap kategori, dan memastikan 80 usulan sebelumnya tetap ada. Pengulangan migrasi tidak menimpa baris inventaris yang sudah ada sehingga perubahan manual tetap terjaga; data usulan tidak diubah.
