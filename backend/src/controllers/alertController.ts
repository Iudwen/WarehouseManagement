import { Request, Response } from 'express';
import { getLowStockAlerts } from '../services/alertService';

export const getAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await getLowStockAlerts();
    res.json({ success: true, alerts });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi truy vấn cảnh báo tồn kho', error: err.message });
  }
};