import { Response } from 'express';
import { CustomRequest } from '../types';
import { getInventoryAuditLogs } from '../services/auditService';

export const getAuditLogs = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const maKho = (req.query.ma_kho as string) || req.maKhoContext;
    const category = (req.query.category as string) || 'ALL';
    const limit = parseInt(req.query.limit as string, 10) || 100;

    const result = await getInventoryAuditLogs(maKho, category, limit);

    res.status(200).json({
      success: true,
      data: result.logs,
      summary: result.summary,
    });
  } catch (err: any) {
    console.error('Audit controller error:', err);

    res.status(500).json({
      message: 'Lỗi khi lấy lịch sử audit logs',
    });
  }
};