from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar
from urllib.parse import urlparse

from flask import Flask, jsonify, request, send_from_directory, session
from cryptography.fernet import Fernet, InvalidToken
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("PROIT_DB_PATH", str(BASE_DIR / "proit_admin_data.db"))).expanduser()
SEED_SQL_PATH = BASE_DIR / "proit_admin_data.sql"
SERVER_SECRET_PATH = BASE_DIR / ".flask_secret_key"
DATA_KEY_PATH = BASE_DIR / ".data_encryption_key"
APPLICATION_RETENTION_DAYS = max(1, int(os.getenv("PROIT_APPLICATION_RETENTION_DAYS", "180")))
MAX_CONTENT_BYTES = 512 * 1024
MAX_PASSWORD_LENGTH = 256
F = TypeVar("F", bound=Callable[..., Any])


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_or_create_server_secret() -> str:
    env_secret = os.getenv("PROIT_FLASK_SECRET", "").strip()
    if env_secret:
        return env_secret
    if os.getenv("PROIT_ENV", "development").lower() == "production":
        raise RuntimeError("PROIT_FLASK_SECRET must be set in production")
    if SERVER_SECRET_PATH.exists():
        secret = SERVER_SECRET_PATH.read_text(encoding="utf-8").strip()
        if secret:
            return secret
    generated = secrets.token_urlsafe(64)
    SERVER_SECRET_PATH.write_text(generated, encoding="utf-8")
    return generated


def load_or_create_data_key() -> bytes:
    env_key = os.getenv("PROIT_DATA_ENCRYPTION_KEY", "").strip()
    if env_key:
        try:
            Fernet(env_key.encode("ascii"))
        except (ValueError, UnicodeEncodeError):
            raise RuntimeError("PROIT_DATA_ENCRYPTION_KEY must be a valid Fernet key")
        return env_key.encode("ascii")
    if os.getenv("PROIT_ENV", "development").lower() == "production":
        raise RuntimeError("PROIT_DATA_ENCRYPTION_KEY must be set in production")
    if DATA_KEY_PATH.exists():
        key = DATA_KEY_PATH.read_bytes().strip()
        if key:
            Fernet(key)
            return key
    key = Fernet.generate_key()
    DATA_KEY_PATH.write_bytes(key)
    return key


app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
https_only = os.getenv("PROIT_HTTPS_ONLY", "1" if os.getenv("PROIT_ENV") == "production" else "0") == "1"
app.config.update(
    SECRET_KEY=load_or_create_server_secret(),
    MAX_CONTENT_LENGTH=MAX_CONTENT_BYTES,
    SESSION_COOKIE_NAME="proit_admin_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=https_only,
    SESSION_COOKIE_SAMESITE=os.getenv("PROIT_SESSION_SAMESITE", "Lax"),
    SESSION_REFRESH_EACH_REQUEST=True,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)
DATA_CIPHER = Fernet(load_or_create_data_key())


def allowed_origins() -> set[str]:
    return {
        origin.strip().rstrip("/")
        for origin in os.getenv("PROIT_CORS_ORIGINS", "").split(",")
        if origin.strip()
    }


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def read_seed_content() -> dict[str, Any] | None:
    if not SEED_SQL_PATH.exists():
        return None
    try:
        with sqlite3.connect(":memory:") as seed_conn:
            seed_conn.executescript(SEED_SQL_PATH.read_text(encoding="utf-8"))
            row = seed_conn.execute(
                "SELECT content_json FROM site_content WHERE id = 1"
            ).fetchone()
        return json.loads(row[0]) if row else None
    except (OSError, sqlite3.Error, TypeError, json.JSONDecodeError):
        return None


def ensure_schema() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS site_content (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                content_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admin_credentials (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rate_limits (
                scope TEXT NOT NULL,
                key_hash TEXT NOT NULL,
                failures INTEGER NOT NULL DEFAULT 0,
                window_started INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (scope, key_hash)
            );

            CREATE TABLE IF NOT EXISTS applications (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                processed INTEGER NOT NULL DEFAULT 0,
                data_encrypted TEXT NOT NULL
            );
            """
        )

        existing_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(applications)").fetchall()
        }
        columns = {
            "data_encrypted": "TEXT NOT NULL DEFAULT ''",
            "created_at": "TEXT NOT NULL DEFAULT ''",
            "processed": "INTEGER NOT NULL DEFAULT 0",
            "source": "TEXT NOT NULL DEFAULT ''",
            "course_id": "TEXT NOT NULL DEFAULT ''",
            "course_title": "TEXT NOT NULL DEFAULT ''",
            "full_name": "TEXT NOT NULL DEFAULT ''",
            "phone": "TEXT NOT NULL DEFAULT ''",
            "format": "TEXT NOT NULL DEFAULT ''",
            "comment": "TEXT NOT NULL DEFAULT ''",
            "consent_policy_version": "TEXT NOT NULL DEFAULT ''",
            "consent_accepted_at": "TEXT NOT NULL DEFAULT ''",
        }
        for name, definition in columns.items():
            if name not in existing_columns:
                conn.execute(f"ALTER TABLE applications ADD COLUMN {name} {definition}")
                existing_columns.add(name)

        content_row = conn.execute("SELECT 1 FROM site_content WHERE id = 1").fetchone()
        if not content_row:
            seed = read_seed_content()
            if seed is not None:
                conn.execute(
                    "INSERT INTO site_content (id, content_json, updated_at) VALUES (1, ?, ?)",
                    (json.dumps(seed, ensure_ascii=False), now_iso()),
                )

        migrate_plaintext_applications(conn, existing_columns)
        conn.commit()


def migrate_plaintext_applications(conn: sqlite3.Connection, columns: set[str]) -> None:
    legacy_fields = {
        "source", "course_id", "course_title", "full_name", "phone",
        "format", "comment", "consent_policy_version", "consent_accepted_at",
    }
    if not legacy_fields.issubset(columns) or "data_encrypted" not in columns:
        return

    rows = conn.execute(
        "SELECT * FROM applications WHERE data_encrypted = '' AND full_name <> ''"
    ).fetchall()
    for row in rows:
        payload = {
            "source": row["source"] or "",
            "courseId": row["course_id"] or "",
            "courseTitle": row["course_title"] or "",
            "fullName": row["full_name"] or "",
            "phone": row["phone"] or "",
            "format": row["format"] or "",
            "comment": row["comment"] or "",
            "consentPolicyVersion": row["consent_policy_version"] or "",
            "consentAcceptedAt": row["consent_accepted_at"] or row["created_at"],
        }
        encrypted = DATA_CIPHER.encrypt(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("ascii")
        conn.execute(
            """
            UPDATE applications
            SET data_encrypted = ?, source = '', course_id = '', course_title = '',
                full_name = '', phone = '', format = '', comment = '',
                consent_policy_version = '', consent_accepted_at = ''
            WHERE id = ?
            """,
            (encrypted, row["id"]),
        )


def clean_text(value: Any, limit: int) -> str:
    return str(value or "").replace("\x00", "").strip()[:limit]


def request_json() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def clean_url(value: Any, limit: int = 2000) -> str:
    candidate = clean_text(value, limit)
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return candidate


def clean_id(value: Any, fallback: str) -> str:
    candidate = clean_text(value, 100)
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", candidate).strip("-")
    return normalized or fallback


def normalize_content(payload: dict[str, Any]) -> dict[str, Any]:
    def item_list(name: str, fields: dict[str, tuple[int, bool]], limit: int = 100) -> list[dict[str, Any]]:
        result = []
        for index, item in enumerate(payload.get(name) or []):
            if not isinstance(item, dict):
                continue
            normalized: dict[str, Any] = {}
            for field, (max_length, is_url) in fields.items():
                normalized[field] = clean_url(item.get(field), max_length) if is_url else clean_text(item.get(field), max_length)
            if any(value for value in normalized.values() if not isinstance(value, list)):
                normalized["id"] = clean_id(item.get("id"), f"{name[:-1]}-{index + 1}")
                result.append(normalized)
            if len(result) >= limit:
                break
        return result

    points = [clean_text(value, 300) for value in (payload.get("about") or {}).get("points", [])]
    points = [value for value in points if value][:30]

    teachers = item_list(
        "teachers",
        {"id": (100, False), "name": (200, False), "role": (200, False), "bio": (1000, False), "photo": (2000, True)},
    )
    courses = item_list(
        "courses",
        {
            "id": (100, False), "title": (200, False), "ageCategory": (50, False),
            "shortDescription": (500, False), "fullDescription": (3000, False),
            "duration": (100, False), "teacherId": (100, False), "image": (2000, True), "price": (100, False),
        },
    )
    for course, source in zip(courses, payload.get("courses") or []):
        formats = source.get("formats") if isinstance(source, dict) else []
        course["formats"] = [clean_text(value, 50) for value in formats or [] if clean_text(value, 50)][:5]

    gallery = item_list(
        "gallery",
        {"image": (2000, True), "title": (200, False), "caption": (500, False), "postUrl": (2000, True)},
    )
    reviews = item_list(
        "reviews",
        {"author": (200, False), "role": (200, False), "text": (2000, False)},
    )
    achievements = item_list(
        "achievements",
        {"title": (200, False), "value": (100, False), "description": (1000, False)},
    )

    brand = payload.get("brand") or {}
    about = payload.get("about") or {}
    enrollment = payload.get("enrollment") or {}
    contacts = payload.get("contacts") or {}

    return {
        "meta": {
            "source": clean_text((payload.get("meta") or {}).get("source"), 500),
            "updatedAt": now_iso(),
        },
        "brand": {
            "schoolName": clean_text(brand.get("schoolName"), 200),
            "heroTitle": clean_text(brand.get("heroTitle"), 300),
            "heroSubtitle": clean_text(brand.get("heroSubtitle"), 1000),
            "tagline": clean_text(brand.get("tagline"), 300),
            "primaryCta": clean_text(brand.get("primaryCta"), 100),
            "secondaryCta": clean_text(brand.get("secondaryCta"), 100),
        },
        "about": {
            "lead": clean_text(about.get("lead"), 1000),
            "description": clean_text(about.get("description"), 3000),
            "points": points,
        },
        "enrollment": {
            "ageInfo": clean_text(enrollment.get("ageInfo"), 200),
            "duration": clean_text(enrollment.get("duration"), 100),
            "formats": clean_text(enrollment.get("formats"), 200),
        },
        "achievements": achievements,
        "teachers": teachers,
        "courses": courses,
        "gallery": gallery,
        "reviews": reviews,
        "contacts": {
            "address": clean_text(contacts.get("address"), 500),
            "phone": clean_text(contacts.get("phone"), 50),
            "email": clean_text(contacts.get("email"), 254),
            "vk": clean_url(contacts.get("vk")),
            "telegram": clean_url(contacts.get("telegram")),
            "mapEmbed": clean_url(contacts.get("mapEmbed")),
        },
    }


def parse_iso_datetime(value: Any) -> datetime | None:
    try:
        normalized = str(value or "").strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        parsed = datetime.fromisoformat(normalized)
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def cleanup_expired_applications(conn: sqlite3.Connection) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=APPLICATION_RETENTION_DAYS)
    rows = conn.execute("SELECT id, created_at FROM applications").fetchall()
    stale = [
        (row["id"],)
        for row in rows
        if (created := parse_iso_datetime(row["created_at"])) is None or created < cutoff
    ]
    if stale:
        conn.executemany("DELETE FROM applications WHERE id = ?", stale)


def client_key(scope: str) -> str:
    address = request.remote_addr or "unknown"
    return hmac.new(
        app.config["SECRET_KEY"].encode("utf-8"),
        f"{scope}:{address}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def rate_limited(
    conn: sqlite3.Connection,
    scope: str,
    limit: int,
    window_seconds: int,
    lock_seconds: int,
) -> tuple[bool, int]:
    now = int(datetime.now(timezone.utc).timestamp())
    key_hash = client_key(scope)
    row = conn.execute(
        "SELECT failures, window_started, locked_until FROM rate_limits WHERE scope = ? AND key_hash = ?",
        (scope, key_hash),
    ).fetchone()
    if not row:
        return False, 0
    if int(row["locked_until"] or 0) > now:
        return True, int(row["locked_until"]) - now
    if now - int(row["window_started"] or 0) > window_seconds:
        conn.execute("DELETE FROM rate_limits WHERE scope = ? AND key_hash = ?", (scope, key_hash))
        return False, 0
    return int(row["failures"] or 0) >= limit, max(0, int(row["locked_until"] or 0) - now)


def record_failure(conn: sqlite3.Connection, scope: str, limit: int, window_seconds: int, lock_seconds: int) -> None:
    now = int(datetime.now(timezone.utc).timestamp())
    key_hash = client_key(scope)
    row = conn.execute(
        "SELECT failures, window_started FROM rate_limits WHERE scope = ? AND key_hash = ?",
        (scope, key_hash),
    ).fetchone()
    if not row or now - int(row["window_started"] or 0) > window_seconds:
        failures, window_started = 1, now
    else:
        failures, window_started = int(row["failures"] or 0) + 1, int(row["window_started"])
    locked_until = now + lock_seconds if failures >= limit else 0
    conn.execute(
        """
        INSERT INTO rate_limits (scope, key_hash, failures, window_started, locked_until, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, key_hash) DO UPDATE SET
            failures = excluded.failures,
            window_started = excluded.window_started,
            locked_until = excluded.locked_until,
            updated_at = excluded.updated_at
        """,
        (scope, key_hash, failures, window_started, locked_until, now_iso()),
    )


def clear_failures(conn: sqlite3.Connection, scope: str) -> None:
    conn.execute("DELETE FROM rate_limits WHERE scope = ? AND key_hash = ?", (scope, client_key(scope)))


def load_admin_credentials(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT password_hash, created_at, updated_at FROM admin_credentials WHERE id = 1"
    ).fetchone()


def is_strong_password(password: str) -> bool:
    return bool(
        12 <= len(password) <= MAX_PASSWORD_LENGTH
        and re.search(r"[A-ZА-ЯЁ]", password)
        and re.search(r"[a-zа-яё]", password)
        and re.search(r"\d", password)
        and re.search(r"[^A-Za-zА-Яа-яЁё0-9]", password)
    )


def require_admin(check_csrf: bool = False) -> Callable[[F], F]:
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any):
            if not session.get("admin_authenticated"):
                return jsonify({"error": "Требуется вход администратора"}), 401
            if check_csrf and not secrets.compare_digest(
                str(request.headers.get("X-CSRF-Token", "")),
                str(session.get("csrf_token", "")),
            ):
                return jsonify({"error": "Некорректный CSRF-токен"}), 403
            return func(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorator


def normalize_application(payload: dict[str, Any]) -> dict[str, str]:
    return {
        "id": f"app_{secrets.token_urlsafe(12)}",
        "created_at": now_iso(),
        "source": clean_text(payload.get("source"), 30),
        "course_id": clean_id(payload.get("courseId"), ""),
        "course_title": clean_text(payload.get("courseTitle"), 200),
        "full_name": clean_text(payload.get("fullName"), 200),
        "phone": clean_text(payload.get("phone"), 30),
        "format": clean_text(payload.get("format"), 50),
        "comment": clean_text(payload.get("comment"), 2000),
        "consent_policy_version": clean_text(payload.get("consentPolicyVersion"), 50),
        "consent_accepted_at": now_iso(),
    }


def encrypt_application(app_data: dict[str, str]) -> str:
    payload = {
        "source": app_data["source"],
        "courseId": app_data["course_id"],
        "courseTitle": app_data["course_title"],
        "fullName": app_data["full_name"],
        "phone": app_data["phone"],
        "format": app_data["format"],
        "comment": app_data["comment"],
        "consentPolicyVersion": app_data["consent_policy_version"],
        "consentAcceptedAt": app_data["consent_accepted_at"],
    }
    return DATA_CIPHER.encrypt(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("ascii")


def row_to_application(row: sqlite3.Row) -> dict[str, Any]:
    try:
        payload = json.loads(DATA_CIPHER.decrypt(row["data_encrypted"].encode("ascii")))
    except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        payload = {
            "source": row["source"] or "",
            "courseId": row["course_id"] or "",
            "courseTitle": row["course_title"] or "",
            "fullName": row["full_name"] or "",
            "phone": row["phone"] or "",
            "format": row["format"] or "",
            "comment": row["comment"] or "",
            "consentPolicyVersion": row["consent_policy_version"] or "",
            "consentAcceptedAt": row["consent_accepted_at"] or row["created_at"],
        }
    return {
        "id": row["id"],
        "createdAt": row["created_at"],
        "processed": bool(row["processed"]),
        "source": payload.get("source", ""),
        "courseId": payload.get("courseId", ""),
        "courseTitle": payload.get("courseTitle", ""),
        "fullName": payload.get("fullName", ""),
        "phone": payload.get("phone", ""),
        "format": payload.get("format", ""),
        "comment": payload.get("comment", ""),
        "consentPolicyVersion": payload.get("consentPolicyVersion", ""),
        "consentAcceptedAt": payload.get("consentAcceptedAt", ""),
    }


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS" and request.path.startswith("/api/"):
        return ("", 204)
    return None


@app.after_request
def add_security_headers(response):
    if response.mimetype in {"text/html", "text/css", "application/javascript", "text/javascript", "application/json"}:
        response.headers["Content-Type"] = f"{response.mimetype}; charset=utf-8"
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin and origin in allowed_origins():
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-CSRF-Token"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Vary"] = "Origin"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data: https:; font-src 'self' data:; "
        "connect-src 'self' https://vk.com https://noembed.com; "
        "frame-src https://www.google.com https://maps.google.com; "
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    )
    if https_only:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/content")
def get_content():
    with get_conn() as conn:
        row = conn.execute("SELECT content_json FROM site_content WHERE id = 1").fetchone()
    if not row:
        return jsonify({"error": "Контент сайта не инициализирован"}), 503
    try:
        return jsonify(json.loads(row["content_json"]))
    except json.JSONDecodeError:
        return jsonify({"error": "Некорректные данные контента"}), 500


@app.put("/api/content")
@require_admin(check_csrf=True)
def update_content():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Ожидается JSON-объект"}), 400
    try:
        content = normalize_content(payload)
    except (AttributeError, TypeError, ValueError):
        return jsonify({"error": "Некорректный формат контента"}), 400
    with get_conn() as conn:
        updated = conn.execute(
            "UPDATE site_content SET content_json = ?, updated_at = ? WHERE id = 1",
            (json.dumps(content, ensure_ascii=False), now_iso()),
        )
        conn.commit()
    if updated.rowcount == 0:
        return jsonify({"error": "Контент сайта не инициализирован"}), 503
    return jsonify(content)


@app.get("/api/admin/status")
def admin_status():
    with get_conn() as conn:
        configured = load_admin_credentials(conn) is not None
    return jsonify({"configured": configured})


@app.post("/api/admin/setup")
def admin_setup():
    payload = request_json()
    password = str(payload.get("password") or "")
    if not is_strong_password(password):
        return jsonify({"error": "Пароль должен быть не короче 12 символов и содержать буквы разного регистра, цифры и спецсимвол"}), 400
    with get_conn() as conn:
        if load_admin_credentials(conn):
            return jsonify({"error": "Администратор уже настроен"}), 409
        timestamp = now_iso()
        conn.execute(
            "INSERT INTO admin_credentials (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)",
            (generate_password_hash(password), timestamp, timestamp),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/login")
def admin_login():
    with get_conn() as conn:
        limited, retry_after = rate_limited(conn, "admin-login", 5, 900, 900)
        if limited:
            response = jsonify({"error": "Слишком много попыток. Попробуйте позже"})
            response.status_code = 429
            response.headers["Retry-After"] = str(max(1, retry_after))
            return response
        credentials = load_admin_credentials(conn)
        if not credentials:
            return jsonify({"error": "Администратор не настроен"}), 409
        payload = request_json()
        password = str(payload.get("password") or "")
        if len(password) > MAX_PASSWORD_LENGTH or not check_password_hash(credentials["password_hash"], password):
            record_failure(conn, "admin-login", 5, 900, 900)
            conn.commit()
            return jsonify({"error": "Неверный пароль"}), 401
        clear_failures(conn, "admin-login")
        conn.commit()

    session.clear()
    session.permanent = True
    session["admin_authenticated"] = True
    session["csrf_token"] = secrets.token_hex(32)
    session["issued_at"] = now_iso()
    return jsonify({"ok": True, "csrfToken": session["csrf_token"]})


@app.post("/api/admin/logout")
@require_admin(check_csrf=True)
def admin_logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/admin/change-password")
@require_admin(check_csrf=True)
def admin_change_password():
    payload = request_json()
    current_password = str(payload.get("currentPassword") or "")
    new_password = str(payload.get("newPassword") or "")
    if not is_strong_password(new_password):
        return jsonify({"error": "Новый пароль не соответствует требованиям безопасности"}), 400
    with get_conn() as conn:
        credentials = load_admin_credentials(conn)
        if not credentials or not check_password_hash(credentials["password_hash"], current_password):
            return jsonify({"error": "Неверный текущий пароль"}), 401
        conn.execute(
            "UPDATE admin_credentials SET password_hash = ?, updated_at = ? WHERE id = 1",
            (generate_password_hash(new_password), now_iso()),
        )
        conn.commit()
    session["csrf_token"] = secrets.token_hex(32)
    return jsonify({"ok": True, "csrfToken": session["csrf_token"]})


@app.get("/api/applications")
@require_admin()
def get_applications():
    with get_conn() as conn:
        cleanup_expired_applications(conn)
        rows = conn.execute("SELECT * FROM applications ORDER BY datetime(created_at) DESC").fetchall()
        conn.commit()
    return jsonify([row_to_application(row) for row in rows])


@app.post("/api/applications")
def create_application():
    payload = request_json()
    if payload.get("website"):
        return jsonify({"ok": True}), 202
    with get_conn() as conn:
        limited, retry_after = rate_limited(conn, "application", 5, 600, 600)
        if limited:
            response = jsonify({"error": "Слишком много заявок. Попробуйте позже"})
            response.status_code = 429
            response.headers["Retry-After"] = str(max(1, retry_after))
            return response

        app_data = normalize_application(payload)
        digits = re.sub(r"\D", "", app_data["phone"])
        if not app_data["full_name"] or len(digits) < 7:
            return jsonify({"error": "Укажите корректные ФИО и номер телефона"}), 400
        if not app_data["consent_policy_version"]:
            return jsonify({"error": "Необходимо согласие на обработку персональных данных"}), 400
        conn.execute(
            """
            INSERT INTO applications (
                id, created_at, processed, data_encrypted
            ) VALUES (?, ?, 0, ?)
            """,
            (
                app_data["id"], app_data["created_at"], encrypt_application(app_data),
            ),
        )
        conn.commit()
    return jsonify({"ok": True}), 201


@app.patch("/api/applications/<app_id>/processed")
@require_admin(check_csrf=True)
def patch_application_processed(app_id: str):
    payload = request_json()
    processed = 1 if bool(payload.get("processed")) else 0
    with get_conn() as conn:
        cur = conn.execute("UPDATE applications SET processed = ? WHERE id = ?", (processed, app_id))
        conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Заявка не найдена"}), 404
    return jsonify({"ok": True, "id": app_id, "processed": bool(processed)})


@app.delete("/api/applications/<app_id>")
@require_admin(check_csrf=True)
def delete_application(app_id: str):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Заявка не найдена"}), 404
    return jsonify({"ok": True})


@app.delete("/api/applications")
@require_admin(check_csrf=True)
def clear_applications():
    with get_conn() as conn:
        conn.execute("DELETE FROM applications")
        conn.commit()
    return jsonify({"ok": True})


@app.get("/")
def root():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/admin")
def admin():
    return send_from_directory(BASE_DIR, "admin.html")


ensure_schema()


if __name__ == "__main__":
    app.run(
        host=os.getenv("PROIT_HOST", "127.0.0.1"),
        port=int(os.getenv("PROIT_PORT", "8000")),
        debug=False,
    )
