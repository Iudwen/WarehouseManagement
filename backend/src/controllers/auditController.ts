import { Response } from 'express';
import { CustomRequest } from '../types';
import { getInventoryAuditLogs } from '../services/auditService';

export const getAuditLogs = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const maKho = req.maKhoContext;

    const logs = await getInventoryAuditLogs(maKho);

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err: any) {
    console.error('Audit controller error:', err);

    res.status(500).json({
      message: 'Lỗi khi lấy lịch sử audit logs',
    });
  }
};