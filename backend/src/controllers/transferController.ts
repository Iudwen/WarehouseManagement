import { Response } from 'express';
import { CustomRequest } from '../types';
import { processTransfer } from '../services/transferService';

export const handleTransfer = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const result = await processTransfer(req.body);
    res.status(200).json({ message: 'Điều chuyển hàng giữa 2 kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi điều chuyển kho' });
  }
};