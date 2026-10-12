import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  processTransfer,
  approveTransfer,
  confirmSourceTransfer,
  shipTransfer,
  receiveTransfer,
  listTransfers,
} from '../services/transferService';

export const handleListTransfers = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { kho_xuat, kho_nhap, trang_thai, ma_kho } = req.query;

    // Chuẩn hóa và validate query parameters (chỉ nhận string)
    const filters: {
      kho_xuat?: string;
      kho_nhap?: string;
      trang_thai?: string;
      ma_kho?: string;
    } = {};

    if (typeof kho_xuat === 'string' && kho_xuat.trim()) {
      filters.kho_xuat = kho_xuat.trim();
    }
    if (typeof kho_nhap === 'string' && kho_nhap.trim()) {
      filters.kho_nhap = kho_nhap.trim();
    }
    if (typeof trang_thai === 'string' && trang_thai.trim()) {
      filters.trang_thai = trang_thai.trim();
    }
    if (typeof ma_kho === 'string' && ma_kho.trim()) {
      filters.ma_kho = ma_kho.trim();
    }

    const data = await listTransfers(filters);

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err: any) {
    console.error('List transfers error:', err);
    res.status(500).json({
      message: err.message || 'Lỗi lấy danh sách phiếu điều chuyển',
    });
  }
};

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
