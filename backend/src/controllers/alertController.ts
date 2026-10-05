import { Response } from 'express';
import { CustomRequest } from '../types';
import { getLowStockAlerts } from '../services/alertService';

export const getAlerts = async (req: CustomRequest, res: Response) => {
  try {
    const ma_kho = (req.query.ma_kho as string) || req.maKhoContext;
    const alerts = await getLowStockAlerts(ma_kho);
    res.json({ success: true, alerts });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi truy vấn cảnh báo tồn kho', error: err.message });
  }
};