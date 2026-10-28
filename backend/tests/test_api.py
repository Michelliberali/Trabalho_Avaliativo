import io

from fastapi.testclient import TestClient
from PIL import Image

from app import main


def image_bytes():
    output = io.BytesIO()
    Image.new("RGB", (200, 200), "#d3e1ee").save(output, format="JPEG")
    return output.getvalue()


def test_registration_and_time_record(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "PHOTOS_DIR", tmp_path / "photos")
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "ponto.db")
    monkeypatch.setattr(main, "ensure_face", lambda path: None)
    monkeypatch.setattr(main, "find_employee", lambda path, employees: employees[0])
    client = TestClient(main.app)
    photo = image_bytes()

    assert client.get("/api/health").json() == {"status": "ok"}
    response = client.post(
        "/api/employees",
        data={"name": "Ana Lima", "registration": "A001", "role": "Analista"},
        files={"photo": ("ana.jpg", photo, "image/jpeg")},
    )
    assert response.status_code == 201
    assert response.json()["registration"] == "A001"
    assert len(client.get("/api/employees").json()) == 1
    assert len(list((tmp_path / "photos").glob("*.jpg"))) == 1

    duplicate = client.post(
        "/api/employees",
        data={"name": "Outra", "registration": "A001", "role": "Analista"},
        files={"photo": ("foto.jpg", photo, "image/jpeg")},
    )
    assert duplicate.status_code == 409

    record = client.post(
        "/api/records",
        data={"record_type": "entrada"},
        files={"photo": ("captura.jpg", photo, "image/jpeg")},
    )
    assert record.status_code == 201
    assert record.json()["employee_name"] == "Ana Lima"
    assert record.json()["record_type"] == "entrada"
    assert len(client.get("/api/records").json()) == 1


def test_invalid_photo_and_record_type(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "ponto.db")
    client = TestClient(main.app)
    response = client.post(
        "/api/employees",
        data={"name": "Ana", "registration": "A001", "role": "Analista"},
        files={"photo": ("broken.jpg", b"not-an-image", "image/jpeg")},
    )
    assert response.status_code == 422
    response = client.post(
        "/api/records",
        data={"record_type": "invalid"},
        files={"photo": ("foto.jpg", image_bytes(), "image/jpeg")},
    )
    assert response.status_code == 422
