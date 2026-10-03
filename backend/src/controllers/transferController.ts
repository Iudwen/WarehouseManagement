import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  approveTransfer,
  confirmSourceTransfer,
  processTransfer,
  shipSourceTransfer,
} from '../services/transferService';

export const handleTransfer = async (req: CustomRequest, res: Response): Promise => {
  try {
    const result = await processTransfer(
      req.body,
      req.user?.ma_kho || undefined,
      req.user?.vai_tro
    );
    res.status(202).json({ message: 'Đã tạo yêu cầu điều chuyển, đang chờ duyệt', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi điều chuyển kho' });
  }
};

export const handleApproveTransfer = async (req: CustomRequest, res: Response): Promise => {
  try {
    const result = await approveTransfer(req.params.maPhieu);
    res.json({ message: 'Đã duyệt yêu cầu điều chuyển và tạo Saga', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi duyệt yêu cầu điều chuyển' });
  }
};

export const handleSourceConfirmation = async (
  req: CustomRequest,
  res: Response,
): Promise => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Chưa xác thực người dùng' });
      return;
    }

    const result = await confirmSourceTransfer(req.params.maPhieu, req.user);
    res.status(202).json({
      message: 'Đã xác nhận kho nguồn, reservation đang được xử lý tại node sở hữu',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xác nhận kho nguồn' });
  }
};

/**
 * Task 3.5: Controller xử lý lệnh xuất hàng tại kho nguồn (Source Shipment)
 */
export const handleSourceShipment = async (
  req: CustomRequest,
  res: Response,
): Promise => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Chưa xác thực người dùng' });
      return;
    }

    const result = await shipSourceTransfer(req.params.maPhieu, req.user);
    res.status(202).json({
      message: 'Đã xuất hàng tại kho nguồn, shipment đang được xử lý tại node sở hữu',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xuất hàng tại kho nguồn' });
  }
};