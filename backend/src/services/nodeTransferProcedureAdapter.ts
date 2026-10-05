import { Pool } from 'pg';
import { getDbPool } from '../config/postgresql';

export interface AcceptTransferCommand {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  ma_kho: string;
  ma_sp: string;
  so_luong: number;
}

export interface ShipTransferCommand {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  ma_kho: string;
  ma_sp: string;
  so_luong: number;
}

export interface ReceiveTransferCommand {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  ma_kho: string;
  ma_sp: string;
  so_luong: number;
}

export interface TransferProcedureClient {
  query(text: string, values?: unknown[]): Promise;
  release(): void;
}

export interface TransferProcedurePool {
  connect(): Promise;
}

export type NodePoolResolver = (maKho: string) => TransferProcedurePool;

const resolveNodePool: NodePoolResolver = (maKho: string): Pool => getDbPool(maKho);

/**
 * Thực thi sp_accept_transfer tại Node DB tương ứng
 */
export const acceptTransferAtNode = async (
  command: AcceptTransferCommand,
  poolResolver: NodePoolResolver = resolveNodePool,
): Promise => {
  const pool = poolResolver(command.ma_kho);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT sp_accept_transfer($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::int)`,
      [
        command.saga_id,
        command.global_id,
        command.ma_phieu_dc,
        command.ma_kho,
        command.ma_sp,
        command.so_luong,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Task 3.5: Thực thi sp_ship_transfer tại Node DB xuất hàng (Source Node)
 */
export const shipTransferAtNode = async (
  command: ShipTransferCommand,
  poolResolver: NodePoolResolver = resolveNodePool,
): Promise => {
  const pool = poolResolver(command.ma_kho);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT sp_ship_transfer($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::int)`,
      [
        command.saga_id,
        command.global_id,
        command.ma_phieu_dc,
        command.ma_kho,
        command.ma_sp,
        command.so_luong,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Task 3.7: Thực thi sp_receive_transfer tại Node DB nhận hàng (Destination Node)
 */
export const receiveTransferAtNode = async (
  command: ReceiveTransferCommand,
  poolResolver: NodePoolResolver = resolveNodePool,
): Promise => {
  const pool = poolResolver(command.ma_kho);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT sp_receive_transfer($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::int)`,
      [
        command.saga_id,
        command.global_id,
        command.ma_phieu_dc,
        command.ma_kho,
        command.ma_sp,
        command.so_luong,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};