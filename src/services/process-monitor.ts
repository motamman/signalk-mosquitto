import { PluginServerApp } from '@signalk/server-api';
import { ProcessMonitor, MosquittoStatus, MosquittoManager } from '../types/interfaces';
import { FileUtils } from '../utils/file-utils';

export class ProcessMonitorImpl implements ProcessMonitor {
  private app: PluginServerApp;
  private mosquittoManager: MosquittoManager;
  private monitorInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private healthCheckIntervalMs: number = 30000; // 30 seconds
  private statusCheckIntervalMs: number = 5000; // 5 seconds
  private maxRestartAttempts: number = 3;
  private restartAttempts: number = 0;
  private lastHealthCheck: Date | null = null;
  private consecutiveFailures: number = 0;

  constructor(app: PluginServerApp, mosquittoManager: MosquittoManager) {
    this.app = app;
    this.mosquittoManager = mosquittoManager;
  }

  start(): void {
    if (this.isMonitoring) {
      console.log('Process monitor is already running');
      return;
    }

    this.isMonitoring = true;
    this.restartAttempts = 0;
    this.consecutiveFailures = 0;
    this.lastHealthCheck = new Date();

    console.log('Starting Mosquitto process monitor');

    this.monitorInterval = setInterval(async () => {
      await this.performStatusCheck();
    }, this.statusCheckIntervalMs);

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckIntervalMs);
  }

  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('Stopping Mosquitto process monitor');

    this.isMonitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const status = await this.mosquittoManager.getStatus();

      if (!status.running) {
        return false;
      }

      if (status.pid) {
        const isProcessAlive = await this.isProcessAlive(status.pid);
        if (!isProcessAlive) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.log(`Health check error: ${(error as Error).message}`);
      return false;
    }
  }

  async getMetrics(): Promise<MosquittoStatus> {
    try {
      return await this.mosquittoManager.getStatus();
    } catch (error) {
      console.error(`Failed to get metrics: ${(error as Error).message}`);
      return {
        running: false,
        connectedClients: 0,
        totalConnections: 0,
        messagesReceived: 0,
        messagesPublished: 0,
        bytesReceived: 0,
        bytesPublished: 0,
      };
    }
  }

  private async performStatusCheck(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      const status = await this.mosquittoManager.getStatus();

      if (!status.running) {
        this.consecutiveFailures++;
        console.log(`Mosquitto process not running (failure ${this.consecutiveFailures})`);

        if (this.consecutiveFailures >= 2 && this.restartAttempts < this.maxRestartAttempts) {
          await this.attemptRestart();
        }
      } else {
        if (this.consecutiveFailures > 0) {
          console.log('Mosquitto process recovered');
          this.consecutiveFailures = 0;
          this.restartAttempts = 0;
        }
      }
    } catch (error) {
      this.consecutiveFailures++;
      console.log(
        `Status check failed: ${(error as Error).message} (failure ${this.consecutiveFailures})`
      );

      if (this.consecutiveFailures >= 3 && this.restartAttempts < this.maxRestartAttempts) {
        await this.attemptRestart();
      }
    }
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      this.lastHealthCheck = new Date();
      const isHealthy = await this.isHealthy();

      if (!isHealthy) {
        console.log('Health check failed - Mosquitto is not healthy');

        if (this.restartAttempts < this.maxRestartAttempts) {
          await this.attemptRestart();
        } else {
          console.error(
            `Mosquitto health check failed after ${this.maxRestartAttempts} restart attempts`
          );
        }
      } else {
        if (this.restartAttempts > 0) {
          console.log('Mosquitto health restored');
          this.restartAttempts = 0;
          this.consecutiveFailures = 0;
        }
      }
    } catch (error) {
      console.error(`Health check error: ${(error as Error).message}`);
    }
  }

  private async attemptRestart(): Promise<void> {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`Maximum restart attempts (${this.maxRestartAttempts}) reached`);
      return;
    }

    this.restartAttempts++;
    console.log(
      `Attempting to restart Mosquitto (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`
    );

    try {
      await this.mosquittoManager.restart();

      // Wait a bit for the process to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      const isHealthy = await this.isHealthy();
      if (isHealthy) {
        console.log('Mosquitto restart successful');
        this.consecutiveFailures = 0;
      } else {
        console.log('Mosquitto restart failed - process is not healthy');
      }
    } catch (error) {
      console.error(`Failed to restart Mosquitto: ${(error as Error).message}`);
    }
  }

  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      // Use kill -0 to check if process exists without actually killing it
      await FileUtils.executeCommand('kill', ['-0', pid.toString()]);
      return true;
    } catch {
      return false;
    }
  }

  getMonitorStatus(): {
    isMonitoring: boolean;
    lastHealthCheck: Date | null;
    consecutiveFailures: number;
    restartAttempts: number;
    maxRestartAttempts: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastHealthCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures,
      restartAttempts: this.restartAttempts,
      maxRestartAttempts: this.maxRestartAttempts,
    };
  }

  updateConfiguration(options: {
    healthCheckIntervalMs?: number;
    statusCheckIntervalMs?: number;
    maxRestartAttempts?: number;
  }): void {
    if (options.healthCheckIntervalMs) {
      this.healthCheckIntervalMs = Math.max(options.healthCheckIntervalMs, 5000); // Minimum 5 seconds
    }

    if (options.statusCheckIntervalMs) {
      this.statusCheckIntervalMs = Math.max(options.statusCheckIntervalMs, 1000); // Minimum 1 second
    }

    if (options.maxRestartAttempts !== undefined) {
      this.maxRestartAttempts = Math.max(options.maxRestartAttempts, 0);
    }

    // Restart monitoring with new intervals if currently running
    if (this.isMonitoring) {
      this.stop();
      this.start();
    }

    console.log('Process monitor configuration updated');
  }

  async forceRestart(): Promise<void> {
    console.log('Force restart requested');
    this.restartAttempts = 0; // Reset attempts for manual restart
    await this.attemptRestart();
  }

  async getDetailedStatus(): Promise<{
    monitor: {
      isMonitoring: boolean;
      lastHealthCheck: Date | null;
      consecutiveFailures: number;
      restartAttempts: number;
      maxRestartAttempts: number;
    };
    mosquitto: MosquittoStatus;
    system: {
      uptime: number;
      memoryUsage: NodeJS.MemoryUsage;
      cpuUsage: NodeJS.CpuUsage;
    };
  }> {
    const mosquittoStatus = await this.getMetrics();
    const monitorStatus = this.getMonitorStatus();

    const cpuUsage = process.cpuUsage();

    return {
      monitor: monitorStatus,
      mosquitto: mosquittoStatus,
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: cpuUsage,
      },
    };
  }

  async performMaintenanceTasks(): Promise<void> {
    console.log('Performing maintenance tasks');

    try {
      // Clean up old log files if they get too large
      const dataDir = FileUtils.getDataDir('signalk-mosquitto');
      const logFile = path.join(dataDir, 'mosquitto.log');

      if (await FileUtils.fileExists(logFile)) {
        const { stdout } = await FileUtils.executeCommand('stat', ['-f%z', logFile]);
        const fileSize = parseInt(stdout.trim());

        // If log file is larger than 10MB, rotate it
        if (fileSize > 10 * 1024 * 1024) {
          const backupFile = `${logFile}.${Date.now()}.bak`;
          await FileUtils.copyFile(logFile, backupFile);
          await FileUtils.writeFile(logFile, '');
          console.log(`Log file rotated to ${backupFile}`);
        }
      }

      // Clean up old backup files (keep only last 5)
      const backupPattern = /mosquitto\.log\.\d+\.bak$/;
      const files = await FileUtils.executeCommand('ls', [dataDir]);
      const backupFiles = files.stdout
        .split('\n')
        .filter(file => backupPattern.test(file))
        .sort()
        .reverse();

      if (backupFiles.length > 5) {
        const filesToDelete = backupFiles.slice(5);
        for (const file of filesToDelete) {
          await FileUtils.deleteFile(path.join(dataDir, file));
          console.log(`Deleted old backup file: ${file}`);
        }
      }

      console.log('Maintenance tasks completed');
    } catch (error) {
      console.error(`Maintenance task error: ${(error as Error).message}`);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
