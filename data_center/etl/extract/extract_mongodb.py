
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient
from bson import json_util

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://mongodb:27017/warehouse_events"
)
DATABASE_NAME = os.getenv("MONGO_DATABASE", "warehouse_events")

BRONZE_DIR = Path(
    "/app/data_lake/bronze/mongodb"
)

COLLECTIONS = [
    "system_info",
    "system_logs",
    "inventory_events",
    "outbound_events",
    "transfer_events",
    "warehouse_events",
]


def extract_mongodb():
    BRONZE_DIR.mkdir(parents=True, exist_ok=True)

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)

    try:
        client.admin.command("ping")
        db = client[DATABASE_NAME]

        for collection_name in COLLECTIONS:
            documents = list(db[collection_name].find({}))

            output_file = BRONZE_DIR / (
                f"{collection_name}.json"
            )

            with output_file.open("w", encoding="utf-8") as file:
                file.write(
                    json_util.dumps(
                        documents,
                        ensure_ascii=False,
                        indent=2
                    )
                )

            print(
                f"{collection_name}: "
                f"{len(documents)} documents -> {output_file}"
            )

        print("MongoDB extraction completed.")

    finally:
        client.close()


if __name__ == "__main__":
    extract_mongodb()
