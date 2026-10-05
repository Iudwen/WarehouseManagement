// =========================================================
// MONGODB - CREATE INDEXES
// =========================================================

db = db.getSiblingDB("warehouse_events");

print("==========================================");
print("CREATE INDEXES");
print("==========================================");


// =========================================================
// WAREHOUSE EVENTS
// =========================================================

db.warehouse_events.createIndex(
    { event_time: -1 }
);

db.warehouse_events.createIndex(
    { ma_kho: 1 }
);

db.warehouse_events.createIndex(
    { event_type: 1 }
);


// =========================================================
// INVENTORY EVENTS
// =========================================================

db.inventory_events.createIndex(
    { event_time: -1 }
);

db.inventory_events.createIndex(
    { ma_kho: 1 }
);

db.inventory_events.createIndex(
    { ma_sp: 1 }
);

db.inventory_events.createIndex(
    { ma_kho: 1, ma_sp: 1 }
);


// =========================================================
// SALES EVENTS
// =========================================================

db.sales_events.createIndex(
    { event_time: -1 }
);

db.sales_events.createIndex(
    { ma_kho: 1 }
);

db.sales_events.createIndex(
    { ma_sp: 1 }
);

db.sales_events.createIndex(
    { ma_kho: 1, ma_sp: 1 }
);


// =========================================================
// TRANSFER EVENTS
// =========================================================

db.transfer_events.createIndex(
    { event_time: -1 }
);

db.transfer_events.createIndex(
    { kho_xuat: 1 }
);

db.transfer_events.createIndex(
    { kho_nhap: 1 }
);

db.transfer_events.createIndex(
    { ma_sp: 1 }
);


// =========================================================
// SYSTEM LOGS
// =========================================================

db.system_logs.createIndex(
    { event_time: -1 }
);

db.system_logs.createIndex(
    { level: 1 }
);

db.system_logs.createIndex(
    { service: 1 }
);


print("Indexes created successfully.");