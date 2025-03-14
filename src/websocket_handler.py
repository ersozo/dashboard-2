import asyncio
import logging

from fastapi import WebSocket

from crud import fetch_production_data


async def send_production_data(websocket: WebSocket, db_session):
    await websocket.accept()
    logging.info("✅ WebSocket bağlantısı açıldı.")
    try:
        while True:
            data = fetch_production_data(db_session)
            logging.info(f"📡 WebSocket veri gönderiyor: {data}")
            await websocket.send_json(data)
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        logging.info("❌ WebSocket bağlantısı iptal edildi.")
    except Exception as e:
        logging.error(f"🔥 WebSocket hatası: {e}")
    finally:
        await websocket.close()
        db_session.close()
        logging.info("🔒 WebSocket bağlantısı kapandı.")