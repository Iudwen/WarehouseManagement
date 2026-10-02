import {
  ApplicationMessage,
  MessageHandler,
  MessageTransport,
} from './messageBoundary';

export class InMemoryMessageTransport implements MessageTransport {
  public readonly messages: ApplicationMessage[] = [];
  public failuresRemaining = 0;
  private readonly handlers = new Map<string, Set<MessageHandler>>();

  public subscribe(messageType: string, handler: MessageHandler): () => void {
    const handlers = this.handlers.get(messageType) || new Set<MessageHandler>();
    handlers.add(handler);
    this.handlers.set(messageType, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(messageType);
    };
  }

  public async publish(message: ApplicationMessage): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('In-memory transport failure');
    }

    this.messages.push(message);

    const handlers = this.handlers.get(message.messageType) || [];
    for (const handler of handlers) {
      await handler(message);
    }
  }
}
