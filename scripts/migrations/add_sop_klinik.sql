-- Apply once to existing SOP tables that do not yet have the clinic column.
ALTER TABLE sop ADD COLUMN klinik TEXT;
