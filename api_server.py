from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "proit_admin_data.db"
ADMIN_CREDENTIALS_PATH = BASE_DIR / "admin_credentials.json"
SERVER_SECRET_PATH = BASE_DIR / ".flask_secret_key"
APPLICATION_RETENTION_DAYS = int(os.getenv("PROIT_APPLICATION_RETENTION_DAYS", "180"))

F = TypeVar("F", bound=Callable[..., Any])


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_or_create_server_secret() -> str:
    env_secret = os.getenv("PROIT_FLASK_SECRET", "").strip()
    if env_secret:
        return env_secret
    if SERVER_SECRET_PATH.exists():
        return SERVER_SECRET_PATH.read_text(encoding="utf-8").strip()
    generated = secrets.token_urlsafe(64)
    SERVER_SECRET_PATH.write_text(generated, encoding="utf-8")
    return generated


app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config.update(
    SECRET_KEY=load_or_create_server_secret(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("PROIT_HTTPS_ONLY", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS applications (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                processed INTEGER NOT NULL DEFAULT 0,
                source TEXT DEFAULT '',
                course_id TEXT DEFAULT '',
                course_title TEXT DEFAULT '',
                full_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                format TEXT DEFAULT '',
                comment TEXT DEFAULT '',
                consent_policy_version TEXT DEFAULT '',
                consent_accepted_at TEXT DEFAULT ''
            )
            """
        )
        existing_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(applications)").fetchall()
        }
        required_columns = {
            "id": "TEXT PRIMARY KEY",
            "created_at": "TEXT NOT NULL",
            "processed": "INTEGER NOT NULL DEFAULT 0",
            "source": "TEXT DEFAULT ''",
            "course_id": "TEXT DEFAULT ''",
            "course_title": "TEXT DEFAULT ''",
            "full_name": "TEXT NOT NULL DEFAULT ''",
            "phone": "TEXT NOT NULL DEFAULT ''",
            "format": "TEXT DEFAULT ''",
            "comment": "TEXT DEFAULT ''",
            "consent_policy_version": "TEXT DEFAULT ''",
            "consent_accepted_at": "TEXT DEFAULT ''",
        }
        for column_name, column_sql in required_columns.items():
            if column_name not in existing_columns:
                conn.execute(
                    f"ALTER TABLE applications ADD COLUMN {column_name} {column_sql}"
                )
        conn.commit()


def parse_iso_datetime(value: str) -> datetime | None:
    try:
        normalized = str(value or "").strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def cleanup_expired_applications(conn: sqlite3.Connection) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=APPLICATION_RETENTION_DAYS)
    rows = conn.execute("SELECT id, created_at FROM applications").fetchall()
    stale_ids: list[tuple[str]] = []
    for row in rows:
        created = parse_iso_datetime(row["created_at"])
        if not created or created < cutoff:
            stale_ids.append((row["id"],))
    if stale_ids:
        conn.executemany("DELETE FROM applications WHERE id = ?", stale_ids)
        conn.commit()


def load_admin_credentials() -> dict[str, Any] | None:
    if ADMIN_CREDENTIALS_PATH.exists():
        try:
            payload = json.loads(ADMIN_CREDENTIALS_PATH.read_text(encoding="utf-8"))
            if payload.get("passwordHash"):
                return payload
        except (json.JSONDecodeError, OSError):
            return None

    env_password = os.getenv("PROIT_ADMIN_PASSWORD", "").strip()
    if env_password:
        payload = {
            "passwordHash": generate_password_hash(env_password),
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        ADMIN_CREDENTIALS_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return payload
    return None


def save_admin_credentials(password: str) -> dict[str, Any]:
    payload = {
        "passwordHash": generate_password_hash(password),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    ADMIN_CREDENTIALS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def is_strong_password(password: str) -> bool:
    value = str(password or "")
    return bool(
        len(value) >= 12
        and re.search(r"[A-Z]", value)
        and re.search(r"[a-z]", value)
        and re.search(r"\d", value)
        and re.search(r"[^A-Za-z0-9]", value)
    )


def require_admin(check_csrf: bool = False) -> Callable[[F], F]:
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any):
            if not session.get("admin_authenticated"):
                return jsonify({"error": "Требуется вход администратора"}), 401

            if check_csrf:
                csrf_header = str(request.headers.get("X-CSRF-Token", ""))
                csrf_session = str(session.get("csrf_token", ""))
                if not csrf_header or csrf_header != csrf_session:
                    return jsonify({"error": "Некорректный CSRF токен"}), 403
            return func(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorator


def normalize_application(payload: dict[str, Any]) -> dict[str, Any]:
    created_at = str(payload.get("createdAt") or now_iso())
    return {
        "id": str(payload.get("id") or f"app_{int(datetime.now().timestamp() * 1000)}"),
        "created_at": created_at,
        "processed": 1 if bool(payload.get("processed")) else 0,
        "source": str(payload.get("source") or ""),
        "course_id": str(payload.get("courseId") or ""),
        "course_title": str(payload.get("courseTitle") or ""),
        "full_name": str(payload.get("fullName") or "").strip(),
        "phone": str(payload.get("phone") or "").strip(),
        "format": str(payload.get("format") or "").strip(),
        "comment": str(payload.get("comment") or "").strip(),
        "consent_policy_version": str(payload.get("consentPolicyVersion") or "").strip(),
        "consent_accepted_at": str(payload.get("consentAcceptedAt") or created_at).strip(),
    }


def row_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "createdAt": row["created_at"],
        "processed": bool(row["processed"]),
        "source": row["source"] or "",
        "courseId": row["course_id"] or "",
        "courseTitle": row["course_title"] or "",
        "fullName": row["full_name"] or "",
        "phone": row["phone"] or "",
        "format": row["format"] or "",
        "comment": row["comment"] or "",
        "consentPolicyVersion": row["consent_policy_version"] or "",
        "consentAcceptedAt": row["consent_accepted_at"] or "",
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/admin/status")
def admin_status():
    credentials = load_admin_credentials()
    return jsonify({"configured": bool(credentials and credentials.get("passwordHash"))})


@app.post("/api/admin/setup")
def admin_setup():
    if load_admin_credentials():
        return jsonify({"error": "Администратор уже настроен"}), 409

    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")
    if not is_strong_password(password):
        return jsonify({"error": "Пароль не соответствует требованиям безопасности"}), 400

    save_admin_credentials(password)
    return jsonify({"ok": True})


@app.post("/api/admin/login")
def admin_login():
    credentials = load_admin_credentials()
    if not credentials:
        return jsonify({"error": "Администратор не настроен"}), 409

    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")
    if not check_password_hash(credentials["passwordHash"], password):
        return jsonify({"error": "Неверный пароль"}), 401

    session.clear()
    session.permanent = True
    session["admin_authenticated"] = True
    session["csrf_token"] = secrets.token_hex(24)
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
    credentials = load_admin_credentials()
    if not credentials:
        return jsonify({"error": "Администратор не настроен"}), 409

    payload = request.get_json(silent=True) or {}
    current_password = str(payload.get("currentPassword") or "")
    new_password = str(payload.get("newPassword") or "")

    if not check_password_hash(credentials["passwordHash"], current_password):
        return jsonify({"error": "Неверный текущий пароль"}), 401
    if not is_strong_password(new_password):
        return jsonify({"error": "Новый пароль не соответствует требованиям безопасности"}), 400

    save_admin_credentials(new_password)
    session["csrf_token"] = secrets.token_hex(24)
    return jsonify({"ok": True, "csrfToken": session["csrf_token"]})


@app.get("/api/applications")
@require_admin()
def get_applications():
    with get_conn() as conn:
        cleanup_expired_applications(conn)
        rows = conn.execute(
            "SELECT * FROM applications ORDER BY datetime(created_at) DESC"
        ).fetchall()
    return jsonify([row_to_api(row) for row in rows])


@app.post("/api/applications")
def create_application():
    payload = request.get_json(silent=True) or {}
    app_data = normalize_application(payload)

    if not app_data["full_name"] or not app_data["phone"]:
        return jsonify({"error": "fullName and phone are required"}), 400
    if not app_data["consent_policy_version"] or not app_data["consent_accepted_at"]:
        return jsonify({"error": "consentPolicyVersion and consentAcceptedAt are required"}), 400

    if len(app_data["full_name"]) > 200 or len(app_data["phone"]) > 30:
        return jsonify({"error": "Некорректные данные формы"}), 400

    with get_conn() as conn:
        cleanup_expired_applications(conn)
        conn.execute(
            """
            INSERT INTO applications (
                id, created_at, processed, source, course_id, course_title,
                full_name, phone, format, comment, consent_policy_version, consent_accepted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                app_data["id"],
                app_data["created_at"],
                app_data["processed"],
                app_data["source"],
                app_data["course_id"],
                app_data["course_title"],
                app_data["full_name"],
                app_data["phone"],
                app_data["format"],
                app_data["comment"],
                app_data["consent_policy_version"],
                app_data["consent_accepted_at"],
            ),
        )
        conn.commit()

    return jsonify(
        {
            "id": app_data["id"],
            "createdAt": app_data["created_at"],
            "processed": bool(app_data["processed"]),
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
    ), 201


@app.patch("/api/applications/<app_id>/processed")
@require_admin(check_csrf=True)
def patch_application_processed(app_id: str):
    payload = request.get_json(silent=True) or {}
    processed = 1 if bool(payload.get("processed")) else 0
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE applications SET processed = ? WHERE id = ?",
            (processed, app_id),
        )
        conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Application not found"}), 404
    return jsonify({"ok": True, "id": app_id, "processed": bool(processed)})


@app.delete("/api/applications/<app_id>")
@require_admin(check_csrf=True)
def delete_application(app_id: str):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Application not found"}), 404
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


if __name__ == "__main__":
    ensure_schema()
    app.run(
        host=os.getenv("PROIT_HOST", "127.0.0.1"),
        port=int(os.getenv("PROIT_PORT", "8000")),
        debug=False,
    )
