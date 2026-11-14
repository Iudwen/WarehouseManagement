/**
 * topics.ts
 * Khai báo danh mục Kafka Topics cho hệ thống Warehouse Management.
 */

export const KAFKA_TOPICS = {
  TRANSFER_EVENTS: 'warehouse.transfer.events',
  INVENTORY_EVENTS: 'warehouse.inventory.events',
  SYSTEM_EVENTS: 'warehouse.system.events',
} as const;

export type KafkaTopic = typeof KAFKA_TOPICS[keyof typeof KAFKA_TOPICS];

