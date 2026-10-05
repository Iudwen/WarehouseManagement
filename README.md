# Distributed Warehouse Management System (Hệ Thống Quản Lý Kho Phân Tán)

Hệ thống quản lý kho phân tán đa chi nhánh xây dựng trên kiến trúc Multi-Node Database, đảm bảo tính toàn vẹn dữ liệu giao dịch inter-node và ghi log sự kiện tập trung.

## 🚀 Công Nghệ Sử Dụng

- **Backend:** Node.js, Express, TypeScript
- **Database Lõi:** PostgreSQL (Multi-node Docker Containers: HN01, DN01, HCM01)
- **Event Logging:** MongoDB
- **Frontend:** React, Vite, TypeScript, Tailwind CSS v4
- **DevOps:** Docker, Docker Compose

## 🛠️ Triển Khai & Khởi Chạy

### 1. Database Nodes (Docker)
Ensure Docker Desktop is running, then start database instances:
```bash
docker-compose up -d