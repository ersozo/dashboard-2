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
from datetime import datetime, timedelta


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


def calculate_elapsed_seconds(hour: int, base_date: datetime) -> int:
    """Verilen saat için o ana kadar geçen süreyi saniye cinsinden döndür."""
    now = datetime.now()
    start_of_hour = datetime.combine(base_date.date(), datetime.min.time()) + timedelta(hours=hour)
    if now >= start_of_hour + timedelta(hours=1):
        return 3600
    elif now < start_of_hour:
        return 0
    else:
        return int((now - start_of_hour).total_seconds())

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
        start_dt = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")

        result_data = {}

        for unit in unit_name:
            query = text("""
                SELECT
                    DATEPART(HOUR, KayitTarihi) AS Hour,
                    Model,
                    COUNT(*) AS ModelProduction,
                    AVG(ModelSuresiSN) AS Target
                FROM dbo.ProductRecordLog
                WHERE KayitTarihi BETWEEN :start_date AND :end_date AND UnitName = :unit_name
                GROUP BY DATEPART(HOUR, KayitTarihi), Model
                ORDER BY Hour, Model
            """)
            result = db.execute(
                query, {"start_date": start_date, "end_date": end_date, "unit_name": unit}
            ).fetchall()

            hour_model_data: dict[int, list[dict[str, any]]] = {}
            for row in result:
                if row is None:
                    continue
                hour = row[0]
                model = row[1]
                model_prod = row[2]
                target = row[3] or 0
                if hour not in hour_model_data:
                    hour_model_data[hour] = []
                hour_model_data[hour].append({
                    "model": model,
                    "model_production": model_prod,
                    "target": target
                })

            unit_data = []
            for hour, models in hour_model_data.items():
                summary_query = text("""
                    SELECT
                        COUNT(*) AS TotalCount,
                        SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) AS SuccessCount,
                        SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) AS FailCount
                    FROM dbo.ProductRecordLog
                    WHERE KayitTarihi BETWEEN :start_date AND :end_date AND UnitName = :unit_name AND DATEPART(HOUR, KayitTarihi) = :hour
                """)
                summary_result = db.execute(
                    summary_query,
                    {
                        "start_date": start_date,
                        "end_date": end_date,
                        "unit_name": unit,
                        "hour": hour
                    }
                ).fetchone()
                if summary_result is None:
                    total, success, fail = 0, 0, 0
                else:
                    total, success, fail = summary_result
                quality = (success / total) if total > 0 else 0

                elapsed_seconds = calculate_elapsed_seconds(hour, start_dt)
                total_performance = 0
                for m in models:
                    model_prod = m["model_production"]
                    target = m["target"]
                    if target and target > 0:
                        # Calculate ideal cycle time as 3600/Target (seconds per unit)
                        ideal_cycle_time = 3600 / target
                        # Calculate performance contribution as (model_production * ideal_cycle_time) / elapsed_seconds
                        if elapsed_seconds > 0:
                            performance_contribution = (model_prod * ideal_cycle_time) / elapsed_seconds
                            total_performance += performance_contribution
                            logging.info(f"Unit {unit}, Hour {hour}, Model {m['model']}: Prod={model_prod}, Target={target}, Ideal Cycle Time={ideal_cycle_time:.2f}, Contribution={performance_contribution:.2f}")
                        else:
                            logging.warning(f"Unit {unit}, Hour {hour}, Model {m['model']}: No elapsed time, skipping performance.")
                    else:
                        logging.warning(f"Unit {unit}, Hour {hour}, Model {m['model']}: No target, skipping performance.")

                # Overall performance is the sum of all model contributions
                performance = total_performance
                # OEE is calculated as Quality × Performance
                oee = quality * performance

                entry_data = {
                    "hour": hour,
                    "total": total,
                    "success": success,
                    "fail": fail,
                    "quality": round(quality, 2),
                    "performance": round(performance, 2),
                    "oee": round(oee, 2)
                }
                logging.info(f"[DATA DEBUG] Adding entry for unit {unit}, hour {hour}: {entry_data}")
                unit_data.append(entry_data)

            result_data[unit] = unit_data
            logging.info(f"[DATA DEBUG] Final data for unit {unit}: {unit_data}")

        final_response = {"data": result_data}
        logging.info(f"[DATA DEBUG] Sending WebSocket response: {final_response}")
        return final_response

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
                # First, get model-specific data
                model_query = text("""
                    SELECT
                        UnitName,
                        DATEPART(HOUR, KayitTarihi) AS Hour,
                        Model,
                        COUNT(*) AS ModelProduction,
                        AVG(ModelSuresiSN) AS Target
                    FROM dbo.ProductRecordLog
                    WHERE KayitTarihi >= DATEADD(HOUR, -1, GETDATE())
                    GROUP BY UnitName, DATEPART(HOUR, KayitTarihi), Model
                    ORDER BY UnitName, Hour, Model
                """)
                model_result = db.execute(model_query).fetchall()

                # Group model data by unit and hour
                hour_model_data: dict[tuple[str, int], list[dict[str, any]]] = {}
                for row in model_result:
                    if row is None:
                        continue
                    unit_name = row[0]
                    hour = row[1]
                    model = row[2]
                    model_prod = row[3]
                    target = row[4] or 0

                    key = (unit_name, hour)
                    if key not in hour_model_data:
                        hour_model_data[key] = []
                    hour_model_data[key].append({
                        "model": model,
                        "model_production": model_prod,
                        "target": target
                    })

                # Get summary data for quality calculation
                summary_query = text("""
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
                summary_result = db.execute(summary_query).fetchall()

                # Calculate metrics and group by unit
                grouped_data = {}
                now = datetime.now()
                base_date = now.replace(minute=0, second=0, microsecond=0)

                for row in summary_result:
                    unit_name = row[0]
                    hour = row[1]
                    total = row[2]
                    success = row[3]
                    fail = row[4]

                    # Calculate quality
                    quality = (success / total) if total > 0 else 0

                    # Calculate performance using model data
                    elapsed_seconds = calculate_elapsed_seconds(hour, base_date)
                    total_performance = 0
                    logging.info(f"[PERF DEBUG] Unit {unit_name}, Hour {hour} - Elapsed seconds: {elapsed_seconds}")

                    # Get model data for this unit and hour
                    models = hour_model_data.get((unit_name, hour), [])
                    logging.info(f"[PERF DEBUG] Models for unit {unit_name}, hour {hour}: {models}")

                    for m in models:
                        model_prod = m["model_production"]
                        target = m["target"]
                        logging.info(f"[PERF DEBUG] Model {m['model']}: Production={model_prod}, Target={target}")

                        if target and target > 0:
                            # Calculate target units per hour from cycle time
                            target_per_hour = 3600 / target  # target is cycle time in seconds
                            if elapsed_seconds > 0:
                                # Calculate actual production rate
                                actual_rate = model_prod  # This is already per hour since we group by hour
                                # Performance is actual/target ratio
                                performance_contribution = actual_rate / target_per_hour
                                total_performance += performance_contribution
                                logging.info(f"[PERF DEBUG] Model {m['model']}: Cycle={target:.1f}s, Target/h={target_per_hour:.1f}, Actual={actual_rate}, Perf={performance_contribution:.2f}")
                            else:
                                logging.warning(f"[PERF DEBUG] Elapsed seconds is 0 for unit {unit_name}, hour {hour}")
                        else:
                            logging.warning(f"[PERF DEBUG] Invalid target for model {m['model']}: {target}")

                    # Calculate OEE
                    performance = total_performance
                    oee = quality * performance
                    logging.info(f"[PERF DEBUG] Final values - Performance: {performance:.2f}, Quality: {quality:.2f}, OEE: {oee:.2f}")

                    entry = {
                        "hour": hour,
                        "total": total,
                        "success": success,
                        "fail": fail,
                        "quality": round(quality, 2),
                        "performance": round(performance, 2),
                        "oee": round(oee, 2)
                    }

                    if unit_name not in grouped_data:
                        grouped_data[unit_name] = []
                    grouped_data[unit_name].append(entry)

                try:
                    # Wrap the data in the same structure as the HTTP endpoint
                    response_data = {"data": grouped_data}
                    logging.info(f"[WS DEBUG] Sending data structure: {response_data}")
                    await websocket.send_text(json.dumps(response_data))
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
