import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";
import { saveAs } from "file-saver";

const numberFormat = new Intl.NumberFormat("id-ID");
const documentFont = "Arial";
const pageWidth = 16838;
const contentWidth = 15398;
const columnWidths = [500, 3000, 900, 1000, 1000, 1900, 7098];

function paragraph(text, options = {}) {
  return new Paragraph({
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: { before: options.before || 0, after: options.after ?? 80, line: 240 },
    ...(options.border ? { border: options.border } : {}),
    children: [
      new TextRun({
        text,
        bold: Boolean(options.bold),
        size: options.size || 18,
        font: documentFont
      })
    ]
  });
}

function tableCell(text, width, options = {}) {
  const cellParagraphs = Array.isArray(text)
    ? text
    : [paragraph(String(text ?? ""), {
        alignment: options.alignment || AlignmentType.CENTER,
        bold: options.bold,
        size: options.size || 16,
        after: 0
      })];
  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 65, right: 65 },
    verticalAlign: VerticalAlign.CENTER,
    ...(options.shading ? { shading: { type: ShadingType.CLEAR, fill: options.shading } } : {}),
    borders: { top: border, bottom: border, left: border, right: border },
    children: cellParagraphs
  });
}

function formatRatio(indicator) {
  if (indicator.capaian === null || indicator.capaian === undefined || !Number.isFinite(Number(indicator.capaian))) {
    return "—";
  }
  return `${Number(indicator.capaian).toFixed(2)}%`;
}

function formatTarget(target) {
  const value = Number(target);
  if (!Number.isFinite(value)) throw new Error("Target indikator INM tidak valid.");
  return value >= 100 ? `${numberFormat.format(value)}%` : `≥ ${numberFormat.format(value)}%`;
}

function safeFilename(value) {
  const filename = String(value || "periode")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return filename || "periode";
}

export async function generateWordINM(dataLaporan, rentangWaktu) {
  const indicators = Array.isArray(dataLaporan)
    ? dataLaporan
    : dataLaporan?.indikatorMutu;
  if (!Array.isArray(indicators)) {
    throw new Error("Data indikator INM belum tersedia untuk diunduh.");
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      tableCell("NO", columnWidths[0], { bold: true, shading: "D9E2F3" }),
      tableCell("INDIKATOR", columnWidths[1], { bold: true, shading: "D9E2F3" }),
      tableCell("TARGET", columnWidths[2], { bold: true, shading: "D9E2F3" }),
      tableCell("NUMERATOR", columnWidths[3], { bold: true, shading: "D9E2F3" }),
      tableCell("DENOMINATOR", columnWidths[4], { bold: true, shading: "D9E2F3" }),
      tableCell("NUMERATOR / DENOMINATOR", columnWidths[5], { bold: true, shading: "D9E2F3" }),
      tableCell("ANALISIS", columnWidths[6], { bold: true, shading: "D9E2F3" })
    ]
  });

  const indicatorRows = indicators.map((indicator, index) => {
    const numerator = Number(indicator.numerator);
    const denominator = Number(indicator.denominator);
    const target = Number(indicator.target);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !Number.isFinite(target)) {
      throw new Error(`Data numerator, denominator, atau target indikator nomor ${index + 1} tidak valid.`);
    }
    const capaian = indicator.capaian === null || indicator.capaian === undefined
      ? null
      : Number(indicator.capaian);
    const tercapai = capaian !== null && Number.isFinite(capaian) && capaian >= target;
    const analysis = capaian === null || !Number.isFinite(capaian)
      ? [paragraph("Belum ada sampling.", { size: 16, after: 0 })]
      : tercapai
        ? [paragraph("Sesuai target, pertahankan hasil capaian.", { size: 16, after: 0 })]
      : [
          paragraph("Kurang dari target, analisis:", { size: 16, after: 80 }),
          paragraph(" ", { size: 16, after: 220 }),
          paragraph(" ", { size: 16, after: 220 }),
          paragraph(" ", { size: 16, after: 220 })
        ];

    return new TableRow({
      children: [
        tableCell(String(index + 1), columnWidths[0]),
        tableCell(String(indicator.nama || indicator.label || "Indikator INM"), columnWidths[1], { alignment: AlignmentType.LEFT }),
        tableCell(formatTarget(target), columnWidths[2]),
        tableCell(numberFormat.format(numerator), columnWidths[3]),
        tableCell(numberFormat.format(denominator), columnWidths[4]),
        tableCell(formatRatio({ ...indicator, capaian }), columnWidths[5]),
        tableCell(analysis, columnWidths[6], { alignment: AlignmentType.LEFT })
      ]
    });
  });

  const signatureBorders = {
    top: { style: BorderStyle.SINGLE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.SINGLE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.SINGLE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.SINGLE, size: 0, color: "FFFFFF" }
  };
  const signatureCell = (children) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: signatureBorders,
    children
  });

  const signatureTable = new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: [contentWidth / 2, contentWidth / 2],
    rows: [
      new TableRow({
        children: [
          signatureCell([
            paragraph("Mengetahui", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph("Kepala Instalasi Rawat Jalan", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph("drg. Betagia Swandhika Wisesa, Sp. KG", { alignment: AlignmentType.CENTER, bold: true, after: 0 }),
            paragraph("NIP. 19891227 201903 1 006", { alignment: AlignmentType.CENTER, after: 0 })
          ]),
          signatureCell([
            paragraph("PIC", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph(" ", { alignment: AlignmentType.CENTER, after: 0 }),
            paragraph("Anggraeni Eka Pratura, A.Md.KG", { alignment: AlignmentType.CENTER, bold: true, after: 0 }),
            paragraph("NIP. 199610082020122004", { alignment: AlignmentType.CENTER, after: 0 })
          ])
        ]
      })
    ]
  });

  const borderLine = {
    style: BorderStyle.SINGLE,
    size: 18,
    color: "000000",
    space: 1
  };
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: documentFont, size: 18 },
          paragraph: { spacing: { line: 240 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: pageWidth, height: 11906, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: [
        paragraph("PEMERINTAH KABUPATEN MAGELANG", { alignment: AlignmentType.CENTER, bold: true, size: 20, after: 20 }),
        paragraph("RUMAH SAKIT UMUM DAERAH MERAH PUTIH", { alignment: AlignmentType.CENTER, bold: true, size: 28, after: 20 }),
        paragraph("Jl. Raya Magelang - Yogyakarta KM.5, Mungkidan, Danurejo, Mertoyudan, Magelang", { alignment: AlignmentType.CENTER, size: 16, after: 10 }),
        paragraph("Telp. (0293) 3202654, 3202284, IGD-3276000 | Kode Pos: 56172 | Email: rsdmerahputihkabmgl@gmail.com", {
          alignment: AlignmentType.CENTER,
          size: 15,
          after: 180,
          border: { bottom: borderLine }
        }),
        paragraph("CAPAIAN INM", { alignment: AlignmentType.CENTER, bold: true, size: 24, before: 220, after: 20 }),
        paragraph("RSUD MERAH PUTIH KABUPATEN MAGELANG", { alignment: AlignmentType.CENTER, bold: true, size: 20, after: 260 }),
        paragraph("Unit Kerja   : Instalasi Rawat Jalan", { size: 18, after: 40 }),
        paragraph(`Bulan        : ${String(rentangWaktu || "").trim() || "—"}`, { size: 18, after: 200 }),
        new Table({
          width: { size: contentWidth, type: WidthType.DXA },
          columnWidths,
          rows: [headerRow, ...indicatorRows]
        }),
        paragraph(" ", { after: 240 }),
        signatureTable
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Laporan-INM-${safeFilename(rentangWaktu)}.docx`);
}
