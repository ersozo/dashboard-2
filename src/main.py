import asyncio
import json
import logging
import os

from fastapi import Depends, FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tüm origin'lere izin ver
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Templates ve Static dosyaları bağla
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/production", response_model=list[schemas.ProductionDataResponse])
def get_production_data(db: Session = Depends(get_db)):
    return crud.get_production_data(db)


@app.get("/unit-names")
def get_unit_names(db: Session = Depends(get_db)):
    try:
        query = text("SELECT DISTINCT UnitName FROM dbo.ProductRecordLog")
        result = db.execute(query).fetchall()
        unit_names = [row[0] for row in result]
        return {"unit_names": unit_names}
    except Exception as e:
        logging.error(f"Hata oluştu: {e}")
        return {"error": "Bir hata oluştu, lütfen logları kontrol edin."}


@app.get("/hourly-production")
def get_hourly_production(
    start_date: str = Query(..., description="Başlangıç tarihi"),
    end_date: str = Query(..., description="Bitiş tarihi"),
    unit_name: str = Query(..., description="Üretim hattı adı"),
    db: Session = Depends(get_db),
):
    try:
        start_date = start_date.replace("T", " ")
        end_date = end_date.replace("T", " ")

        query = text("""
            SELECT 
                DATEPART(HOUR, KayitTarihi) AS Hour,
                COUNT(*) AS TotalCount,
                SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount
            FROM dbo.ProductRecordLog
            WHERE KayitTarihi BETWEEN :start_date AND :end_date AND UnitName = :unit_name
            GROUP BY DATEPART(HOUR, KayitTarihi)
            ORDER BY Hour
        """)
        result = db.execute(
            query,
            {"start_date": start_date, "end_date": end_date, "unit_name": unit_name},
        ).fetchall()
        data = [
            {"hour": row[0], "total": row[1], "success": row[2], "fail": row[3]}
            for row in result
        ]
        return {"data": data}
    except Exception as e:
        logging.error(f"Hata oluştu: {e}")
        return {"error": "Bir hata oluştu, lütfen logları kontrol edin."}


# ✅ WebSocket bağlantılarını takip eden liste
active_websockets = set()


async def send_production_data(websocket: WebSocket):
    db = next(get_db())  # 📌 Yeni bir veritabanı oturumu aç
    active_websockets.add(websocket)  # 📌 Bağlantıyı aktif listeye ekle
    await websocket.accept()
    logging.info(f"🔗 Yeni WebSocket bağlantısı: {websocket.client}")

    try:
        while True:
            try:
                query = text("""
                    SELECT 
                        UnitName,
                        DATEPART(HOUR, KayitTarihi) AS Hour,
                        COUNT(*) AS TotalCount,
                        SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                        SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount
                    FROM dbo.ProductRecordLog
                    WHERE KayitTarihi >= DATEADD(HOUR, -1, GETDATE())  
                    GROUP BY UnitName, DATEPART(HOUR, KayitTarihi)
                    ORDER BY UnitName, Hour
                """)
                result = db.execute(query).fetchall()

                # 📌 Verileri unitName bazında gruplama
                grouped_data = {}
                for row in result:
                    unit_name = row[0]
                    entry = {
                        "hour": row[1],
                        "total": row[2],
                        "success": row[3],
                        "fail": row[4],
                    }

                    if unit_name not in grouped_data:
                        grouped_data[unit_name] = []
                    grouped_data[unit_name].append(entry)

                # 📌 JSON verisini WebSocket'e gönder
                await websocket.send_text(json.dumps(grouped_data))
                await asyncio.sleep(10)

            except Exception as e:
                logging.error(f"WebSocket veri gönderme hatası: {e}")
                await websocket.send_text(json.dumps({"error": "Veri çekme hatası"}))
                break

    except WebSocketDisconnect:
        active_websockets.remove(websocket)
        logging.info(f"❌ WebSocket bağlantısı kapandı: {websocket.client}")

    finally:
        db.close()  # 📌 Bağlantıyı kapat


@app.websocket("/ws/production")
async def websocket_endpoint(websocket: WebSocket):
    await send_production_data(websocket)
