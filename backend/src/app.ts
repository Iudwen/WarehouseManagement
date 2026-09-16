import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import authRoutes from './routes/authRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import transferRoutes from './routes/transferRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import masterDataRoutes from './routes/masterDataRoutes';
import alertRoutes from './routes/alertRoutes';

const app: Application = express();

app.use(cors());
app.use(express.json());

// Kết nối Mongo Event Log
const mongoUri = process.env.MONGO_URI || 'mongodb://admin:admin123@localhost:27017/warehouse_events?authSource=admin';
mongoose.connect(mongoUri)
  .then(() => console.log('🍃 MongoDB Event Logs Connected!'))
  .catch((err) => console.error('Lỗi kết nối MongoDB:', err));

// Register System Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/master-data', masterDataRoutes);
app.use('/api/v1/alerts', alertRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Warehouse TypeScript Backend Distributed Core Ready!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Warehouse Backend running on port ${PORT}`);
});