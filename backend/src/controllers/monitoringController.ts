/**
 * monitoringController.ts
 * Bộ điều khiển các API giám sát hệ thống phân tán
 */

import { Request, Response } from 'express';
import { monitoringService } from '../services/monitoringService';

export const getHealthController = async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await monitoringService.getSystemHealth();
    res.json({
      success: true,
      data: health,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Không thể thu thập trạng thái sức khỏe hệ thống',
      error: err?.message || String(err),
    });
  }
};

export const getNodesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const nodes = await monitoringService.getNodeStatuses();
    res.json({
      success: true,
      data: nodes,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Không thể thu thập trạng thái các node phân tán',
      error: err?.message || String(err),
    });
  }
};

export const getMetricsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Không thể thu thập chỉ số đo lường hệ thống',
      error: err?.message || String(err),
    });
  }
};

export const checkTargetDatabaseController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { database, host, port } = req.body;
    if (!database) {
      res.status(400).json({
        success: false,
        message: 'Tên database không được để trống',
      });
      return;
    }
    const result = await monitoringService.checkDatabaseHealth({ database, host, port });
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || 'Lỗi khi kiểm tra database chỉ định',
    });
  }
};

