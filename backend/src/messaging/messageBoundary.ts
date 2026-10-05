export interface ApplicationMessage<TPayload = Record<string, unknown>> {
  messageType: string;
  aggregateId: string;
  payload: TPayload;
  eventId?: string;
  sagaId?: string;
  globalTransactionId?: string;
}

export type MessageHandler = (message: ApplicationMessage) => Promise<void> | void;

export interface MessageTransport {
  publish(message: ApplicationMessage): Promise<void>;
  subscribe(messageType: string, handler: MessageHandler): () => void;
}

export interface TransactionClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export const appendOutboxEvent = async (
  client: TransactionClient,
  message: ApplicationMessage,
): Promise<void> => {
  await client.query(
    `INSERT INTO outbox_event
      (event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id, payload)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb)`,
    [
      message.eventId || null,
      message.sagaId || null,
      message.globalTransactionId || null,
      message.messageType,
      message.aggregateId,
      JSON.stringify(message.payload),
    ],
  );
};
