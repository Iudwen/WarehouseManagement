/**
 * outboxWorker.ts
 * Entry point và Bộ điều phối vòng đời hoàn chỉnh cho Outbox Relay Worker (Gate 6.4C).
 * Tích hợp:
 *   - outboxPoller: reapExpiredLeases & claimEvents
 *   - outboxRelay: relaySingleEvent (với OCC Fencing)
 *   - types: WorkerConfig, OutboxEvent, RelayResult
 */

import { Pool } from 'pg';
import { getDbPool, pools } from '../config/postgresql';
import { claimEvents, reapExpiredLeases } from './outboxPoller';
import { relaySingleEvent } from './outboxRelay';
import { WorkerConfig, OutboxEvent, RelayResult } from './types';

export class OutboxWorker {
  private isRunning: boolean = false;
  private isPolling: boolean = false;
  private inFlightEvents: Set<string> = new Set();
  private pollTimer: NodeJS.Timeout | null = null;
  private config: WorkerConfig;
  private nodePool: Pool;
  private centralPool: Pool;

  constructor(
    config: Partial<WorkerConfig> = {},
    customNodePool?: Pool,
    customCentralPool?: Pool
  ) {
    let rawNode = (config.nodeName || process.env.NODE_NAME || 'HN').trim().toUpperCase();
    if (!['HN', 'DN', 'HCM'].includes(rawNode)) {
      if (rawNode.includes('HN')) rawNode = 'HN';
      else if (rawNode.includes('DN')) rawNode = 'DN';
      else if (rawNode.includes('HCM')) rawNode = 'HCM';
      else {
        throw new Error(`Tên Node không hợp lệ: "${config.nodeName}". Chỉ chấp nhận: HN, DN, HCM.`);
      }
    }
    const nodeName = rawNode;

    const batchSize = config.batchSize && config.batchSize > 0 ? config.batchSize : 10;
    const pollIntervalMs = config.pollIntervalMs !== undefined && config.pollIntervalMs >= 0 ? config.pollIntervalMs : 3000;
    const leaseTimeoutSeconds = config.leaseTimeoutSeconds && config.leaseTimeoutSeconds > 0 ? config.leaseTimeoutSeconds : 300;

    // =========================================================================
    // CƠ CHẾ AN TOÀN VÀ PHÂN ĐỊNH CHẾ ĐỘ QUÉT OUTBOX
    // =========================================================================
    let requireWhitelist = config.requireWhitelist;
    let whitelistEventIds = config.whitelistEventIds;
    let allowUnsafeAllPending = config.allowUnsafeAllPending || false;

    if (whitelistEventIds && Array.isArray(whitelistEventIds) && whitelistEventIds.length > 0) {
      // 1. Chế độ Whitelist (Chỉ quét các ID chỉ định - dùng cho Test Fixture / Audit)
      requireWhitelist = true;
    } else if (requireWhitelist === true) {
      // Nếu bật requireWhitelist tường minh mà không có ID -> Từ chối khởi tạo
      throw new Error(
        `[FAIL-CLOSED SAFETY LOCK] Worker từ chối khởi tạo: Bắt buộc cung cấp whitelistEventIds hợp lệ khi requireWhitelist=true.`
      );
    } else {
      // 2. Chế độ Tiêu Chuẩn (Standard Production Relay):
      // Quét tất cả các sự kiện PENDING có next_retry_at <= CURRENT_TIMESTAMP.
      // Dữ liệu cũ chưa xác minh trên các node (25 bản ghi HN, 1 bản ghi DN) đã được cách ly qua cơ chế Quarantine
      // với next_retry_at = '2099-01-01 00:00:00' và lưu trong bảng backup outbox_quarantine_backup_20261014.
      // Node HCM hiện tại có 0 sự kiện trong outbox_event.
      // Đã loại bỏ hoàn toàn bộ lọc createdAfter mặc định để bảo đảm các sự kiện hợp lệ sinh ra trong thời gian
      // worker tạm dừng hoặc downtime không bị bỏ sót ngoài ý muốn.
      requireWhitelist = false;
    }

    this.config = {
      nodeName,
      batchSize,
      pollIntervalMs,
      dryRun: config.dryRun || false,
      once: config.once || false,
      whitelistEventIds,
      requireWhitelist: Boolean(requireWhitelist),
      allowUnsafeAllPending,
      createdAfter: undefined,
      leaseTimeoutSeconds,
      maxShutdownWaitMs: config.maxShutdownWaitMs || 5000,
    };

    this.nodePool = customNodePool || getDbPool(this.config.nodeName);
    this.centralPool = customCentralPool || pools.CENTRAL;
  }

  public getConfig(): WorkerConfig {
    return { ...this.config };
  }

  public getInFlightCount(): number {
    return this.inFlightEvents.size;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getIsPolling(): boolean {
    return this.isPolling;
  }

  /**
   * Khởi động Worker vòng đời liên tục hoặc single-pass.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    console.log('====================================================');
    console.log(`[OUTBOX WORKER] Khởi động thành công trên Node: ${this.config.nodeName}`);
    console.log(`  -> Batch Size: ${this.config.batchSize}`);
    console.log(`  -> Poll Interval: ${this.config.pollIntervalMs}ms`);
    console.log(`  -> Mode: ${this.config.once ? 'Single-pass (--once)' : 'Continuous'}`);
    if (this.config.requireWhitelist) {
      console.log(`  -> Filter Mode: WHITELIST (${this.config.whitelistEventIds?.length || 0} events)`);
    } else {
      console.log(`  -> Filter Mode: STANDARD ACTIONABLE PENDING (Quarantine-Protected, createdAfter filter removed)`);
    }
    console.log('====================================================');

    if (this.config.once) {
      // Chạy đúng một chu kỳ rồi dừng an toàn
      await this.pollOnce();
      await this.stop();
    } else {
      // Lên lịch chu kỳ đầu tiên
      this.scheduleNextPoll(0);
    }
  }

  /**
   * Dừng Worker an toàn (Graceful Shutdown).
   * Không nhận batch mới, chờ các event đang relay hoàn tất tối đa maxShutdownWaitMs.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[OUTBOX WORKER] Nhận yêu cầu dừng. Bắt đầu Graceful Shutdown...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Chờ các in-flight events kết thúc
    const startTime = Date.now();
    const waitLimit = this.config.maxShutdownWaitMs || 5000;

    while (this.inFlightEvents.size > 0 || this.isPolling) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= waitLimit) {
        console.warn(
          `[OUTBOX WORKER WARNING] Hết thời gian chờ shutdown (${waitLimit}ms). Còn ${this.inFlightEvents.size} event đang xử lý. Thoát an toàn (Event chưa hoàn tất sẽ được Reaper thu hồi).`
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('[OUTBOX WORKER] Đã dừng Worker hoàn tất.');
  }

  /**
   * Thực thi một chu kỳ Polling duy nhất:
   * 1. Kiểm tra lặp đè (Re-entrancy prevention)
   * 2. Gọi Reaper thu hồi lease hết hạn
   * 3. Claim batch PENDING mới
   * 4. Xử lý tuần tự từng event trong batch
   */
  public async pollOnce(): Promise<{
    reclaimedCount: number;
    claimedCount: number;
    processedCount: number;
    results: RelayResult[];
  }> {
    if (this.isPolling) {
      // Ngăn chạy 2 chu kỳ đồng thời trong cùng một instance
      return { reclaimedCount: 0, claimedCount: 0, processedCount: 0, results: [] };
    }

    this.isPolling = true;
    const results: RelayResult[] = [];
    let reclaimedCount = 0;
    let claimedCount = 0;
    let processedCount = 0;

    try {
      // 1. Gọi Reaper trước khi claim
      try {
        const reapRes = await reapExpiredLeases(this.nodePool, {
          leaseTimeoutSeconds: this.config.leaseTimeoutSeconds,
          whitelistEventIds: this.config.whitelistEventIds,
          requireWhitelist: this.config.requireWhitelist,
        });
        reclaimedCount = reapRes.reclaimedCount;
        if (reclaimedCount > 0) {
          console.log(`[OUTBOX WORKER REAPER] Đã thu hồi ${reclaimedCount} event hết hạn lease.`);
        }
      } catch (reapErr: any) {
        console.error('[OUTBOX WORKER REAPER ERROR]:', reapErr?.message || reapErr);
      }

      // 2. Nếu đã có tín hiệu dừng thì không nhận thêm batch mới
      if (!this.isRunning && !this.config.once) {
        return { reclaimedCount, claimedCount: 0, processedCount: 0, results: [] };
      }

      // 3. Claim batch event mới
      let events: OutboxEvent[] = [];
      try {
        events = await claimEvents(this.nodePool, {
          limit: this.config.batchSize,
          whitelistEventIds: this.config.whitelistEventIds,
          requireWhitelist: this.config.requireWhitelist,
          allowedEventTypes: ['TRANSFER_SHIPPED', 'TRANSFER_RECEIVED'],
        });
        claimedCount = events.length;
      } catch (claimErr: any) {
        console.error('[OUTBOX WORKER CLAIM ERROR]:', claimErr?.message || claimErr);
        return { reclaimedCount, claimedCount: 0, processedCount: 0, results: [] };
      }

      if (events.length === 0) {
        return { reclaimedCount, claimedCount: 0, processedCount: 0, results: [] };
      }

      console.log(`[OUTBOX WORKER] Đã claim thành công ${events.length} event. Bắt đầu xử lý...`);

      // 4. Xử lý tuần tự từng event trong batch
      for (const event of events) {
        // Kiểm tra tín hiệu shutdown giữa các event trong batch
        if (!this.isRunning && !this.config.once) {
          console.log(
            `[OUTBOX WORKER] Phát hiện dừng trong lúc xử lý batch. Bỏ qua các event còn lại trong batch (để Reaper xử lý lại).`
          );
          break;
        }

        this.inFlightEvents.add(event.event_id);
        try {
          if (this.config.dryRun) {
            console.log(`[OUTBOX WORKER DRY-RUN] Bỏ qua relay cho event: ${event.event_id}`);
            continue;
          }

          // Gọi Relay với đúng claimedVersion từ event
          const res = await relaySingleEvent(this.nodePool, this.centralPool, event);
          results.push(res);
          processedCount++;

          if (res.success) {
            console.log(
              `  -> [RELAY OK] Event: ${event.event_id} | Type: ${event.event_type} | Version: ${event.version}`
            );
          } else {
            console.warn(
              `  -> [RELAY FAIL] Event: ${event.event_id} | ErrorType: ${res.errorType} | Lỗi: ${res.errorMessage}`
            );
          }
        } catch (itemErr: any) {
          // Lỗi của 1 event không được làm dừng các event khác
          console.error(
            `[OUTBOX WORKER ITEM FATAL] Event ${event.event_id} gặp ngoại lệ không bắt được:`,
            itemErr
          );
          results.push({
            eventId: event.event_id,
            eventType: event.event_type,
            success: false,
            errorMessage: itemErr?.message || String(itemErr),
          });
        } finally {
          this.inFlightEvents.delete(event.event_id);
        }
      }
    } finally {
      this.isPolling = false;
    }

    return { reclaimedCount, claimedCount, processedCount, results };
  }

  private scheduleNextPoll(delayMs?: number): void {
    if (!this.isRunning) {
      return;
    }

    const wait = delayMs !== undefined ? delayMs : this.config.pollIntervalMs;
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollOnce();
      } catch (err) {
        console.error('[OUTBOX WORKER POLL CYCLE ERROR]:', err);
      } finally {
        if (this.isRunning) {
          this.scheduleNextPoll();
        }
      }
    }, wait);
  }
}

/**
 * Quản lý và giám sát nhiều Outbox Worker chạy đồng thời trên các Node (HN, DN, HCM).
 */
export class MultiNodeOutboxWorker {
  private workers: OutboxWorker[] = [];

  constructor(
    nodes: string[] = ['HN', 'DN', 'HCM'],
    baseConfig: Partial<WorkerConfig> = {},
    customPools?: Record<string, { nodePool: Pool; centralPool?: Pool }>
  ) {
    this.workers = nodes.map((nodeName) => {
      const poolsForNode = customPools ? customPools[nodeName] : undefined;
      return new OutboxWorker(
        {
          ...baseConfig,
          nodeName,
        },
        poolsForNode?.nodePool,
        poolsForNode?.centralPool
      );
    });
  }

  public async start(): Promise<void> {
    console.log(`[MULTI-NODE WORKER] Bắt đầu khởi chạy ${this.workers.length} worker instances...`);
    // Sử dụng Promise.allSettled để bảo đảm nếu 1 node gặp lỗi khởi động, các node khác vẫn tiếp tục vận hành độc lập
    const results = await Promise.allSettled(this.workers.map((w) => w.start()));
    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        const workerNode = this.workers[idx]?.getConfig()?.nodeName;
        console.error(`[MULTI-NODE WORKER ERROR] Worker trên Node ${workerNode} gặp lỗi khởi động:`, res.reason);
      }
    });
  }

  public async stop(): Promise<void> {
    console.log(`[MULTI-NODE WORKER] Bắt đầu dừng tất cả ${this.workers.length} worker instances...`);
    const results = await Promise.allSettled(this.workers.map((w) => w.stop()));
    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        const workerNode = this.workers[idx]?.getConfig()?.nodeName;
        console.error(`[MULTI-NODE WORKER ERROR] Lỗi khi dừng Worker trên Node ${workerNode}:`, res.reason);
      }
    });
    console.log(`[MULTI-NODE WORKER] Toàn bộ worker instances đã dừng.`);
  }

  public getWorkers(): OutboxWorker[] {
    return this.workers;
  }
}

// Chạy trực tiếp qua CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const isHelp = args.includes('--help') || args.includes('-h');
  const isOnce = args.includes('--once');
  const isDryRun = args.includes('--dry-run');

  // Trích xuất tham số dạng --key=value hoặc --key value
  const getArgValue = (flag: string): string | undefined => {
    const prefix = `--${flag}=`;
    const match = args.find((a) => a.startsWith(prefix));
    if (match) return match.slice(prefix.length);
    const idx = args.indexOf(`--${flag}`);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return undefined;
  };

  const nodeArg = getArgValue('node') || process.env.NODE_NAME || 'HN';
  const batchSizeArg = getArgValue('batch-size')
    ? Number(getArgValue('batch-size'))
    : process.env.OUTBOX_BATCH_SIZE
    ? Number(process.env.OUTBOX_BATCH_SIZE)
    : undefined;
  const pollIntervalArg = getArgValue('poll-interval')
    ? Number(getArgValue('poll-interval'))
    : process.env.OUTBOX_POLL_INTERVAL
    ? Number(process.env.OUTBOX_POLL_INTERVAL)
    : undefined;
  const leaseTimeoutArg = getArgValue('lease-timeout')
    ? Number(getArgValue('lease-timeout'))
    : process.env.OUTBOX_LEASE_TIMEOUT
    ? Number(process.env.OUTBOX_LEASE_TIMEOUT)
    : undefined;
  const whitelistArg = getArgValue('whitelist') || process.env.OUTBOX_WHITELIST;
  const allowUnsafeArg = args.includes('--allow-unsafe-all-pending') || process.env.ALLOW_UNSAFE_ALL_PENDING === 'true';
  const isAllNodes = args.includes('--all-nodes') || process.env.OUTBOX_ALL_NODES === 'true';

  const whitelistEventIds = whitelistArg
    ? whitelistArg.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
    : undefined;

  if (isHelp) {
    console.log(`
Sử dụng: npx ts-node src/workers/outboxWorker.ts [options]

Tùy chọn:
  --node=<name>                  Tên Node mục tiêu (HN, DN, HCM). Mặc định: HN hoặc từ biến môi trường NODE_NAME
  --all-nodes                    Khởi chạy đồng thời Worker cho toàn bộ các Node (HN, DN, HCM)
  --whitelist=<uuid1,uuid2,...>  Danh sách event UUID cho phép claim (Chế độ Test Fixture / Kiểm thử cô lập)
  --batch-size=<n>               Số lượng event tối đa claim trong mỗi đợt (mặc định: 10)
  --poll-interval=<ms>           Thời gian chờ giữa các chu kỳ polling (mặc định: 3000ms)
  --lease-timeout=<s>            Thời gian hết hạn lease tính bằng giây (mặc định: 300s)
  --once                         Chạy kiểm tra một chu kỳ rồi thoát an toàn
  --dry-run                      Chế độ mô phỏng, không ghi dữ liệu lên Central
  --help, -h                     Hiển thị thông tin trợ giúp

Lưu ý: Mặc định Worker hoạt động ở chế độ Chuẩn (Standard Relay) bảo vệ bởi Quarantine:
       Quét tất cả các sự kiện PENDING có next_retry_at <= CURRENT_TIMESTAMP mà không cần createdAfter.
    `);
    process.exit(0);
  }

  const baseConfig: Partial<WorkerConfig> = {
    once: isOnce || false,
    dryRun: isDryRun,
    batchSize: batchSizeArg,
    pollIntervalMs: pollIntervalArg,
    leaseTimeoutSeconds: leaseTimeoutArg,
    whitelistEventIds,
    requireWhitelist: Boolean(whitelistEventIds && whitelistEventIds.length > 0),
    allowUnsafeAllPending: allowUnsafeArg,
  };

  if (isAllNodes) {
    const multiWorker = new MultiNodeOutboxWorker(['HN', 'DN', 'HCM'], baseConfig);

    const handleShutdown = async (signal: string) => {
      console.log(`\n[SIGNAL] Nhận tín hiệu ${signal}.`);
      await multiWorker.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    multiWorker.start().then(() => {
      if (isOnce) process.exit(0);
    }).catch((err) => {
      console.error('[MULTI-NODE WORKER FATAL]:', err);
      process.exit(1);
    });
  } else {
    const worker = new OutboxWorker({
      ...baseConfig,
      nodeName: nodeArg,
    });

    const handleShutdown = async (signal: string) => {
      console.log(`\n[SIGNAL] Nhận tín hiệu ${signal}.`);
      await worker.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    worker.start().then(() => {
      if (isOnce) process.exit(0);
    }).catch((err) => {
      console.error('[OUTBOX WORKER FATAL]:', err);
      process.exit(1);
    });
  }
}
