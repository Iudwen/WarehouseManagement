/**
 * consumer.ts
 * Kafka Consumer: Đọc thông điệp từ Kafka Topics, kiểm tra Idempotency và ghi vào MongoDB Event Logs.
 */

import mongoose from 'mongoose';
import { Consumer, EachMessagePayload } from 'kafkajs';
import { createKafkaConsumer } from './kafkaClient';
import { KAFKA_TOPICS } from './topics';

export interface ProcessedEventResult {
  eventId: string;
  isDuplicate: boolean;
  success: boolean;
}

export class KafkaEventConsumer {
  private consumer: Consumer;
  private isRunning: boolean = false;
  private groupId: string;

  constructor(groupId: string = 'warehouse-audit-consumer-group') {
    this.groupId = groupId;
    this.consumer = createKafkaConsumer(groupId);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    await this.consumer.connect();
    console.log(`[CONSUMER] Connected to Kafka with group: ${this.groupId}`);

    // Đăng ký nhận tin từ cả 3 topics
    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.TRANSFER_EVENTS,
        KAFKA_TOPICS.INVENTORY_EVENTS,
        KAFKA_TOPICS.SYSTEM_EVENTS,
      ],
      fromBeginning: false,
    });

    this.isRunning = true;

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    console.log(`[CONSUMER] Listening for events on topics: ${Object.values(KAFKA_TOPICS).join(', ')}`);
  }

  public async handleMessage(payload: EachMessagePayload): Promise<ProcessedEventResult> {
    const { topic, partition, message } = payload;
    const rawValue = message.value?.toString() || '{}';

    let data: any;
    try {
      data = JSON.parse(rawValue);
    } catch {
      data = { raw: rawValue };
    }

    const eventId = data.event_id || message.key?.toString() || `UNKNOWN-${Date.now()}`;
    const eventType = data.event_type || 'UNKNOWN_EVENT';

    // 1. Log nhận thông điệp
    console.log(
      `[CONSUMER] Message received | ID: ${eventId} | Topic: ${topic} | Partition: ${partition} | Offset: ${message.offset}`
    );

    // 2. Kiểm tra Idempotency dựa trên MongoDB
    const db = mongoose.connection.db;
    if (db) {
      const collectionName = topic === KAFKA_TOPICS.TRANSFER_EVENTS
        ? 'transfer_events'
        : topic === KAFKA_TOPICS.INVENTORY_EVENTS
        ? 'inventory_events'
        : 'system_logs';

      const existing = await db.collection(collectionName).findOne({ event_id: eventId });
      if (existing) {
        console.log(
          `[CONSUMER] [IDEMPOTENT SKIP] Event ${eventId} already processed in ${collectionName}. Skipping duplicate execution.`
        );
        return { eventId, isDuplicate: true, success: true };
      }

      // 3. Log bắt đầu xử lý nghiệp vụ
      console.log(
        `[CONSUMER] Processing event | ID: ${eventId} | Type: ${eventType}`
      );

      // Lưu trữ tài liệu Audit Log vào MongoDB (với try/catch xử lý E11000 duplicate key)
      try {
        if (topic === KAFKA_TOPICS.TRANSFER_EVENTS) {
          const p = data.payload || {};
          await db.collection('transfer_events').insertOne({
            event_id: eventId,
            saga_id: data.saga_id,
            ma_giao_dich_global: data.ma_giao_dich_global,
            ma_phieu_dc: data.aggregate_id || p.ma_phieu_dc,
            event_type: eventType,
            kho_xuat: p.kho_xuat || p.ma_kho || data.source_node || 'HN01',
            kho_nhap: p.kho_nhap || 'DN01',
            ma_sp: p.ma_sp,
            so_luong: p.so_luong || p.so_luong_thuc_nhan,
            status: eventType === 'TRANSFER_SHIPPED' ? 'SHIPPED' : 'COMPLETED',
            event_time: p.event_time || data.created_at || new Date().toISOString(),
            created_at: new Date(),
            source_node: data.source_node,
            raw: data,
          });
        } else if (topic === KAFKA_TOPICS.INVENTORY_EVENTS) {
          const p = data.payload || {};
          await db.collection('inventory_events').insertOne({
            event_id: eventId,
            event_type: eventType,
            ma_kho: data.source_node || p.ma_kho || 'HN01',
            ma_phieu: data.aggregate_id,
            items: p.items || [{ ma_sp: p.ma_sp, so_luong: p.so_luong, don_gia: p.don_gia }],
            created_at: new Date(),
            raw: data,
          });
        } else {
          await db.collection('system_logs').insertOne({
            event_id: eventId,
            level: 'INFO',
            service: 'kafka-consumer',
            message: `Processed event ${eventType}`,
            metadata: data,
            created_at: new Date(),
          });
        }
      } catch (insertErr: any) {
        // Xử lý lỗi trùng khóa vật lý MongoDB (E11000) một cách an toàn và hợp lệ
        if (insertErr?.code === 11000 || String(insertErr).includes('E11000')) {
          console.log(
            `[CONSUMER] [IDEMPOTENT DUPLICATE-KEY E11000] Event ${eventId} đã tồn tại trong MongoDB (chặn bởi unique index). Bỏ qua an toàn.`
          );
          return { eventId, isDuplicate: true, success: true };
        }
        throw insertErr;
      }

      // 4. Log hoàn thành xử lý
      console.log(
        `[CONSUMER] Event processed successfully | ID: ${eventId} | Stored in MongoDB`
      );

      return { eventId, isDuplicate: false, success: true };
    }

    console.warn(`[CONSUMER] MongoDB not connected, event ${eventId} acknowledged without DB persistence.`);
    return { eventId, isDuplicate: false, success: true };
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    await this.consumer.disconnect();
    console.log(`[CONSUMER] Disconnected consumer group: ${this.groupId}`);
  }
}

let defaultConsumerInstance: KafkaEventConsumer | null = null;

export function getDefaultEventConsumer(): KafkaEventConsumer {
  if (!defaultConsumerInstance) {
    defaultConsumerInstance = new KafkaEventConsumer();
  }
  return defaultConsumerInstance;
}

