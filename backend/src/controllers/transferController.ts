import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  processTransfer,
  approveTransfer,
  confirmSourceTransfer,
  shipTransfer,
  receiveTransfer,
} from '../services/transferService';

export const handleTransfer = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await processTransfer({
      ...req.body,
      nguoi_tao: req.user?.ma_nguoi_dung,
    });

    res.status(201).json({
      message: 'Tạo yêu cầu điều chuyển thành công',
      data: result,
    });
  } catch (err: any) {
    console.error('Create transfer error:', err);

    res.status(400).json({
      message: err.message || 'Lỗi tạo yêu cầu điều chuyển',
    });
  }
};

export const handleApproveTransfer = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { maPhieu } = req.params;

    const result = await approveTransfer(
      maPhieu,
      req.user?.ma_nguoi_dung,
      req.maKhoContext
    );

    res.status(200).json({
      message: 'Duyệt yêu cầu điều chuyển thành công',
      data: result,
    });
  } catch (err: any) {
    console.error('Approve transfer error:', err);

    res.status(400).json({
      message: err.message || 'Lỗi duyệt yêu cầu điều chuyển',
    });
  }
};

export const handleSourceShipment = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { maPhieu } = req.params;

    const result = await shipTransfer(
      maPhieu,
      req.user?.ma_nguoi_dung,
      req.maKhoContext
    );

    res.status(200).json({
      message: 'Xuất hàng điều chuyển thành công',
      data: result,
    });
  } catch (err: any) {
    console.error('Source shipment error:', err);

    res.status(400).json({
      message: err.message || 'Lỗi xuất hàng điều chuyển',
    });
  }
};

export const handleDestinationReceiving = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { maPhieu } = req.params;

    const result = await receiveTransfer(
      maPhieu,
      req.user?.ma_nguoi_dung,
      req.maKhoContext
    );

    res.status(200).json({
      message: 'Nhận hàng điều chuyển thành công',
      data: result,
    });
  } catch (err: any) {
    console.error('Destination receiving error:', err);

    res.status(400).json({
      message: err.message || 'Lỗi nhận hàng điều chuyển',
    });
  }
};
export const handleConfirmSourceTransfer = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { maPhieu } = req.params;

    const result = await confirmSourceTransfer(
      maPhieu,
      req.user?.ma_nguoi_dung,
      req.maKhoContext
    );

    res.status(200).json({
      message: 'Xác nhận kho nguồn thành công',
      data: result,
    });
  } catch (err: any) {
    console.error('Confirm source transfer error:', err);

    res.status(400).json({
      message: err.message || 'Lỗi xác nhận kho nguồn',
    });
  }
};
