import { pools } from '../config/postgresql';
import { UserPayload } from '../types';
import {
  AcceptTransferCommand,
  acceptTransferAtNode,
} from './nodeTransferProcedureAdapter';

export interface TransferPayload {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  items: Array<{ ma_sp: string; so_luong: number }>;
}

export interface SagaTransferContext {
  saga_id: string;
  global_id: string | null;
  ma_phieu_dc: string;
  kho_xuat: string;
  ma_sp: string;
  so_luong_yeu_cau: number;
  current_state: string;
  status: string;
}

type SourceConfirmationActor = Pick<
  UserPayload,
  'ma_nguoi_dung' | 'vai_tro' | 'ma_kho'
>;

export interface SourceConfirmationDependencies {
  loadSagaContext: (maPhieuDc: string) => Promise<SagaTransferContext | null>;
  acceptTransfer: (command: AcceptTransferCommand) => Promise<void>;
}

const nodeByWarehouse: Record<string, string> = {
  HN01: 'NODE_HN',
  DN01: 'NODE_DN',
  HCM01: 'NODE_HCM',
};

const validateTransfer = (payload: TransferPayload, userKho?: string, userRole?: string): void => {
  const { ma_phieu_dc, kho_xuat, kho_nhap, items } = payload;
  const normalizedSource = kho_xuat?.trim().toUpperCase();
  const normalizedDestination = kho_nhap?.trim().toUpperCase();

  if (!ma_phieu_dc || ma_phieu_dc.length > 20) {
    throw new Error('Mã phiếu điều chuyển phải có từ 1 đến 20 ký tự');
  }

  if (!items || items.length !== 1) {
    throw new Error('Mỗi yêu cầu điều chuyển hiện chỉ hỗ trợ một sản phẩm');
  }

  if (!nodeByWarehouse[normalizedSource] || !nodeByWarehouse[normalizedDestination]) {
    throw new Error('Kho xuất hoặc kho nhập không hợp lệ');
  }

  if (normalizedSource === normalizedDestination) {
    throw new Error('Kho xuất và Kho nhập không được trùng nhau');
  }

  if (!items[0].ma_sp || items[0].so_luong <= 0) {
    throw new Error('Sản phẩm và số lượng điều chuyển phải hợp lệ');
  }

  if (userRole !== 'ADMIN' && userKho?.toUpperCase() !== normalizedSource) {
    throw new Error(`Tài khoản thuộc kho ${userKho}, không có quyền xuất hàng từ kho ${normalizedSource}`);
  }
};

export const processTransfer = async (
  payload: TransferPayload,
  userKho?: string,
  userRole?: string,
) => {
  validateTransfer(payload, userKho, userRole);

  const sourceWarehouse = payload.kho_xuat.trim().toUpperCase();
  const destinationWarehouse = payload.kho_nhap.trim().toUpperCase();
  const client = await pools.CENTRAL.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO dieu_chuyen_central
        (ma_phieu_dc, kho_xuat, kho_nhap, ma_sp, so_luong, ngay_dieu_chuyen, trang_thai, source_node)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'PENDING', $6)`,
      [
        payload.ma_phieu_dc,
        sourceWarehouse,
        destinationWarehouse,
        payload.items[0].ma_sp,
        payload.items[0].so_luong,
        nodeByWarehouse[sourceWarehouse],
      ],
    );
    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_dc: payload.ma_phieu_dc,
      trang_thai: 'PENDING',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const approveTransfer = async (maPhieuDc: string) => {
  const client = await pools.CENTRAL.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT trang_thai
       FROM dieu_chuyen_central
       WHERE ma_phieu_dc = $1
       FOR UPDATE`,
      [maPhieuDc],
    );

    if (!result.rows[0]) {
      throw new Error('Không tìm thấy yêu cầu điều chuyển');
    }

    if (result.rows[0].trang_thai !== 'PENDING') {
      throw new Error(`Yêu cầu đang ở trạng thái ${result.rows[0].trang_thai}`);
    }

    const saga = await client.query(
      `SELECT sp_create_saga($1) AS saga_id`,
      [maPhieuDc],
    );
    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_dc: maPhieuDc,
      saga_id: saga.rows[0].saga_id,
      trang_thai: 'DANG_XU_LY',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const loadSagaContext = async (maPhieuDc: string): Promise<SagaTransferContext | null> => {
  const result = await pools.CENTRAL.query(
    `SELECT
       saga_id,
       ma_giao_dich_global AS global_id,
       ma_phieu_dc,
       kho_xuat,
       ma_sp,
       so_luong_yeu_cau,
       current_state,
       status
     FROM saga_transaction
     WHERE ma_phieu_dc = $1`,
    [maPhieuDc],
  );

  return result.rows[0] || null;
};

const defaultSourceConfirmationDependencies: SourceConfirmationDependencies = {
  loadSagaContext,
  acceptTransfer: acceptTransferAtNode,
};

export const confirmSourceTransfer = async (
  maPhieuDc: string,
  actor: SourceConfirmationActor,
  dependencies: SourceConfirmationDependencies = defaultSourceConfirmationDependencies,
) => {
  const sagaContext = await dependencies.loadSagaContext(maPhieuDc);

  if (!sagaContext) {
    throw new Error(`Không tìm thấy Saga cho phiếu ${maPhieuDc}`);
  }

  if (!sagaContext.global_id) {
    throw new Error(`Saga của phiếu ${maPhieuDc} thiếu ma_giao_dich_global`);
  }

  if (sagaContext.status !== 'RUNNING') {
    throw new Error(`Saga đang ở trạng thái ${sagaContext.status}, không thể xác nhận kho nguồn`);
  }

  if (sagaContext.current_state !== 'WAITING_SOURCE_CONFIRMATION') {
    throw new Error(
      `Saga đang ở state ${sagaContext.current_state}, không thể xác nhận kho nguồn`,
    );
  }

  if (
    actor.vai_tro !== 'ADMIN' &&
    (!actor.ma_kho || actor.ma_kho.toUpperCase() !== sagaContext.kho_xuat.toUpperCase())
  ) {
    throw new Error(
      `Tài khoản thuộc kho ${actor.ma_kho}, không có quyền xác nhận kho nguồn ${sagaContext.kho_xuat}`,
    );
  }

  const command: AcceptTransferCommand = {
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    ma_kho: sagaContext.kho_xuat,
    ma_sp: sagaContext.ma_sp,
    so_luong: sagaContext.so_luong_yeu_cau,
  };

  await dependencies.acceptTransfer(command);

  return {
    success: true,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_kho: sagaContext.kho_xuat,
    event_type: 'TRANSFER_ACCEPTED',
  };
};
