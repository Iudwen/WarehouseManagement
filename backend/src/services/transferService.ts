import { pools } from '../config/postgresql';
import { UserPayload } from '../types';
import {
  AcceptTransferCommand,
  ReceiveTransferCommand,
  ShipTransferCommand,
  acceptTransferAtNode,
  receiveTransferAtNode,
  shipTransferAtNode,
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
  kho_nhap: string;
  ma_sp: string;
  so_luong_yeu_cau: number;
  current_state: string;
  status: string;
}

export interface DiscrepancyOptions {
  so_luong_thuc_nhan?: number;
  ly_do_thieu?: string;
}

type SourceConfirmationActor = Pick<
  UserPayload,
  'ma_nguoi_dung' | 'vai_tro' | 'ma_kho'
>;

export interface SourceConfirmationDependencies {
  loadSagaContext: (maPhieuDc: string) => Promise;
  acceptTransfer: (command: AcceptTransferCommand) => Promise;
}

type SourceShipmentActor = Pick<
  UserPayload,
  'ma_nguoi_dung' | 'vai_tro' | 'ma_kho'
>;

export interface SourceShipmentDependencies {
  loadSagaContext: (maPhieuDc: string) => Promise;
  shipTransfer: (command: ShipTransferCommand) => Promise;
}

type DestinationReceivingActor = Pick<
  UserPayload,
  'ma_nguoi_dung' | 'vai_tro' | 'ma_kho'
>;

export interface DestinationReceivingDependencies {
  loadSagaContext: (maPhieuDc: string) => Promise;
  receiveTransfer: (command: ReceiveTransferCommand) => Promise;
}

const nodeByWarehouse: Record = {
  HN01: 'NODE_HN',
  DN01: 'NODE_DN',
  HCM01: 'NODE_HCM',
};

const validateTransfer = (
  payload: TransferPayload,
  userKho?: string,
  userRole?: string,
): void => {
  const { ma_phieu_dc, kho_xuat, kho_nhap, items } = payload;

  const normalizedSource = kho_xuat?.trim().toUpperCase();
  const normalizedDestination = kho_nhap?.trim().toUpperCase();

  if (!ma_phieu_dc || ma_phieu_dc.length > 20) {
    throw new Error('Mã phiếu điều chuyển phải có từ 1 đến 20 ký tự');
  }

  if (!items || items.length !== 1) {
    throw new Error('Mỗi yêu cầu điều chuyển hiện chỉ hỗ trợ một sản phẩm');
  }

  if (
    !normalizedSource ||
    !normalizedDestination ||
    !nodeByWarehouse[normalizedSource] ||
    !nodeByWarehouse[normalizedDestination]
  ) {
    throw new Error('Kho xuất hoặc kho nhập không hợp lệ');
  }

  if (normalizedSource === normalizedDestination) {
    throw new Error('Kho xuất và Kho nhập không được trùng nhau');
  }

  if (!items[0].ma_sp || items[0].so_luong <= 0) {
    throw new Error('Sản phẩm và số lượng điều chuyển phải hợp lệ');
  }

  // ĐIỀU PHỐI là vai trò trung tâm nên không bị giới hạn bởi ma_kho.
  if (userRole === 'DIEU_PHOI') {
    return;
  }

  // ADMIN cũng không bị giới hạn bởi kho.
  if (userRole === 'ADMIN') {
    return;
  }

  // Các vai trò thuộc một kho chỉ được tạo yêu cầu từ chính kho của mình.
  if (
    !userKho ||
    userKho.toUpperCase() !== normalizedSource
  ) {
    throw new Error(
      `Tài khoản thuộc kho ${userKho || 'không xác định'}, không có quyền xuất hàng từ kho ${normalizedSource}`,
    );
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

export const approveTransfer = async (
  maPhieuDc: string,
  actor: Pick<UserPayload, 'ma_nguoi_dung' | 'vai_tro' | 'ma_kho'>,
) => {
  const client = await pools.CENTRAL.connect();

  try {
    // Chỉ QUẢN LÝ KHO mới được duyệt
    if (actor.vai_tro !== 'MANAGER') {
      throw new Error('Chỉ quản lý kho mới được duyệt yêu cầu điều chuyển');
    }

    await client.query('BEGIN');

    // Lấy thông tin phiếu và khóa bản ghi để tránh duyệt đồng thời
    const result = await client.query<{
      trang_thai: string;
      kho_xuat: string;
    }>(
      `SELECT trang_thai, kho_xuat
       FROM dieu_chuyen_central
       WHERE ma_phieu_dc = $1
       FOR UPDATE`,
      [maPhieuDc],
    );

    if (!result.rows[0]) {
      throw new Error('Không tìm thấy yêu cầu điều chuyển');
    }

    const transfer = result.rows[0];

    // Chỉ quản lý đúng kho nguồn mới được duyệt
    if (
      !actor.ma_kho ||
      actor.ma_kho.toUpperCase() !== transfer.kho_xuat.toUpperCase()
    ) {
      throw new Error(
        `Quản lý kho ${actor.ma_kho || 'không xác định'} không có quyền duyệt phiếu xuất từ kho ${transfer.kho_xuat}`,
      );
    }

    // Chỉ phiếu đang chờ duyệt mới được duyệt
    if (transfer.trang_thai !== 'PENDING') {
      throw new Error(
        `Yêu cầu đang ở trạng thái ${transfer.trang_thai}`,
      );
    }

    // Tạo Saga
    const saga = await client.query<{ saga_id: string }>(
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

const loadSagaContext = async (maPhieuDc: string): Promise => {
  const result = await pools.CENTRAL.query(
    `SELECT
       saga_id,
       ma_giao_dich_global AS global_id,
       ma_phieu_dc,
       kho_xuat,
       kho_nhap,
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
      `Tài khoản thuộc kho \({actor.ma_kho}, không có quyền xác nhận kho nguồn\){sagaContext.kho_xuat}`,
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

const defaultSourceShipmentDependencies: SourceShipmentDependencies = {
  loadSagaContext,
  shipTransfer: shipTransferAtNode,
};

/**
 * Task 3.5: Lệnh xuất hàng tại kho nguồn (Source Shipment)
 */
export const shipSourceTransfer = async (
  maPhieuDc: string,
  actor: SourceShipmentActor,
  dependencies: SourceShipmentDependencies = defaultSourceShipmentDependencies,
) => {
  const sagaContext = await dependencies.loadSagaContext(maPhieuDc);

  if (!sagaContext) {
    throw new Error(`Không tìm thấy Saga cho phiếu ${maPhieuDc}`);
  }

  if (!sagaContext.global_id) {
    throw new Error(`Saga của phiếu ${maPhieuDc} thiếu ma_giao_dich_global`);
  }

  if (sagaContext.status !== 'RUNNING') {
    throw new Error(`Saga đang ở trạng thái ${sagaContext.status}, không thể thực hiện xuất hàng`);
  }

  if (sagaContext.current_state !== 'SOURCE_ACCEPTED') {
    throw new Error(
      `Saga đang ở state ${sagaContext.current_state}, không thể thực hiện xuất hàng`,
    );
  }

  if (
    actor.vai_tro !== 'ADMIN' &&
    (!actor.ma_kho || actor.ma_kho.toUpperCase() !== sagaContext.kho_xuat.toUpperCase())
  ) {
    throw new Error(
      `Tài khoản thuộc kho \({actor.ma_kho}, không có quyền xuất hàng từ kho nguồn\){sagaContext.kho_xuat}`,
    );
  }

  const command: ShipTransferCommand = {
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    ma_kho: sagaContext.kho_xuat,
    ma_sp: sagaContext.ma_sp,
    so_luong: sagaContext.so_luong_yeu_cau,
  };

  await dependencies.shipTransfer(command);

  return {
    success: true,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_kho: sagaContext.kho_xuat,
    event_type: 'TRANSFER_SHIPPED',
  };
};

const defaultDestinationReceivingDependencies: DestinationReceivingDependencies = {
  loadSagaContext,
  receiveTransfer: receiveTransferAtNode,
};

/**
 * Task 3.7 & 3.9: Lệnh nhận hàng tại kho đích (Destination Receiving & Discrepancy Support)
 */
/**
 * Task 3.7 & 3.9: Lệnh nhận hàng tại kho đích (Destination Receiving & Discrepancy Support)
 * Hỗ trợ cả 3 tham số (backward compatible) và 4 tham số (Discrepancy options)
 */
export const receiveDestinationTransfer = async (
  maPhieuDc: string,
  actor: DestinationReceivingActor,
  optionsOrDeps?: DiscrepancyOptions | DestinationReceivingDependencies,
  deps?: DestinationReceivingDependencies,
) => {
  let discrepancyOptions: DiscrepancyOptions | undefined;
  let dependencies: DestinationReceivingDependencies;

  // Tự động nhận diện nếu tham số thứ 3 là dependencies (test cases cũ)
  if (optionsOrDeps && ('loadSagaContext' in optionsOrDeps || 'receiveTransfer' in optionsOrDeps)) {
    dependencies = optionsOrDeps as DestinationReceivingDependencies;
    discrepancyOptions = undefined;
  } else {
    discrepancyOptions = optionsOrDeps as DiscrepancyOptions | undefined;
    dependencies = deps || defaultDestinationReceivingDependencies;
  }

  const sagaContext = await dependencies.loadSagaContext(maPhieuDc);

  if (!sagaContext) {
    throw new Error(`Không tìm thấy Saga cho phiếu ${maPhieuDc}`);
  }

  if (!sagaContext.global_id) {
    throw new Error(`Saga của phiếu ${maPhieuDc} thiếu ma_giao_dich_global`);
  }

  if (sagaContext.status !== 'RUNNING') {
    throw new Error(`Saga đang ở trạng thái ${sagaContext.status}, không thể thực hiện nhận hàng`);
  }

  if (sagaContext.current_state !== 'IN_TRANSIT') {
    throw new Error(
      `Saga đang ở state ${sagaContext.current_state}, không thể thực hiện nhận hàng`,
    );
  }

  if (
    actor.vai_tro !== 'ADMIN' &&
    (!actor.ma_kho || actor.ma_kho.toUpperCase() !== sagaContext.kho_nhap.toUpperCase())
  ) {
    throw new Error(
      `Tài khoản thuộc kho \({actor.ma_kho}, không có quyền nhận hàng tại kho đích\){sagaContext.kho_nhap}`,
    );
  }

  // --- TASK 3.9: Validate & xử lý thông tin chênh lệch ---
  const actualQty = discrepancyOptions?.so_luong_thuc_nhan ?? sagaContext.so_luong_yeu_cau;
  const reason = discrepancyOptions?.ly_do_thieu?.trim();

  if (actualQty <= 0) {
    throw new Error('Số lượng thực nhận phải lớn hơn 0');
  }

  if (actualQty > sagaContext.so_luong_yeu_cau) {
    throw new Error(`Số lượng thực nhận (\({actualQty}) không được lớn hơn số lượng yêu cầu (\){sagaContext.so_luong_yeu_cau})`);
  }

  const isDiscrepancy = actualQty < sagaContext.so_luong_yeu_cau;

  if (isDiscrepancy && (!reason || reason === '')) {
    throw new Error('Bắt buộc phải nhập lý do thiếu khi số lượng thực nhận không đủ');
  }

  const command: ReceiveTransferCommand = {
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    ma_kho: sagaContext.kho_nhap,
    ma_sp: sagaContext.ma_sp,
    so_luong: sagaContext.so_luong_yeu_cau,
    so_luong_thuc_nhan: actualQty,
    ly_do_thieu: isDiscrepancy ? reason : undefined,
  };

  await dependencies.receiveTransfer(command);

  return {
    success: true,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_kho: sagaContext.kho_nhap,
    event_type: isDiscrepancy ? 'TRANSFER_COMPLETED_WITH_DISCREPANCY' : 'TRANSFER_COMPLETED',
    so_luong_thuc_nhan: actualQty,
    ly_do_thieu: isDiscrepancy ? reason : null,
  };
};