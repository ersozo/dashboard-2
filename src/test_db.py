from sqlalchemy import create_engine, text

DATABASE_URL = (
    "mssql+pyodbc://usrvbeap:Mv.A42-n@10.3.25.126:1433/VBE_BZD_DBC"
    "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes&Encrypt=no"
)

engine = create_engine(DATABASE_URL)

with engine.connect() as connection:
    result = connection.execute(text("SELECT * FROM dbo.ProductRecordLog"))
    rows = result.fetchall()
    print(f"Tablodan gelen veri: {rows}")
