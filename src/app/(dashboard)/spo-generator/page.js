"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import mammoth from "mammoth/mammoth.browser";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlertCircle,
  Bold,
  ClipboardPaste,
  Copy,
  Download,
  FileText,
  Hash,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Loader2,
  Pencil,
  Plus,
  Redo2,
  Ruler,
  Save,
  Scissors,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  List,
  ListOrdered,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { daftarKlinikArsipSop } from "@/lib/sop-constants";

const emptySop = {
  no_sop: "",
  tanggal_pembuatan: "",
  tanggal_pengesahan: "",
  revisi: "Ke -",
  judul_sop: "",
  disahkan_oleh: "",
  pejabat_pengesah: "",
  nip_pengesah: "",
  pengertian: "",
  tujuan: "",
  kebijakan: "",
  unit_terkait: "",
  dokumen_terkait: "",
  prosedur: [],
};

function getSessionRuangan() {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split("; ").find((item) => item.startsWith("session_dak_pro="));
  if (!cookie) return "";
  try {
    const session = JSON.parse(decodeURIComponent(cookie.slice("session_dak_pro=".length)));
    return String(session?.ruangan || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

const border = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const pageWidth = 10206;

function cleanStepNumber(value) {
  return String(value || "").replace(/^\s*\d+[.)]\s*/, "");
}

function stageLetter(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function configureListElement(list, listTag, orderedType = "1") {
  list.style.margin = "0 0 5px 28px";
  list.style.paddingLeft = "18px";
  list.style.listStylePosition = "outside";
  list.style.listStyleType = listTag === "ol"
    ? ({ a: "lower-alpha", A: "upper-alpha", i: "lower-roman", I: "upper-roman" }[orderedType] || "decimal")
    : "disc";
  if (listTag === "ol") list.setAttribute("type", orderedType);
  [...list.children].forEach((item) => {
    if (item.nodeName === "LI") item.style.display = "list-item";
  });
}

function toDateInputValue(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function sanitizeEditorHtml(html) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const allowedTags = new Set([
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col",
    "p", "h1", "h2", "h3", "blockquote", "ol", "ul", "li", "div", "span",
    "strong", "b", "em", "i", "u", "s", "strike", "del", "br",
  ]);
  const allowedStyles = new Set([
    "width", "height", "margin", "margin-top", "margin-right", "margin-bottom",
    "margin-left", "padding", "padding-top", "padding-right", "padding-bottom",
    "padding-left", "border", "border-top", "border-right", "border-bottom",
    "border-left", "border-collapse", "table-layout", "vertical-align", "text-align",
    "text-transform", "font-family", "font-size", "font-weight", "font-style",
    "text-decoration", "line-height", "color", "background-color", "background-image", "list-style-type",
    "background-repeat", "background-position", "background-size", "list-style-position", "text-indent",
  ]);
  const safeValue = (value) => !/(url\s*\(|expression|javascript:|<|>)/i.test(value);
  const sanitizeNode = (parent) => {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const element = node;
      const tag = element.tagName.toLowerCase();
      if (["script", "style", "iframe", "object", "embed", "svg", "math", "template"].includes(tag)) {
        element.remove();
        continue;
      }
      sanitizeNode(element);
      if (!allowedTags.has(tag)) {
        element.replaceWith(...element.childNodes);
        continue;
      }

      const originalStyle = element.style;
      const styles = [];
      for (const property of allowedStyles) {
        const value = originalStyle.getPropertyValue(property).trim();
        if (!value) continue;
        if (property === "background-image") {
          if (element.hasAttribute("data-hospital-logo") && value.includes("https://i.ibb.co.com/0RMzZ5hS/Logo-Kabupaten-Magelang.png")) {
            styles.push([property, "url('https://i.ibb.co.com/0RMzZ5hS/Logo-Kabupaten-Magelang.png')"]);
          }
        } else if (safeValue(value)) {
          styles.push([property, value]);
        }
      }
      const keptAttributes = [];
      if (element.hasAttribute("colspan") && /^\d{1,2}$/.test(element.getAttribute("colspan"))) {
        keptAttributes.push(["colspan", element.getAttribute("colspan")]);
      }
      if (element.hasAttribute("rowspan") && /^\d{1,2}$/.test(element.getAttribute("rowspan"))) {
        keptAttributes.push(["rowspan", element.getAttribute("rowspan")]);
      }
      for (const name of ["data-spo-document", "data-logo-cell", "data-hospital-logo", "data-stage-heading", "data-procedure-content"]) {
        if (element.hasAttribute(name)) keptAttributes.push([name, "true"]);
      }
      if (element.getAttribute("role") === "img") keptAttributes.push(["role", "img"]);
      if (element.hasAttribute("aria-label")) keptAttributes.push(["aria-label", element.getAttribute("aria-label").slice(0, 100)]);
      if (element.getAttribute("contenteditable") === "false" && element.hasAttribute("data-hospital-logo")) {
        keptAttributes.push(["contenteditable", "false"]);
      }
      if (["ol", "ul"].includes(tag)) {
        const type = element.getAttribute("type");
        if (["1", "a", "A", "i", "I"].includes(type)) keptAttributes.push(["type", type]);
        const start = element.getAttribute("start");
        if (/^\d{1,4}$/.test(start || "")) keptAttributes.push(["start", start]);
      }
      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
      keptAttributes.forEach(([name, value]) => element.setAttribute(name, value));
      element.removeAttribute("style");
      styles.forEach(([property, value]) => element.style.setProperty(property, value));
    }
  };
  sanitizeNode(parsed.body);
  return parsed.body.innerHTML;
}

function cssLengthToTwips(value) {
  const parsed = Number.parseFloat(value || "");
  if (!Number.isFinite(parsed)) return 0;
  if (value.endsWith("cm")) return Math.round(parsed * 567);
  if (value.endsWith("in")) return Math.round(parsed * 1440);
  if (value.endsWith("pt")) return Math.round(parsed * 20);
  return Math.round(parsed * 15);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function createPreviewHtml(sop) {
  const fields = [
    ["pengertian", "PENGERTIAN"],
    ["tujuan", "TUJUAN"],
    ["kebijakan", "KEBIJAKAN"],
    ["unit_terkait", "UNIT TERKAIT"],
    ["dokumen_terkait", "DOKUMEN TERKAIT"],
  ];
  const tableStyle = "width:100%;border-collapse:collapse;table-layout:fixed;font-family:'Times New Roman',serif;font-size:12pt;line-height:1;color:#000";
  const cellStyle = "border:1px solid #000;padding:4px 6px;vertical-align:top";
  const metadataRows = [
    ["No. SOP", sop.no_sop],
    ["Tanggal Pembuatan", sop.tanggal_pembuatan],
    ["Revisi", sop.revisi || "Ke -"],
    ["Tanggal Pengesahan", sop.tanggal_pengesahan],
  ].map(([label, value], index) => (
    `<tr>${index === 0 ? `<td rowspan="6" data-logo-cell="true" style="${cellStyle};text-align:center;vertical-align:middle"><div data-hospital-logo="true" contenteditable="false" role="img" aria-label="Logo Kabupaten Magelang" style="height:150px;width:116px;margin:0 auto 8px;background-image:url('https://i.ibb.co.com/0RMzZ5hS/Logo-Kabupaten-Magelang.png');background-repeat:no-repeat;background-position:center;background-size:contain"></div><div style="font-family:'Bookman Old Style',serif;font-size:12pt;line-height:1;text-align:center">RSUD MERAH PUTIH<br>KAB. MAGELANG</div></td>` : ""}<td style="${cellStyle};width:29%">${label}</td><td style="${cellStyle};width:45%">${textToHtml(value)}</td></tr>`
  ));
  const approvalRow = `<tr><td style="${cellStyle}">Disahkan Oleh</td><td style="${cellStyle};height:142px;text-align:center;vertical-align:top"><div>${textToHtml(sop.disahkan_oleh)}</div><div style="height:46px"></div><div><strong>${textToHtml(sop.pejabat_pengesah)}</strong></div><div>${textToHtml(sop.nip_pengesah)}</div></td></tr>`;
  const titleRow = `<tr><td style="${cellStyle}">Nama SOP</td><td style="${cellStyle};text-align:center;font-weight:bold;text-transform:uppercase">${textToHtml(sop.judul_sop)}</td></tr>`;
  const informationRows = fields.map(([key, label]) => (
    `<tr><td style="${cellStyle};text-transform:uppercase">${label}</td><td colspan="2" style="${cellStyle}">${textToHtml(["unit_terkait", "dokumen_terkait"].includes(key) ? String(sop[key] || "").trim() || "-" : sop[key])}</td></tr>`
  ));
  const procedure = sop.prosedur.map((stage) => (
    `<p data-stage-heading="true" style="margin:0 0 2px"><strong>${textToHtml(stage.tahap)}</strong></p><ol style="margin:0 0 5px 28px;padding-left:18px;list-style-position:outside;list-style-type:decimal">${stage.langkah.map((step) => `<li style="display:list-item;padding-left:2px">${textToHtml(cleanStepNumber(step))}</li>`).join("")}</ol>`
  )).join("");
  const rows = [
    ...metadataRows,
    approvalRow,
    titleRow,
    ...informationRows,
    `<tr><td colspan="3" style="${cellStyle};text-align:center;text-transform:uppercase;font-weight:bold">Uraian Prosedur</td></tr>`,
    `<tr><td colspan="3" data-procedure-content="true" style="${cellStyle};vertical-align:top">${procedure}</td></tr>`,
  ];
  return `<table data-spo-document="true" style="${tableStyle}"><colgroup><col style="width:26%"><col style="width:29%"><col style="width:45%"></colgroup><tbody>${rows.join("")}</tbody></table>`;
}

function inlineWordRuns(node, inheritedStyle = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent
      ? [new TextRun({
          text: inheritedStyle.uppercase ? node.textContent.toLocaleUpperCase("id-ID") : node.textContent,
          bold: inheritedStyle.bold,
          italics: inheritedStyle.italic,
          underline: inheritedStyle.underline ? {} : undefined,
          strike: inheritedStyle.strike,
          shading: inheritedStyle.highlight
            ? { fill: inheritedStyle.highlight, color: "auto", type: "clear" }
            : undefined,
          font: inheritedStyle.font || "Times New Roman",
          size: inheritedStyle.size ? Math.round(inheritedStyle.size * 2) : 24,
          color: inheritedStyle.color,
        })]
      : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  if (node.nodeName === "BR") return [new TextRun({ break: 1 })];
  const element = node;
  const style = { ...inheritedStyle };
  const tag = element.nodeName.toLowerCase();
  if (tag === "strong" || tag === "b") style.bold = true;
  if (tag === "h1") { style.bold = true; style.size = 20; }
  if (tag === "h2") { style.bold = true; style.size = 16; }
  if (tag === "h3") { style.bold = true; style.size = 14; }
  if (tag === "em" || tag === "i") style.italic = true;
  if (tag === "u") style.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") style.strike = true;
  if (Number.parseInt(element.style.fontWeight, 10) >= 600) style.bold = true;
  if (element.style.fontStyle === "italic") style.italic = true;
  if (element.style.textDecoration.includes("underline")) style.underline = true;
  if (element.style.textDecoration.includes("line-through")) style.strike = true;
  if (element.style.textTransform === "uppercase") style.uppercase = true;
  if (element.style.fontFamily) style.font = element.style.fontFamily.replaceAll('"', "").split(",")[0].trim();
  if (element.getAttribute("face")) style.font = element.getAttribute("face");
  if (element.style.fontSize) {
    const size = Number.parseFloat(element.style.fontSize);
    if (Number.isFinite(size)) style.size = element.style.fontSize.endsWith("px") ? size * 0.75 : size;
  }
  if (element.style.color) {
    const rgb = element.style.color.match(/(?:rgb\()?\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    if (rgb) style.color = rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase();
    else if (/^#[0-9a-f]{6}$/i.test(element.style.color)) style.color = element.style.color.slice(1).toUpperCase();
  } else if (/^#[0-9a-f]{6}$/i.test(element.getAttribute("color") || "")) {
    style.color = element.getAttribute("color").slice(1).toUpperCase();
  }
  if (element.style.backgroundColor) {
    const highlight = element.style.backgroundColor.match(/(?:rgb\()?\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    if (highlight) style.highlight = highlight.slice(1, 4)
      .map((part) => Number(part).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    else if (/^#[0-9a-f]{6}$/i.test(element.style.backgroundColor)) {
      style.highlight = element.style.backgroundColor.slice(1).toUpperCase();
    }
  }
  if (!style.size && element.getAttribute("size")) {
    const legacySize = Number(element.getAttribute("size"));
    if (Number.isFinite(legacySize)) style.size = [0, 8, 10, 12, 14, 18, 24, 36][legacySize] || 12;
  }
  return [...element.childNodes].flatMap((child) => inlineWordRuns(child, style));
}

function wordParagraphFromElement(element, prefix = "", listIndent = 360) {
  const runs = prefix
    ? [new TextRun({ text: prefix, font: "Bookman Old Style", size: 24 })]
    : [];
  runs.push(...inlineWordRuns(element));
  const blockElement = element.nodeType === Node.ELEMENT_NODE ? element : element.parentElement;
  const alignment = blockElement?.style?.textAlign === "center"
    ? AlignmentType.CENTER
    : blockElement?.style?.textAlign === "right"
      ? AlignmentType.RIGHT
      : blockElement?.style?.textAlign === "justify"
        ? AlignmentType.JUSTIFIED
        : AlignmentType.LEFT;
  const leftIndent = cssLengthToTwips(blockElement?.style?.marginLeft || "")
    || (blockElement?.nodeName === "BLOCKQUOTE" ? 360 : 0);
  const firstLineIndent = cssLengthToTwips(blockElement?.style?.textIndent || "");
  return new Paragraph({
    children: runs.length ? runs : [new TextRun({ text: "" })],
    alignment,
    spacing: {
      line: Math.round(240 * (Number.parseFloat(blockElement?.style?.lineHeight) || 1)),
      before: cssLengthToTwips(blockElement?.style?.height || blockElement?.style?.marginTop || ""),
      after: cssLengthToTwips(blockElement?.style?.marginBottom || ""),
    },
    indent: prefix
      ? { left: listIndent + 180, hanging: 180 }
      : leftIndent || firstLineIndent
        ? { left: leftIndent, firstLine: firstLineIndent }
        : undefined,
  });
}

function wordParagraphsFromCell(cell) {
  const paragraphs = [];
  const romanize = (value) => {
    const numerals = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let number = value;
    return numerals.reduce((result, [amount, numeral]) => {
      while (number >= amount) {
        result += numeral;
        number -= amount;
      }
      return result;
    }, "");
  };
  const listPrefix = (list, number) => {
    const type = list.style.listStyleType || ({ a: "lower-alpha", A: "upper-alpha", i: "lower-roman", I: "upper-roman", "1": "decimal" }[list.getAttribute("type")]) || (list.nodeName === "OL" ? "decimal" : "disc");
    if (type === "circle") return "○ ";
    if (type === "square") return "▪ ";
    if (type !== "decimal" && type !== "decimal-leading-zero" && list.nodeName === "UL") return "• ";
    if (type === "lower-alpha" || type === "upper-alpha") {
      const letter = String.fromCharCode(97 + ((number - 1) % 26));
      return `${type === "upper-alpha" ? letter.toUpperCase() : letter}. `;
    }
    if (type === "lower-roman" || type === "upper-roman") {
      const numeral = romanize(number);
      return `${type === "upper-roman" ? numeral : numeral.toLowerCase()}. `;
    }
    return `${number}. `;
  };
  const processList = (list, depth = 0) => {
    let number = Number(list.getAttribute("start") || 1);
    for (const item of [...list.children].filter((element) => element.nodeName.toLowerCase() === "li")) {
      const listIndent = cssLengthToTwips(list.style.marginLeft || "28px") + depth * 360;
      const nestedLists = [...item.children].filter((element) => ["ol", "ul"].includes(element.nodeName.toLowerCase()));
      const content = document.createElement("div");
      content.style.cssText = `${item.style.cssText};margin-left:${(depth + 1) * 24}px`;
      [...item.childNodes].filter((node) => !nestedLists.includes(node)).forEach((node) => content.append(node.cloneNode(true)));
      const textBlocks = [...content.children].filter((element) => ["p", "div", "h1", "h2", "h3", "blockquote"].includes(element.nodeName.toLowerCase()));
      if (textBlocks.length) {
        textBlocks.forEach((block, index) => {
          block.style.marginLeft = `${(depth + 1) * 24}px`;
          paragraphs.push(wordParagraphFromElement(
            block,
            index === 0 ? listPrefix(list, number) : "",
            listIndent
          ));
        });
      } else {
        paragraphs.push(wordParagraphFromElement(content, listPrefix(list, number), listIndent));
      }
      nestedLists.forEach((nestedList) => processList(nestedList, depth + 1));
      number += 1;
    }
  };
  const process = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent.trim()) paragraphs.push(wordParagraphFromElement(child));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.nodeName.toLowerCase();
      if (tag === "ol" || tag === "ul") {
        processList(child);
      } else if (["p", "div", "h1", "h2", "h3", "blockquote"].includes(tag)) {
        paragraphs.push(wordParagraphFromElement(child));
      } else if (tag === "br") {
        paragraphs.push(new Paragraph({ text: "" }));
      } else if (!child.matches("[data-hospital-logo]")) {
        process(child);
      }
    }
  };
  process(cell);
  return paragraphs.length ? paragraphs : [wordParagraphFromElement(cell)];
}

function makeWordCellFromElement(cell, logoData, width) {
  const children = cell.hasAttribute("data-logo-cell") || cell.querySelector("[data-hospital-logo]")
    ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: logoData, transformation: { width: 116, height: 150 } })],
        }),
        ...wordParagraphsFromCell(cell),
      ]
    : wordParagraphsFromCell(cell);
  const verticalAlign = cell.style.verticalAlign;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    borders: cellBorders,
    verticalAlign: verticalAlign === "top" || verticalAlign === "bottom" ? verticalAlign : "center",
    columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
    rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
    children,
  });
}

async function downloadSopWord(editor) {
  const htmlTable = editor?.querySelector("[data-spo-document]");
  if (!htmlTable) throw new Error("Preview SPO tidak ditemukan untuk diunduh.");
  const logoResponse = await fetch("/api/spo-generator", { cache: "no-store" });
  if (!logoResponse.ok) {
    const result = await logoResponse.json().catch(() => ({}));
    throw new Error(result.error || "Logo kabupaten gagal diambil.");
  }
  const logoData = new Uint8Array(await logoResponse.arrayBuffer());
  const columnWidths = [2654, 2959, pageWidth - 5613];
  const occupiedColumns = [0, 0, 0];
  const rows = [...htmlTable.rows].map((row, rowIndex) => {
    let columnIndex = 0;
    const cells = [...row.cells].map((cell) => {
      while (occupiedColumns[columnIndex] > rowIndex) columnIndex += 1;
      const span = Math.max(1, cell.colSpan || 1);
      const width = columnWidths.slice(columnIndex, columnIndex + span).reduce((sum, part) => sum + part, 0) || pageWidth;
      if (cell.rowSpan > 1) {
        for (let column = columnIndex; column < columnIndex + span; column += 1) {
          occupiedColumns[column] = rowIndex + cell.rowSpan;
        }
      }
      columnIndex += span;
      return makeWordCellFromElement(cell, logoData, width);
    });
    return new TableRow({ cantSplit: false, children: cells });
  });
  const titleRow = [...htmlTable.rows].find((row) => (
    row.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "nama sop"
  ));
  const documentTitle = titleRow?.cells[1]?.textContent?.trim() || "SPO";

  const children = [new Table({
    width: { size: pageWidth, type: WidthType.DXA },
    columnWidths,
    rows,
  })];

  const document = new Document({
    title: documentTitle,
    subject: "Standar Prosedur Operasional",
    creator: "SPO Generator AI",
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, bottom: 720, left: 850, right: 850, footer: 360 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT], font: "Bookman Old Style", size: 20 })],
            }),
          ],
        }),
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(document);
  const safeName = documentTitle.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 150);
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = window.document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `${safeName || "SPO"}.docx`;
  downloadLink.style.display = "none";
  window.document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function EditorToolButton({ label, children, onClick, onMouseDown }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
    >
      {children}
    </button>
  );
}

export default function SpoGeneratorPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const [rawText, setRawText] = useState("");
  const [uploadedSources, setUploadedSources] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [newSopTitle, setNewSopTitle] = useState("");
  const [newSopContext, setNewSopContext] = useState("");
  const [sop, setSop] = useState(emptySop);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fontFamily, setFontFamily] = useState("Times New Roman");
  const [fontSize, setFontSize] = useState("12");
  const [orderedListType, setOrderedListType] = useState("1");
  const [highlightColor, setHighlightColor] = useState("#FFFF00");
  const [rulerDrag, setRulerDrag] = useState("");
  const [rulerIndent, setRulerIndent] = useState({ left: 0, firstLine: 0 });
  const rulerRef = useRef(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [managementSops, setManagementSops] = useState([]);
  const [selectedManagementSopId, setSelectedManagementSopId] = useState("");
  const [selectedClinic, setSelectedClinic] = useState(daftarKlinikArsipSop[0]);
  const [newManagementSopTitle, setNewManagementSopTitle] = useState("");
  const [isLoadingManagementSops, setIsLoadingManagementSops] = useState(true);
  const [openSections, setOpenSections] = useState({
    create: false,
    extract: false,
    archive: false,
    numbering: false,
    registry: false,
    editor: false,
  });
  const [managementSearch, setManagementSearch] = useState("");
  const [editingManagementSop, setEditingManagementSop] = useState(null);
  const [managementForm, setManagementForm] = useState({
    no_sop: "",
    judul_prosedur: "",
    klinik: "",
    tanggal_pembuatan: "",
    tanggal_pengesahan: "",
    link_gdrive: "",
  });
  const [isSavingManagementSop, setIsSavingManagementSop] = useState(false);
  const [deletingManagementSopId, setDeletingManagementSopId] = useState(null);
  const [isNumbering, setIsNumbering] = useState(false);
  const [aiSection, setAiSection] = useState("pengertian");
  const [aiInstructions, setAiInstructions] = useState("");
  const aiInstructionsRef = useRef(null);
  const aiInstructionsSelectionRef = useRef({ start: 0, end: 0 });
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [dateValues, setDateValues] = useState({
    tanggal_pembuatan: toDateInputValue(emptySop.tanggal_pembuatan),
    tanggal_pengesahan: toDateInputValue(emptySop.tanggal_pengesahan),
  });
  const previewHtml = useMemo(() => createPreviewHtml(sop), [sop]);
  const [editorHtml, setEditorHtml] = useState(() => previewHtml);
  const historyRef = useRef({ undo: [], redo: [], lastRecorded: "", pending: false, timer: null });
  const toggleSection = (section) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const openSectionFromNavigation = (section) => {
    setOpenSections((current) => ({ ...current, [section]: true }));
  };

  const loadSavedDocuments = useCallback(async () => {
    setIsLoadingSaved(true);
    try {
      const response = await fetch("/api/spo-generator/saved", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal memuat arsip SPO.");
      setSavedDocuments(result.documents || []);
    } catch (loadError) {
      setError(loadError.message || "Gagal memuat arsip SPO.");
    } finally {
      setIsLoadingSaved(false);
    }
  }, [router]);

  const loadManagementSops = useCallback(async () => {
    setIsLoadingManagementSops(true);
    try {
      const response = await fetch("/api/sop", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal memuat nomor dari Manajemen SOP.");
      setManagementSops(Array.isArray(result) ? result : []);
    } catch (loadError) {
      setError(loadError.message || "Gagal memuat nomor dari Manajemen SOP.");
    } finally {
      setIsLoadingManagementSops(false);
    }
  }, [router]);

  const startEditingManagementSop = (item) => {
    setEditingManagementSop(item);
    setManagementForm({
      no_sop: item.no_sop || "",
      judul_prosedur: item.judul_prosedur || item.judul_sop || "",
      klinik: item.klinik || daftarKlinikArsipSop[0],
      tanggal_pembuatan: toDateInputValue(item.tanggal_pembuatan),
      tanggal_pengesahan: toDateInputValue(item.tanggal_pengesahan),
      link_gdrive: item.link_gdrive || "",
    });
    setError("");
    setNotice("");
  };

  const cancelEditingManagementSop = () => {
    setEditingManagementSop(null);
    setManagementForm({
      no_sop: "",
      judul_prosedur: "",
      klinik: "",
      tanggal_pembuatan: "",
      tanggal_pengesahan: "",
      link_gdrive: "",
    });
  };

  const saveManagementSop = async (event) => {
    event.preventDefault();
    if (!editingManagementSop) return;
    setError("");
    setNotice("");
    setIsSavingManagementSop(true);
    try {
      const response = await fetch(`/api/sop/${editingManagementSop.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...managementForm,
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal memperbarui data SOP.");
      cancelEditingManagementSop();
      setNotice("Data Manajemen SOP berhasil diperbarui.");
      await loadManagementSops();
    } catch (saveError) {
      setError(saveError.message || "Gagal memperbarui data SOP.");
    } finally {
      setIsSavingManagementSop(false);
    }
  };

  const deleteManagementSop = async (item) => {
    if (!window.confirm(`Hapus data SOP ${item.no_sop} — "${item.judul_prosedur}"?`)) return;
    setDeletingManagementSopId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/sop/${item.id}`, { method: "DELETE" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal menghapus data SOP.");
      if (String(item.id) === selectedManagementSopId) setSelectedManagementSopId("");
      if (editingManagementSop?.id === item.id) cancelEditingManagementSop();
      setNotice("Data Manajemen SOP berhasil dihapus.");
      await loadManagementSops();
    } catch (deleteError) {
      setError(deleteError.message || "Gagal menghapus data SOP.");
    } finally {
      setDeletingManagementSopId(null);
    }
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const loadSavedDocument = async (id) => {
    if (!id) return;
    setError("");
    try {
      const response = await fetch(`/api/spo-generator/saved/${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal memuat SPO dari arsip.");
      const savedSop = { ...emptySop, ...result.document.data };
      const savedHtml = result.document.html_content
        ? sanitizeEditorHtml(result.document.html_content)
        : createPreviewHtml(savedSop);
      setSop(savedSop);
      setOpenSections((current) => ({ ...current, editor: true }));
      setEditorHtml(savedHtml);
      setDateValues({
        tanggal_pembuatan: toDateInputValue(savedSop.tanggal_pembuatan),
        tanggal_pengesahan: toDateInputValue(savedSop.tanggal_pengesahan),
      });
      setIsEditing(false);
      setActiveDocumentId(id);
      setNotice(`“${result.document.judul_sop}” dimuat dari arsip.`);
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (loadError) {
      setError(loadError.message || "Gagal memuat SPO dari arsip.");
    }
  };

  const deleteSavedDocument = async (document) => {
    if (!window.confirm(`Hapus arsip “${document.judul_sop}” secara permanen?`)) return;
    setError("");
    setNotice("");
    setDeletingDocumentId(document.id);
    try {
      const response = await fetch(`/api/spo-generator/saved/${encodeURIComponent(document.id)}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal menghapus arsip SPO.");
      if (activeDocumentId === document.id) {
        setActiveDocumentId("");
        setSop(emptySop);
        setEditorHtml(createPreviewHtml(emptySop));
        setDateValues({
          tanggal_pembuatan: toDateInputValue(emptySop.tanggal_pembuatan),
          tanggal_pengesahan: toDateInputValue(emptySop.tanggal_pengesahan),
        });
        setIsEditing(false);
      }
      await loadSavedDocuments();
      setNotice(`Arsip “${document.judul_sop}” berhasil dihapus.`);
    } catch (deleteError) {
      setError(deleteError.message || "Gagal menghapus arsip SPO.");
    } finally {
      setDeletingDocumentId("");
    }
  };

  useEffect(() => {
    loadSavedDocuments();
  }, [loadSavedDocuments]);

  useEffect(() => {
    loadManagementSops();
  }, [loadManagementSops]);

  const saveEditorSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return null;
    editor.focus();
    const selection = window.getSelection();
    if (selectionRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    return selection;
  };

  const resetEditorHistory = (html) => {
    const history = historyRef.current;
    window.clearTimeout(history.timer);
    history.undo = [html];
    history.redo = [];
    history.lastRecorded = html;
    history.pending = false;
  };

  const recordEditorChange = () => {
    const html = editorRef.current?.innerHTML;
    if (typeof html !== "string") return;
    const history = historyRef.current;
    if (html === history.lastRecorded && !history.pending) return;
    history.pending = true;
    window.clearTimeout(history.timer);
    history.timer = window.setTimeout(() => {
      const latestHtml = editorRef.current?.innerHTML;
      if (typeof latestHtml === "string" && latestHtml !== history.undo.at(-1)) {
        history.undo.push(latestHtml);
        if (history.undo.length > 100) history.undo.shift();
      }
      history.lastRecorded = latestHtml || "";
      history.pending = false;
      history.redo = [];
    }, 600);
  };

  const restoreEditorHistory = (direction) => {
    const editor = editorRef.current;
    if (!editor) return;
    const history = historyRef.current;
    window.clearTimeout(history.timer);
    if (history.pending) {
      const currentHtml = editor.innerHTML;
      if (currentHtml !== history.undo.at(-1)) history.undo.push(currentHtml);
      history.lastRecorded = currentHtml;
      history.pending = false;
    }
    let nextHtml;
    if (direction === "undo") {
      if (history.undo.length <= 1) return;
      history.redo.push(history.undo.pop());
      nextHtml = history.undo.at(-1);
    } else {
      nextHtml = history.redo.pop();
      if (!nextHtml) return;
      history.undo.push(nextHtml);
    }
    if (!nextHtml) return;
    editor.innerHTML = nextHtml;
    history.lastRecorded = nextHtml;
    history.pending = false;
    editor.focus();
    selectionRef.current = null;
    saveEditorSelection();
  };

  const handleEditorPaste = (event) => {
    if (!isEditing) return;
    event.preventDefault();
    const clipboard = event.clipboardData;
    const html = clipboard.getData("text/html");
    const plainText = clipboard.getData("text/plain");
    const sanitizedHtml = html
      ? sanitizeEditorHtml(html)
      : "";
    const pastedHtml = sanitizedHtml || escapeHtml(plainText).replace(/\r?\n/g, "<br>");
    if (!pastedHtml) return;
    const selection = restoreEditorSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0).cloneRange();
    const previousHtml = editorRef.current.innerHTML;
    const inserted = document.execCommand("insertHTML", false, pastedHtml);
    if (!inserted || editorRef.current.innerHTML === previousHtml) {
      range.deleteContents();
      const fragment = range.createContextualFragment(pastedHtml);
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    recordEditorChange();
    saveEditorSelection();
  };

  const applyListCommand = (listTag) => {
    const selection = restoreEditorSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      setNotice("Pilih teks atau paragraf terlebih dahulu untuk membuat daftar.");
      return;
    }
    const selectedRange = selection.getRangeAt(0).cloneRange();
    const blocks = [...editorRef.current.querySelectorAll("p, h1, h2, h3, blockquote, li, div")].filter((block) => {
      if (block.closest("[data-hospital-logo]")) return false;
      if (block.nodeName !== "LI" && block.closest("li")) return false;
      if (block.nodeName === "DIV" && block.querySelector("p, h1, h2, h3, blockquote, li")) return false;
      try {
        return selectedRange.intersectsNode(block);
      } catch {
        return false;
      }
    });
    if (!blocks.length) {
      setError("Tidak ada paragraf terpilih yang dapat dijadikan daftar.");
      return;
    }
    const groups = new Map();
    blocks.forEach((block) => {
      const parent = block.parentElement;
      groups.set(parent, [...(groups.get(parent) || []), block]);
    });
    const replacements = [];
    for (const [parent, group] of groups) {
      if (parent.nodeName === "OL" || parent.nodeName === "UL") {
        if (parent.nodeName.toLowerCase() !== listTag) {
          const replacement = document.createElement(listTag);
          replacement.innerHTML = parent.innerHTML;
          replacement.style.cssText = parent.style.cssText;
          configureListElement(replacement, listTag, orderedListType);
          if (parent.nodeName === "OL" && parent.hasAttribute("start")) {
            replacement.setAttribute("start", parent.getAttribute("start"));
          }
          parent.replaceWith(replacement);
          replacements.push(replacement.lastElementChild);
        } else {
          configureListElement(parent, listTag, orderedListType);
          replacements.push(group.at(-1));
        }
        continue;
      }

      const runs = [];
      let currentRun = [];
      [...parent.children].forEach((child) => {
        if (group.includes(child)) {
          currentRun.push(child);
        } else if (currentRun.length) {
          runs.push(currentRun);
          currentRun = [];
        }
      });
      if (currentRun.length) runs.push(currentRun);
      runs.forEach((run) => {
        const list = document.createElement(listTag);
        const listItems = run.map((block) => {
          const item = document.createElement("li");
          item.style.cssText = block.style.cssText;
          item.style.display = "list-item";
          item.innerHTML = block.innerHTML;
          return item;
        });
        list.append(...listItems);
        configureListElement(list, listTag, orderedListType);
        run[0].replaceWith(list);
        run.slice(1).forEach((block) => block.remove());
        replacements.push(listItems.at(-1));
      });
    }
    editorRef.current.focus();
    const nextRange = document.createRange();
    const lastListItem = replacements.at(-1) || editorRef.current.querySelector(`${listTag} li:last-child`);
    if (!lastListItem) return;
    nextRange.selectNodeContents(lastListItem);
    nextRange.collapse(false);
    const nextSelection = window.getSelection();
    nextSelection.removeAllRanges();
    nextSelection.addRange(nextRange);
    recordEditorChange();
    saveEditorSelection();
  };

  const runEditorCommand = (command, value) => {
    if (command === "undo" || command === "redo") {
      restoreEditorHistory(command);
      return;
    }
    const selection = restoreEditorSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0).cloneRange();
    const supported = document.execCommand(command, false, value);
    if (!supported && ["insertOrderedList", "insertUnorderedList"].includes(command)) {
      const fragment = range.extractContents();
      const list = document.createElement(command === "insertOrderedList" ? "ol" : "ul");
      const blocks = [...fragment.querySelectorAll("p, li")];
      if (blocks.length) {
        blocks.forEach((block) => {
          const listItem = document.createElement("li");
          while (block.firstChild) listItem.append(block.firstChild);
          list.append(listItem);
        });
      } else {
        const listItem = document.createElement("li");
        listItem.append(fragment);
        list.append(listItem);
      }
      range.insertNode(list);
    }
    saveEditorSelection();
    recordEditorChange();
  };

  const applyInlineStyle = (style) => {
    const selection = restoreEditorSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      setNotice("Pilih teks terlebih dahulu untuk menerapkan format.");
      return false;
    }
    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      setNotice("Pilih teks di dalam tabel SPO terlebih dahulu untuk menerapkan format.");
      return false;
    }
    const textNodes = [];
    try {
      const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);
        if (range.intersectsNode(node)) textNodes.push(node);
      }
      const wrappers = [];
      for (const node of textNodes) {
        const start = range.startContainer === node ? range.startOffset : 0;
        const end = range.endContainer === node ? range.endOffset : node.length;
        if (end <= start) continue;
        if (end < node.length) node.splitText(end);
        const selectedNode = start > 0 ? node.splitText(start) : node;
        const wrapper = document.createElement("span");
        Object.assign(wrapper.style, style);
        selectedNode.parentNode.insertBefore(wrapper, selectedNode);
        wrapper.append(selectedNode);
        wrappers.push(wrapper);
      }
      if (!wrappers.length) {
        setNotice("Teks yang dipilih tidak dapat diformat.");
        return false;
      }
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.setStartBefore(wrappers[0]);
      nextRange.setEndAfter(wrappers[wrappers.length - 1]);
      selection.addRange(nextRange);
      saveEditorSelection();
      recordEditorChange();
      setNotice("Format diterapkan pada teks yang dipilih.");
      return true;
    } catch {
      setError("Format tidak dapat diterapkan pada pilihan teks tersebut.");
      return false;
    }
  };

  const applyLineSpacing = (lineHeight) => {
    const selection = restoreEditorSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const blocks = [...editorRef.current.querySelectorAll("p, li, td")];
    const selectedBlocks = blocks.filter((block) => {
      try {
        return range.intersectsNode(block);
      } catch {
        return false;
      }
    });
    selectedBlocks.forEach((block) => { block.style.lineHeight = lineHeight; });
    saveEditorSelection();
    recordEditorChange();
  };

  const selectedParagraphs = () => {
    const selection = restoreEditorSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return [];
    const range = selection.getRangeAt(0);
    return [...editorRef.current.querySelectorAll("p, li")].filter((block) => {
      try {
        return range.intersectsNode(block);
      } catch {
        return false;
      }
    });
  };

  const setRulerIndentation = (kind, centimeters) => {
    const selected = selectedParagraphs();
    if (!selected.length) return;
    const value = `${centimeters.toFixed(2)}cm`;
    selected.forEach((paragraph) => {
      if (kind === "left") paragraph.style.marginLeft = value;
      if (kind === "firstLine") paragraph.style.textIndent = value;
    });
    saveEditorSelection();
    recordEditorChange();
  };

  const handleRulerPointerDown = (kind, event) => {
    event.preventDefault();
    saveEditorSelection();
    setRulerDrag(kind);
    event.currentTarget.parentElement.setPointerCapture(event.pointerId);
  };

  const handleRulerPointerMove = (event) => {
    if (!rulerDrag || !rulerRef.current) return;
    const bounds = rulerRef.current.getBoundingClientRect();
    const centimeters = Math.min(18, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 18));
    setRulerIndent((current) => ({ ...current, [rulerDrag]: centimeters }));
    setRulerIndentation(rulerDrag, centimeters);
  };

  const handleRulerPointerUp = () => setRulerDrag("");

  const handleClipboard = async (action) => {
    const selection = restoreEditorSelection();
    const selectedText = selection?.toString() || "";
    const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    try {
      if (action === "paste") {
        const text = await navigator.clipboard.readText();
        if (text && savedRange) {
          selection.removeAllRanges();
          selection.addRange(savedRange);
          const previousHtml = editorRef.current.innerHTML;
          const inserted = document.execCommand("insertText", false, text);
          if (!inserted || editorRef.current.innerHTML === previousHtml) {
            const range = savedRange.cloneRange();
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } else {
        if (!selectedText) {
          setNotice("Pilih teks terlebih dahulu.");
          return;
        }
        await navigator.clipboard.writeText(selectedText);
        if (action === "cut" && savedRange) {
          selection.removeAllRanges();
          selection.addRange(savedRange);
          selection.deleteFromDocument();
        }
      }
      saveEditorSelection();
      recordEditorChange();
    } catch {
      setError("Akses papan klip ditolak browser. Gunakan pintasan keyboard atau izinkan akses clipboard.");
    }
  };

  const addProcedureStage = () => {
    const procedureCell = editorRef.current?.querySelector("[data-procedure-content]");
    if (!procedureCell) return;
    const stageNumber = stageLetter(procedureCell.querySelectorAll("[data-stage-heading]").length);
    const heading = document.createElement("p");
    heading.dataset.stageHeading = "true";
    heading.style.margin = "0 0 2px";
    const label = document.createElement("strong");
    label.textContent = `${stageNumber}. Tahap Baru`;
    heading.append(label);
    const list = document.createElement("ol");
    configureListElement(list, "ol");
    const step = document.createElement("li");
    step.style.display = "list-item";
    step.style.paddingLeft = "2px";
    step.textContent = "Langkah baru";
    list.append(step);
    procedureCell.append(heading, list);
    editorRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(label);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    saveEditorSelection();
    recordEditorChange();
  };

  const addProcedureStep = () => {
    const procedureCell = editorRef.current?.querySelector("[data-procedure-content]");
    if (!procedureCell) return;
    let list = [...procedureCell.children].filter((element) => element.nodeName === "OL").at(-1);
    if (!list) {
      list = document.createElement("ol");
      configureListElement(list, "ol");
      procedureCell.append(list);
    }
    const step = document.createElement("li");
    step.style.display = "list-item";
    step.style.paddingLeft = "2px";
    step.textContent = "Langkah baru";
    list.append(step);
    editorRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(step);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    saveEditorSelection();
    recordEditorChange();
  };

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    setError("");
    setNotice("");
    setBatchResults([]);
    setUploadedSources([]);
    setRawText("");
    if (rejectedFiles.length) {
      setError("Sebagian berkas tidak diterima. Format yang didukung DOCX atau TXT, maksimal 10 MB per berkas dan 20 berkas.");
    }
    if (!acceptedFiles.length) return;

    const sources = [];
    for (const file of acceptedFiles) {
      try {
        let text;
        if (file.name.toLowerCase().endsWith(".docx")) {
          const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
          const parsedDocument = new DOMParser().parseFromString(result.value, "text/html");
          text = [...parsedDocument.body.children].map((element) => {
            if (element.nodeName.toLowerCase() === "table") {
              return [...element.rows].map((row) => (
                [...row.cells].map((cell) => cell.innerText.trim()).filter(Boolean).join(" | ")
              )).filter(Boolean).join("\n");
            }
            return element.innerText.trim();
          }).filter(Boolean).join("\n");
        } else {
          text = await file.text();
        }
        if (!text.trim()) throw new Error("Tidak ditemukan teks pada dokumen.");
        sources.push({ name: file.name, text });
      } catch (readError) {
        sources.push({ name: file.name, text: "", error: readError.message || "Dokumen gagal dibaca." });
      }
    }

    setUploadedSources(sources);
    if (sources.length === 1 && sources[0].text) setRawText(sources[0].text);
    const readableCount = sources.filter((source) => source.text).length;
    setNotice(`${readableCount} dari ${sources.length} berkas siap diproses${sources.length > 1 ? " sebagai lembar kerja terpisah" : ""}.`);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    multiple: true,
    maxFiles: 20,
    maxSize: 10 * 1024 * 1024,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
  });

  const extractSop = async () => {
    setError("");
    setNotice("");
    const sources = uploadedSources.length
      ? uploadedSources.map((source) => ({
          ...source,
          text: uploadedSources.length === 1 ? rawText : source.text,
        }))
      : [{ name: "Teks manual", text: rawText }];
    if (!sources.some((source) => source.text?.trim())) {
      setError("Pilih minimal satu berkas yang dapat dibaca atau isi teks sumber.");
      return;
    }

    setIsExtracting(true);
    const results = sources.map((source) => source.error
      ? { fileName: source.name, status: "gagal", error: source.error }
      : { fileName: source.name, status: "menunggu" });
    setBatchResults(results);
    const extractedDocuments = [];
    try {
      for (const [resultIndex, source] of sources.entries()) {
        if (!source.text?.trim()) continue;
        results[resultIndex] = { fileName: source.name, status: "diproses" };
        setBatchResults([...results]);
        try {
          const response = await fetch("/api/spo-generator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawText: source.text, klinik: selectedClinic }),
          });
          const result = await response.json();
          if (response.status === 401) {
            router.push("/login");
            return;
          }
          if (!response.ok) throw new Error(result.error || "Ekstraksi SOP gagal.");
          const extractedSop = { ...emptySop, ...result.data };
          const documentResult = {
            fileName: source.name,
            status: "selesai",
            id: result.documentId,
            title: extractedSop.judul_sop || "SPO tanpa judul",
            data: extractedSop,
            extractionMode: result.extractionMode,
          };
          results[resultIndex] = documentResult;
          extractedDocuments.push(documentResult);
          setBatchResults([...results]);
        } catch (extractError) {
          results[resultIndex] = {
            fileName: source.name,
            status: "gagal",
            error: extractError.message || "Ekstraksi SOP gagal.",
          };
          setBatchResults([...results]);
        }
      }

      if (extractedDocuments.length) {
        const firstDocument = extractedDocuments[0];
        setSop(firstDocument.data);
        setOpenSections((current) => ({ ...current, editor: true }));
        setEditorHtml(createPreviewHtml(firstDocument.data));
        setDateValues({
          tanggal_pembuatan: toDateInputValue(firstDocument.data.tanggal_pembuatan),
          tanggal_pengesahan: toDateInputValue(firstDocument.data.tanggal_pengesahan),
        });
        setActiveDocumentId(firstDocument.id || "");
        setIsEditing(false);
        await loadSavedDocuments();
        await loadManagementSops();
      }

      const failedCount = results.filter((item) => item.status === "gagal").length;
      const localCount = extractedDocuments.filter((item) => item.extractionMode === "local").length;
      if (extractedDocuments.length) {
        setNotice(
          `${extractedDocuments.length} lembar kerja berhasil dibuat dan disimpan${failedCount ? `; ${failedCount} berkas gagal diproses` : ""}${localCount ? `. ${localCount} berkas diekstrak lokal tanpa AI karena GROQ_API_KEY belum dikonfigurasi; periksa kembali hasilnya` : ""}. Pilih hasil di bawah untuk membuka lembar kerja.`
        );
      } else {
        setError(results.find((item) => item.status === "gagal")?.error || "Ekstraksi SPO gagal.");
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const generateNewSop = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsExtracting(true);
    try {
      const response = await fetch("/api/spo-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          judul_sop: newSopTitle,
          rawText: newSopContext,
          klinik: selectedClinic,
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Pembuatan draft SPO gagal.");
      const generatedSop = { ...emptySop, ...result.data, judul_sop: result.data?.judul_sop || newSopTitle };
      setSop(generatedSop);
      setOpenSections((current) => ({ ...current, editor: true }));
      setEditorHtml(createPreviewHtml(generatedSop));
      setDateValues({
        tanggal_pembuatan: toDateInputValue(generatedSop.tanggal_pembuatan),
        tanggal_pengesahan: toDateInputValue(generatedSop.tanggal_pengesahan),
      });
      setActiveDocumentId(result.documentId || "");
      setIsEditing(false);
      await loadSavedDocuments();
      await loadManagementSops();
      setNotice("Draft SPO berhasil dibuat dan disimpan otomatis ke arsip. Periksa dan sesuaikan seluruh isi sebelum digunakan.");
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (generateError) {
      setError(generateError.message || "Pembuatan draft SPO gagal.");
    } finally {
      setIsExtracting(false);
    }
  };

  const updateDateField = (field, value) => {
    const label = field === "tanggal_pembuatan" ? "Tanggal Pembuatan" : "Tanggal Pengesahan";
    const table = editorRef.current?.querySelector("[data-spo-document]");
    const row = table
      ? [...table.rows].find((item) => item.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === label.toLocaleLowerCase("id-ID"))
      : null;
    if (row?.cells[1]) row.cells[1].textContent = value;
    setDateValues((current) => ({ ...current, [field]: value }));
    setSop((current) => ({ ...current, [field]: value }));
    if (table) {
      recordEditorChange();
      saveEditorSelection();
    }
  };

  const readEditorSection = (section) => {
    const table = editorRef.current?.querySelector("[data-spo-document]");
    if (!table) return "";
    if (section === "prosedur") {
      return table.querySelector("[data-procedure-content]")?.innerText?.trim() || "";
    }
    const labels = {
      judul_sop: "nama sop",
      unit_terkait: "unit terkait",
      dokumen_terkait: "dokumen terkait",
    };
    const label = labels[section] || section;
    const row = [...table.rows].find((item) => (
      item.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === label
    ));
    return row?.cells[1]?.innerText?.trim() || "";
  };

  const generateSectionSuggestion = async () => {
    const judul_sop = readEditorSection("judul_sop") || sop.judul_sop;
    if (!judul_sop) {
      setError("Buat atau buka draft SPO terlebih dahulu sebelum meminta bantuan AI.");
      return;
    }
    setError("");
    setNotice("");
    setAiFeedback(null);
    setAiSuggestion(null);
    setIsAiGenerating(true);
    const sectionContext = [
      `Judul SPO: ${judul_sop}`,
      `Pengertian: ${readEditorSection("pengertian")}`,
      `Tujuan: ${readEditorSection("tujuan")}`,
      `Kebijakan: ${readEditorSection("kebijakan")}`,
      `Unit kerja: ${readEditorSection("unit_terkait")}`,
      `Dokumen terkait: ${readEditorSection("dokumen_terkait")}`,
      `Uraian tugas/prosedur: ${readEditorSection("prosedur")}`,
    ].join("\n\n");

    try {
      const response = await fetch("/api/spo-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assist-section",
          section: aiSection,
          judul_sop,
          rawText: [sectionContext, aiInstructions.trim() ? `Arahan tambahan pengguna:\n${aiInstructions.trim()}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          currentContent: readEditorSection(aiSection),
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "AI gagal menyusun saran bagian SPO.");
      setAiSuggestion({ section: aiSection, value: result.value });
    } catch (aiError) {
      setError(aiError.message || "AI gagal menyusun saran bagian SPO.");
      setAiFeedback({ type: "error", text: aiError.message || "AI gagal menyusun saran bagian SPO." });
    } finally {
      setIsAiGenerating(false);
    }
  };

  const applySectionSuggestion = () => {
    if (!aiSuggestion) return;
    const table = editorRef.current?.querySelector("[data-spo-document]");
    if (!table) {
      setError("Tabel SPO tidak ditemukan untuk menerapkan saran AI.");
      return;
    }

    resetEditorHistory(editorRef.current.innerHTML);
    if (aiSuggestion.section === "prosedur") {
      const procedureCell = table.querySelector("[data-procedure-content]");
      if (!procedureCell) {
        setError("Bagian uraian prosedur tidak ditemukan pada tabel SPO.");
        return;
      }
      procedureCell.replaceChildren();
      aiSuggestion.value.forEach((stage, stageIndex) => {
        const heading = document.createElement("p");
        heading.dataset.stageHeading = "true";
        heading.style.margin = "0 0 2px";
        const label = document.createElement("strong");
        const stageTitle = String(stage.tahap || "").trim();
        label.textContent = stageTitle || `${stageLetter(stageIndex)}. Tahap`;
        heading.append(label);

        const list = document.createElement("ol");
        configureListElement(list, "ol");
        stage.langkah.forEach((step) => {
          const item = document.createElement("li");
          item.style.display = "list-item";
          item.style.paddingLeft = "2px";
          item.textContent = cleanStepNumber(step);
          list.append(item);
        });
        procedureCell.append(heading, list);
      });
      setSop((current) => ({ ...current, prosedur: aiSuggestion.value }));
    } else {
      const label = aiSuggestion.section === "unit_terkait"
        ? "unit terkait"
        : aiSuggestion.section === "dokumen_terkait"
          ? "dokumen terkait"
          : aiSuggestion.section;
      const row = [...table.rows].find((item) => (
        item.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === label
      ));
      if (!row?.cells[1]) {
        setError(`Bagian ${label} tidak ditemukan pada tabel SPO.`);
        return;
      }
      row.cells[1].replaceChildren();
      String(aiSuggestion.value).split(/\r?\n/).filter((line) => line.trim()).forEach((line) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        row.cells[1].append(paragraph);
      });
      setSop((current) => ({ ...current, [aiSuggestion.section]: aiSuggestion.value }));
    }

    setEditorHtml(editorRef.current.innerHTML);
    setIsEditing(true);
    setAiSuggestion(null);
    setAiFeedback({ type: "success", text: "Saran AI diterapkan ke tabel. Tinjau isinya, lalu simpan perubahan SPO." });
    setNotice("Saran AI diterapkan ke tabel. Tinjau isinya, lalu simpan perubahan SPO.");
    saveEditorSelection();
    recordEditorChange();
  };

  const saveCurrentSop = async () => {
    const table = editorRef.current?.querySelector("[data-spo-document]");
    if (!table) {
      setError("Tabel SPO tidak ditemukan untuk disimpan.");
      return false;
    }
    const titleRow = [...table.rows].find((row) => (
      row.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "nama sop"
    ));
    const noSopRow = [...table.rows].find((row) => (
      row.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "no. sop"
    ));
    const createdDateRow = [...table.rows].find((row) => (
      row.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "tanggal pembuatan"
    ));
    const approvalDateRow = [...table.rows].find((row) => (
      row.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "tanggal pengesahan"
    ));
    const judul_sop = titleRow?.cells[1]?.textContent?.trim() || "";
    const no_sop = noSopRow?.cells[1]?.textContent?.trim() || "";
    const tanggal_pembuatan = createdDateRow?.cells[1]?.textContent?.trim() || "";
    const tanggal_pengesahan = approvalDateRow?.cells[1]?.textContent?.trim() || "";
    const readField = (labels) => {
      const row = [...table.rows].find((item) => labels.includes(
        item.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID")
      ));
      return row?.cells[1]?.innerText?.trim() || "";
    };
    const unit_terkait = readField(["unit terkait", "unit kerja", "unit pelaksana", "pelaksana", "petugas", "instalasi"]);
    const dokumen_terkait = readField(["dokumen terkait", "dokumen pendukung", "referensi", "formulir", "rekaman", "catatan"]);
    const pengertian = readField(["pengertian"]);
    const tujuan = readField(["tujuan"]);
    const kebijakan = readField(["kebijakan"]);
    const prosedurCell = table.querySelector("[data-procedure-content]");
    const prosedur = prosedurCell
      ? [...prosedurCell.querySelectorAll("[data-stage-heading]")].map((heading) => {
          const next = heading.nextElementSibling;
          return {
            tahap: heading.innerText.trim(),
            langkah: next?.nodeName === "OL" || next?.nodeName === "UL"
              ? [...next.children].map((step) => step.innerText.trim()).filter(Boolean)
              : [],
          };
        })
      : sop.prosedur;
    if (!judul_sop) {
      setError("Isi Nama SOP sebelum menyimpan ke Turso.");
      return false;
    }
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const html_content = sanitizeEditorHtml(table.outerHTML);
      const endpoint = activeDocumentId
        ? `/api/spo-generator/saved/${encodeURIComponent(activeDocumentId)}`
        : "/api/spo-generator/saved";
      const response = await fetch(endpoint, {
        method: activeDocumentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul_sop,
          no_sop,
          html_content,
          klinik: selectedClinic,
          data: {
            ...sop,
            judul_sop,
            no_sop,
            tanggal_pembuatan,
            tanggal_pengesahan,
            pengertian,
            tujuan,
            kebijakan,
            unit_terkait,
            dokumen_terkait,
            prosedur,
          },
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return false;
      }
      if (!response.ok) throw new Error(result.error || "Gagal menyimpan SPO.");
      if (result.id) setActiveDocumentId(result.id);
      const savedNoSop = result.no_sop || no_sop;
      if (noSopRow?.cells[1]) noSopRow.cells[1].textContent = savedNoSop;
      const savedHtml = sanitizeEditorHtml(table.outerHTML);
      setSop((current) => ({
        ...current,
        judul_sop,
        no_sop: savedNoSop,
        tanggal_pembuatan,
        tanggal_pengesahan,
        pengertian,
        tujuan,
        kebijakan,
        unit_terkait,
        dokumen_terkait,
        prosedur,
      }));
      setEditorHtml(savedHtml);
      setDateValues({
        tanggal_pembuatan: toDateInputValue(tanggal_pembuatan),
        tanggal_pengesahan: toDateInputValue(tanggal_pengesahan),
      });
      setIsEditing(false);
      await loadSavedDocuments();
      await loadManagementSops();
      setNotice("Perubahan SPO berhasil disimpan ke database Turso.");
      return true;
    } catch (saveError) {
      setError(saveError.message || "Gagal menyimpan SPO ke Turso.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const findNumberCell = () => {
    const table = editorRef.current?.querySelector("[data-spo-document]");
    const row = table && [...table.rows].find((item) => (
      item.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "no. sop"
    ));
    return row?.cells[1] || null;
  };

  const applyManagementNumber = async (number) => {
    const cell = findNumberCell();
    if (!cell) {
      setError("Sel No. SOP tidak ditemukan pada tabel.");
      return false;
    }
    cell.textContent = number;
    setSop((current) => ({ ...current, no_sop: number }));
    return saveCurrentSop();
  };

  const useSelectedManagementNumber = async () => {
    const selected = managementSops.find((item) => String(item.id) === selectedManagementSopId);
    if (!selected) {
      setError("Pilih nomor dari Manajemen SOP terlebih dahulu.");
      return;
    }
    setError("");
    setNotice("");
    setIsNumbering(true);
    try {
      const saved = await applyManagementNumber(String(selected.no_sop || ""));
      if (saved) {
        setNotice(`Nomor ${selected.no_sop} dari Manajemen SOP sudah dimasukkan ke tabel dan disimpan.`);
      }
    } finally {
      setIsNumbering(false);
    }
  };

  const registerNextManagementNumber = async () => {
    const titleRow = [...(editorRef.current?.querySelector("[data-spo-document]")?.rows || [])]
      .find((row) => row.cells[0]?.textContent?.trim().toLocaleLowerCase("id-ID") === "nama sop");
    const judul_sop = titleRow?.cells[1]?.textContent?.trim() || "";
    const ruangan = getSessionRuangan();
    const currentNumber = findNumberCell()?.textContent?.trim() || "";
    if (!judul_sop) {
      setError("Isi Nama SOP pada tabel sebelum mengambil nomor otomatis.");
      return;
    }
    if (!ruangan) {
      setError("Ruangan sesi tidak ditemukan. Silakan masuk kembali.");
      return;
    }
    if (currentNumber && !window.confirm(
      `Tabel sudah memiliki nomor ${currentNumber}. Tetap buat entri baru dengan nomor berikutnya? Entri Manajemen SOP yang lama tidak dihapus.`
    )) return;

    setError("");
    setNotice("");
    setIsNumbering(true);
    try {
      const response = await fetch("/api/sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul_sop,
          ruangan,
          klinik: selectedClinic,
          tanggal_pembuatan: dateValues.tanggal_pembuatan || sop.tanggal_pembuatan || "",
          tanggal_pengesahan: dateValues.tanggal_pengesahan || sop.tanggal_pengesahan || "",
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal mengambil nomor berikutnya.");

      const saved = await applyManagementNumber(String(result.data?.nomor_sop || ""));
      await loadManagementSops();
      if (saved) {
        setNotice(`Nomor berikutnya ${result.data?.nomor_sop} berhasil dibuat di Manajemen SOP dan dimasukkan ke tabel.`);
      } else {
        setNotice(`Nomor ${result.data?.nomor_sop} sudah dibuat di Manajemen SOP, tetapi lembar kerja belum tersimpan. Tekan “Simpan perubahan” untuk mencoba lagi.`);
      }
    } catch (numberError) {
      setError(numberError.message || "Gagal mengambil nomor berikutnya.");
    } finally {
      setIsNumbering(false);
    }
  };

  const createManagementSop = async (event) => {
    event.preventDefault();
    const ruangan = getSessionRuangan();
    if (!ruangan) {
      setError("Ruangan sesi tidak ditemukan. Silakan masuk kembali.");
      return;
    }

    setError("");
    setNotice("");
    setIsNumbering(true);
    try {
      const response = await fetch("/api/sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul_sop: newManagementSopTitle.trim(),
          ruangan,
          klinik: selectedClinic,
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Gagal membuat SPO baru.");

      setNewManagementSopTitle("");
      await loadManagementSops();
      setNotice(`SPO baru berhasil didaftarkan dengan nomor ${result.data?.nomor_sop}. Dokumen dapat ditautkan nanti dari daftar Manajemen SPO.`);
    } catch (createError) {
      setError(createError.message || "Gagal membuat SPO baru.");
    } finally {
      setIsNumbering(false);
    }
  };

  const downloadWord = async () => {
    setError("");
    setNotice("");
    setIsDownloading(true);
    try {
      await downloadSopWord(editorRef.current);
      setNotice("File Word (.docx) berhasil diunduh.");
    } catch (downloadError) {
      if (downloadError.message === "Failed to fetch") {
        setError("Gagal menghubungi server untuk mengambil logo. Periksa koneksi dan coba kembali.");
      } else {
        setError(downloadError.message || "File Word gagal diunduh.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isHydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-16" aria-busy="true">
        <header className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
            <Sparkles size={26} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">Manajemen SPO + AI</h1>
            <p className="mt-1 text-sm text-slate-500">Memuat editor SPO...</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-blue-100 ring-1 ring-white/20">
          <Sparkles size={26} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-200">Pusat kerja dokumen</p>
          <h1 className="mt-1 text-xl font-black uppercase tracking-tight sm:text-2xl">Manajemen SPO + AI</h1>
          <p className="mt-1 max-w-2xl text-sm text-blue-100/80">Buat draft, ekstrak dokumen lama, kelola nomor dan arsip, lalu tinjau serta unduh dari satu halaman.</p>
        </div>
        <span className="ml-auto rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
          {managementSops.length} SPO terdaftar
        </span>
        </div>
        <nav aria-label="Navigasi bagian SPO" className="mt-6 flex flex-wrap gap-2">
          {[
            ["#spo-create", "Buat baru", "create"],
            ["#spo-extract", "Ekstrak lama", "extract"],
            ["#spo-archive", "Arsip draft", "archive"],
            ["#spo-numbering", "Penomoran", "numbering"],
            ["#spo-registry", "Manajemen SPO", "registry"],
            ["#spo-editor", "Editor & unduh", "editor"],
          ].map(([href, label, section]) => (
            <a key={href} href={href} onClick={() => openSectionFromNavigation(section)} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section id="spo-create" className="scroll-mt-6 space-y-4 rounded-3xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sparkles className="text-blue-600" size={20} />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Buat SPO Baru dengan AI</h2>
              <p className="mt-1 text-xs text-slate-500">Isi topik dan arahan. AI menyusun draft lengkap langsung ke tabel untuk Anda tinjau.</p>
            </div>
          </div>
          <button type="button" onClick={() => toggleSection("create")} aria-expanded={openSections.create} aria-controls="spo-create-content" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">
            {openSections.create ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {openSections.create ? "Tutup" : "Buka"}
          </button>
        </div>
        <div id="spo-create-content" hidden={!openSections.create}>
        <form onSubmit={generateNewSop} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-slate-600">
            <span>Nama / judul SPO <span className="text-red-500">*</span></span>
            <input
              required
              maxLength={255}
              value={newSopTitle}
              onChange={(event) => setNewSopTitle(event.target.value)}
              placeholder="Contoh: Prosedur Pelayanan Pasien Rawat Jalan"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600 md:row-span-2">
            <span>Tujuan, konteks, unit terkait, dan arahan prosedur</span>
            <textarea
              value={newSopContext}
              onChange={(event) => setNewSopContext(event.target.value)}
              rows={5}
              maxLength={100000}
              placeholder="Jelaskan tujuan SPO, unit yang menjalankan, alat/bahan, kondisi khusus, serta urutan kerja yang perlu dicantumkan."
              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button
            type="submit"
            disabled={!newSopTitle.trim() || isExtracting}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExtracting ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            {isExtracting ? "Membuat draft..." : "Buat draft ke tabel"}
          </button>
        </form>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Hasil AI adalah draft untuk ditinjau. Lengkapi metadata pengesahan dan validasi isi klinis, kebijakan, serta dasar hukum sebelum ditetapkan.
        </p>
        </div>
      </section>

      <section id="spo-extract" className="scroll-mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Upload className="text-blue-600" size={20} />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Unggah SPO Lama</h2>
              <p className="mt-1 text-xs text-slate-500">Ekstrak dokumen lama dengan AI dan lanjutkan penyuntingan pada halaman ini.</p>
            </div>
          </div>
          <button type="button" onClick={() => toggleSection("extract")} aria-expanded={openSections.extract} aria-controls="spo-extract-content" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {openSections.extract ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {openSections.extract ? "Tutup" : "Buka"}
          </button>
        </div>
        <div id="spo-extract-content" hidden={!openSections.extract}>
        <div
          {...getRootProps()}
          className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"}`}
        >
          <input {...getInputProps()} />
          <FileText className="mx-auto mb-2 text-slate-400" size={28} />
          <p className="text-sm font-bold text-slate-700">
            {isDragActive ? "Lepaskan dokumen di sini" : "Seret berkas DOCX atau TXT ke area ini"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Pilih hingga 20 berkas, maksimal 10 MB per berkas. Setiap berkas dibuat menjadi lembar kerja terpisah.</p>
          <button
            type="button"
            onClick={open}
            className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
          >
            Pilih berkas
          </button>
        </div>
        {uploadedSources.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-700">Berkas terpilih ({uploadedSources.length})</p>
            <ul className="space-y-1.5">
              {uploadedSources.map((source, index) => (
                <li key={`${source.name}-${index}`} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <span className="break-all font-medium text-slate-700">{source.name}</span>
                  <span className={source.error ? "text-red-600" : "text-emerald-700"}>
                    {source.error || "Siap diekstrak"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {uploadedSources.length <= 1 ? (
          <label className="block space-y-2">
            <span className="text-xs font-bold text-slate-600">Teks sumber (dapat diperiksa atau ditempel manual)</span>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={7}
              maxLength={100000}
              placeholder="Teks SPO lama akan tampil di sini setelah diunggah..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <span className="block text-right text-[10px] text-slate-400">{rawText.length.toLocaleString("id-ID")} / 100.000 karakter</span>
          </label>
        ) : (
          <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800">
            Isi setiap berkas akan diekstrak secara terpisah. Untuk mengubah teks salah satu berkas, unggah berkas itu sendiri atau tempel teksnya sebagai input tunggal.
          </p>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          AI memetakan unit kerja, dokumen terkait, dan tanda tangan dari SPO lama. Jika bagian tersebut tidak tercantum, AI dapat memberi saran bertanda “perlu validasi” berdasarkan prosedur; periksa sebelum digunakan.
        </p>
        <button
          type="button"
          disabled={(!rawText.trim() && !uploadedSources.some((source) => source.text?.trim())) || isExtracting}
          onClick={extractSop}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExtracting ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
          {isExtracting ? "Mengekstrak berkas..." : uploadedSources.length > 1 ? `Ekstrak ${uploadedSources.length} SPO dengan AI` : "Ekstrak dengan AI"}
        </button>
        {batchResults.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-700">Hasil lembar kerja</p>
            <ul className="space-y-2">
              {batchResults.map((item, index) => (
                <li key={`${item.fileName}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="break-all text-xs font-bold text-slate-800">{item.title || item.fileName}</p>
                    <p className={`mt-0.5 text-[11px] ${item.status === "gagal" ? "text-red-600" : item.status === "selesai" ? "text-emerald-700" : "text-slate-500"}`}>
                      {item.status === "gagal" ? item.error : item.status === "selesai" ? `Sumber: ${item.fileName}` : item.status === "diproses" ? "Sedang diproses..." : "Menunggu"}
                    </p>
                  </div>
                  {item.status === "selesai" && (
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => loadSavedDocument(item.id)}
                      className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      Buka lembar kerja
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </section>

      <section id="spo-archive" className="scroll-mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Arsip SPO Tersimpan</h2>
            <p className="mt-1 text-xs text-slate-500">{savedDocuments.length} dokumen · Draft AI dan hasil ekstraksi yang tersimpan.</p>
          </div>
          <button type="button" onClick={() => toggleSection("archive")} aria-expanded={openSections.archive} aria-controls="spo-archive-content" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {openSections.archive ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {openSections.archive ? "Tutup" : "Buka"}
          </button>
        </div>
        <div id="spo-archive-content" hidden={!openSections.archive}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Arsip SPO Tersimpan</h2>
            <p className="mt-1 text-xs text-slate-500">Hasil ekstraksi dan draft AI disimpan otomatis di Turso, terpisah berdasarkan ruangan.</p>
          </div>
          <button
            type="button"
            onClick={loadSavedDocuments}
            disabled={isLoadingSaved}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoadingSaved ? "Memuat..." : "Muat ulang"}
          </button>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-slate-600">Pilih dokumen tersimpan</span>
          <select
            value={activeDocumentId}
            disabled={isLoadingSaved || !savedDocuments.length}
            onChange={(event) => loadSavedDocument(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-100"
          >
            <option value="">
              {isLoadingSaved
                ? "Memuat arsip SPO..."
                : savedDocuments.length
                  ? "Pilih SPO untuk dibuka"
                  : "Belum ada SPO tersimpan"}
            </option>
            {savedDocuments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.judul_sop} · {item.no_sop || "Tanpa nomor"} · {item.source_type === "generate" ? "Draft AI" : item.source_type === "manual" ? "Edit manual" : "Ekstraksi"}
              </option>
            ))}
          </select>
        </label>
        {savedDocuments.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {savedDocuments.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="break-words text-xs font-bold text-slate-800">{item.judul_sop}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.no_sop || "Tanpa nomor"} · {item.source_type === "generate" ? "Draft AI" : item.source_type === "manual" ? "Edit manual" : "Ekstraksi"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadSavedDocument(item.id)}
                    className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                  >
                    Buka
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedDocument(item)}
                    disabled={Boolean(deletingDocumentId)}
                    aria-label={`Hapus arsip ${item.judul_sop}`}
                    title="Hapus arsip"
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingDocumentId === item.id ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>

      {(error || notice) && (
        <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error && <AlertCircle className="mt-0.5 shrink-0" size={17} />}
          <span>{error || notice}</span>
        </div>
      )}

      <section id="spo-numbering" className="scroll-mt-6 space-y-4 rounded-3xl border border-violet-100 bg-violet-50/60 p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Hash className="text-violet-700" size={20} />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Penomoran Terintegrasi</h2>
              <p className="mt-1 text-xs text-slate-600">{managementSops.length} nomor tercatat · Tahun nomor baru otomatis mengikuti tahun berjalan.</p>
            </div>
          </div>
          <button type="button" onClick={() => toggleSection("numbering")} aria-expanded={openSections.numbering} aria-controls="spo-numbering-content" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100">
            {openSections.numbering ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {openSections.numbering ? "Tutup" : "Buka"}
          </button>
        </div>
        <div id="spo-numbering-content" hidden={!openSections.numbering}>
        <form onSubmit={createManagementSop} className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Tambah SPO baru tanpa unggah dokumen</h3>
            <p className="mt-1 text-xs text-slate-500">Masukkan judul untuk membuat nomor dan mendaftarkannya langsung ke Manajemen SPO. Dokumen bisa ditautkan nanti.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="min-w-0 flex-1 space-y-1.5 text-xs font-bold text-slate-600">
              <span>Judul SPO <span className="text-red-500">*</span></span>
              <input
                required
                maxLength={255}
                value={newManagementSopTitle}
                onChange={(event) => setNewManagementSopTitle(event.target.value)}
                placeholder="Contoh: Prosedur Identifikasi Pasien"
                disabled={isNumbering}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
              />
            </label>
            <button
              type="submit"
              disabled={!newManagementSopTitle.trim() || isNumbering || isSaving}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isNumbering ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              Buat SPO & nomor otomatis
            </button>
          </div>
        </form>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={selectedManagementSopId}
            onChange={(event) => setSelectedManagementSopId(event.target.value)}
            disabled={isLoadingManagementSops || !managementSops.length || isNumbering}
            aria-label="Pilih nomor dari Manajemen SOP"
            className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-100"
          >
            <option value="">
              {isLoadingManagementSops
                ? "Memuat nomor Manajemen SOP..."
                : managementSops.length
                  ? "Pilih nomor SOP yang sudah terdaftar"
                  : "Belum ada nomor SOP di Manajemen SOP"}
            </option>
            {managementSops.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.no_sop} · {item.judul_prosedur || item.judul_sop}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadManagementSops}
            disabled={isLoadingManagementSops || isNumbering}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Muat ulang daftar nomor
          </button>
          <button
            type="button"
            onClick={useSelectedManagementNumber}
            disabled={!selectedManagementSopId || isNumbering || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isNumbering ? <Loader2 className="animate-spin" size={15} /> : <Hash size={15} />}
            Ambil nomor terpilih ke tabel
          </button>
        </div>
        <div className="grid gap-3 rounded-2xl border border-violet-100 bg-white/80 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="space-y-1.5 text-xs font-bold text-slate-600">
            <span>Klinik untuk SPO baru / arsip</span>
            <select
              value={selectedClinic}
              onChange={(event) => setSelectedClinic(event.target.value)}
              disabled={isNumbering}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 disabled:bg-slate-100"
            >
              {daftarKlinikArsipSop.map((clinic) => (
                <option key={clinic} value={clinic}>{clinic}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={registerNextManagementNumber}
              disabled={isNumbering || isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              {isNumbering ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              Daftarkan ke arsip & ambil nomor berikutnya
            </button>
          </div>
        </div>
        </div>
      </section>

      <section id="spo-registry" className="scroll-mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-7">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Daftar Manajemen SPO</h2>
            <p className="mt-1 text-xs text-slate-500">Kelola nomor, klinik, tanggal, dan tautan dokumen tanpa meninggalkan generator.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{managementSops.length} dokumen</span>
            <button
              type="button"
              onClick={loadManagementSops}
              disabled={isLoadingManagementSops}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isLoadingManagementSops ? "Memuat..." : "Muat ulang"}
            </button>
            <button type="button" onClick={() => toggleSection("registry")} aria-expanded={openSections.registry} aria-controls="spo-registry-content" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {openSections.registry ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {openSections.registry ? "Tutup" : "Buka"}
            </button>
          </div>
        </div>

        <div id="spo-registry-content" hidden={!openSections.registry}>
        {editingManagementSop && (
          <form onSubmit={saveManagementSop} className="m-5 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:m-7 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-900">Ubah data SPO</p>
                <p className="mt-1 text-xs text-amber-800">Nomor dapat disesuaikan manual. Daftar akan diurutkan ulang setelah disimpan.</p>
              </div>
              <button type="button" onClick={cancelEditingManagementSop} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Batal mengubah SOP">
                <X size={17} />
              </button>
            </div>
            <label className="space-y-1.5 text-xs font-bold text-slate-600 sm:col-span-2">
              <span>Nomor SPO</span>
              <input
                required
                maxLength={100}
                value={managementForm.no_sop}
                onChange={(event) => setManagementForm((current) => ({ ...current, no_sop: event.target.value }))}
                placeholder="IRJA/001/2026"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-slate-600">
              <span>Judul prosedur</span>
              <input
                required
                maxLength={255}
                value={managementForm.judul_prosedur}
                onChange={(event) => setManagementForm((current) => ({ ...current, judul_prosedur: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-slate-600">
              <span>Klinik tujuan</span>
              <select
                required
                value={managementForm.klinik}
                onChange={(event) => setManagementForm((current) => ({ ...current, klinik: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {daftarKlinikArsipSop.map((clinic) => <option key={clinic} value={clinic}>{clinic}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold text-slate-600">
              <span>Tanggal pembuatan</span>
              <input type="date" value={managementForm.tanggal_pembuatan} onChange={(event) => setManagementForm((current) => ({ ...current, tanggal_pembuatan: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-slate-600">
              <span>Tanggal pengesahan</span>
              <input type="date" value={managementForm.tanggal_pengesahan} onChange={(event) => setManagementForm((current) => ({ ...current, tanggal_pengesahan: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-slate-600 sm:col-span-2">
              <span>Link dokumen Google Drive</span>
              <input type="url" value={managementForm.link_gdrive} onChange={(event) => setManagementForm((current) => ({ ...current, link_gdrive: event.target.value }))} placeholder="https://drive.google.com/..." className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={isSavingManagementSop} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">
                {isSavingManagementSop ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {isSavingManagementSop ? "Menyimpan..." : "Simpan metadata"}
              </button>
              <button type="button" onClick={cancelEditingManagementSop} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Batal</button>
            </div>
          </form>
        )}

        <div className="border-b border-slate-100 p-5 sm:p-7">
          <input
            type="search"
            value={managementSearch}
            onChange={(event) => setManagementSearch(event.target.value)}
            placeholder="Cari nomor, judul, atau klinik..."
            aria-label="Cari daftar Manajemen SPO"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-md"
          />
        </div>

        {isLoadingManagementSops ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm font-semibold text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Memuat daftar SPO...
          </div>
        ) : managementSops.length === 0 ? (
          <p className="p-10 text-center text-sm font-medium text-slate-500">Belum ada SPO terdaftar. Buat draft atau daftarkan nomor melalui panel penomoran di atas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">No. SPO</th>
                  <th className="px-5 py-4">Judul prosedur</th>
                  <th className="px-5 py-4">Klinik</th>
                  <th className="px-5 py-4">Dokumen</th>
                  <th className="px-5 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {managementSops
                  .filter((item) => `${item.no_sop} ${item.judul_prosedur || item.judul_sop || ""} ${item.klinik || ""}`.toLocaleLowerCase("id-ID").includes(managementSearch.trim().toLocaleLowerCase("id-ID")))
                  .map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-700">{item.no_sop}</td>
                      <td className="max-w-sm px-5 py-4 font-semibold text-slate-800">{item.judul_prosedur || item.judul_sop}</td>
                      <td className="px-5 py-4 text-slate-600">{item.klinik || "—"}</td>
                      <td className="px-5 py-4">
                        {item.link_gdrive ? (
                          <a href={item.link_gdrive} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Buka dokumen ↗</a>
                        ) : <span className="text-xs text-slate-400">Belum ditautkan</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => startEditingManagementSop(item)} aria-label={`Ubah ${item.no_sop}`} className="rounded-lg bg-amber-50 p-2 text-amber-700 hover:bg-amber-100">
                            <Pencil size={15} />
                          </button>
                          <button type="button" onClick={() => deleteManagementSop(item)} disabled={deletingManagementSopId === item.id} aria-label={`Hapus ${item.no_sop}`} className="rounded-lg bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50">
                            {deletingManagementSopId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {managementSops.filter((item) => `${item.no_sop} ${item.judul_prosedur || item.judul_sop || ""} ${item.klinik || ""}`.toLocaleLowerCase("id-ID").includes(managementSearch.trim().toLocaleLowerCase("id-ID"))).length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">Tidak ada SPO yang cocok dengan pencarian.</p>
            )}
          </div>
        )}
        </div>
      </section>

      <section id="spo-editor" className="scroll-mt-6 space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Preview Tabel SPO</h2>
            <p className="mt-1 text-xs text-slate-500">
              {isEditing ? "Edit isi tabel, lalu simpan ke Turso atau unduh dokumen Word." : "Pilih Edit untuk mengubah isi tabel, atau unduh dokumen Word (.docx)."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => {
                  resetEditorHistory(editorRef.current?.innerHTML || "");
                  setIsEditing(true);
                  setOpenSections((current) => ({ ...current, editor: true }));
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-700"
              >
                <Pencil size={15} /> Edit isi
              </button>
            ) : (
              <button
                type="button"
                onClick={saveCurrentSop}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                {isSaving ? "Menyimpan..." : "Simpan perubahan"}
              </button>
            )}
            <button
              type="button"
              onClick={downloadWord}
              disabled={isDownloading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isDownloading ? "Menyiapkan unduhan..." : "Unduh Word (.docx)"}
            </button>
            <button type="button" onClick={() => toggleSection("editor")} aria-expanded={openSections.editor} aria-controls="spo-editor-content" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {openSections.editor ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {openSections.editor ? "Tutup" : "Buka"}
            </button>
          </div>
        </div>

        <div id="spo-editor-content" hidden={!openSections.editor}>
        <div className="space-y-4">
          <section aria-label="Asisten AI untuk isi SPO" className="space-y-4 rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700">
                <Sparkles size={19} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Asisten AI isi SPO</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Minta bantuan untuk menyusun atau menyempurnakan satu bagian. Saran hanya diterapkan setelah Anda meninjau dan memilihnya.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <label className="space-y-1.5 text-xs font-bold text-slate-700">
                <span>Bagian yang ingin dibantu</span>
                <select
                  value={aiSection}
                  onChange={(event) => {
                    setAiSection(event.target.value);
                    setAiSuggestion(null);
                    setAiFeedback(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="pengertian">Pengertian</option>
                  <option value="tujuan">Tujuan</option>
                  <option value="kebijakan">Kebijakan</option>
                  <option value="unit_terkait">Unit kerja terkait</option>
                  <option value="dokumen_terkait">Dokumen terkait</option>
                  <option value="prosedur">Uraian tugas / prosedur</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-bold text-slate-700">
                <span>Arahan tambahan <span className="font-normal text-slate-400">(opsional)</span></span>
                <textarea
                  ref={aiInstructionsRef}
                  value={aiInstructions}
                  onChange={(event) => {
                    aiInstructionsSelectionRef.current = {
                      start: event.target.selectionStart,
                      end: event.target.selectionEnd,
                    };
                    setAiInstructions(event.target.value);
                  }}
                  onSelect={(event) => {
                    aiInstructionsSelectionRef.current = {
                      start: event.target.selectionStart,
                      end: event.target.selectionEnd,
                    };
                  }}
                  onPointerUp={(event) => {
                    aiInstructionsSelectionRef.current = {
                      start: event.currentTarget.selectionStart,
                      end: event.currentTarget.selectionEnd,
                    };
                  }}
                  onFocus={(event) => {
                    const { start, end } = aiInstructionsSelectionRef.current;
                    event.currentTarget.setSelectionRange(start, end);
                  }}
                  maxLength={5000}
                  rows={4}
                  placeholder="Jelaskan arahan dengan bebas. Contoh: gunakan bahasa sederhana, sesuaikan untuk petugas pendaftaran, dan buat langkah kerja mudah dipahami."
                  className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">{aiInstructions.length.toLocaleString("id-ID")} / 5.000 karakter</p>
                <button
                  type="button"
                  onClick={generateSectionSuggestion}
                  disabled={isAiGenerating || isSaving || isExtracting || !sop.judul_sop}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAiGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {isAiGenerating ? "Menyusun saran..." : "Buat saran AI"}
                </button>
              </div>
            </div>

            {aiFeedback && (
              <p role={aiFeedback.type === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-xs font-semibold ${aiFeedback.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {aiFeedback.text}
              </p>
            )}

            {aiSuggestion && (
              <div aria-live="polite" className="space-y-3 rounded-xl border border-teal-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wide text-teal-800">
                    Saran AI · {
                      {
                        pengertian: "Pengertian",
                        tujuan: "Tujuan",
                        kebijakan: "Kebijakan",
                        unit_terkait: "Unit kerja terkait",
                        dokumen_terkait: "Dokumen terkait",
                        prosedur: "Uraian tugas / prosedur",
                      }[aiSuggestion.section]
                    }
                  </p>
                  <p className="text-[10px] font-semibold text-amber-700">Tinjau dan validasi sebelum ditetapkan.</p>
                </div>
                {aiSuggestion.section === "prosedur" ? (
                  <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    {aiSuggestion.value.map((stage, stageIndex) => (
                      <div key={`${stage.tahap}-${stageIndex}`}>
                        <p className="font-bold">{stage.tahap || `Tahap ${stageIndex + 1}`}</p>
                        <ol className="ml-5 mt-1 list-decimal space-y-1">
                          {stage.langkah.map((step, stepIndex) => <li key={`${step}-${stepIndex}`}>{cleanStepNumber(step)}</li>)}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{aiSuggestion.value}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={applySectionSuggestion}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800"
                  >
                    <Pencil size={14} /> Terapkan ke tabel
                  </button>
                  <button
                    type="button"
                    onClick={generateSectionSuggestion}
                    disabled={isAiGenerating}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Buat ulang
                  </button>
                  <button type="button" onClick={() => setAiSuggestion(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                    Abaikan
                  </button>
                </div>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-slate-500">
              Isi AI adalah draf, bukan kebijakan resmi. Periksa kesesuaian dengan aturan, formulir, unit, dan prosedur klinis yang berlaku sebelum menyimpan atau menggunakan.
            </p>
          </section>

          <div
            aria-disabled={!isEditing}
            className={`rounded-2xl border border-slate-200 bg-slate-50 p-3 ${isEditing ? "" : "pointer-events-none opacity-50"}`}
          >
            <div className="mb-3 grid gap-3 border-b border-slate-200 pb-3 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] font-bold text-slate-600">
                <span>Tanggal pembuatan</span>
                <input
                  type="date"
                  value={dateValues.tanggal_pembuatan}
                  disabled={!isEditing}
                  onChange={(event) => updateDateField("tanggal_pembuatan", event.target.value)}
                  className="block h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:bg-slate-100"
                />
              </label>
              <label className="space-y-1 text-[11px] font-bold text-slate-600">
                <span>Tanggal pengesahan</span>
                <input
                  type="date"
                  value={dateValues.tanggal_pengesahan}
                  disabled={!isEditing}
                  onChange={(event) => updateDateField("tanggal_pengesahan", event.target.value)}
                  className="block h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:bg-slate-100"
                />
              </label>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
              <select
                aria-label="Jenis huruf"
                value={fontFamily}
                onPointerDown={saveEditorSelection}
                onMouseDown={saveEditorSelection}
                onChange={(event) => {
                  const selectedFont = event.target.value;
                  if (applyInlineStyle({ fontFamily: `"${selectedFont}"` })) {
                    setFontFamily(selectedFont);
                  }
                }}
                className="h-9 max-w-48 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                {["Times New Roman", "Bookman Old Style", "Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Verdana"].map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
              <select
                aria-label="Ukuran huruf"
                value={fontSize}
                onPointerDown={saveEditorSelection}
                onMouseDown={saveEditorSelection}
                onChange={(event) => {
                  const selectedSize = event.target.value;
                  if (applyInlineStyle({ fontSize: `${selectedSize}pt` })) {
                    setFontSize(selectedSize);
                  }
                }}
                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                {["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "36"].map((size) => (
                  <option key={size} value={size}>{size} pt</option>
                ))}
              </select>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600">
                Warna
                <input
                  aria-label="Warna teks"
                  type="color"
                  defaultValue="#000000"
                  onMouseDown={saveEditorSelection}
                  onChange={(event) => {
                    restoreEditorSelection();
                    document.execCommand("foreColor", false, event.target.value);
                    saveEditorSelection();
                  }}
                  className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600">
                Sorot
                <input
                  aria-label="Warna sorotan teks"
                  type="color"
                  value={highlightColor}
                  onMouseDown={saveEditorSelection}
                  onChange={(event) => setHighlightColor(event.target.value)}
                  className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
              <span className="mx-1 hidden h-7 border-l border-slate-300 sm:block" />
              <EditorToolButton label="Tebal" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("bold")}><Bold size={16} /></EditorToolButton>
              <EditorToolButton label="Miring" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("italic")}><Italic size={16} /></EditorToolButton>
              <EditorToolButton label="Garis bawah" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("underline")}><Underline size={16} /></EditorToolButton>
              <EditorToolButton label="Coret" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("strikeThrough")}><Strikethrough size={16} /></EditorToolButton>
              <EditorToolButton label="Sorot teks" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => applyInlineStyle({ backgroundColor: highlightColor })}><Highlighter size={16} /></EditorToolButton>
              <EditorToolButton label="Hapus format" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("removeFormat")}>Tx</EditorToolButton>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="pr-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Papan klip</span>
              <EditorToolButton label="Potong" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => handleClipboard("cut")}><Scissors size={16} /></EditorToolButton>
              <EditorToolButton label="Salin" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => handleClipboard("copy")}><Copy size={16} /></EditorToolButton>
              <EditorToolButton label="Tempel teks" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => handleClipboard("paste")}><ClipboardPaste size={16} /></EditorToolButton>
              <EditorToolButton label="Urungkan" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => restoreEditorHistory("undo")}><Undo2 size={16} /></EditorToolButton>
              <EditorToolButton label="Ulangi" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => restoreEditorHistory("redo")}><Redo2 size={16} /></EditorToolButton>
              <span className="mx-1 hidden h-7 border-l border-slate-300 sm:block" />
              <span className="pr-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Paragraf</span>
              <EditorToolButton label="Rata kiri" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("justifyLeft")}><AlignLeft size={16} /></EditorToolButton>
              <EditorToolButton label="Rata tengah" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("justifyCenter")}><AlignCenter size={16} /></EditorToolButton>
              <EditorToolButton label="Rata kanan" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("justifyRight")}><AlignRight size={16} /></EditorToolButton>
              <EditorToolButton label="Rata kiri-kanan" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("justifyFull")}><AlignJustify size={16} /></EditorToolButton>
              <EditorToolButton label="Daftar bernomor" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => applyListCommand("ol")}><ListOrdered size={16} /></EditorToolButton>
              <EditorToolButton label="Daftar berpoin" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => applyListCommand("ul")}><List size={16} /></EditorToolButton>
              <select
                aria-label="Format penomoran"
                value={orderedListType}
                onMouseDown={saveEditorSelection}
                onChange={(event) => {
                  setOrderedListType(event.target.value);
                  const selection = restoreEditorSelection();
                  const activeNode = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
                    ? selection.anchorNode
                    : selection?.anchorNode?.parentElement;
                  const list = activeNode?.closest("ol");
                  if (list && editorRef.current.contains(list)) {
                    configureListElement(list, "ol", event.target.value);
                  }
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="1">1, 2, 3</option>
                <option value="a">a, b, c</option>
                <option value="A">A, B, C</option>
                <option value="i">i, ii, iii</option>
                <option value="I">I, II, III</option>
              </select>
              <EditorToolButton label="Kurangi indentasi" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("outdent")}><IndentDecrease size={16} /></EditorToolButton>
              <EditorToolButton label="Tambah indentasi" onMouseDown={(event) => { event.preventDefault(); saveEditorSelection(); }} onClick={() => runEditorCommand("indent")}><IndentIncrease size={16} /></EditorToolButton>
              <select
                aria-label="Gaya paragraf"
                defaultValue="P"
                onMouseDown={saveEditorSelection}
                onChange={(event) => runEditorCommand("formatBlock", event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="P">Paragraf</option>
                <option value="H1">Judul 1</option>
                <option value="H2">Judul 2</option>
                <option value="H3">Judul 3</option>
              </select>
              <label className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600">
                Spasi
                <select
                  aria-label="Spasi baris"
                  defaultValue="1"
                  onMouseDown={saveEditorSelection}
                  onChange={(event) => applyLineSpacing(event.target.value)}
                  className="max-w-16 bg-transparent text-xs text-slate-700 outline-none"
                >
                  <option value="1">1.0</option>
                  <option value="1.15">1.15</option>
                  <option value="1.5">1.5</option>
                  <option value="2">2.0</option>
                </select>
              </label>
              <span className="mx-1 hidden h-7 border-l border-slate-300 sm:block" />
              <button
                type="button"
                onClick={addProcedureStage}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                <Plus size={14} /> Tambah tahap
              </button>
              <button
                type="button"
                onClick={addProcedureStep}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                <Plus size={14} /> Tambah langkah
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-3 sm:p-6">
            <div className="mx-auto mb-2 min-w-[720px] max-w-[900px] px-5">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <Ruler size={13} /> Penggaris (cm) — seret penanda untuk mengatur indentasi paragraf terpilih
              </div>
              <div
                ref={rulerRef}
                onPointerMove={handleRulerPointerMove}
                onPointerUp={handleRulerPointerUp}
                onPointerCancel={handleRulerPointerUp}
                className="relative h-9 touch-none select-none border-x border-b border-slate-300 bg-white"
                aria-label="Penggaris horizontal"
              >
                <div className="absolute inset-x-0 top-0 h-5" style={{ backgroundImage: "repeating-linear-gradient(to right, transparent 0, transparent calc(5.5556% - 1px), #94a3b8 calc(5.5556% - 1px), #94a3b8 5.5556%)" }} />
                <div className="absolute inset-x-0 bottom-0 flex justify-between px-0.5 text-[9px] text-slate-500">
                  {Array.from({ length: 10 }, (_, index) => <span key={index}>{index * 2}</span>)}
                </div>
                <button
                  type="button"
                  title="Indentasi kiri"
                  aria-label="Geser indentasi kiri"
                  onPointerDown={(event) => handleRulerPointerDown("left", event)}
                  className="absolute top-0 z-10 h-0 w-0 cursor-ew-resize border-x-[7px] border-t-[11px] border-x-transparent border-t-blue-600"
                  style={{ left: `${(rulerIndent.left / 18) * 100}%` }}
                />
                <button
                  type="button"
                  title="Indentasi baris pertama"
                  aria-label="Geser indentasi baris pertama"
                  onPointerDown={(event) => handleRulerPointerDown("firstLine", event)}
                  className="absolute top-2 z-10 h-0 w-0 cursor-ew-resize border-x-[7px] border-b-[11px] border-x-transparent border-b-amber-500"
                  style={{ left: `${(rulerIndent.firstLine / 18) * 100}%` }}
                />
              </div>
            </div>
            <div
              ref={editorRef}
              contentEditable={isEditing}
              suppressContentEditableWarning
              onInput={() => {
                saveEditorSelection();
                recordEditorChange();
              }}
              onPaste={handleEditorPaste}
              onKeyDown={(event) => {
                if (!(event.ctrlKey || event.metaKey)) return;
                const key = event.key.toLowerCase();
                if (key === "z") {
                  event.preventDefault();
                  restoreEditorHistory(event.shiftKey ? "redo" : "undo");
                } else if (key === "y") {
                  event.preventDefault();
                  restoreEditorHistory("redo");
                }
              }}
              onKeyUp={saveEditorSelection}
              onMouseUp={saveEditorSelection}
              dangerouslySetInnerHTML={{ __html: editorHtml }}
              aria-label="Editor dokumen SPO"
              className="mx-auto min-h-[500px] min-w-[720px] max-w-[900px] bg-white p-5 text-black shadow-md outline-none focus:ring-2 focus:ring-blue-200 [&_table]:border [&_table]:border-black [&_td]:outline-none [&_td:focus]:bg-blue-50"
              style={{ fontFamily: '"Times New Roman",serif', fontSize: "12pt", lineHeight: 1 }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Pilih teks lalu gunakan toolbar. Pintasan keyboard dan tempel teks kaya dari Word juga didukung.
            Semua pemformatan pada preview ikut diekspor ke DOCX. Nomor halaman ditambahkan otomatis di bawah setiap halaman, rata tengah, Bookman Old Style 10 pt.
          </p>
        </div>
        </div>
      </section>
    </div>
  );
}
