/**
 * producer.ts
 * Kafka Producer: Đọc sự kiện Outbox và xuất bản lên Apache Kafka Topic tương ứng.
 */

import { getKafkaProducer } from './kafkaClient';
import { KAFKA_TOPICS } from './topics';
import { OutboxEvent } from '../workers/types';

export interface KafkaPublishResult {
  success: boolean;
  topic: string;
  partition: number;
  offset: string;
  eventId: string;
}

export function resolveTopicForEvent(eventType: string): string {
  if (eventType.startsWith('TRANSFER_')) {
    return KAFKA_TOPICS.TRANSFER_EVENTS;
  }
  if (
    eventType.startsWith('INVENTORY_') ||
    eventType === 'IMPORT' ||
    eventType === 'EXPORT'
  ) {
    return KAFKA_TOPICS.INVENTORY_EVENTS;
  }
  return KAFKA_TOPICS.SYSTEM_EVENTS;
}

export async function sendOutboxEventToKafka(
  event: OutboxEvent,
  sourceNode: string
): Promise<KafkaPublishResult> {
  const topic = resolveTopicForEvent(event.event_type);

  // 1. Log phát hiện sự kiện Outbox theo định dạng yêu cầu
  console.log(
    `[OUTBOX] Event detected | ID: ${event.event_id} | Type: ${event.event_type} | Node: ${sourceNode}`
  );

  const producer = await getKafkaProducer();

  // Chuẩn hóa payload
  let payloadObj = event.payload;
  if (typeof payloadObj === 'string') {
    try {
      payloadObj = JSON.parse(payloadObj);
    } catch {
      payloadObj = {};
    }
  }

  const messagePayload = {
    event_id: event.event_id,
    saga_id: event.saga_id,
    ma_giao_dich_global: event.ma_giao_dich_global,
    event_type: event.event_type,
    aggregate_id: event.aggregate_id,
    source_node: sourceNode,
    payload: payloadObj,
    version: event.version,
    created_at: event.created_at,
    published_at: new Date().toISOString(),
  };

  // 2. Log chuẩn bị gửi lên Kafka
  console.log(
    `[PRODUCER] Sending event to Kafka | Topic: ${topic} | Key: ${event.event_id}`
  );

  try {
    const recordMetadata = await producer.send({
      topic,
      messages: [
        {
          key: event.event_id,
          value: JSON.stringify(messagePayload),
          headers: {
            'event-id': event.event_id,
            'event-type': event.event_type,
            'source-node': sourceNode,
          },
        },
      ],
      acks: -1, // Đảm bảo toàn bộ replicas xác nhận
    });

    const meta = recordMetadata[0];
    const partition = meta?.partition ?? 0;
    const offset = meta?.offset ?? '0';

    // 3. Log xác nhận Kafka Broker đã nhận thông điệp
    console.log(
      `[PRODUCER] Message delivered | ID: ${event.event_id} | Topic: ${topic} | Partition: ${partition} | Offset: ${offset}`
    );

    return {
      success: true,
      topic,
      partition,
      offset,
      eventId: event.event_id,
    };
  } catch (err: any) {
    console.error(
      `[PRODUCER ERROR] Failed to send event ${event.event_id} to Kafka:`,
      err?.message || err
    );
    throw err;
  }
}

