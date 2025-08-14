import { PluginServerApp } from '@signalk/server-api';
import { MosquittoPluginConfig, BridgeConfig, BridgeManager } from '../types/interfaces';
import { FileUtils } from '../utils/file-utils';
import { ValidationUtils } from '../utils/validation';
import * as mqtt from 'mqtt';
import * as path from 'path';

export class BridgeManagerImpl implements BridgeManager {
  private app: PluginServerApp;
  private config: MosquittoPluginConfig;
  private dataDir: string;
  private bridgeConfigFile: string;

  constructor(app: PluginServerApp, config: MosquittoPluginConfig) {
    this.app = app;
    this.config = config;
    this.dataDir = FileUtils.getDataDir('signalk-mosquitto');
    this.bridgeConfigFile = path.join(this.dataDir, 'bridges.json');
  }

  async addBridge(bridge: BridgeConfig): Promise<void> {
    try {
      const validation = ValidationUtils.validateBridge(bridge);
      if (validation.length > 0) {
        throw new Error(`Bridge validation failed: ${validation.join(', ')}`);
      }

      const existingBridges = await this.getBridges();

      const existingBridge = existingBridges.find(b => b.id === bridge.id);
      if (existingBridge) {
        throw new Error(`Bridge with ID '${bridge.id}' already exists`);
      }

      existingBridges.push(bridge);
      await this.saveBridges(existingBridges);

      console.log(`Bridge '${bridge.name}' added successfully`);

      await this.updateMainConfig(existingBridges);
    } catch (error) {
      console.error(`Failed to add bridge: ${(error as Error).message}`);
      throw error;
    }
  }

  async removeBridge(bridgeId: string): Promise<void> {
    try {
      const existingBridges = await this.getBridges();
      const bridgeIndex = existingBridges.findIndex(b => b.id === bridgeId);

      if (bridgeIndex === -1) {
        throw new Error(`Bridge with ID '${bridgeId}' not found`);
      }

      const removedBridge = existingBridges.splice(bridgeIndex, 1)[0];
      await this.saveBridges(existingBridges);

      console.log(`Bridge '${removedBridge.name}' removed successfully`);

      await this.updateMainConfig(existingBridges);
    } catch (error) {
      console.error(`Failed to remove bridge: ${(error as Error).message}`);
      throw error;
    }
  }

  async updateBridge(bridgeId: string, bridge: BridgeConfig): Promise<void> {
    try {
      const validation = ValidationUtils.validateBridge(bridge);
      if (validation.length > 0) {
        throw new Error(`Bridge validation failed: ${validation.join(', ')}`);
      }

      const existingBridges = await this.getBridges();
      const bridgeIndex = existingBridges.findIndex(b => b.id === bridgeId);

      if (bridgeIndex === -1) {
        throw new Error(`Bridge with ID '${bridgeId}' not found`);
      }

      if (bridge.id !== bridgeId) {
        bridge.id = bridgeId;
      }

      existingBridges[bridgeIndex] = bridge;
      await this.saveBridges(existingBridges);

      console.log(`Bridge '${bridge.name}' updated successfully`);

      await this.updateMainConfig(existingBridges);
    } catch (error) {
      console.error(`Failed to update bridge: ${(error as Error).message}`);
      throw error;
    }
  }

  async getBridges(): Promise<BridgeConfig[]> {
    try {
      if (!(await FileUtils.fileExists(this.bridgeConfigFile))) {
        return [];
      }

      const content = await FileUtils.readFile(this.bridgeConfigFile);
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load bridges: ${(error as Error).message}`);
      return [];
    }
  }

  async testBridgeConnection(bridge: BridgeConfig): Promise<boolean> {
    return new Promise(resolve => {
      try {
        const clientOptions: mqtt.IClientOptions = {
          host: bridge.remoteHost,
          port: bridge.remotePort,
          keepalive: bridge.keepalive,
          connectTimeout: 10000,
          reconnectPeriod: 0,
          clean: bridge.cleanSession,
        };

        if (bridge.remoteUsername) {
          clientOptions.username = bridge.remoteUsername;
        }

        if (bridge.remotePassword) {
          clientOptions.password = bridge.remotePassword;
        }

        if (bridge.tlsEnabled) {
          clientOptions.protocol = 'mqtts';

          if (bridge.tlsCaPath) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            clientOptions.ca = require('fs').readFileSync(bridge.tlsCaPath);
          }

          if (bridge.tlsCertPath) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            clientOptions.cert = require('fs').readFileSync(bridge.tlsCertPath);
          }

          if (bridge.tlsKeyPath) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            clientOptions.key = require('fs').readFileSync(bridge.tlsKeyPath);
          }

          clientOptions.rejectUnauthorized = true;
        } else {
          clientOptions.protocol = 'mqtt';
        }

        const testClient = mqtt.connect(clientOptions);

        const timeout = setTimeout(() => {
          testClient.end(true);
          resolve(false);
        }, 10000);

        testClient.on('connect', () => {
          clearTimeout(timeout);
          testClient.end();
          resolve(true);
        });

        testClient.on('error', error => {
          clearTimeout(timeout);
          console.log(`Bridge test connection error: ${(error as Error).message}`);
          testClient.end(true);
          resolve(false);
        });

        testClient.on('close', () => {
          clearTimeout(timeout);
        });
      } catch (error) {
        console.error(`Bridge test connection failed: ${(error as Error).message}`);
        resolve(false);
      }
    });
  }

  private async saveBridges(bridges: BridgeConfig[]): Promise<void> {
    await FileUtils.ensureDir(this.dataDir);
    await FileUtils.writeFile(this.bridgeConfigFile, JSON.stringify(bridges, null, 2));
  }

  private async updateMainConfig(bridges: BridgeConfig[]): Promise<void> {
    this.config.bridges = bridges;
  }

  async enableBridge(bridgeId: string): Promise<void> {
    try {
      const bridges = await this.getBridges();
      const bridge = bridges.find(b => b.id === bridgeId);

      if (!bridge) {
        throw new Error(`Bridge with ID '${bridgeId}' not found`);
      }

      bridge.enabled = true;
      await this.updateBridge(bridgeId, bridge);

      console.log(`Bridge '${bridge.name}' enabled`);
    } catch (error) {
      console.error(`Failed to enable bridge: ${(error as Error).message}`);
      throw error;
    }
  }

  async disableBridge(bridgeId: string): Promise<void> {
    try {
      const bridges = await this.getBridges();
      const bridge = bridges.find(b => b.id === bridgeId);

      if (!bridge) {
        throw new Error(`Bridge with ID '${bridgeId}' not found`);
      }

      bridge.enabled = false;
      await this.updateBridge(bridgeId, bridge);

      console.log(`Bridge '${bridge.name}' disabled`);
    } catch (error) {
      console.error(`Failed to disable bridge: ${(error as Error).message}`);
      throw error;
    }
  }

  async getBridgeStatus(
    bridgeId: string
  ): Promise<{ connected: boolean; lastSeen?: Date; error?: string }> {
    try {
      const bridges = await this.getBridges();
      const bridge = bridges.find(b => b.id === bridgeId);

      if (!bridge) {
        throw new Error(`Bridge with ID '${bridgeId}' not found`);
      }

      if (!bridge.enabled) {
        return { connected: false, error: 'Bridge is disabled' };
      }

      const isConnected = await this.testBridgeConnection(bridge);
      return {
        connected: isConnected,
        lastSeen: isConnected ? new Date() : undefined,
        error: isConnected ? undefined : 'Connection failed',
      };
    } catch (error) {
      console.error(`Failed to get bridge status: ${(error as Error).message}`);
      return { connected: false, error: (error as Error).message };
    }
  }

  async duplicateBridge(bridgeId: string, newBridgeId: string): Promise<BridgeConfig> {
    try {
      const bridges = await this.getBridges();
      const sourceBridge = bridges.find(b => b.id === bridgeId);

      if (!sourceBridge) {
        throw new Error(`Source bridge with ID '${bridgeId}' not found`);
      }

      const existingBridge = bridges.find(b => b.id === newBridgeId);
      if (existingBridge) {
        throw new Error(`Bridge with ID '${newBridgeId}' already exists`);
      }

      const duplicatedBridge: BridgeConfig = {
        ...sourceBridge,
        id: newBridgeId,
        name: `${sourceBridge.name} (Copy)`,
        enabled: false,
      };

      await this.addBridge(duplicatedBridge);

      console.log(`Bridge '${sourceBridge.name}' duplicated as '${duplicatedBridge.name}'`);

      return duplicatedBridge;
    } catch (error) {
      console.error(`Failed to duplicate bridge: ${(error as Error).message}`);
      throw error;
    }
  }

  async getBridgeConnectionLogs(bridgeId: string, lines: number = 100): Promise<string[]> {
    try {
      const logFile = path.join(this.dataDir, 'mosquitto.log');

      if (!(await FileUtils.fileExists(logFile))) {
        return [];
      }

      const { stdout } = await FileUtils.executeCommand('tail', ['-n', lines.toString(), logFile]);
      const logLines = stdout.split('\n').filter(line => line.includes(bridgeId));

      return logLines;
    } catch (error) {
      console.error(`Failed to get bridge logs: ${(error as Error).message}`);
      return [];
    }
  }

  async exportBridgeConfig(bridgeId?: string): Promise<string> {
    try {
      const bridges = await this.getBridges();

      if (bridgeId) {
        const bridge = bridges.find(b => b.id === bridgeId);
        if (!bridge) {
          throw new Error(`Bridge with ID '${bridgeId}' not found`);
        }
        return JSON.stringify(bridge, null, 2);
      }

      return JSON.stringify(bridges, null, 2);
    } catch (error) {
      console.error(`Failed to export bridge config: ${(error as Error).message}`);
      throw error;
    }
  }

  async importBridgeConfig(configJson: string, overwrite: boolean = false): Promise<number> {
    try {
      let importedBridges: BridgeConfig | BridgeConfig[];

      try {
        importedBridges = JSON.parse(configJson);
      } catch {
        throw new Error('Invalid JSON format');
      }

      const bridgesToImport = Array.isArray(importedBridges) ? importedBridges : [importedBridges];
      const existingBridges = await this.getBridges();
      let importedCount = 0;

      for (const bridge of bridgesToImport) {
        const validation = ValidationUtils.validateBridge(bridge);
        if (validation.length > 0) {
          console.log(`Skipping invalid bridge '${bridge.name}': ${validation.join(', ')}`);
          continue;
        }

        const existingIndex = existingBridges.findIndex(b => b.id === bridge.id);

        if (existingIndex >= 0) {
          if (overwrite) {
            existingBridges[existingIndex] = bridge;
            importedCount++;
          } else {
            console.log(`Skipping existing bridge '${bridge.name}' (ID: ${bridge.id})`);
          }
        } else {
          existingBridges.push(bridge);
          importedCount++;
        }
      }

      if (importedCount > 0) {
        await this.saveBridges(existingBridges);
        await this.updateMainConfig(existingBridges);
        console.log(`Imported ${importedCount} bridge(s)`);
      }

      return importedCount;
    } catch (error) {
      console.error(`Failed to import bridge config: ${(error as Error).message}`);
      throw error;
    }
  }
}
