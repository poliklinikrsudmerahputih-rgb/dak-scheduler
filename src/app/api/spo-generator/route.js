import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSopRuangan } from "@/lib/sop";
import { saveGeneratedSop } from "@/lib/spo-generator-storage";

export const dynamic = "force-dynamic";

const logoUrl = "https://i.ibb.co.com/0RMzZ5hS/Logo-Kabupaten-Magelang.png";
const maxTextLength = 100_000;

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

  const action = body?.action === "generate" ? "generate" : "extract";
  const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
  const requestedTitle = typeof body?.judul_sop === "string" ? body.judul_sop.trim() : "";
  if (action === "extract" && !rawText) {
    return NextResponse.json({ error: "Teks SPO wajib diisi." }, { status: 400 });
  }
  if (action === "generate" && !requestedTitle) {
    return NextResponse.json({ error: "Judul SPO wajib diisi sebelum membuat draft." }, { status: 400 });
  }
  if (rawText.length > maxTextLength || requestedTitle.length > 255) {
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
    const systemPrompt = action === "generate"
      ? `Anda adalah asisten penyusun rancangan SPO rumah sakit dalam Bahasa Indonesia. Buat rancangan yang jelas, aman, terukur, dan dapat ditinjau oleh tenaga kesehatan dari topik dan konteks yang diberikan. Kembalikan hanya JSON valid dengan struktur persis berikut:\n${schema}\n\nPertahankan judul yang diberikan. Susun prosedur berurutan dalam tahap berhuruf (A., B., C.) dan langkah bernomor. Jangan mengarang nomor dokumen, tanggal, jabatan, nama pejabat, NIP, nomor kebijakan, atau dasar hukum; biarkan kosong jika tidak diberikan. Isi unit_terkait dan dokumen_terkait dari konteks. Jika tidak disebut, beri saran umum yang relevan dengan topik/prosedur dan awali "Saran AI (perlu validasi): "; jangan mengklaim sebagai unit atau dokumen resmi yang berlaku. Tandai informasi klinis yang perlu validasi sebagai instruksi umum untuk ditetapkan tim berwenang. Bila informasi konteks terbatas, buat draft kerangka yang wajar dan tidak menambahkan tindakan klinis berisiko atau dosis.`
      : `Anda adalah asisten ekstraksi dokumen SPO rumah sakit. Petakan isi teks sumber secara akurat ke satu objek JSON valid dengan struktur persis:\n${schema}\n\nPertahankan informasi dan urutan prosedur dari sumber. Kelompokkan langkah berdasarkan tahap jika ada. Baca seluruh isi tabel dan teks, termasuk sel yang berisi banyak baris. Untuk unit_terkait, cari juga label UNIT TERKAIT, UNIT KERJA, PELAKSANA, PETUGAS, dan INSTALASI. Untuk dokumen_terkait, cari juga label DOKUMEN TERKAIT, REFERENSI, FORMULIR, REKAMAN, dan DOKUMEN PENDUKUNG. Jika informasi ditemukan di sumber, pindahkan lengkap ke field terkait walau label lama berbeda. Bila suatu bagian tidak ada atau kosong, buat saran yang masuk akal hanya berdasarkan tugas/prosedur yang dijelaskan, awali nilainya dengan "Saran AI (perlu validasi): " dan jangan menyatakannya sebagai kebijakan resmi. Jangan menambahkan nama unit, dokumen resmi, peraturan, atau formulir yang spesifik seolah-olah sudah berlaku bila sumber tidak membuktikannya. Jangan menghilangkan isi yang tersedia dengan mengganti menggunakan saran. Tanggal gunakan format YYYY-MM-DD bila dapat dipastikan, selain itu pertahankan teks aslinya. Petakan blok pengesahan dengan teliti: jabatan yang mengesahkan ke "disahkan_oleh", nama orang yang menandatangani ke "pejabat_pengesah", dan nomor induk yang tertera ke "nip_pengesah". Cari identitas penandatangan yang berada di sel persetujuan, termasuk teks setelah baris kosong atau label Disahkan Oleh/Disetujui Oleh. Bila nama, jabatan, dan nomor induk tidak dapat dipastikan, biarkan kosong; jangan memindahkannya ke uraian prosedur. Balas hanya JSON, tanpa markdown.`;
    const userPrompt = action === "generate"
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
    let documentId;
    try {
      documentId = await saveGeneratedSop({ ruangan, sourceType: action, data });
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
      { error: "Hasil ekstraksi tidak dapat diproses. Silakan coba kembali." },
      { status: 502 }
    );
  }
}
