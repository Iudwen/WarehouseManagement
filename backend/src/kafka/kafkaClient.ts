/**
 * kafkaClient.ts
 * Quản lý kết nối Apache Kafka Client (KRaft Broker).
 */

import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9094')
  .split(',')
  .map((b) => b.trim());

const clientId = process.env.KAFKA_CLIENT_ID || 'warehouse-backend';

export const kafka = new Kafka({
  clientId,
  brokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

let producerInstance: Producer | null = null;

export async function getKafkaProducer(): Promise<Producer> {
  if (!producerInstance) {
    producerInstance = kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: false, // Thích hợp cho single-partition broker sinh viên
    });
    await producerInstance.connect();
    console.log(`[KAFKA PRODUCER] Connected to Kafka brokers: ${brokers.join(', ')}`);
  }
  return producerInstance;
}

export function createKafkaConsumer(groupId: string): Consumer {
  return kafka.consumer({
    groupId,
    allowAutoTopicCreation: true,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });
}

export async function disconnectKafka(): Promise<void> {
  if (producerInstance) {
    try {
      await producerInstance.disconnect();
      producerInstance = null;
      console.log('[KAFKA PRODUCER] Disconnected successfully');
    } catch (err) {
      console.error('[KAFKA PRODUCER] Error disconnecting:', err);
    }
  }
}

