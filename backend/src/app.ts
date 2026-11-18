import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Nạp file .env từ thư mục gốc hoặc thư mục hiện tại (tương thích cả khi chạy từ root lẫn backend/)
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

import authRoutes from './routes/authRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import transferRoutes from './routes/transferRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import masterDataRoutes from './routes/masterDataRoutes';
import alertRoutes from './routes/alertRoutes';
import auditRoutes from './routes/auditRoutes'; // Bổ sung Audit Route
import dataMiningRoutes from './routes/dataMiningRoutes'; // Data Mining & Dự báo nhu cầu
import monitoringRoutes from './routes/monitoringRoutes'; // API Giám sát Hệ thống Phân tán (Giai đoạn 4)
import backupRoutes from './routes/backupRoutes'; // API Sao lưu & Phục hồi dữ liệu (Giai đoạn 5)
import slottingRoutes from './routes/slottingRoutes'; // Phân hệ Warehouse Slotting (Giai đoạn 6)
import { getDefaultEventConsumer } from './kafka';
import { backupScheduler } from './services/backupScheduler';

const app: Application = express();

app.use(cors());
app.use(express.json());

// Load Swagger document (hỗ trợ cả dev mode từ src/docs và production từ dist/docs)
const swaggerPath = fs.existsSync(path.join(__dirname, 'docs/swagger.yaml'))
  ? path.join(__dirname, 'docs/swagger.yaml')
  : path.join(__dirname, '../src/docs/swagger.yaml');
const swaggerDocument = YAML.load(swaggerPath);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Kết nối Mongo Event Log & Khởi động Kafka Consumer
const mongoUri =
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27018/warehouse_events';
mongoose.connect(mongoUri)
  .then(async () => {
    console.log('🍃 MongoDB Event Logs Connected!');
    try {
      await getDefaultEventConsumer().start();
    } catch (kErr: any) {
      console.warn('⚠️ [KAFKA] Consumer chưa kết nối được ngay:', kErr?.message || kErr);
    }
  })
  .catch((err) => console.error('❌ Lỗi kết nối MongoDB:', err));

// Register System Routes (/api/v1 Prefix)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/master-data', masterDataRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/audit', auditRoutes); // Đăng ký route xem Log MongoDB
app.use('/api/v1/data-mining', dataMiningRoutes); // API Data Mining & Dự báo nhu cầu xuất kho
app.use('/api/v1/monitoring', monitoringRoutes); // Tuyến đường giám sát hệ thống phân tán (ADMIN only)
app.use('/api/v1/backup', backupRoutes); // Tuyến đường sao lưu & phục hồi dữ liệu (ADMIN only)
app.use('/api/v1/slotting', slottingRoutes); // Phân hệ Warehouse Slotting & Storage Bins

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Warehouse TypeScript Backend Distributed Core Ready!' });
});

// Handling 404 Route Not Found
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route [${req.method}] ${req.originalUrl} không tồn tại` });
});

// Global Error Handler Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('🔥 Server Internal Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi hệ thống máy chủ nội bộ',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Warehouse Backend running on port ${PORT}`);
  if (process.env.BACKUP_SCHEDULE_ENABLED !== 'false') {
    backupScheduler.start();
  }
});