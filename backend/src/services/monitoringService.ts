/**
 * monitoringService.ts
 * Dịch vụ giám sát trạng thái toàn bộ hệ thống phân tán Warehouse Management:
 * - 3 Warehouse Nodes (HN, DN, HCM) + Central Data Center
 * - 4 PostgreSQL Databases
 * - MongoDB Event Logs
 * - Apache Kafka Broker & Topics
 * - Outbox Worker & Backlog Metrics (PENDING, PROCESSING, FAILED, PROCESSED)
 */

import mongoose from 'mongoose';
import { Pool } from 'pg';
import { pools } from '../config/postgresql';
import { kafka } from '../kafka/kafkaClient';
import { KAFKA_TOPICS } from '../kafka/topics';

// Helper: Giới hạn thời gian thực thi (Timeout 2000ms) để không làm treo API
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} không phản hồi sau ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// Helper: Làm sạch thông báo lỗi, loại bỏ thông tin nhạy cảm (passwords, connection strings, tokens)
function sanitizeError(err: any): string {
  if (!err) return '';
  let msg = err.message || String(err);
  msg = msg.replace(/:[^:@]+@/g, ':***@');
  msg = msg.replace(/password=[^\s;]+/gi, 'password=***');
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
  return msg;
}

export interface NodeStatusInfo {
  nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL';
  name: string;
  type: 'WAREHOUSE_NODE' | 'CENTRAL_DATA_CENTER';
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  statusSource: 'inferred_from_services';
  statusText: string;
  latencyMs: number;
  lastChecked: string;
  postgres: {
    status: 'CONNECTED' | 'ERROR' | 'UNREACHABLE';
    latencyMs: number;
    database: string;
    error?: string;
  };
  outbox?: {
    pending: number;
    processing: number;
    failed: number;
    processed: number;
    lastProcessedAt: string | null;
  };
  details?: Record<string, any>;
}

export interface SystemHealthSummary {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  statusText: string;
  timestamp: string;
  uptimeSeconds: number;
  nodesSummary: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
  };
  infrastructure: {
    postgresHN: 'ONLINE' | 'OFFLINE';
    postgresDN: 'ONLINE' | 'OFFLINE';
    postgresHCM: 'ONLINE' | 'OFFLINE';
    postgresCentral: 'ONLINE' | 'OFFLINE';
    mongoDb: 'ONLINE' | 'OFFLINE';
    kafkaBroker: 'ONLINE' | 'OFFLINE';
    outboxWorker: 'ACTIVE' | 'IDLE' | 'STOPPED';
  };
}

export interface SystemMetricsData {
  timestamp: string;
  databaseMetrics: Record<string, {
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    error?: string;
  }>;
  mongoMetrics: {
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    readyState: number;
    error?: string;
  };
  kafkaMetrics: {
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    clusterId?: string;
    brokerCount?: number;
    topics?: string[];
    hasBusinessTopics?: boolean;
    error?: string;
  };
  outboxWorkerMetrics: {
    workerStatus: 'ACTIVE' | 'IDLE' | 'STOPPED';
    lastHeartbeat: string | null;
    heartbeatNodes: Array<{ node: string; lastPollAt: string; status: string }>;
  };
  outboxBacklogMetrics: {
    totalPending: number;
    totalProcessing: number;
    totalFailed: number;
    totalProcessed: number;
    nodes: Record<string, {
      pending: number;
      processing: number;
      failed: number;
      processed: number;
      lastProcessedAt: string | null;
    }>;
  };
}

export class MonitoringService {
  /**
   * Kiểm tra kết nối và độ trễ của 1 PostgreSQL node
   */
  private async checkPostgresNode(nodeKey: 'HN' | 'DN' | 'HCM' | 'CENTRAL'): Promise<{
    status: 'CONNECTED' | 'ERROR' | 'UNREACHABLE';
    latencyMs: number;
    database: string;
    error?: string;
    outboxCounts?: { pending: number; processing: number; failed: number; processed: number; lastProcessedAt: string | null };
  }> {
    const pool = pools[nodeKey];
    const dbName = `warehouse_${nodeKey.toLowerCase()}`;
    const start = Date.now();

    if (!pool) {
      return {
        status: 'UNREACHABLE',
        latencyMs: 0,
        database: dbName,
        error: `Pool không tồn tại cho node ${nodeKey}`,
      };
    }

    try {
      // Connect với timeout 2 giây
      const client = await withTimeout(pool.connect(), 2000, `Postgres ${nodeKey} Connect`);
      try {
        await withTimeout(client.query('SELECT 1 AS ping'), 1500, `Postgres ${nodeKey} Ping`);
        const latencyMs = Date.now() - start;

        // Nếu là chi nhánh kho (HN, DN, HCM), truy vấn bảng outbox_event
        let outboxCounts = undefined;
        if (nodeKey !== 'CENTRAL') {
          try {
            const outboxRes = await withTimeout(
              client.query(`
                SELECT 
                  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
                  COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
                  COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
                  COUNT(*) FILTER (WHERE status = 'PROCESSED') AS processed,
                  MAX(processed_at) AS last_processed_at
                FROM outbox_event
              `),
              1500,
              `Outbox count ${nodeKey}`
            );
            const row = outboxRes.rows[0];
            outboxCounts = {
              pending: Number(row?.pending || 0),
              processing: Number(row?.processing || 0),
              failed: Number(row?.failed || 0),
              processed: Number(row?.processed || 0),
              lastProcessedAt: row?.last_processed_at ? new Date(row.last_processed_at).toISOString() : null,
            };
          } catch (outboxErr: any) {
            // Không làm hỏng việc kiểm tra PG nếu bảng outbox chưa khởi tạo
          }
        }

        return {
          status: 'CONNECTED',
          latencyMs,
          database: dbName,
          outboxCounts,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const isTimeout = String(err?.message || '').includes('Timeout');
      return {
        status: isTimeout ? 'UNREACHABLE' : 'ERROR',
        latencyMs,
        database: dbName,
        error: sanitizeError(err),
      };
    }
  }

  /**
   * Kiểm tra kết nối MongoDB
   */
  private async checkMongoDB(): Promise<{
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    readyState: number;
    error?: string;
  }> {
    const start = Date.now();
    const readyState = mongoose.connection.readyState;

    if (readyState !== 1 || !mongoose.connection.db) {
      return {
        status: 'OFFLINE',
        latencyMs: 0,
        readyState,
        error: readyState === 2 ? 'MongoDB đang kết nối...' : 'MongoDB chưa kết nối',
      };
    }

    try {
      await withTimeout(mongoose.connection.db.admin().ping(), 2000, 'MongoDB Admin Ping');
      return {
        status: 'ONLINE',
        latencyMs: Date.now() - start,
        readyState,
      };
    } catch (err: any) {
      return {
        status: 'OFFLINE',
        latencyMs: Date.now() - start,
        readyState,
        error: sanitizeError(err),
      };
    }
  }

  /**
   * Kiểm tra kết nối Apache Kafka KRaft Broker
   */
  private async checkKafka(): Promise<{
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    clusterId?: string;
    brokerCount?: number;
    topics?: string[];
    hasBusinessTopics?: boolean;
    error?: string;
  }> {
    const start = Date.now();
    const admin = kafka.admin();

    try {
      await withTimeout(admin.connect(), 2000, 'Kafka Admin Connect');
      const cluster = await withTimeout(admin.describeCluster(), 2000, 'Kafka Describe Cluster');
      const topics = await withTimeout(admin.listTopics(), 2000, 'Kafka List Topics');
      await admin.disconnect();

      const requiredTopics = [
        KAFKA_TOPICS.TRANSFER_EVENTS,
        KAFKA_TOPICS.INVENTORY_EVENTS,
        KAFKA_TOPICS.SYSTEM_EVENTS,
      ];
      const hasBusinessTopics = requiredTopics.every((t) => topics.includes(t));

      return {
        status: 'ONLINE',
        latencyMs: Date.now() - start,
        clusterId: cluster.clusterId,
        brokerCount: cluster.brokers.length,
        topics: topics.filter((t) => t.startsWith('warehouse.') || !t.startsWith('__')),
        hasBusinessTopics,
      };
    } catch (err: any) {
      try {
        await admin.disconnect();
      } catch {}
      return {
        status: 'OFFLINE',
        latencyMs: Date.now() - start,
        error: sanitizeError(err),
      };
    }
  }

  /**
   * Lấy thông tin Heartbeat của Outbox Worker từ MongoDB
   */
  private async getWorkerHeartbeats(): Promise<{
    workerStatus: 'ACTIVE' | 'IDLE' | 'STOPPED';
    lastHeartbeat: string | null;
    heartbeatNodes: Array<{ node: string; lastPollAt: string; status: string }>;
  }> {
    try {
      const db = mongoose.connection.db;
      if (!db || mongoose.connection.readyState !== 1) {
        return {
          workerStatus: 'IDLE',
          lastHeartbeat: null,
          heartbeatNodes: [],
        };
      }

      const heartbeats = await withTimeout(
        db.collection('worker_heartbeats').find().toArray(),
        1500,
        'Worker Heartbeats Query'
      );

      if (!heartbeats || heartbeats.length === 0) {
        return {
          workerStatus: 'IDLE',
          lastHeartbeat: null,
          heartbeatNodes: [],
        };
      }

      let mostRecentTime = 0;
      const nodesData = heartbeats.map((h: any) => {
        const time = new Date(h.last_poll_at).getTime();
        if (time > mostRecentTime) mostRecentTime = time;
        return {
          node: h.node,
          lastPollAt: new Date(h.last_poll_at).toISOString(),
          status: h.status || 'RUNNING',
        };
      });

      const now = Date.now();
      const diffMs = now - mostRecentTime;

      // Nếu có heartbeat trong vòng 30 giây qua -> ACTIVE
      // Nếu từ 30s đến 60 giây -> IDLE
      // Nếu > 60 giây -> STOPPED (Offline)
      let workerStatus: 'ACTIVE' | 'IDLE' | 'STOPPED' = 'STOPPED';
      if (diffMs <= 30000) {
        workerStatus = 'ACTIVE';
      } else if (diffMs <= 60000) {
        workerStatus = 'IDLE';
      }

      return {
        workerStatus,
        lastHeartbeat: mostRecentTime > 0 ? new Date(mostRecentTime).toISOString() : null,
        heartbeatNodes: nodesData,
      };
    } catch {
      return {
        workerStatus: 'IDLE',
        lastHeartbeat: null,
        heartbeatNodes: [],
      };
    }
  }

  /**
   * GET /api/v1/monitoring/nodes
   * Trả về danh sách chi tiết 3 Warehouse Nodes (HN, DN, HCM) + Central Data Center
   */
  public async getNodeStatuses(): Promise<NodeStatusInfo[]> {
    // Chạy đồng thời kiểm tra 4 Postgres nodes
    const [hnCheck, dnCheck, hcmCheck, centralCheck, mongoCheck] = await Promise.all([
      this.checkPostgresNode('HN'),
      this.checkPostgresNode('DN'),
      this.checkPostgresNode('HCM'),
      this.checkPostgresNode('CENTRAL'),
      this.checkMongoDB(),
    ]);

    const now = new Date().toISOString();

    // 1. Kho Hà Nội (HN01)
    let hnStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'ONLINE';
    let hnStatusText = 'Hoạt động bình thường';
    if (hnCheck.status !== 'CONNECTED') {
      hnStatus = 'DEGRADED';
      hnStatusText = `Cơ sở dữ liệu kho không thể kết nối (${hnCheck.error || 'Connection Failed'})`;
    } else if (hnCheck.outboxCounts && hnCheck.outboxCounts.failed > 0) {
      hnStatus = 'DEGRADED';
      hnStatusText = `Có ${hnCheck.outboxCounts.failed} sự kiện Outbox bị lỗi chuyển tiếp`;
    } else if (hnCheck.latencyMs > 1000) {
      hnStatus = 'DEGRADED';
      hnStatusText = `Độ trễ cao (${hnCheck.latencyMs}ms)`;
    }

    const nodeHN: NodeStatusInfo = {
      nodeId: 'HN',
      name: 'Kho Hà Nội (HN01)',
      type: 'WAREHOUSE_NODE',
      status: hnStatus,
      statusSource: 'inferred_from_services',
      statusText: hnStatusText,
      latencyMs: hnCheck.latencyMs,
      lastChecked: now,
      postgres: {
        status: hnCheck.status,
        latencyMs: hnCheck.latencyMs,
        database: hnCheck.database,
        error: hnCheck.error,
      },
      outbox: hnCheck.outboxCounts,
    };

    // 2. Kho Đà Nẵng (DN01)
    let dnStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'ONLINE';
    let dnStatusText = 'Hoạt động bình thường';
    if (dnCheck.status !== 'CONNECTED') {
      dnStatus = 'DEGRADED';
      dnStatusText = `Cơ sở dữ liệu kho không thể kết nối (${dnCheck.error || 'Connection Failed'})`;
    } else if (dnCheck.outboxCounts && dnCheck.outboxCounts.failed > 0) {
      dnStatus = 'DEGRADED';
      dnStatusText = `Có ${dnCheck.outboxCounts.failed} sự kiện Outbox bị lỗi chuyển tiếp`;
    } else if (dnCheck.latencyMs > 1000) {
      dnStatus = 'DEGRADED';
      dnStatusText = `Độ trễ cao (${dnCheck.latencyMs}ms)`;
    }

    const nodeDN: NodeStatusInfo = {
      nodeId: 'DN',
      name: 'Kho Đà Nẵng (DN01)',
      type: 'WAREHOUSE_NODE',
      status: dnStatus,
      statusSource: 'inferred_from_services',
      statusText: dnStatusText,
      latencyMs: dnCheck.latencyMs,
      lastChecked: now,
      postgres: {
        status: dnCheck.status,
        latencyMs: dnCheck.latencyMs,
        database: dnCheck.database,
        error: dnCheck.error,
      },
      outbox: dnCheck.outboxCounts,
    };

    // 3. Kho TP.HCM (HCM01)
    let hcmStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'ONLINE';
    let hcmStatusText = 'Hoạt động bình thường';
    if (hcmCheck.status !== 'CONNECTED') {
      hcmStatus = 'DEGRADED';
      hcmStatusText = `Cơ sở dữ liệu kho không thể kết nối (${hcmCheck.error || 'Connection Failed'})`;
    } else if (hcmCheck.outboxCounts && hcmCheck.outboxCounts.failed > 0) {
      hcmStatus = 'DEGRADED';
      hcmStatusText = `Có ${hcmCheck.outboxCounts.failed} sự kiện Outbox bị lỗi chuyển tiếp`;
    } else if (hcmCheck.latencyMs > 1000) {
      hcmStatus = 'DEGRADED';
      hcmStatusText = `Độ trễ cao (${hcmCheck.latencyMs}ms)`;
    }

    const nodeHCM: NodeStatusInfo = {
      nodeId: 'HCM',
      name: 'Kho TP. Hồ Chí Minh (HCM01)',
      type: 'WAREHOUSE_NODE',
      status: hcmStatus,
      statusSource: 'inferred_from_services',
      statusText: hcmStatusText,
      latencyMs: hcmCheck.latencyMs,
      lastChecked: now,
      postgres: {
        status: hcmCheck.status,
        latencyMs: hcmCheck.latencyMs,
        database: hcmCheck.database,
        error: hcmCheck.error,
      },
      outbox: hcmCheck.outboxCounts,
    };

    // 4. Central Data Center
    let centralStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'ONLINE';
    let centralStatusText = 'Hoạt động bình thường (PostgreSQL & MongoDB kết nối)';
    if (centralCheck.status !== 'CONNECTED' && mongoCheck.status !== 'ONLINE') {
      centralStatus = 'OFFLINE';
      centralStatusText = 'Cả PostgreSQL Central và MongoDB đều mất kết nối';
    } else if (centralCheck.status !== 'CONNECTED') {
      centralStatus = 'DEGRADED';
      centralStatusText = `PostgreSQL Central mất kết nối (${centralCheck.error || 'Error'})`;
    } else if (mongoCheck.status !== 'ONLINE') {
      centralStatus = 'DEGRADED';
      centralStatusText = `MongoDB Event Logs mất kết nối (${mongoCheck.error || 'Error'})`;
    }

    const nodeCentral: NodeStatusInfo = {
      nodeId: 'CENTRAL',
      name: 'Trung Tâm Dữ Liệu (Central Data Center)',
      type: 'CENTRAL_DATA_CENTER',
      status: centralStatus,
      statusSource: 'inferred_from_services',
      statusText: centralStatusText,
      latencyMs: centralCheck.latencyMs,
      lastChecked: now,
      postgres: {
        status: centralCheck.status,
        latencyMs: centralCheck.latencyMs,
        database: centralCheck.database,
        error: centralCheck.error,
      },
      details: {
        mongodb: {
          status: mongoCheck.status,
          latencyMs: mongoCheck.latencyMs,
          error: mongoCheck.error,
        },
      },
    };

    return [nodeHN, nodeDN, nodeHCM, nodeCentral];
  }

  /**
   * GET /api/v1/monitoring/health
   * Trả về tổng quan sức khỏe toàn hệ thống
   */
  public async getSystemHealth(): Promise<SystemHealthSummary> {
    const [nodes, mongoCheck, kafkaCheck, workerInfo] = await Promise.all([
      this.getNodeStatuses(),
      this.checkMongoDB(),
      this.checkKafka(),
      this.getWorkerHeartbeats(),
    ]);

    const total = nodes.length;
    const online = nodes.filter((n) => n.status === 'ONLINE').length;
    const degraded = nodes.filter((n) => n.status === 'DEGRADED').length;
    const offline = nodes.filter((n) => n.status === 'OFFLINE').length;

    const hn = nodes.find((n) => n.nodeId === 'HN');
    const dn = nodes.find((n) => n.nodeId === 'DN');
    const hcm = nodes.find((n) => n.nodeId === 'HCM');
    const central = nodes.find((n) => n.nodeId === 'CENTRAL');

    // Xác định trạng thái tổng thể hệ thống
    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
    let statusText = 'Tất cả các dịch vụ phân tán hoạt động ổn định';

    if (offline > 0 || kafkaCheck.status === 'OFFLINE' || central?.status === 'OFFLINE') {
      overallStatus = 'UNHEALTHY';
      statusText = 'Có dịch vụ trọng yếu hoặc node trung tâm mất kết nối';
    } else if (degraded > 0 || mongoCheck.status === 'OFFLINE') {
      overallStatus = 'DEGRADED';
      statusText = 'Hệ thống đang hoạt động ở chế độ cảnh báo hoặc suy giảm';
    }

    return {
      status: overallStatus,
      statusText,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodesSummary: {
        total,
        online,
        degraded,
        offline,
      },
      infrastructure: {
        postgresHN: hn?.postgres.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
        postgresDN: dn?.postgres.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
        postgresHCM: hcm?.postgres.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
        postgresCentral: central?.postgres.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
        mongoDb: mongoCheck.status,
        kafkaBroker: kafkaCheck.status,
        outboxWorker: workerInfo.workerStatus,
      },
    };
  }

  /**
   * GET /api/v1/monitoring/metrics
   * Trả về chi tiết các chỉ số đo lường (Latency, Outbox Backlog, Kafka Details)
   */
  public async getSystemMetrics(): Promise<SystemMetricsData> {
    const [nodes, mongoCheck, kafkaCheck, workerInfo] = await Promise.all([
      this.getNodeStatuses(),
      this.checkMongoDB(),
      this.checkKafka(),
      this.getWorkerHeartbeats(),
    ]);

    const databaseMetrics: Record<string, { status: 'ONLINE' | 'OFFLINE'; latencyMs: number; error?: string }> = {};
    const outboxNodes: Record<string, any> = {};
    let totalPending = 0;
    let totalProcessing = 0;
    let totalFailed = 0;
    let totalProcessed = 0;

    for (const node of nodes) {
      databaseMetrics[node.nodeId] = {
        status: node.postgres.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
        latencyMs: node.postgres.latencyMs,
        error: node.postgres.error,
      };

      if (node.outbox) {
        totalPending += node.outbox.pending;
        totalProcessing += node.outbox.processing;
        totalFailed += node.outbox.failed;
        totalProcessed += node.outbox.processed;

        outboxNodes[node.nodeId] = {
          pending: node.outbox.pending,
          processing: node.outbox.processing,
          failed: node.outbox.failed,
          processed: node.outbox.processed,
          lastProcessedAt: node.outbox.lastProcessedAt,
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      databaseMetrics,
      mongoMetrics: mongoCheck,
      kafkaMetrics: kafkaCheck,
      outboxWorkerMetrics: workerInfo,
      outboxBacklogMetrics: {
        totalPending,
        totalProcessing,
        totalFailed,
        totalProcessed,
        nodes: outboxNodes,
      },
    };
  }

  /**
   * Kiểm tra trạng thái sức khỏe của một database kiểm thử / đối tượng chỉ định
   * Phục vụ kịch bản kiểm thử chịu lỗi và phục hồi (Fault/Recovery Demo - Task 5.8)
   */
  public async checkDatabaseHealth(config: {
    host?: string;
    port?: number;
    database: string;
    user?: string;
    password?: string;
  }): Promise<{
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    database: string;
    tableCount: number;
    error?: string;
  }> {
    const host = config.host || 'localhost';
    const port = config.port || 5433;
    const database = config.database;
    const user = config.user || process.env.POSTGRES_USER || 'admin';
    const password = config.password || process.env.POSTGRES_PASSWORD || 'admin123';

    const testPool = new Pool({
      host,
      port,
      database,
      user,
      password,
      connectionTimeoutMillis: 2000,
    });
    const start = Date.now();

    try {
      const client = await withTimeout(testPool.connect(), 2000, `DB ${database} Connect`);
      try {
        await withTimeout(client.query('SELECT 1 AS ping'), 1500, `DB ${database} Ping`);
        const countRes = await withTimeout(
          client.query(`
            SELECT COUNT(*) AS count 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          `),
          1500,
          `DB ${database} Table Count`
        );
        const latencyMs = Date.now() - start;
        const tableCount = parseInt(countRes.rows[0]?.count || '0', 10);
        return {
          status: 'ONLINE',
          latencyMs,
          database,
          tableCount,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        status: 'OFFLINE',
        latencyMs,
        database,
        tableCount: 0,
        error: sanitizeError(err),
      };
    } finally {
      await testPool.end().catch(() => {});
    }
  }
}

export const monitoringService = new MonitoringService();

