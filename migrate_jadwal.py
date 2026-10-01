from __future__ import annotations

import base64
import os
import re
import time as time_module
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pandas as pd
import requests
from dotenv import load_dotenv

session = requests.Session()

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent if SCRIPT_DIR.name.lower() == "scripts" else SCRIPT_DIR
ENV_FILE = ROOT / ".env"
CSV_FILE = ROOT / "JADWAL DOKTER RAJAL.csv"
JAKARTA_TZ = timezone(timedelta(hours=7))
REQUEST_TIMEOUT = 30
TURSO_ENDPOINT = ""
TURSO_AUTH_TOKEN = ""

MONTHS = {
    "JANUARI": 1, "FEBRUARI": 2, "MARET": 3, "APRIL": 4,
    "MEI": 5, "JUNI": 6, "JULI": 7, "AGUSTUS": 8,
    "SEPTEMBER": 9, "OKTOBER": 10, "NOVEMBER": 11, "DESEMBER": 12,
}
WEEKDAYS_ID = {
    0: "SENIN", 1: "SELASA", 2: "RABU", 3: "KAMIS",
    4: "JUMAT", 5: "SABTU", 6: "MINGGU",
}
ALIAS_NAMA = {
    "andrif": "afriliandryf",
}


def configure_turso(database_url: str, auth_token: str) -> None:
    global TURSO_ENDPOINT, TURSO_AUTH_TOKEN
    url = database_url.strip()
    if url.startswith("libsql://"):
        url = url.replace("libsql://", "https://", 1)
    elif not url.startswith(("https://", "http://")):
        url = f"https://{url}"

    parsed = urlsplit(url)
    if not parsed.netloc:
        raise ValueError("TURSO_DATABASE_URL tidak valid.")
    path = parsed.path.rstrip("/")
    if not path.endswith("/v2/pipeline"):
        path = f"{path}/v2/pipeline" if path else "/v2/pipeline"
    TURSO_ENDPOINT = urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))
    TURSO_AUTH_TOKEN = auth_token.strip()


def encode_value(value: object) -> dict[str, object]:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, bytes):
        return {"type": "blob", "base64": base64.b64encode(value).decode("ascii")}
    return {"type": "text", "value": str(value)}


def decode_value(value: dict[str, object]) -> object:
    kind = value.get("type")
    if kind == "null":
        return None
    if kind == "integer":
        return int(value["value"])
    if kind == "float":
        return float(value["value"])
    if kind == "blob":
        return base64.b64decode(value.get("base64", ""))
    return value.get("value")


def execute_turso_query(
    sql: str,
    args: list[object] | tuple[object, ...] | None = None,
) -> dict[str, object]:
    if not TURSO_ENDPOINT or not TURSO_AUTH_TOKEN:
        raise RuntimeError("Koneksi Turso belum dikonfigurasi.")

    statement: dict[str, object] = {"sql": sql}
    if args:
        statement["args"] = [encode_value(value) for value in args]
    payload = {"requests": [
        {"type": "execute", "stmt": statement},
        {"type": "close"},
    ]}
    time_module.sleep(0.3)
    response = session.post(
        TURSO_ENDPOINT,
        headers={
            "Authorization": f"Bearer {TURSO_AUTH_TOKEN}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    if not response.ok:
        raise RuntimeError(f"Turso HTTP {response.status_code}: {response.text[:1000]}")

    body = response.json()
    results = body.get("results", [])
    if not results:
        raise RuntimeError("Respons Turso tidak berisi hasil query.")
    first = results[0]
    if first.get("type") == "error":
        error = first.get("error", {})
        raise RuntimeError(error.get("message", str(error)))

    result = first.get("response", {}).get("result", {})
    columns = [column.get("name", "") for column in result.get("cols", [])]
    rows = []
    for raw_row in result.get("rows", []):
        rows.append({
            name: decode_value(raw_row[index])
            for index, name in enumerate(columns)
            if index < len(raw_row)
        })
    return {
        "rows": rows,
        "affected_row_count": result.get("affected_row_count", 0),
        "last_insert_rowid": result.get("last_insert_rowid"),
    }


def clean_cell(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def normalize_label(value: object) -> str:
    return re.sub(r"\s+", " ", clean_cell(value)).strip().upper()


def clean_doctor_name(value: object) -> str:
    name = clean_cell(value).lower()
    name = re.sub(r"\b(?:drg|dr|sp)\.?\s*", " ", name, flags=re.IGNORECASE)
    name = re.sub(r"[^a-z0-9]+", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def normalize_doctor_name(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean_doctor_name(value))


def normalize_schedule_time(value: object) -> str | None:
    text = clean_cell(value).lower()
    if not text:
        return None
    if any(character.isalpha() for character in text):
        return None
    if any(term in text for term in ("tutup", "on call", "tidak", "tidak datang")):
        return None

    text = text.replace(".", ":")
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
    if not match:
        return None
    hour, minute = map(int, match.groups())
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def parse_time(value: object) -> time | None:
    normalized = normalize_schedule_time(value)
    if not normalized:
        return None
    hour, minute = map(int, normalized.split(":"))
    return time(hour, minute)


def parse_date_header(value: object) -> date | None:
    match = re.search(
        r"\b(\d{1,2})\s+([A-Z]+)\s+(\d{4})\b",
        normalize_label(value),
    )
    if not match:
        return None
    day, month_name, year = match.groups()
    month = MONTHS.get(month_name)
    if not month:
        return None
    try:
        return date(int(year), month, int(day))
    except ValueError:
        return None


def ensure_schema() -> None:
    execute_turso_query(
        """CREATE TABLE IF NOT EXISTS indikator_mutu_praktik (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dokter_id INTEGER NOT NULL,
            tanggal TEXT NOT NULL,
            ruangan TEXT NOT NULL DEFAULT 'POLIKLINIK',
            jam_praktik TEXT NOT NULL DEFAULT '',
            jam_mulai_aktual TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (dokter_id, tanggal)
        )"""
    )
    info = execute_turso_query("PRAGMA table_info('indikator_mutu_praktik')")
    columns = {str(row.get("name", "")) for row in info["rows"]}
    if "jam_praktik" not in columns:
        execute_turso_query(
            "ALTER TABLE indikator_mutu_praktik "
            "ADD COLUMN jam_praktik TEXT NOT NULL DEFAULT ''"
        )
    execute_turso_query(
        """CREATE UNIQUE INDEX IF NOT EXISTS idx_indikator_mutu_praktik_dokter_tanggal
           ON indikator_mutu_praktik (dokter_id, tanggal)"""
    )


def lookup_doctors(name: str) -> list[dict[str, object]]:
    clean_name = clean_doctor_name(name)
    if not clean_name:
        return []
    alias_key = normalize_doctor_name(clean_name)
    query_name = ALIAS_NAMA.get(alias_key, clean_name)
    result = execute_turso_query(
        """SELECT id, nama_dokter, ruangan, jadwal_hari, jam_praktik
           FROM master_dokter
           WHERE LOWER(nama_dokter) LIKE ?""",
        [f"%{query_name}%"],
    )
    candidates = result["rows"]
    if candidates:
        return candidates

    target_first_name = query_name.split()[0]
    all_doctors = execute_turso_query(
        """SELECT id, nama_dokter, ruangan, jadwal_hari, jam_praktik
           FROM master_dokter
           WHERE nama_dokter IS NOT NULL AND TRIM(nama_dokter) <> ''"""
    )["rows"]
    scored_candidates = []
    for doctor in all_doctors:
        doctor_name = clean_doctor_name(doctor.get("nama_dokter"))
        first_name = doctor_name.split()[0] if doctor_name else ""
        score = SequenceMatcher(None, target_first_name, first_name).ratio()
        if score >= 0.82:
            scored_candidates.append((score, doctor))

    if not scored_candidates:
        return []

    best_score = max(score for score, _ in scored_candidates)
    return [
        doctor for score, doctor in scored_candidates
        if score >= max(0.82, best_score - 0.05)
    ]


def choose_doctor(
    candidates: list[dict[str, object]],
    practice_date: date,
    scheduled_time: str,
) -> dict[str, object] | None:
    if not candidates:
        return None
    weekday = WEEKDAYS_ID[practice_date.weekday()]
    matches = [
        doctor for doctor in candidates
        if normalize_label(doctor.get("jadwal_hari")) == weekday
    ]
    if matches:
        candidates = matches
    matches = [
        doctor for doctor in candidates
        if normalize_schedule_time(doctor.get("jam_praktik")) == scheduled_time
    ]
    if matches:
        candidates = matches
    return candidates[0]


def migrate_csv(csv_path: Path) -> tuple[int, int]:
    if not csv_path.is_file():
        raise FileNotFoundError(f"File CSV tidak ditemukan: {csv_path}")
    frame = pd.read_csv(
        csv_path,
        header=None,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        on_bad_lines="warn",
    )
    header_rows = [
        row for row in range(len(frame))
        if frame.shape[1] and normalize_label(frame.iat[row, 0]) == "NAMA DOKTER"
    ]
    if not header_rows:
        raise ValueError("Header 'NAMA DOKTER' tidak ditemukan pada CSV.")

    insert_sql = """INSERT INTO indikator_mutu_praktik
        (dokter_id, tanggal, ruangan, jam_praktik, jam_mulai_aktual)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(dokter_id, tanggal) DO UPDATE SET
            ruangan = excluded.ruangan,
            jam_praktik = excluded.jam_praktik,
            jam_mulai_aktual = excluded.jam_mulai_aktual"""
    doctor_cache: dict[str, list[dict[str, object]]] = {}
    imported = 0
    skipped = 0

    for section, header_row in enumerate(header_rows):
        if header_row == 0:
            print(f"[SKIP] Tidak ada baris tanggal sebelum header baris {header_row + 1}.")
            skipped += 1
            continue
        next_header = header_rows[section + 1] if section + 1 < len(header_rows) else len(frame)
        date_row = frame.iloc[header_row - 1]
        title_row = frame.iloc[header_row]
        date_columns: list[tuple[int, int, date | None]] = []
        active_date = None

        for column in range(1, frame.shape[1]):
            header_date = parse_date_header(date_row.iloc[column])
            if header_date:
                active_date = header_date
            if normalize_label(title_row.iloc[column]) != "JADWAL":
                continue
            arrival_column = column + 1
            if (
                arrival_column >= frame.shape[1]
                or normalize_label(title_row.iloc[arrival_column]) != "JAM KEDATANGAN"
            ):
                print(f"[ERROR] Sub-header JAM KEDATANGAN tidak valid di kolom {column + 1}.")
                skipped += 1
                continue
            date_columns.append((column, arrival_column, header_date or active_date))

        for row in range(header_row + 1, next_header):
            doctor_name = clean_cell(frame.iat[row, 0])
            if not doctor_name:
                continue
            for schedule_col, arrival_col, practice_date in date_columns:
                raw_schedule = clean_cell(frame.iat[row, schedule_col])
                raw_arrival = clean_cell(frame.iat[row, arrival_col])
                date_label = (
                    practice_date.isoformat()
                    if practice_date is not None
                    else "tanggal tidak valid"
                )
                print(f"Memproses {doctor_name} ({date_label})...")
                if not raw_schedule and not raw_arrival:
                    continue

                schedule = normalize_schedule_time(raw_schedule)
                arrival = normalize_schedule_time(raw_arrival)
                if schedule is None or arrival is None:
                    continue
                if practice_date is None:
                    print(f"[ERROR] Tanggal tidak valid pada baris {row + 1}; dilewati.")
                    skipped += 1
                    continue

                name_key = normalize_doctor_name(doctor_name)
                try:
                    if name_key not in doctor_cache:
                        doctor_cache[name_key] = lookup_doctors(doctor_name)
                    doctor = choose_doctor(
                        doctor_cache[name_key], practice_date, schedule
                    )
                except Exception as error:
                    print(f"[ERROR] SELECT dokter gagal untuk {doctor_name!r}: {error}")
                    skipped += 1
                    continue
                if doctor is None:
                    print(f"[ERROR] Nama dokter tidak ditemukan: {doctor_name!r}; dilewati.")
                    skipped += 1
                    continue

                actual_time = datetime.strptime(arrival, "%H:%M").time()
                timestamp = datetime.combine(
                    practice_date, actual_time, tzinfo=JAKARTA_TZ
                ).isoformat(timespec="seconds")
                room = clean_cell(doctor.get("ruangan")) or "POLIKLINIK"
                try:
                    execute_turso_query(
                        insert_sql,
                        [
                            int(doctor["id"]),
                            practice_date.isoformat(),
                            room.upper(),
                            schedule,
                            timestamp,
                        ],
                    )
                    imported += 1
                except Exception as error:
                    print(
                        f"[ERROR] INSERT gagal untuk {doctor_name!r} "
                        f"pada {practice_date.isoformat()}: {error}"
                    )
                    skipped += 1

    return imported, skipped


def main() -> int:
    load_dotenv(ENV_FILE)
    if not os.getenv("TURSO_DATABASE_URL") or not os.getenv("TURSO_AUTH_TOKEN"):
        load_dotenv(ROOT / ".env.local", override=False)
    database_url = os.getenv("TURSO_DATABASE_URL")
    auth_token = os.getenv("TURSO_AUTH_TOKEN")
    if not database_url or not auth_token:
        print(f"[FATAL] TURSO_DATABASE_URL/TURSO_AUTH_TOKEN tidak ditemukan di {ENV_FILE}")
        return 1

    try:
        configure_turso(database_url, auth_token)
        ensure_schema()
        imported, skipped = migrate_csv(CSV_FILE)
        print(f"\nMigrasi selesai. Berhasil: {imported}; dilewati/gagal: {skipped}.")
        return 0
    except Exception as error:
        print(f"[FATAL] Migrasi gagal: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
