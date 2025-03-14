import asyncio

import websockets


async def test_websocket():
    uri = "ws://127.0.0.1:8000/ws/production"
    async with websockets.connect(uri) as websocket:
        try:
            while True:
                message = await websocket.recv()
                print(f"Gelen mesaj: {message}")
        except websockets.exceptions.ConnectionClosed:
            print("Bağlantı kapandı")


asyncio.run(test_websocket())
