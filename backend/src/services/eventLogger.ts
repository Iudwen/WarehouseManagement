import mongoose from 'mongoose';

export interface InventoryEventData {
  type: 'IMPORT' | 'EXPORT';
  ma_kho: string;
  ma_phieu: string;
  items: Array<{ ma_sp: string; so_luong: number; don_gia: number }>;
}

export interface TransferEventData {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  items: Array<{ ma_sp: string; so_luong: number }>;
}

export const logInventoryEvent = async (data: InventoryEventData): Promise<void> => {
  try {
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('inventory_events').insertOne({
        event_type: data.type,
        ma_kho: data.ma_kho,
        ma_phieu: data.ma_phieu,
        items: data.items,
        created_at: new Date()
      });
    }
  } catch (err) {
    console.error('Lỗi ghi inventory_event vào MongoDB:', err);
  }
};

export const logTransferEvent = async (data: TransferEventData): Promise<void> => {
  try {
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('transfer_events').insertOne({
        ma_phieu_dc: data.ma_phieu_dc,
        kho_xuat: data.kho_xuat,
        kho_nhap: data.kho_nhap,
        items: data.items,
        status: 'COMPLETED',
        created_at: new Date()
      });
    }
  } catch (err) {
    console.error('Lỗi ghi transfer_event vào MongoDB:', err);
  }
};