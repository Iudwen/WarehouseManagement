/**
 * backupScheduler.ts
 * Quản lý lịch sao lưu tự động định kỳ (Task 5.4):
 * - Mặc định chạy hàng ngày lúc 02:00 (Múi giờ Asia/Ho_Chi_Minh).
 * - Cấu hình linh hoạt qua biến môi trường (BACKUP_SCHEDULE_TIME, BACKUP_SCHEDULE_TIMEZONE, BACKUP_SCHEDULE_ENABLED).
 * - Tự động kích hoạt phiên backup hệ thống toàn diện (4 PostgreSQL + 1 MongoDB).
 * - Hỗ trợ kích hoạt thủ công (triggerManualBackup).
 * - Chống chạy trùng lặp thông qua In-process Memory Lock và Cross-instance File Lock (.backup.lock).
 * - Cơ chế phục hồi: Lỗi một phiên không làm dừng Scheduler; không retry dồn dập.
 * - Logging chi tiết, không để lộ thông tin nhạy cảm.
 */

import { backupService, FullBackupSessionResult } from './backupService';

export interface SchedulerConfig {
  enabled: boolean;
  scheduleTime: string; // Định dạng HH:mm, ví dụ: '02:00'
  timezone: string; // Ví dụ: 'Asia/Ho_Chi_Minh'
  checkIntervalMs: number; // Chu kỳ quét kiểm tra (mặc định 60,000ms = 1 phút)
}

export interface SchedulerStatus {
  isScheduled: boolean;
  config: SchedulerConfig;
  lastRunDate?: string;
  lastRunResult?: FullBackupSessionResult;
  nextScheduledTime?: string;
  currentTimeInTz: {
    time: string;
    date: string;
  };
}

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isScheduled: boolean = false;
  private lastRunDate: string | null = null;
  private lastRunResult: FullBackupSessionResult | null = null;
  private config: SchedulerConfig;

  constructor() {
    this.config = {
      enabled: process.env.BACKUP_SCHEDULE_ENABLED !== 'false',
      scheduleTime: process.env.BACKUP_SCHEDULE_TIME || '02:00',
      timezone: process.env.BACKUP_SCHEDULE_TIMEZONE || 'Asia/Ho_Chi_Minh',
      checkIntervalMs: Number(process.env.BACKUP_CHECK_INTERVAL_MS) || 60000,
    };
  }

  /**
   * Lấy cấu hình Scheduler hiện tại
   */
  public getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Cập nhật cấu hình Scheduler (dùng khi kiểm thử hoặc cập nhật runtime)
   */
  public setConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Lấy thời gian hiện tại theo múi giờ đã cấu hình
   */
  public getCurrentTimeInTimezone(): { timeString: string; dateString: string } {
    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.config.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return {
      timeString: timeFormatter.format(now), // '02:00'
      dateString: dateFormatter.format(now), // '2026-11-14'
    };
  }

  /**
   * Tính toán thời điểm chạy tiếp theo dự kiến
   */
  public calculateNextScheduledTime(): string {
    const { timeString, dateString } = this.getCurrentTimeInTimezone();
    const [targetHour, targetMin] = this.config.scheduleTime.split(':').map(Number);
    const [currHour, currMin] = timeString.split(':').map(Number);

    const targetMinutes = targetHour * 60 + targetMin;
    const currentMinutes = currHour * 60 + currMin;

    if (currentMinutes < targetMinutes) {
      return `${dateString} ${this.config.scheduleTime} (${this.config.timezone})`;
    } else {
      // Chạy vào ngày hôm sau
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.config.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nextDate);
      return `${nextDateStr} ${this.config.scheduleTime} (${this.config.timezone})`;
    }
  }

  /**
   * Lấy trạng thái hoạt động của Scheduler
   */
  public getStatus(): SchedulerStatus {
    const { timeString, dateString } = this.getCurrentTimeInTimezone();
    return {
      isScheduled: this.isScheduled,
      config: this.getConfig(),
      lastRunDate: this.lastRunDate || undefined,
      lastRunResult: this.lastRunResult || undefined,
      nextScheduledTime: this.calculateNextScheduledTime(),
      currentTimeInTz: {
        time: timeString,
        date: dateString,
      },
    };
  }

  /**
   * Quét kiểm tra thời gian và kích hoạt nếu đến giờ hẹn
   */
  public async checkAndTrigger(): Promise<FullBackupSessionResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    const { timeString, dateString } = this.getCurrentTimeInTimezone();

    // Nếu thời gian khớp và hôm nay chưa chạy
    if (timeString === this.config.scheduleTime && this.lastRunDate !== dateString) {
      console.log(`\n⏰ [SCHEDULER] Đã đến giờ sao lưu định kỳ: ${timeString} ngày ${dateString} (${this.config.timezone})`);
      this.lastRunDate = dateString;

      try {
        const result = await backupService.runFullBackup('SCHEDULED');
        this.lastRunResult = result;
        return result;
      } catch (err: any) {
        console.error(`❌ [SCHEDULER] Lỗi ngoài dự kiến trong phiên backup tự động:`, err?.message || err);
        return null;
      }
    }

    return null;
  }

  /**
   * Khởi động vòng lặp kiểm tra định kỳ của Scheduler
   */
  public start(): void {
    if (this.isScheduled) {
      return;
    }

    if (!this.config.enabled) {
      console.log(`ℹ️ [SCHEDULER] Backup Scheduler đang tắt (BACKUP_SCHEDULE_ENABLED=false).`);
      return;
    }

    console.log(
      `🚀 [SCHEDULER] Khởi động Backup Scheduler: Lịch chạy lúc ${this.config.scheduleTime} hàng ngày (${this.config.timezone}), chu kỳ kiểm tra: ${this.config.checkIntervalMs}ms`
    );
    this.isScheduled = true;

    this.timer = setInterval(async () => {
      try {
        await this.checkAndTrigger();
      } catch (err) {
        // Đảm bảo không có ngoại lệ nào làm sập timer
      }
    }, this.config.checkIntervalMs);

    // Không giữ event loop chặn tiến trình thoát khi testing
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Dừng vòng lặp Scheduler
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isScheduled = false;
    console.log(`⏹️ [SCHEDULER] Đã dừng Backup Scheduler.`);
  }

  /**
   * Kích hoạt sao lưu thủ công (MANUAL TRIGGER)
   */
  public async triggerManualBackup(): Promise<FullBackupSessionResult> {
    console.log(`⚡ [SCHEDULER] Kích hoạt phiên sao lưu thủ công (MANUAL)...`);
    const result = await backupService.runFullBackup('MANUAL');
    this.lastRunResult = result;
    return result;
  }

  /**
   * Kích hoạt giả lập phiên định kỳ (Dùng cho kiểm thử tự động, không cần chờ đến 02:00)
   */
  public async triggerScheduledNowForTest(): Promise<FullBackupSessionResult> {
    const { dateString } = this.getCurrentTimeInTimezone();
    this.lastRunDate = dateString;
    const result = await backupService.runFullBackup('SCHEDULED');
    this.lastRunResult = result;
    return result;
  }
}

export const backupScheduler = new BackupScheduler();
