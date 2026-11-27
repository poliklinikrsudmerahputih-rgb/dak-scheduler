# Metmor (Meeting Morning)

The Metmor workspace is available at `/metmor` for authenticated users. Entries are scoped to the room in the user's session and include a meeting date and information text. The latest 200 entries can be edited or deleted from the workspace.

The public schedule at `/view-jadwal` automatically displays Metmor entries matching its selected date and room. Each saved entry also has an opaque, unguessable share link at `/shared/metmor?token=...` that can be copied into e-Kinerja. The shared page only exposes that individual entry.

## Database setup

Apply [`../scripts/migrations/create_metmor.sql`](../scripts/migrations/create_metmor.sql) to a Turso database before using the workspace. It creates the `metmor` table and the room/date index. The configured project database has this migration applied.

The configured project database contains 179 historical text entries from the 2026 Meeting Morning Word document, dated January 1 through September 30. Nine rows with date ranges or malformed dates and one row with no information were excluded; embedded photos were not imported. The imported entries are available to the public schedule and their per-entry share links. Do not publish sensitive personal or patient information in Metmor notes.
