from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "proit_admin_data.db"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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
        conn.commit()


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
        "consent_policy_version": str(payload.get("consentPolicyVersion") or ""),
        "consent_accepted_at": str(payload.get("consentAcceptedAt") or created_at),
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


@app.get("/api/applications")
def get_applications():
    with get_conn() as conn:
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

    with get_conn() as conn:
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
def delete_application(app_id: str):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Application not found"}), 404
    return jsonify({"ok": True})


@app.delete("/api/applications")
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
    app.run(host="127.0.0.1", port=8000, debug=True)
