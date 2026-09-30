import { Pool } from 'pg';
import { ExportPayload, ImportPayload, UserPayload } from '../types';
import { logInventoryEvent } from './eventLogger';
import { generateTransactionCode } from '../utils/codeGenerator';

type InventoryActor = Pick<UserPayload, 'ma_nguoi_dung' | 'vai_tro'>;

type WorkflowDocument = {
  ma_phieu: string;
  ma_kho: string;
  trang_thai: string;
  version: number;
};

const validateItems = (items: Array<{ ma_sp: string; so_luong: number; don_gia?: number }>) => {
  if (!items?.length) {
    throw new Error('Danh sách hàng hóa không được để rỗng');
  }

  for (const item of items) {
    if (!item.ma_sp || item.so_luong <= 0) {
      throw new Error('Sản phẩm và số lượng phải hợp lệ');
    }
  }
};

const addWorkflowHistory = async (
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  loaiPhieu: 'NHAP' | 'XUAT',
  maPhieu: string,
  oldStatus: string | null,
  newStatus: string,
  actorId: string,
  reason?: string,
) => {
  await client.query(
    `INSERT INTO phieu_workflow_history
      (loai_phieu, ma_phieu, trang_thai_cu, trang_thai_moi, nguoi_thuc_hien, ly_do)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [loaiPhieu, maPhieu, oldStatus, newStatus, actorId, reason || null],
  );
};

export const processImport = async (
  pool: Pool,
  payload: ImportPayload,
  actor: InventoryActor,
) => {
  validateItems(payload.items);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const maPhieuNhap = payload.ma_phieu_nhap || (await generateTransactionCode(client, 'PN', payload.ma_kho));

    await client.query(
      `INSERT INTO phieu_nhap
        (ma_phieu_nhap, ma_kho, ma_ncc, ngay_nhap, trang_thai, nguoi_tao, tao_luc)
       VALUES ($1, $2, $3, NOW(), 'PENDING_APPROVAL', $4, NOW())`,
      [maPhieuNhap, payload.ma_kho, payload.ma_ncc, actor.ma_nguoi_dung],
    );

    for (const item of payload.items) {
      await client.query(
        `INSERT INTO ct_phieu_nhap (ma_phieu_nhap, ma_sp, so_luong, don_gia)
         VALUES ($1, $2, $3, $4)`,
        [maPhieuNhap, item.ma_sp, item.so_luong, item.don_gia],
      );
    }

    await addWorkflowHistory(client, 'NHAP', maPhieuNhap, null, 'PENDING_APPROVAL', actor.ma_nguoi_dung);
    await client.query('COMMIT');
    return { success: true, ma_phieu_nhap: maPhieuNhap, trang_thai: 'PENDING_APPROVAL' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const processExport = async (
  pool: Pool,
  payload: ExportPayload,
  actor: InventoryActor,
) => {
  validateItems(payload.items);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const maPhieuXuat = payload.ma_phieu_xuat || (await generateTransactionCode(client, 'PX', payload.ma_kho));

    await client.query(
      `INSERT INTO phieu_xuat
        (ma_phieu_xuat, ma_kho, ma_kh, ngay_xuat, trang_thai, nguoi_tao, tao_luc)
       VALUES ($1, $2, $3, NOW(), 'PENDING_APPROVAL', $4, NOW())`,
      [maPhieuXuat, payload.ma_kho, payload.ma_kh, actor.ma_nguoi_dung],
    );

    for (const item of payload.items) {
      await client.query(
        `INSERT INTO ct_phieu_xuat (ma_phieu_xuat, ma_sp, so_luong, don_gia)
         VALUES ($1, $2, $3, $4)`,
        [maPhieuXuat, item.ma_sp, item.so_luong, item.don_gia],
      );
    }

    await addWorkflowHistory(client, 'XUAT', maPhieuXuat, null, 'PENDING_APPROVAL', actor.ma_nguoi_dung);
    await client.query('COMMIT');
    return { success: true, ma_phieu_xuat: maPhieuXuat, trang_thai: 'PENDING_APPROVAL' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getWorkflowDocument = async (
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: WorkflowDocument[] }> },
  table: 'phieu_nhap' | 'phieu_xuat',
  idColumn: 'ma_phieu_nhap' | 'ma_phieu_xuat',
  id: string,
): Promise<WorkflowDocument> => {
  const result = await client.query(
    `SELECT ${idColumn} AS ma_phieu, ma_kho, trang_thai, version
     FROM ${table}
     WHERE ${idColumn} = $1
     FOR UPDATE`,
    [id],
  );

  const document = result.rows[0];
  if (!document) throw new Error('Không tìm thấy phiếu giao dịch');
  if (document.trang_thai !== 'PENDING_APPROVAL') {
    throw new Error(`Phiếu đang ở trạng thái ${document.trang_thai}, không thể duyệt`);
  }

  return document;
};

export const approveImport = async (pool: Pool, maPhieuNhap: string, actor: InventoryActor) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const document = await getWorkflowDocument(client, 'phieu_nhap', 'ma_phieu_nhap', maPhieuNhap);
    const items = await client.query(
      `SELECT ma_sp, so_luong, don_gia FROM ct_phieu_nhap WHERE ma_phieu_nhap = $1`,
      [maPhieuNhap],
    );

    for (const item of items.rows) {
      await client.query(
        `INSERT INTO ton_kho (ma_kho, ma_sp, so_luong, cap_nhat_luc)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (ma_kho, ma_sp)
         DO UPDATE SET so_luong = ton_kho.so_luong + EXCLUDED.so_luong, cap_nhat_luc = NOW()`,
        [document.ma_kho, item.ma_sp, item.so_luong],
      );
      await client.query(
        `INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, nhap)
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (ma_kho, ma_sp, ngay)
         DO UPDATE SET nhap = lich_su_ton_kho.nhap + EXCLUDED.nhap`,
        [document.ma_kho, item.ma_sp, item.so_luong],
      );
    }

    await client.query(
      `UPDATE phieu_nhap
       SET trang_thai = 'COMPLETED', nguoi_duyet = $1, duyet_luc = NOW(), version = version + 1
       WHERE ma_phieu_nhap = $2 AND version = $3`,
      [actor.ma_nguoi_dung, maPhieuNhap, document.version],
    );
    await addWorkflowHistory(client, 'NHAP', maPhieuNhap, 'PENDING_APPROVAL', 'COMPLETED', actor.ma_nguoi_dung);
    await client.query('COMMIT');

    await logInventoryEvent({ type: 'IMPORT', ma_kho: document.ma_kho, ma_phieu: maPhieuNhap, items: items.rows });
    return { success: true, ma_phieu_nhap: maPhieuNhap, trang_thai: 'COMPLETED' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const approveExport = async (pool: Pool, maPhieuXuat: string, actor: InventoryActor) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const document = await getWorkflowDocument(client, 'phieu_xuat', 'ma_phieu_xuat', maPhieuXuat);
    const items = await client.query(
      `SELECT ma_sp, so_luong, don_gia FROM ct_phieu_xuat WHERE ma_phieu_xuat = $1`,
      [maPhieuXuat],
    );

    for (const item of items.rows) {
      const stock = await client.query(
        `SELECT so_luong FROM ton_kho WHERE ma_kho = $1 AND ma_sp = $2 FOR UPDATE`,
        [document.ma_kho, item.ma_sp],
      );
      const currentStock = stock.rows[0]?.so_luong || 0;
      if (currentStock < item.so_luong) {
        throw new Error(`Sản phẩm ${item.ma_sp} không đủ tồn kho (Hiện có: ${currentStock}, Cần xuất: ${item.so_luong})`);
      }

      await client.query(
        `UPDATE ton_kho SET so_luong = so_luong - $1, cap_nhat_luc = NOW()
         WHERE ma_kho = $2 AND ma_sp = $3`,
        [item.so_luong, document.ma_kho, item.ma_sp],
      );
      await client.query(
        `INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, xuat)
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (ma_kho, ma_sp, ngay)
         DO UPDATE SET xuat = lich_su_ton_kho.xuat + EXCLUDED.xuat`,
        [document.ma_kho, item.ma_sp, item.so_luong],
      );
    }

    await client.query(
      `UPDATE phieu_xuat
       SET trang_thai = 'COMPLETED', nguoi_duyet = $1, duyet_luc = NOW(), version = version + 1
       WHERE ma_phieu_xuat = $2 AND version = $3`,
      [actor.ma_nguoi_dung, maPhieuXuat, document.version],
    );
    await addWorkflowHistory(client, 'XUAT', maPhieuXuat, 'PENDING_APPROVAL', 'COMPLETED', actor.ma_nguoi_dung);
    await client.query('COMMIT');

    await logInventoryEvent({ type: 'EXPORT', ma_kho: document.ma_kho, ma_phieu: maPhieuXuat, items: items.rows });
    return { success: true, ma_phieu_xuat: maPhieuXuat, trang_thai: 'COMPLETED' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const rejectWorkflowDocument = async (
  pool: Pool,
  table: 'phieu_nhap' | 'phieu_xuat',
  idColumn: 'ma_phieu_nhap' | 'ma_phieu_xuat',
  loaiPhieu: 'NHAP' | 'XUAT',
  id: string,
  actor: InventoryActor,
  reason: string,
) => {
  if (!reason.trim()) throw new Error('Cần nhập lý do từ chối');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const document = await getWorkflowDocument(client, table, idColumn, id);
    await client.query(
      `UPDATE ${table}
       SET trang_thai = 'REJECTED', nguoi_duyet = $1, duyet_luc = NOW(), ly_do_tu_choi = $2, version = version + 1
       WHERE ${idColumn} = $3 AND version = $4`,
      [actor.ma_nguoi_dung, reason, id, document.version],
    );
    await addWorkflowHistory(client, loaiPhieu, id, 'PENDING_APPROVAL', 'REJECTED', actor.ma_nguoi_dung, reason);
    await client.query('COMMIT');
    return { success: true, ma_phieu: id, trang_thai: 'REJECTED' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const rejectImport = (pool: Pool, id: string, actor: InventoryActor, reason: string) =>
  rejectWorkflowDocument(pool, 'phieu_nhap', 'ma_phieu_nhap', 'NHAP', id, actor, reason);

export const rejectExport = (pool: Pool, id: string, actor: InventoryActor, reason: string) =>
  rejectWorkflowDocument(pool, 'phieu_xuat', 'ma_phieu_xuat', 'XUAT', id, actor, reason);

export const listPendingApprovals = async (pool: Pool) => {
  const result = await pool.query(`
    SELECT
      'NHAP' AS loai_phieu,
      pn.ma_phieu_nhap AS ma_phieu,
      pn.ma_kho,
      pn.ma_ncc AS ma_doi_tac,
      pn.ngay_nhap AS tao_luc,
      pn.nguoi_tao,
      pn.trang_thai
    FROM phieu_nhap pn
    WHERE pn.trang_thai = 'PENDING_APPROVAL'
    UNION ALL
    SELECT
      'XUAT' AS loai_phieu,
      px.ma_phieu_xuat AS ma_phieu,
      px.ma_kho,
      px.ma_kh AS ma_doi_tac,
      px.ngay_xuat AS tao_luc,
      px.nguoi_tao,
      px.trang_thai
    FROM phieu_xuat px
    WHERE px.trang_thai = 'PENDING_APPROVAL'
    ORDER BY tao_luc ASC
  `);

  return result.rows;
};
