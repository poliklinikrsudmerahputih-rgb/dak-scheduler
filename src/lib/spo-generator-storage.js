import { randomUUID } from "node:crypto";
import { turso } from "@/lib/turso";
import { daftarKlinikArsipSop } from "@/lib/sop-constants";

let schemaReady;

export async function ensureSpoGeneratorStorage() {
  if (!schemaReady) {
    schemaReady = turso.execute(`
      CREATE TABLE IF NOT EXISTS spo_generator_documents (
        id TEXT PRIMARY KEY,
        ruangan TEXT NOT NULL,
        no_sop TEXT NOT NULL DEFAULT '',
        judul_sop TEXT NOT NULL,
        source_type TEXT NOT NULL,
        content_json TEXT NOT NULL,
        html_content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(async () => {
      const columns = await turso.execute("PRAGMA table_info('spo_generator_documents')");
      if (!(columns.rows || []).some((column) => String(column.name) === "html_content")) {
        await turso.execute(`
          ALTER TABLE spo_generator_documents
          ADD COLUMN html_content TEXT NOT NULL DEFAULT ''
        `);
      }
      await turso.execute(`
        CREATE INDEX IF NOT EXISTS idx_spo_generator_documents_ruangan_created
        ON spo_generator_documents (ruangan, created_at DESC)
      `);
      await turso.execute(`
        CREATE TABLE IF NOT EXISTS spo_generator_sop_links (
          archive_id TEXT PRIMARY KEY,
          ruangan TEXT NOT NULL,
          sop_id INTEGER NOT NULL
        )
      `);
    }).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function getNextSopNumber(rows) {
  const lastSequence = (rows || []).reduce((max, row) => {
    const match = String(row.no_sop || "").trim().match(/^IRJA\/(?:[A-Z]{3}\/)?(\d+)\/\d{4}$/i);
    if (!match) return max;
    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  const year = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).format(new Date());
  return `IRJA/${String(lastSequence + 1).padStart(3, "0")}/${year}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function replaceTableCell(html, label, value) {
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(html).replace(
    new RegExp(`(<td\\b[^>]*>\\s*${safeLabel}\\s*<\\/td>\\s*<td\\b[^>]*>)[\\s\\S]*?(<\\/td>)`, "i"),
    `$1${escapeHtml(value)}$2`
  );
}

export async function saveSopArchive(options) {
  const {
    id: requestedId,
    ruangan,
    no_sop = "",
    judul_sop,
    source_type,
    data,
    html_content = "",
    klinik = daftarKlinikArsipSop[0],
  } = options;
  const id = requestedId || randomUUID();
  await ensureSpoGeneratorStorage();
  const title = String(judul_sop || "").trim();
  if (!title) throw new Error("Judul SPO wajib diisi sebelum diarsipkan.");
  const department = String(ruangan || "").trim().toUpperCase();
  const clinic = daftarKlinikArsipSop.includes(klinik) ? klinik : daftarKlinikArsipSop[0];
  const columnsResult = await turso.execute("PRAGMA table_info('sop')");
  const sopColumns = new Set((columnsResult.rows || []).map((column) => String(column.name)));
  const transaction = await turso.transaction("write");

  try {
    const archived = await transaction.execute({
      sql: `SELECT no_sop, judul_sop, source_type FROM spo_generator_documents
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [id, department],
    });
    const existingArchive = archived.rows?.[0];
    if (!existingArchive && requestedId) {
      throw new Error("Arsip SPO tidak ditemukan di ruangan Anda.");
    }

    const existingNumbers = await transaction.execute({
      sql: `SELECT id, no_sop, judul_prosedur, link_gdrive FROM sop
            WHERE UPPER(TRIM(ruangan)) = ?`,
      args: [department],
    });
    const linked = await transaction.execute({
      sql: `SELECT sop_id FROM spo_generator_sop_links
            WHERE archive_id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [id, department],
    });
    const linkedRegistry = linked.rows?.[0]
      ? existingNumbers.rows.find((row) => String(row.id) === String(linked.rows[0].sop_id))
      : null;
    const previousNumber = String(existingArchive?.no_sop || "").trim();
    const previousTitle = String(existingArchive?.judul_sop || "").trim();
    const ownRegistry = linkedRegistry || (previousNumber
      ? existingNumbers.rows.find((row) => (
          String(row.no_sop || "").trim().toUpperCase() === previousNumber.toUpperCase()
          && String(row.judul_prosedur || "").trim().toLocaleLowerCase("id-ID")
            === previousTitle.toLocaleLowerCase("id-ID")
        ))
      : null);
    let assignedNumber = String(no_sop || "").trim() || previousNumber;
    let matchingRegistry = assignedNumber
      ? existingNumbers.rows.find((row) => String(row.no_sop || "").trim().toUpperCase() === assignedNumber.toUpperCase())
      : null;

    if (!assignedNumber) {
      assignedNumber = getNextSopNumber(existingNumbers.rows);
      matchingRegistry = ownRegistry || null;
    } else if (matchingRegistry && matchingRegistry.id !== ownRegistry?.id
      && String(matchingRegistry.judul_prosedur || "").trim().toLocaleLowerCase("id-ID")
        !== title.toLocaleLowerCase("id-ID")) {
      assignedNumber = getNextSopNumber(existingNumbers.rows);
      matchingRegistry = ownRegistry || null;
    } else if (!matchingRegistry && ownRegistry) {
      matchingRegistry = ownRegistry;
    }

    const registryId = matchingRegistry?.id;
    if (registryId !== undefined) {
      const assignments = ["no_sop = ?", "judul_prosedur = ?"];
      const values = [assignedNumber, title];
      if (sopColumns.has("updated_at")) assignments.push("updated_at = CURRENT_TIMESTAMP");
      if (sopColumns.has("klinik")) {
        assignments.push("klinik = ?");
        values.push(clinic);
      }
      if (sopColumns.has("tanggal_pembuatan") && data?.tanggal_pembuatan) {
        assignments.push("tanggal_pembuatan = NULLIF(?, '')");
        values.push(String(data.tanggal_pembuatan));
      }
      if (sopColumns.has("tanggal_pengesahan") && data?.tanggal_pengesahan) {
        assignments.push("tanggal_pengesahan = NULLIF(?, '')");
        values.push(String(data.tanggal_pengesahan));
      }
      values.push(registryId, department);
      await transaction.execute({
        sql: `UPDATE sop SET ${assignments.join(", ")}
              WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
        args: values,
      });
    } else {
      const insertColumns = ["no_sop", "judul_prosedur", "link_gdrive", "ruangan"];
      const insertValues = [assignedNumber, title, "", department];
      for (const [column, value] of [
        ["klinik", clinic],
        ["tanggal_pembuatan", String(data?.tanggal_pembuatan || "") || null],
        ["tanggal_pengesahan", String(data?.tanggal_pengesahan || "") || null],
      ]) {
        if (sopColumns.has(column)) {
          insertColumns.push(column);
          insertValues.push(value);
        }
      }
      await transaction.execute({
        sql: `INSERT INTO sop (${insertColumns.join(", ")})
              VALUES (${insertColumns.map(() => "?").join(", ")})`,
        args: insertValues,
      });
    }

    const savedData = { ...(data && typeof data === "object" ? data : {}), no_sop: assignedNumber };
    const savedHtml = replaceTableCell(
      replaceTableCell(html_content, "No. SOP", assignedNumber),
      "Nama SOP",
      title
    );
    if (existingArchive) {
      await transaction.execute({
        sql: `UPDATE spo_generator_documents
              SET no_sop = ?, judul_sop = ?, source_type = ?, content_json = ?, html_content = ?
              WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
        args: [
          assignedNumber,
          title,
          source_type || existingArchive.source_type,
          JSON.stringify(savedData),
          savedHtml,
          id,
          department,
        ],
      });
    } else {
      await transaction.execute({
        sql: `INSERT INTO spo_generator_documents
              (id, ruangan, no_sop, judul_sop, source_type, content_json, html_content)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          department,
          assignedNumber,
          title,
          source_type || "manual",
          JSON.stringify(savedData),
          savedHtml,
        ],
      });
    }

    await transaction.execute({
      sql: `INSERT INTO spo_generator_sop_links (archive_id, ruangan, sop_id)
            VALUES (?, ?, ?)
            ON CONFLICT(archive_id) DO UPDATE SET
              ruangan = excluded.ruangan,
              sop_id = excluded.sop_id`,
      args: [id, department, registryId ?? (await transaction.execute({
        sql: `SELECT id FROM sop
              WHERE UPPER(TRIM(ruangan)) = ? AND UPPER(TRIM(no_sop)) = UPPER(TRIM(?))
              LIMIT 1`,
        args: [department, assignedNumber],
      })).rows?.[0]?.id],
    });

    await transaction.commit();
    return { id, no_sop: assignedNumber, data: savedData };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function saveGeneratedSop({ ruangan, sourceType, data, klinik }) {
  return saveSopArchive({
    ruangan,
    no_sop: data.no_sop || "",
    judul_sop: data.judul_sop || "SPO tanpa judul",
    source_type: sourceType,
    data,
    klinik,
  });
}

export async function syncArchivedSopDocuments(ruangan) {
  await ensureSpoGeneratorStorage();
  const result = await turso.execute({
    sql: `SELECT id, no_sop, judul_sop, source_type, content_json, html_content
          FROM spo_generator_documents
          WHERE UPPER(TRIM(ruangan)) = ?
          ORDER BY created_at DESC
          LIMIT 100`,
    args: [ruangan],
  });

  for (const row of result.rows || []) {
    const linked = await turso.execute({
      sql: `SELECT s.id, s.no_sop, s.judul_prosedur
            FROM spo_generator_sop_links l
            JOIN sop s ON s.id = l.sop_id AND UPPER(TRIM(s.ruangan)) = UPPER(TRIM(l.ruangan))
            WHERE l.archive_id = ? AND UPPER(TRIM(l.ruangan)) = ?`,
      args: [String(row.id), ruangan],
    });
    const content = JSON.parse(String(row.content_json));
    const data = content && typeof content === "object" && "data" in content
      ? content.data
      : content;
    if (linked.rows?.[0]) {
      const registry = linked.rows[0];
      const syncedData = {
        ...(data && typeof data === "object" ? data : {}),
        no_sop: String(registry.no_sop || ""),
        judul_sop: String(registry.judul_prosedur || ""),
      };
      const html_content = replaceTableCell(
        replaceTableCell(String(row.html_content || ""), "No. SOP", syncedData.no_sop),
        "Nama SOP",
        syncedData.judul_sop
      );
      if (
        String(row.no_sop || "") === syncedData.no_sop
        && String(row.judul_sop || "") === syncedData.judul_sop
        && String(data?.no_sop || "") === syncedData.no_sop
        && String(data?.judul_sop || "") === syncedData.judul_sop
        && String(row.html_content || "") === html_content
      ) continue;
      await turso.execute({
        sql: `UPDATE spo_generator_documents
              SET no_sop = ?, judul_sop = ?, content_json = ?, html_content = ?
              WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
        args: [
          syncedData.no_sop,
          syncedData.judul_sop,
          JSON.stringify(syncedData),
          html_content,
          String(row.id),
          ruangan,
        ],
      });
      continue;
    }
    await saveSopArchive({
      id: String(row.id),
      ruangan,
      no_sop: String(row.no_sop || ""),
      judul_sop: String(row.judul_sop || ""),
      source_type: String(row.source_type || "manual"),
      data,
      html_content: String(row.html_content || ""),
    });
  }
}

export async function listSavedSopDocuments(ruangan) {
  await ensureSpoGeneratorStorage();
  const result = await turso.execute({
    sql: `SELECT id, no_sop, judul_sop, source_type, content_json, created_at
          FROM spo_generator_documents
          WHERE UPPER(TRIM(ruangan)) = ?
          ORDER BY created_at DESC
          LIMIT 100`,
    args: [ruangan],
  });
  return (result.rows || []).map((row) => {
    const content = JSON.parse(String(row.content_json));
    const data = content && typeof content === "object" && "data" in content
      ? content.data
      : content;
    return {
      id: String(row.id),
      no_sop: String(row.no_sop || ""),
      judul_sop: String(row.judul_sop || ""),
      source_type: String(row.source_type || ""),
      created_at: String(row.created_at || ""),
      data,
    };
  });
}

export async function getSavedSopDocument(id, ruangan) {
  await ensureSpoGeneratorStorage();
  const result = await turso.execute({
    sql: `SELECT id, no_sop, judul_sop, source_type, content_json, html_content, created_at
          FROM spo_generator_documents
          WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
    args: [id, ruangan],
  });
  const row = result.rows?.[0];
  if (!row) return null;
  const content = JSON.parse(String(row.content_json));
  return {
    id: String(row.id),
    no_sop: String(row.no_sop || ""),
    judul_sop: String(row.judul_sop || ""),
    source_type: String(row.source_type || ""),
    created_at: String(row.created_at || ""),
    data: content && typeof content === "object" && "data" in content ? content.data : content,
    html_content: String(row.html_content || (content?.html_content ?? "")),
  };
}
