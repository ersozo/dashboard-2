# FastAPI implementation

uvicorn main:app --reload
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug


netstat -ano | findstr :8000
taskkill /PID 24424 /F