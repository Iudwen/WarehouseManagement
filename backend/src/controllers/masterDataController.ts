import { Response } from 'express';
import { CustomRequest } from '../types';
import { getMasterDataByNode } from '../services/masterDataService';

export const getMasterData = async (req: CustomRequest, res: Response) => {
  try {
    const ma_kho = (req.query.ma_kho as string) || req.maKhoContext || 'HN01';
    const data = await getMasterDataByNode(ma_kho);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy dữ liệu danh mục', error: err.message });
  }
};