import { Pool } from 'pg';

import {
  ImportPayload,
  ExportPayload,
} from '../types';

import {
  insertImportReceipt,
  insertImportDetail,
  increaseStock,
  increaseImportHistory,
} from '../repositories/importRepository';

import {
  getCurrentStockForUpdate,
  insertExportReceipt,
  insertExportDetail,
  decreaseStock,
  increaseExportHistory,
} from '../repositories/exportRepository';

import { logInventoryEvent } from './eventLogger';

export const processImport = async (
  pool: Pool,
  payload: ImportPayload
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      ma_phieu_nhap,
      ma_kho,
      ma_ncc,
      items,
    } = payload;

    await insertImportReceipt(
      client,
      ma_phieu_nhap,
      ma_kho,
      ma_ncc
    );

    for (const item of items) {
      await insertImportDetail(
        client,
        ma_phieu_nhap,
        item
      );

      await increaseStock(
        client,
        ma_kho,
        item
      );

      await increaseImportHistory(
        client,
        ma_kho,
        item
      );
    }

    await client.query('COMMIT');

    await logInventoryEvent({
      type: 'IMPORT',
      ma_kho,
      ma_phieu: ma_phieu_nhap,
      items,
    });

    return {
      success: true,
      ma_phieu_nhap,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const processExport = async (
  pool: Pool,
  payload: ExportPayload
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      ma_phieu_xuat,
      ma_kho,
      ma_kh,
      items,
    } = payload;

    // Lock và kiểm tra tồn kho trước khi xuất
    for (const item of items) {
      const currentStock =
        await getCurrentStockForUpdate(
          client,
          ma_kho,
          item.ma_sp
        );

      if (currentStock < item.so_luong) {
        throw new Error(
          `Sản phẩm ${item.ma_sp} không đủ tồn kho ` +
          `(Hiện có: ${currentStock}, Cần xuất: ${item.so_luong})`
        );
      }
    }

    await insertExportReceipt(
      client,
      ma_phieu_xuat,
      ma_kho,
      ma_kh
    );

    for (const item of items) {
      await insertExportDetail(
        client,
        ma_phieu_xuat,
        item
      );

      await decreaseStock(
        client,
        ma_kho,
        item
      );

      await increaseExportHistory(
        client,
        ma_kho,
        item
      );
    }

    await client.query('COMMIT');

    await logInventoryEvent({
      type: 'EXPORT',
      ma_kho,
      ma_phieu: ma_phieu_xuat,
      items,
    });

    return {
      success: true,
      ma_phieu_xuat,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};