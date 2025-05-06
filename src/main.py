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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/results")
def results_page(request: Request):
    return templates.TemplateResponse("results.html", {"request": request})


# @app.get("/production", response_model=list[schemas.ProductionDataResponse])
# def get_production_data(db: Session = Depends(get_db)):
#     return crud.get_production_data(db)


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


@app.get("/hourly-production/")
async def get_hourly_production(
    start_date: str = Query(..., description="Başlangıç tarihi"),
    end_date: str = Query(..., description="Bitiş tarihi"),
    unit_name: list[str] = Query(..., description="Üretim hattı adı"),
    db: Session = Depends(get_db),
):
    try:
        start_date = start_date.replace("T", " ")
        end_date = end_date.replace("T", " ")

        if isinstance(unit_name, list) and len(unit_name) == 1:
            unit_name = unit_name[0]
            query = text("""
                SELECT
                    DATEPART(HOUR, KayitTarihi) AS Hour,
                    COUNT(*) AS TotalCount,
                    SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                    SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount,
                    AVG(ModelSuresiSN) AS AvgCycleTime
                FROM dbo.ProductRecordLog
                WHERE KayitTarihi BETWEEN :start_date AND :end_date AND UnitName = :unit_name
                GROUP BY DATEPART(HOUR, KayitTarihi)
                ORDER BY Hour
            """)
            result = db.execute(
                query,
                {
                    "start_date": start_date,
                    "end_date": end_date,
                    "unit_name": unit_name,
                },
            ).fetchall()
            data = []
            for row in result:
                total = row[1]
                success = row[2]
                avg_cycle_time = row[4] or 0

                # Calculate metrics
                quality = (success / total) if total > 0 else 0
                ideal_output = (3600 / avg_cycle_time) if avg_cycle_time > 0 else 0
                performance = (total / ideal_output) if ideal_output > 0 else 0
                # OEE = Quality * Performance
                oee = quality * performance

                data.append({
                    "hour": row[0],
                    "total": total,
                    "success": success,
                    "fail": row[3],
                    "avg_cycle_time": avg_cycle_time,
                    "quality": round(quality, 2),
                    "performance": round(performance, 2),
                    "oee": round(oee, 2)
                })
            return {"data": data}
        else:
            all_data = {}
            for unit in unit_name:
                query = text("""
                    SELECT
                        DATEPART(HOUR, KayitTarihi) AS Hour,
                        COUNT(*) AS TotalCount,
                        SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                        SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount,
                        AVG(ModelSuresiSN) AS AvgCycleTime
                    FROM dbo.ProductRecordLog
                    WHERE KayitTarihi BETWEEN :start_date AND :end_date AND UnitName = :unit_name
                    GROUP BY DATEPART(HOUR, KayitTarihi)
                    ORDER BY Hour
                """)
                result = db.execute(
                    query,
                    {"start_date": start_date, "end_date": end_date, "unit_name": unit},
                ).fetchall()
                unit_data = []
                for row in result:
                    total = row[1]
                    success = row[2]
                    avg_cycle_time = row[4] or 0

                    # Calculate metrics
                    quality = (success / total) if total > 0 else 0
                    ideal_output = (3600 / avg_cycle_time) if avg_cycle_time > 0 else 0
                    performance = (total / ideal_output) if ideal_output > 0 else 0
                    # OEE = Quality * Performance
                    oee = quality * performance

                    unit_data.append({
                        "hour": row[0],
                        "total": total,
                        "success": success,
                        "fail": row[3],
                        "avg_cycle_time": avg_cycle_time,
                        "quality": round(quality, 2),
                        "performance": round(performance, 2),
                        "oee": round(oee, 2)
                    })
                all_data[unit] = unit_data

            return {"data": all_data}
    except Exception as e:
        logging.error(f"Hata oluştu: {e}")
        return {"error": "Bir hata oluştu, lütfen logları kontrol edin."}


# Aktif WebSocket'ler listesi
active_websockets = set()


async def send_production_data(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    logging.info(f"Yeni WebSocket bağlantısı: {websocket.client}")

    try:
        while True:
            db = next(get_db())
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

                try:
                    await websocket.send_text(json.dumps(grouped_data))
                except RuntimeError as e:
                    logging.error(f"WebSocket gönderme hatası: {e}")
                    break

                await asyncio.sleep(30)

            except Exception as e:
                logging.error(f"WebSocket veri gönderme hatası: {e}")
                try:
                    await websocket.send_text(
                        json.dumps({"error": "Veri çekme hatası"})
                    )
                except:
                    pass
                break
            finally:
                db.close()

    except WebSocketDisconnect:
        logging.info(f"WebSocket bağlantısı kesildi: {websocket.client}")
    finally:
        active_websockets.discard(websocket)


@app.websocket("/ws/production")
async def websocket_endpoint(websocket: WebSocket):
    await send_production_data(websocket)
