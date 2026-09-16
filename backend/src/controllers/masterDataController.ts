import { Request, Response } from 'express';
import { getMasterDataByNode } from '../services/masterDataService';

export const getMasterData = async (req: Request, res: Response) => {
  try {
    const ma_kho = (req.query.ma_kho as string) || 'HN01';
    const data = await getMasterDataByNode(ma_kho);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy dữ liệu danh mục', error: err.message });
  }
};