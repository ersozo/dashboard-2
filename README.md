# FastAPI implementation

uvicorn main:app --reload
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug


netstat -ano | findstr :8000
taskkill /PID 24424 /F


1. For each model:
    - Calculates ideal cycle time as 3600/Target (seconds per unit)
    - Calculates performance contribution as (model_production * ideal_cycle_time) / elapsed_seconds
    - Adds this contribution to the total performance
2. The overall performance is now the sum of all model contributions, which represents how well the production is keeping up with the ideal rate across all models
    - OEE is calculated as Quality × Performance, where:
    - Quality = success / total (if total > 0, else 0)
    - Performance = sum of all model performance contributions
3. In results.html the overall OEE will be shown as an average of only the completed time periods so it is not artificially lowered by incomplete time periods.