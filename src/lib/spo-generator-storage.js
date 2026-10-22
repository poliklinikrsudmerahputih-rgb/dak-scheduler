import { randomUUID } from "node:crypto";
import { turso } from "@/lib/turso";

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
    }).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function saveGeneratedSop({ ruangan, sourceType, data }) {
  await ensureSpoGeneratorStorage();
  const id = randomUUID();
  await turso.execute({
    sql: `INSERT INTO spo_generator_documents
          (id, ruangan, no_sop, judul_sop, source_type, content_json, html_content)
          VALUES (?, ?, ?, ?, ?, ?, '')`,
    args: [
      id,
      ruangan,
      data.no_sop || "",
      data.judul_sop || "SPO tanpa judul",
      sourceType,
      JSON.stringify(data),
    ],
  });
  return id;
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
