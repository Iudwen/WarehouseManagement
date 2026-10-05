// =========================================================
// MONGODB - INSERT SAMPLE EVENTS
// =========================================================

db = db.getSiblingDB("warehouse_events");

print("==========================================");
print("INSERT SAMPLE EVENTS");
print("==========================================");


// =========================================================
// 1. WAREHOUSE EVENTS
// =========================================================

db.warehouse_events.insertMany([

    {
        event_id: "EVT001",

        event_type: "WAREHOUSE_OPEN",

        ma_kho: "HN01",

        warehouse: {
            name: "Kho Hà Nội",
            city: "Hà Nội"
        },

        event_time: new Date(),

        source: "warehouse_management_system",

        metadata: {
            user: "admin_hn",
            device: "WEB",
            ip: "192.168.1.10"
        }
    },

    {
        event_id: "EVT002",

        event_type: "WAREHOUSE_OPEN",

        ma_kho: "DN01",

        warehouse: {
            name: "Kho Đà Nẵng",
            city: "Đà Nẵng"
        },

        event_time: new Date(),

        source: "warehouse_management_system",

        metadata: {
            user: "admin_dn",
            device: "WEB"
        }
    },

    {
        event_id: "EVT003",

        event_type: "WAREHOUSE_OPEN",

        ma_kho: "HCM01",

        warehouse: {
            name: "Kho Hồ Chí Minh",
            city: "Hồ Chí Minh"
        },

        event_time: new Date(),

        source: "warehouse_management_system",

        metadata: {
            user: "admin_hcm",
            device: "WEB"
        }
    }

]);


// =========================================================
// 2. INVENTORY EVENTS
// =========================================================

db.inventory_events.insertMany([

    {
        event_id: "INV001",

        event_type: "INVENTORY_UPDATED",

        ma_kho: "HN01",

        ma_sp: "SP001",

        product: {
            name: "Laptop Dell",
            category: "Điện tử"
        },

        quantity: {
            before: 800,
            change: 50,
            after: 850
        },

        reason: "IMPORT",

        event_time: new Date(),

        source: "postgresql_hn"
    },

    {
        event_id: "INV002",

        event_type: "INVENTORY_UPDATED",

        ma_kho: "DN01",

        ma_sp: "SP001",

        product: {
            name: "Laptop Dell",
            category: "Điện tử"
        },

        quantity: {
            before: 200,
            change: -20,
            after: 180
        },

        reason: "SALE",

        event_time: new Date(),

        source: "postgresql_dn"
    },

    {
        event_id: "INV003",

        event_type: "INVENTORY_UPDATED",

        ma_kho: "HCM01",

        ma_sp: "SP002",

        product: {
            name: "Chuột Logitech",
            category: "Điện tử"
        },

        quantity: {
            before: 250,
            change: -10,
            after: 240
        },

        reason: "SALE",

        event_time: new Date(),

        source: "postgresql_hcm"
    }

]);


// =========================================================
// 3. SALES EVENTS
// =========================================================

db.sales_events.insertMany([

    {
        event_id: "SALE001",

        event_type: "SALE_COMPLETED",

        ma_kho: "HN01",

        ma_phieu_xuat: "PXHN0001",

        customer: {
            ma_kh: "KH0001",
            type: "NORMAL"
        },

        items: [
            {
                ma_sp: "SP001",
                name: "Laptop Dell",
                quantity: 2,
                price: 18000000
            },
            {
                ma_sp: "SP002",
                name: "Chuột Logitech",
                quantity: 3,
                price: 450000
            }
        ],

        payment: {
            method: "CASH",
            status: "PAID"
        },

        total_amount: 37350000,

        event_time: new Date(),

        source: "warehouse_management_system"
    },


    {
        event_id: "SALE002",

        event_type: "SALE_COMPLETED",

        ma_kho: "HCM01",

        ma_phieu_xuat: "PXHCM0001",

        customer: {
            ma_kh: "KH0002",
            type: "ONLINE"
        },

        items: [
            {
                ma_sp: "SP002",
                name: "Chuột Logitech",
                quantity: 5,
                price: 450000
            }
        ],

        payment: {
            method: "BANKING",
            status: "PAID"
        },

        total_amount: 2250000,

        event_time: new Date(),

        source: "warehouse_management_system"
    }

]);


// =========================================================
// 4. TRANSFER EVENTS
// =========================================================

db.transfer_events.insertMany([

    {
        event_id: "TRF001",

        event_type: "TRANSFER_CREATED",

        ma_phieu_dc: "DC0001",

        kho_xuat: "HN01",

        kho_nhap: "DN01",

        items: [
            {
                ma_sp: "SP001",
                name: "Laptop Dell",
                quantity: 50
            },
            {
                ma_sp: "SP002",
                name: "Chuột Logitech",
                quantity: 100
            }
        ],

        status: "COMPLETED",

        event_time: new Date(),

        source: "warehouse_management_system"
    },


    {
        event_id: "TRF002",

        event_type: "TRANSFER_CREATED",

        ma_phieu_dc: "DC0002",

        kho_xuat: "HCM01",

        kho_nhap: "DN01",

        items: [
            {
                ma_sp: "SP003",
                name: "Bàn phím Logitech",
                quantity: 80
            }
        ],

        status: "PENDING",

        event_time: new Date(),

        source: "warehouse_management_system"
    }

]);


// =========================================================
// 5. SYSTEM LOGS
// =========================================================

db.system_logs.insertMany([

    {
        log_id: "LOG001",

        level: "INFO",

        service: "inventory_service",

        message: "Inventory updated successfully",

        ma_kho: "HN01",

        event_time: new Date(),

        metadata: {
            user: "admin_hn",
            operation: "UPDATE_INVENTORY"
        }
    },


    {
        log_id: "LOG002",

        level: "INFO",

        service: "transfer_service",

        message: "Transfer completed",

        ma_kho: "HN01",

        event_time: new Date(),

        metadata: {
            ma_phieu_dc: "DC0001",
            destination: "DN01"
        }
    },


    {
        log_id: "LOG003",

        level: "WARNING",

        service: "inventory_service",

        message: "Inventory below safety stock",

        ma_kho: "DN01",

        event_time: new Date(),

        metadata: {
            ma_sp: "SP001",
            current_quantity: 80,
            safety_stock: 200
        }
    }

]);


print("Sample events inserted successfully.");

print("==========================================");
print("MONGODB INITIALIZATION COMPLETED");
print("==========================================");