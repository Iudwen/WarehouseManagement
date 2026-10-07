import { Response } from 'express';
import { CustomRequest } from '../types';
import { getMasterDataByNode } from '../services/masterDataService';

export const getMasterData = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.dbPool) {
      res.status(500).json({
        message: 'Không xác định được kết nối CSDL',
      });
      return;
    }

    const data = await getMasterDataByNode(req.dbPool);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error('Master data error:', err);

    res.status(500).json({
      message: 'Lỗi lấy dữ liệu danh mục',
    });
  }
};