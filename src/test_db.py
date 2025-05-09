from sqlalchemy import create_engine, text

DATABASE_URL = (
    "mssql+pyodbc://usrvbeap:Mv.A42-n@10.3.25.126:1433/VBE_BZD_DBC"
    "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes&Encrypt=no"
)

engine = create_engine(DATABASE_URL)


def inspect_tables():
    with engine.connect() as connection:
        result = connection.execute(
            text(
                "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
            )
        )
        tables = result.fetchall()

        print("Veritabanındaki tablolar:")
        for schema, table in tables:
            print(f"{schema}.{table}")


def inspect_columns(table_name, schema="dbo"):
    with engine.connect() as connection:
        result = connection.execute(
            text(
                "SELECT COLUMN_NAME, DATA_TYPE "
                "FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = :table AND TABLE_SCHEMA = :schema"
            ),
            {"table": table_name, "schema": schema},  # SQL injection riskini önlüyoruz
        )
        columns = result.fetchall()

        if not columns:
            print(f"'{schema}.{table_name}' tablosu bulunamadı veya sütun bilgisi yok.")
            return

        print(f"{schema}.{table_name} tablosundaki sütunlar:")
        for column_name, data_type in columns:
            print(f"{column_name} ({data_type})")


def inspect_values(table_name, schema="dbo", columns="*", limit=5):
    """Belirtilen tablodaki tüm verileri listeler."""
    try:
        with engine.connect() as connection:
            # Önce tablonun gerçekten var olup olmadığını kontrol et
            table_check = connection.execute(
                text(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                    "WHERE TABLE_NAME = :table AND TABLE_SCHEMA = :schema"
                ),
                {"table": table_name, "schema": schema},
            ).fetchone()

            if not table_check:
                print(f"Hata: '{schema}.{table_name}' tablosu bulunamadı!")
                return

            # Sütunları belirtildiği gibi ayarla
            column_str = ", ".join(columns) if isinstance(columns, list) else columns

            # İlk 'limit' kadar verileri çek
            query = text(
                    f"SELECT TOP {limit} {column_str} FROM {schema}.{table_name}"
                )
            result = connection.execute(query)
            rows = result.fetchall()

            if not rows:
                print(f"'{schema}.{table_name}' tablosunda veri bulunmuyor.")
                return

            print(f"{schema}.{table_name} tablosundaki ilk {limit} veri:")
            for row in rows:
                print(row)

    except Exception as e:
        print(f"Hata oluştu: {e}")


# inspect_tables()
inspect_columns("ProductRecordLogModels")
inspect_values("ProductRecordLog")
# inspect_values("ProductRecordLog", columns=["Model", "ModelSuresiSN"])
