// =========================================================
// MONGODB - INITIALIZE DATABASE
// =========================================================

db = db.getSiblingDB("warehouse_events");

print("==========================================");
print("WAREHOUSE EVENTS DATABASE");
print("==========================================");

print("Database: " + db.getName());

db.createCollection("system_info");

db.system_info.updateOne(
    { _id: "warehouse_system" },
    {
        $set: {
            system_name: "Warehouse Management System",
            description: "Lưu trữ dữ liệu sự kiện và log từ hệ thống kho",
            created_at: new Date()
        }
    },
    { upsert: true }
);

print("Database initialized successfully.");