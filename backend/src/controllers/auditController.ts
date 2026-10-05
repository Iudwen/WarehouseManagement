import { Response } from 'express';
import { CustomRequest } from '../types';
import { getInventoryAuditLogs } from '../services/auditService';

export const getAuditLogs = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const ma_kho = (req.query.ma_kho as string) || req.maKhoContext;
    const logs = await getInventoryAuditLogs(ma_kho);

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi khi lấy lịch sử audit logs' });
  }
};