
// =========================================================
// MONGODB - CREATE COLLECTIONS
// =========================================================

db = db.getSiblingDB("warehouse_events");

print("==========================================");
print("CREATE COLLECTIONS");
print("==========================================");

// ---------------------------------------------------------
// SỰ KIỆN KHO
// ---------------------------------------------------------

if (!db.getCollectionNames().includes("warehouse_events")) {
    db.createCollection("warehouse_events");
}

// ---------------------------------------------------------
// SỰ KIỆN TỒN KHO
// ---------------------------------------------------------

if (!db.getCollectionNames().includes("inventory_events")) {
    db.createCollection("inventory_events");
}

// ---------------------------------------------------------
// SỰ KIỆN XUẤT HÀNG
// ---------------------------------------------------------

if (!db.getCollectionNames().includes("outbound_events")) {
    db.createCollection("outbound_events");
}

// ---------------------------------------------------------
// SỰ KIỆN ĐIỀU CHUYỂN
// ---------------------------------------------------------

if (!db.getCollectionNames().includes("transfer_events")) {
    db.createCollection("transfer_events");
}

// ---------------------------------------------------------
// LOG HỆ THỐNG
// ---------------------------------------------------------

if (!db.getCollectionNames().includes("system_logs")) {
    db.createCollection("system_logs");
}

print("Collections created successfully.");

printjson(db.getCollectionNames());
```