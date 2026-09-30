import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  approveExport,
  approveImport,
  processExport,
  processImport,
  rejectExport,
  rejectImport,
  listPendingApprovals,
} from '../services/inventoryService';

export const handleImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const payload = {
      ...req.body,
      ma_kho: req.body.ma_kho || req.maKhoContext || 'HN01',
    };

    const result = await processImport(req.dbPool, payload, req.user!);

    res.status(201).json({ 
      message: 'Tạo phiếu nhập kho, đang chờ duyệt',
      ma_phieu_nhap: result.ma_phieu_nhap,
      data: result 
    });
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

    const payload = {
      ...req.body,
      ma_kho: req.body.ma_kho || req.maKhoContext || 'HN01',
    };

    const result = await processExport(req.dbPool, payload, req.user!);

    res.status(201).json({ 
      message: 'Tạo phiếu xuất kho, đang chờ duyệt',
      ma_phieu_xuat: result.ma_phieu_xuat,
      data: result 
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xử lý xuất kho' });
  }
};

export const handleApproveImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool || !req.user) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const result = await approveImport(req.dbPool, req.params.maPhieu, req.user);
    res.json({ message: 'Đã duyệt phiếu nhập kho', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi duyệt phiếu nhập kho' });
  }
};

export const handleApproveExport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool || !req.user) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const result = await approveExport(req.dbPool, req.params.maPhieu, req.user);
    res.json({ message: 'Đã duyệt phiếu xuất kho', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi duyệt phiếu xuất kho' });
  }
};

export const handleRejectImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool || !req.user) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const result = await rejectImport(req.dbPool, req.params.maPhieu, req.user, req.body.reason || '');
    res.json({ message: 'Đã từ chối phiếu nhập kho', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi từ chối phiếu nhập kho' });
  }
};

export const handleRejectExport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool || !req.user) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const result = await rejectExport(req.dbPool, req.params.maPhieu, req.user, req.body.reason || '');
    res.json({ message: 'Đã từ chối phiếu xuất kho', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi từ chối phiếu xuất kho' });
  }
};

export const handlePendingApprovals = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const data = await listPendingApprovals(req.dbPool);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi tải phiếu chờ duyệt' });
  }
};