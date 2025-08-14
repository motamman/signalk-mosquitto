import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class FileUtils {
  static async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf8');
  }

  static async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf8');
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async deleteFile(filePath: string): Promise<void> {
    if (await this.fileExists(filePath)) {
      await fs.unlink(filePath);
    }
  }

  static async copyFile(source: string, destination: string): Promise<void> {
    await fs.copy(source, destination);
  }

  static async chmod(filePath: string, mode: string): Promise<void> {
    await fs.chmod(filePath, mode);
  }

  static async createBackup(filePath: string): Promise<string> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    if (await this.fileExists(filePath)) {
      await this.copyFile(filePath, backupPath);
    }
    return backupPath;
  }

  static async restoreBackup(backupPath: string, originalPath: string): Promise<void> {
    if (await this.fileExists(backupPath)) {
      await this.copyFile(backupPath, originalPath);
      await this.deleteFile(backupPath);
    }
  }

  static getMosquittoConfigDir(): string {
    return process.platform === 'darwin' ? '/usr/local/etc/mosquitto' : '/etc/mosquitto';
  }

  static getMosquittoBinPath(): string {
    return process.platform === 'darwin' ? '/usr/local/bin/mosquitto' : '/usr/bin/mosquitto';
  }

  static getMosquittoPasswordPath(): string {
    return process.platform === 'darwin'
      ? '/usr/local/bin/mosquitto_passwd'
      : '/usr/bin/mosquitto_passwd';
  }

  static getDataDir(pluginName: string): string {
    const homeDir = process.env.HOME || '/tmp';
    return path.join(homeDir, '.signalk', 'plugin-config-data', pluginName);
  }

  static async executeCommand(
    command: string,
    args: string[] = []
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`);
      return { stdout, stderr };
    } catch (error) {
      throw new Error(`Command failed: ${(error as Error).message}`);
    }
  }

  static async isCommandAvailable(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  static async findProcessByName(processName: string): Promise<number[]> {
    try {
      const { stdout } = await execAsync(`pgrep -f ${processName}`);
      return stdout
        .trim()
        .split('\n')
        .map(pid => parseInt(pid, 10))
        .filter(pid => !isNaN(pid));
    } catch {
      return [];
    }
  }

  static async killProcess(pid: number, signal: string = 'TERM'): Promise<void> {
    try {
      await execAsync(`kill -${signal} ${pid}`);
    } catch (error) {
      throw new Error(`Failed to kill process ${pid}: ${(error as Error).message}`);
    }
  }

  static async waitForProcess(pid: number, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        await execAsync(`kill -0 ${pid}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        return true;
      }
    }

    return false;
  }
}
