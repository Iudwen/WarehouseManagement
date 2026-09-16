import { Response } from 'express';
import { CustomRequest } from '../types';
import { processImport, processExport } from '../services/inventoryService';

export const handleImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }
    const result = await processImport(req.dbPool, req.body);
    res.status(201).json({ message: 'Tạo phiếu nhập kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xử lý nhập kho' });
  }
};

export const handleExport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }
    const result = await processExport(req.dbPool, req.body);
    res.status(201).json({ message: 'Tạo phiếu xuất kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xử lý xuất kho' });
  }
};