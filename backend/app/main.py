"""API for a small, local facial-recognition time clock."""

from __future__ import annotations

import io
import os
import sqlite3
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

DATA_DIR = Path(os.getenv("PONTO_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
PHOTOS_DIR = DATA_DIR / "photos"
DB_PATH = DATA_DIR / "ponto.db"
MAX_PHOTO_BYTES = 8 * 1024 * 1024
RECORD_TYPES = {"entrada", "saida", "intervalo_inicio", "intervalo_fim"}

app = FastAPI(title="Ponto Facial", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class Employee(BaseModel):
    id: int
    name: str
    registration: str
    role: str
    created_at: str


class TimeRecord(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    record_type: str
    recorded_at: str


@contextmanager
def database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                registration TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL,
                photo_path TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS time_records (
                id INTEGER PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES employees(id),
                record_type TEXT NOT NULL,
                recorded_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_records_date ON time_records(recorded_at DESC);
            """
        )
        yield connection


async def read_photo(upload: UploadFile) -> bytes:
    content = await upload.read(MAX_PHOTO_BYTES + 1)
    if not content or len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "A foto deve ter até 8 MB.")
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            if image.width < 160 or image.height < 160:
                raise HTTPException(422, "A foto deve ter pelo menos 160 x 160 pixels.")
            output = io.BytesIO()
            image.convert("RGB").save(output, format="JPEG", quality=90)
            return output.getvalue()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(422, "Envie uma imagem válida.") from None


def ensure_face(photo_path: Path) -> None:
    try:
        from deepface import DeepFace

        faces = DeepFace.extract_faces(
            img_path=str(photo_path), detector_backend="opencv", enforce_detection=True
        )
        if len(faces) != 1:
            raise HTTPException(422, "A foto deve mostrar exatamente um rosto.")
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(422, "Nenhum rosto nítido foi encontrado na foto.") from None
    except Exception as exc:
        raise HTTPException(503, "O reconhecimento facial está indisponível.") from exc


def find_employee(photo_path: Path, employees: list[sqlite3.Row]) -> sqlite3.Row | None:
    try:
        from deepface import DeepFace

        best = None
        best_distance = float("inf")
        for employee in employees:
            result = DeepFace.verify(
                img1_path=str(photo_path),
                img2_path=employee["photo_path"],
                model_name="VGG-Face",
                detector_backend="opencv",
                enforce_detection=True,
            )
            if result["verified"] and result["distance"] < best_distance:
                best, best_distance = employee, result["distance"]
        return best
    except ValueError:
        raise HTTPException(422, "Não foi possível detectar um rosto nítido.") from None
    except Exception as exc:
        raise HTTPException(503, "O reconhecimento facial está indisponível.") from exc


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/employees", response_model=list[Employee])
def list_employees():
    with database() as db:
        rows = db.execute(
            "SELECT id, name, registration, role, created_at FROM employees ORDER BY name"
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/employees", response_model=Employee, status_code=201)
async def create_employee(
    name: str = Form(...),
    registration: str = Form(...),
    role: str = Form(...),
    photo: UploadFile = File(...),
):
    name, registration, role = (value.strip() for value in (name, registration, role))
    if not all((name, registration, role)) or any(len(v) > 120 for v in (name, registration, role)):
        raise HTTPException(422, "Preencha nome, matrícula e cargo (até 120 caracteres).")
    with database() as db:
        if db.execute("SELECT 1 FROM employees WHERE registration = ?", (registration,)).fetchone():
            raise HTTPException(409, "Esta matrícula já está cadastrada.")
    photo_bytes = await read_photo(photo)
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    path = PHOTOS_DIR / f"{uuid.uuid4().hex}.jpg"
    path.write_bytes(photo_bytes)
    try:
        ensure_face(path)
        created_at = datetime.now(timezone.utc).isoformat()
        with database() as db:
            cursor = db.execute(
                "INSERT INTO employees(name, registration, role, photo_path, created_at) VALUES (?, ?, ?, ?, ?)",
                (name, registration, role, str(path), created_at),
            )
            employee_id = cursor.lastrowid
        return Employee(id=employee_id, name=name, registration=registration, role=role, created_at=created_at)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Esta matrícula já está cadastrada.") from None
    except Exception:
        path.unlink(missing_ok=True)
        raise


@app.get("/api/records", response_model=list[TimeRecord])
def list_records():
    with database() as db:
        rows = db.execute(
            """SELECT r.id, r.employee_id, e.name AS employee_name,
                      r.record_type, r.recorded_at
               FROM time_records r JOIN employees e ON e.id = r.employee_id
               ORDER BY r.recorded_at DESC, r.id DESC LIMIT 100"""
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/records", response_model=TimeRecord, status_code=201)
async def create_record(record_type: str = Form(...), photo: UploadFile = File(...)):
    if record_type not in RECORD_TYPES:
        raise HTTPException(422, "Tipo de registro inválido.")
    photo_bytes = await read_photo(photo)
    with database() as db:
        employees = db.execute("SELECT id, name, photo_path FROM employees").fetchall()
    if not employees:
        raise HTTPException(409, "Cadastre um funcionário antes de registrar ponto.")
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as temp:
        temp.write(photo_bytes)
        temp_path = Path(temp.name)
    try:
        ensure_face(temp_path)
        employee = find_employee(temp_path, employees)
    finally:
        temp_path.unlink(missing_ok=True)
    if employee is None:
        raise HTTPException(404, "Rosto não reconhecido. Confira o cadastro e tente novamente.")
    recorded_at = datetime.now(timezone.utc).isoformat()
    with database() as db:
        cursor = db.execute(
            "INSERT INTO time_records(employee_id, record_type, recorded_at) VALUES (?, ?, ?)",
            (employee["id"], record_type, recorded_at),
        )
        record_id = cursor.lastrowid
    return TimeRecord(
        id=record_id,
        employee_id=employee["id"],
        employee_name=employee["name"],
        record_type=record_type,
        recorded_at=recorded_at,
    )
