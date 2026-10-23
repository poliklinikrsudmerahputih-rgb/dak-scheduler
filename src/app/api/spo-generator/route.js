import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSopRuangan } from "@/lib/sop";
import { saveGeneratedSop } from "@/lib/spo-generator-storage";

export const dynamic = "force-dynamic";

const logoUrl = "https://i.ibb.co.com/0RMzZ5hS/Logo-Kabupaten-Magelang.png";
const maxTextLength = 100_000;

function findLabeledSourceValue(rawText, aliases) {
  const normalizedAliases = aliases.map((alias) => alias.toLocaleLowerCase("id-ID"));
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const cells = lines[index].split(/\s*\|\s*|\t+/).map((cell) => cell.trim()).filter(Boolean);
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells[cellIndex].replace(/^[\s*#\-–—]+/, "").replace(/^\d+[.)]\s*/, "").trim();
      const inlineMatch = cell.match(/^([^:：=]+?)\s*[:：=]\s*(.+)$/);
      const inlineLabel = inlineMatch?.[1].replace(/^\d+[.)]\s*/, "").trim().toLocaleLowerCase("id-ID");
      if (inlineMatch && normalizedAliases.includes(inlineLabel)) {
        return inlineMatch[2].trim();
      }

      const label = cell.replace(/\s*[:：=]\s*$/, "").toLocaleLowerCase("id-ID");
      if (!normalizedAliases.includes(label)) continue;
      const adjacentValue = cells.slice(cellIndex + 1).join(" | ").trim();
      if (adjacentValue) return adjacentValue;

      const nextLine = lines[index + 1] || "";
      const nextCell = nextLine.split(/\s*\|\s*|\t+/).map((value) => value.trim()).filter(Boolean)[0] || "";
      const nextLabel = nextCell.replace(/^[\s*#\-–—]+/, "").replace(/^\d+[.)]\s*/, "").replace(/\s*[:：=]\s*$/, "").toLocaleLowerCase("id-ID");
      if (nextCell && !normalizedAliases.includes(nextLabel)) {
        return nextCell;
      }
    }
  }
  return "";
}

async function hasValidSession() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  if (!sessionCookie) return false;
  try {
    return Boolean(JSON.parse(sessionCookie.value));
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  try {
    const response = await fetch(logoUrl, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Logo gagal diambil (HTTP ${response.status}).`);
    }
    const image = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/") || image.byteLength === 0) {
      throw new Error("Sumber logo tidak mengembalikan berkas gambar yang valid.");
    }
    return new NextResponse(image, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("SPO Generator logo fetch failed:", error);
    return NextResponse.json({ error: "Logo kabupaten gagal diambil." }, { status: 502 });
  }
}

export async function POST(request) {
  const ruangan = await getSopRuangan();
  if (!ruangan || !(await hasValidSession())) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
  }

  const action = ["generate", "assist-section"].includes(body?.action) ? body.action : "extract";
  const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
  const requestedTitle = typeof body?.judul_sop === "string" ? body.judul_sop.trim() : "";
  const section = typeof body?.section === "string" ? body.section : "";
  const currentContent = typeof body?.currentContent === "string" ? body.currentContent.trim() : "";
  const allowedSections = new Set([
    "pengertian",
    "tujuan",
    "kebijakan",
    "unit_terkait",
    "dokumen_terkait",
    "prosedur",
  ]);
  if (action === "extract" && !rawText) {
    return NextResponse.json({ error: "Teks SPO wajib diisi." }, { status: 400 });
  }
  if (action === "generate" && !requestedTitle) {
    return NextResponse.json({ error: "Judul SPO wajib diisi sebelum membuat draft." }, { status: 400 });
  }
  if (action === "assist-section" && (!allowedSections.has(section) || !requestedTitle)) {
    return NextResponse.json({ error: "Bagian SPO atau judul dokumen tidak valid." }, { status: 400 });
  }
  if (rawText.length > maxTextLength || requestedTitle.length > 255 || currentContent.length > maxTextLength) {
    return NextResponse.json({ error: "Input melebihi batas panjang yang diizinkan." }, { status: 413 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY belum dikonfigurasi pada environment server." },
      { status: 500 }
    );
  }

  try {
    const schema = `{
  "no_sop": "",
  "tanggal_pembuatan": "",
  "tanggal_pengesahan": "",
  "revisi": "",
  "judul_sop": "",
  "disahkan_oleh": "",
  "pejabat_pengesah": "",
  "nip_pengesah": "",
  "pengertian": "",
  "tujuan": "",
  "kebijakan": "",
  "unit_terkait": "",
  "dokumen_terkait": "",
  "prosedur": [{"tahap": "A. Tahap Pra Interaksi", "langkah": ["1. ..."]}]
}`;
    const sectionNames = {
      pengertian: "Pengertian",
      tujuan: "Tujuan",
      kebijakan: "Kebijakan",
      unit_terkait: "Unit Kerja Terkait",
      dokumen_terkait: "Dokumen Terkait",
      prosedur: "Uraian Tugas / Prosedur",
    };
    const sectionSchema = section === "prosedur"
      ? `{"prosedur":[{"tahap":"A. Nama Tahap","langkah":["1. Langkah kerja"]}]}`
      : `{"value":"Isi saran untuk ${sectionNames[section] || "bagian SPO"}"}`;
    const systemPrompt = action === "assist-section"
      ? `Anda adalah asisten penyusunan draft SPO berbahasa Indonesia. Susun hanya satu bagian SPO yang diminta dan kembalikan JSON valid sesuai skema:\n${sectionSchema}\n\nGunakan judul, konteks, dan isi SPO lain sebagai acuan. Tulis jelas, ringkas, profesional, dan dapat ditinjau. Jangan mengarang kebijakan resmi, nomor/rujukan peraturan, nama formulir, atau nama unit tertentu yang tidak diberikan. Untuk saran unit atau dokumen, beri label "Saran AI (perlu validasi): " dan tuliskan kategori umum, bukan seolah nama resmi yang berlaku. Untuk kebijakan, jangan mengklaim aturan spesifik yang tidak ada pada konteks; beri penanda validasi bila perlu. Untuk isi klinis, jangan mengarang dosis atau tindakan berisiko; gunakan arahan umum dan tandai perlu validasi tenaga berwenang. Untuk prosedur, buat beberapa tahap yang runtut dan langkah operasional bernomor, tanpa klaim klinis spesifik yang tidak diberikan. Balas hanya JSON tanpa markdown.`
      : action === "generate"
        ? `Anda adalah asisten penyusun rancangan SPO rumah sakit dalam Bahasa Indonesia. Buat rancangan yang jelas, aman, terukur, dan dapat ditinjau oleh tenaga kesehatan dari topik dan konteks yang diberikan. Kembalikan hanya JSON valid dengan struktur persis berikut:\n${schema}\n\nPertahankan judul yang diberikan. Susun prosedur berurutan dalam tahap berhuruf (A., B., C.) dan langkah bernomor. Jangan mengarang nomor dokumen, tanggal, jabatan, nama pejabat, NIP, nomor kebijakan, atau dasar hukum; biarkan kosong jika tidak diberikan. Isi unit_terkait dan dokumen_terkait dari konteks. Jika tidak disebut, beri saran umum yang relevan dengan topik/prosedur dan awali "Saran AI (perlu validasi): "; jangan mengklaim sebagai unit atau dokumen resmi yang berlaku. Tandai informasi klinis yang perlu validasi sebagai instruksi umum untuk ditetapkan tim berwenang. Bila informasi konteks terbatas, buat draft kerangka yang wajar dan tidak menambahkan tindakan klinis berisiko atau dosis.`
        : `Anda adalah asisten ekstraksi dokumen SPO rumah sakit. Petakan isi teks sumber secara akurat ke satu objek JSON valid dengan struktur persis:\n${schema}\n\nPertahankan informasi dan urutan prosedur dari sumber. Kelompokkan langkah berdasarkan tahap jika ada. Baca seluruh isi tabel dan teks, termasuk sel yang berisi banyak baris. Teks tabel mungkin ditulis sebagai beberapa sel yang dipisahkan tanda |, tab, atau baris baru: jika satu sel berisi label dan sel berikutnya berisi nilainya, gabungkan nilai sel berikutnya ke field yang sesuai. Untuk unit_terkait, wajib telusuri dan salin isi setelah label UNIT TERKAIT, UNIT KERJA, UNIT/UNIT PELAKSANA, PELAKSANA, PETUGAS, dan INSTALASI; label dapat berada di kolom pertama tabel dan nilainya di kolom sebelahnya. Untuk dokumen_terkait, wajib telusuri dan salin isi setelah label DOKUMEN TERKAIT, DOKUMEN PENDUKUNG, REFERENSI, FORMULIR, REKAMAN, dan CATATAN. Jangan mengosongkan atau mengganti nilai yang ada pada sumber dengan saran. Pertahankan daftar nilai sebagaimana tertulis, termasuk lebih dari satu unit atau dokumen. Saran bertanda "Saran AI (perlu validasi): " hanya boleh digunakan bila tidak ditemukan nilai maupun label beserta isinya di seluruh sumber; jangan membuat saran jika isi sumber tersedia. Jangan menambahkan nama unit, dokumen resmi, peraturan, atau formulir spesifik seolah-olah berlaku bila sumber tidak membuktikannya. Tanggal gunakan format YYYY-MM-DD bila dapat dipastikan, selain itu pertahankan teks aslinya. Petakan blok pengesahan dengan teliti: jabatan yang mengesahkan ke "disahkan_oleh", nama orang yang menandatangani ke "pejabat_pengesah", dan nomor induk yang tertera ke "nip_pengesah". Cari identitas penandatangan yang berada di sel persetujuan, termasuk teks setelah baris kosong atau label Disahkan Oleh/Disetujui Oleh. Bila nama, jabatan, dan nomor induk tidak dapat dipastikan, biarkan kosong; jangan memindahkannya ke uraian prosedur. Balas hanya JSON, tanpa markdown.`;
    const userPrompt = action === "assist-section"
      ? `Judul SPO: ${requestedTitle}\nBagian yang diminta: ${sectionNames[section]}\n\nKonteks/arahan pengguna:\n${rawText || "(Belum ada arahan tambahan)"}\n\nIsi bagian saat ini (boleh diperbaiki atau dikembangkan):\n${currentContent || "(Masih kosong)"}`
      : action === "generate"
        ? `Buat draft SPO dengan judul berikut: ${requestedTitle}\n\nKonteks, tujuan, dan arahan pengguna:\n${rawText || "(Tidak ada konteks tambahan)"}\n\nGunakan judul tersebut persis dan buat bagian pengertian, tujuan, kebijakan, unit terkait, dokumen terkait, serta uraian prosedur terstruktur.`
        : rawText;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.1,
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const statusMessages = {
        401: "API key Groq tidak valid atau sudah dicabut.",
        403: "API key Groq tidak memiliki akses ke layanan atau model yang diminta.",
        400: "Groq menolak permintaan ekstraksi. Periksa model dan format permintaan.",
        404: "Model Groq tidak ditemukan atau tidak lagi tersedia.",
        413: "Dokumen terlalu besar untuk diproses Groq.",
        429: "Batas permintaan Groq tercapai. Silakan coba kembali nanti.",
      };
      const message = statusMessages[response.status]
        || `Layanan Groq gagal memproses dokumen (HTTP ${response.status}).`;
      console.error("SPO Generator Groq request failed:", response.status);
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Respons Groq tidak berisi hasil ekstraksi.");
    }

    const extracted = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (action === "assist-section") {
      if (section === "prosedur") {
        const prosedur = Array.isArray(extracted.prosedur)
          ? extracted.prosedur.map((stage) => ({
              tahap: typeof stage?.tahap === "string" ? stage.tahap : "",
              langkah: Array.isArray(stage?.langkah)
                ? stage.langkah.filter((step) => typeof step === "string")
                : [],
            })).filter((stage) => stage.tahap || stage.langkah.length)
          : [];
        if (!prosedur.length) throw new Error("Respons AI tidak berisi uraian prosedur.");
        return NextResponse.json({ success: true, section, value: prosedur });
      }
      const value = typeof extracted.value === "string" ? extracted.value.trim() : "";
      if (!value) throw new Error("Respons AI tidak berisi saran bagian SPO.");
      return NextResponse.json({ success: true, section, value });
    }
    const data = {
      no_sop: typeof extracted.no_sop === "string" ? extracted.no_sop : "",
      tanggal_pembuatan: typeof extracted.tanggal_pembuatan === "string" ? extracted.tanggal_pembuatan : "",
      tanggal_pengesahan: typeof extracted.tanggal_pengesahan === "string" ? extracted.tanggal_pengesahan : "",
      revisi: typeof extracted.revisi === "string" ? extracted.revisi : "Ke -",
      judul_sop: typeof extracted.judul_sop === "string" ? extracted.judul_sop : "",
      disahkan_oleh: typeof extracted.disahkan_oleh === "string" ? extracted.disahkan_oleh : "",
      pejabat_pengesah: typeof extracted.pejabat_pengesah === "string" ? extracted.pejabat_pengesah : "",
      nip_pengesah: typeof extracted.nip_pengesah === "string" ? extracted.nip_pengesah : "",
      pengertian: typeof extracted.pengertian === "string" ? extracted.pengertian : "",
      tujuan: typeof extracted.tujuan === "string" ? extracted.tujuan : "",
      kebijakan: typeof extracted.kebijakan === "string" ? extracted.kebijakan : "",
      unit_terkait: typeof extracted.unit_terkait === "string" ? extracted.unit_terkait : "",
      dokumen_terkait: typeof extracted.dokumen_terkait === "string" ? extracted.dokumen_terkait : "",
      prosedur: Array.isArray(extracted.prosedur)
        ? extracted.prosedur.map((stage) => ({
            tahap: typeof stage?.tahap === "string" ? stage.tahap : "",
            langkah: Array.isArray(stage?.langkah)
              ? stage.langkah.filter((step) => typeof step === "string")
              : [],
          }))
        : [],
    };
    const sourceUnit = findLabeledSourceValue(rawText, [
      "UNIT TERKAIT", "UNIT KERJA", "UNIT PELAKSANA", "PELAKSANA", "PETUGAS", "INSTALASI",
    ]);
    const sourceDocuments = findLabeledSourceValue(rawText, [
      "DOKUMEN TERKAIT", "DOKUMEN PENDUKUNG", "REFERENSI", "FORMULIR", "REKAMAN", "CATATAN",
    ]);
    if (sourceUnit) data.unit_terkait = sourceUnit;
    if (sourceDocuments) data.dokumen_terkait = sourceDocuments;
    let documentId;
    try {
      const saved = await saveGeneratedSop({
        ruangan,
        sourceType: action,
        data,
        klinik: body?.klinik,
      });
      documentId = saved.id;
      Object.assign(data, saved.data);
    } catch (storageError) {
      console.error("SPO Generator automatic save failed:", storageError);
      return NextResponse.json(
        { error: "Draft berhasil diproses AI, tetapi gagal disimpan ke arsip Turso. Coba kembali." },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, data, documentId });
  } catch (error) {
    console.error("SPO Generator extraction failed:", error);
    return NextResponse.json(
      {
        error: action === "assist-section"
          ? "Saran AI untuk bagian SPO tidak dapat diproses. Silakan coba kembali."
          : "Hasil ekstraksi tidak dapat diproses. Silakan coba kembali.",
      },
      { status: 502 }
    );
  }
}
