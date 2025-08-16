import { Plugin, PluginServerApp } from '@signalk/server-api';
import { MosquittoPluginConfig, MosquittoCompleteConfig } from './types/interfaces';
import { MosquittoManagerImpl } from './services/mosquitto-manager';
import { BridgeManagerImpl } from './services/bridge-manager';
import { SecurityManagerImpl } from './services/security-manager';
import { ProcessMonitorImpl } from './services/process-monitor';
import { MosquittoInstaller } from './services/mosquitto-installer';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs-extra';
import { FileUtils } from './utils/file-utils';

const defaultPluginConfig: MosquittoPluginConfig = {
  enabled: false,
  brokerPort: 1883,
  brokerHost: '0.0.0.0',
  enableSecurity: true,
  autoStart: true
};

const defaultCompleteConfig: MosquittoCompleteConfig = {
  ...defaultPluginConfig,
  enableWebsockets: true,
  websocketPort: 9001,
  maxConnections: 1000,
  allowAnonymous: true,
  enableLogging: true,
  logLevel: 'information',
  persistence: true,
  persistenceLocation: '/tmp/mosquitto.db',
  tlsEnabled: false,
  tlsCertPath: '',
  tlsKeyPath: '',
  tlsCaPath: '',
  bridges: [],
  users: [],
  acls: []
};

function plugin(app: PluginServerApp): Plugin {
  let mosquittoManager: MosquittoManagerImpl;
  let bridgeManager: BridgeManagerImpl;
  let securityManager: SecurityManagerImpl;
  let processMonitor: ProcessMonitorImpl;
  let mosquittoInstaller: MosquittoInstaller;
  let currentPluginConfig: MosquittoPluginConfig;
  let currentCompleteConfig: MosquittoCompleteConfig;
  let configDir: string;

  // Configuration management functions
  const getConfigPath = (): string => {
    if (!configDir) {
      configDir = FileUtils.getDataDir('signalk-mosquitto');
    }
    return configDir;
  };

  const getWebappConfigPath = (): string => {
    return path.join(getConfigPath(), 'webapp-config.json');
  };

  const loadWebappConfig = async (): Promise<MosquittoCompleteConfig> => {
    try {
      const configPath = getWebappConfigPath();
      if (await fs.pathExists(configPath)) {
        const savedConfig = await fs.readJson(configPath);
        return { ...defaultCompleteConfig, ...currentPluginConfig, ...savedConfig };
      }
    } catch (error) {
      console.warn('Failed to load webapp config, using defaults:', error);
    }
    return { ...defaultCompleteConfig, ...currentPluginConfig };
  };

  const saveWebappConfig = async (config: Partial<MosquittoCompleteConfig>): Promise<void> => {
    try {
      await fs.ensureDir(getConfigPath());
      const configPath = getWebappConfigPath();
      // Only save webapp-managed settings, exclude plugin settings
      const { enabled, brokerPort, brokerHost, enableSecurity, autoStart, ...webappConfig } = config;
      await fs.writeJson(configPath, webappConfig, { spaces: 2 });
    } catch (error) {
      console.error('Failed to save webapp config:', error);
      throw error;
    }
  };

  const pluginInstance: Plugin = {
    id: 'signalk-mosquitto',
    name: 'SignalK MQTT Mosquitto Manager',

    schema: (): object => ({
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable Mosquitto Broker',
          description: 'Start/stop the Mosquitto MQTT broker service',
          default: false
        },
        brokerPort: {
          type: 'number',
          title: 'MQTT Port',
          description: 'Primary MQTT port for broker connections',
          default: 1883,
          minimum: 1,
          maximum: 65535
        },
        brokerHost: {
          type: 'string',
          title: 'Bind Address', 
          description: 'IP address to bind the broker to (0.0.0.0 for all interfaces)',
          default: '0.0.0.0'
        },
        enableSecurity: {
          type: 'boolean',
          title: 'Enable Authentication',
          description: 'Require username/password authentication for connections',
          default: true
        },
        autoStart: {
          type: 'boolean',
          title: 'Auto-start on SignalK Start',
          description: 'Automatically start Mosquitto when SignalK server starts',
          default: true
        }
      }
    }),

    start: async (config: object): Promise<void> => {
      currentPluginConfig = { ...defaultPluginConfig, ...(config as MosquittoPluginConfig) };
      
      try {
        // Load complete configuration from webapp config file
        currentCompleteConfig = await loadWebappConfig();
        
        mosquittoInstaller = new MosquittoInstaller(app);
        mosquittoManager = new MosquittoManagerImpl(app, currentCompleteConfig);
        bridgeManager = new BridgeManagerImpl(app, currentCompleteConfig);
        securityManager = new SecurityManagerImpl(app, currentCompleteConfig);
        processMonitor = new ProcessMonitorImpl(app, mosquittoManager);

        if (currentPluginConfig.enabled && currentPluginConfig.autoStart) {
          const isInstalled = await mosquittoInstaller.isInstalled();
          if (!isInstalled) {
            console.log('Mosquitto not installed, installing...');
            await mosquittoInstaller.install();
          }

          console.log('Starting Mosquitto broker...');
          await mosquittoManager.start();
          processMonitor.start();
          
          console.log('Mosquitto broker running');
        } else {
          console.log('Mosquitto broker disabled or auto-start disabled');
        }
      } catch (error) {
        console.error(`Failed to start Mosquitto: ${(error as Error).message}`);
        throw error;
      }
    },

    stop: async (): Promise<void> => {
      try {
        if (processMonitor) {
          processMonitor.stop();
        }
        if (mosquittoManager) {
          await mosquittoManager.stop();
        }
        console.log('Mosquitto plugin stopped');
      } catch (error) {
        console.error(`Error stopping Mosquitto: ${(error as Error).message}`);
        throw error;
      }
    },


    registerWithRouter: (router: express.Router): void => {
      // Serve the main web interface at the root of the plugin path
      router.get('/', (_req, res) => {
        res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
      });

      // API routes
      router.get('/status', async (_req, res) => {
        try {
          if (!mosquittoManager) {
            return res.status(503).json({ error: 'Mosquitto manager not initialized' });
          }
          
          const status = await mosquittoManager.getStatus();
          res.json(status);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/restart', async (_req, res) => {
        try {
          if (!mosquittoManager) {
            return res.status(503).json({ error: 'Mosquitto manager not initialized' });
          }
          
          await mosquittoManager.restart();
          res.json({ success: true, message: 'Mosquitto broker restarted' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.get('/bridges', async (_req, res) => {
        try {
          if (!bridgeManager) {
            return res.status(503).json({ error: 'Bridge manager not initialized' });
          }
          
          const bridges = await bridgeManager.getBridges();
          res.json(bridges);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/bridges/test', async (req, res) => {
        try {
          if (!bridgeManager) {
            return res.status(503).json({ error: 'Bridge manager not initialized' });
          }
          
          const bridge = req.body;
          const isConnected = await bridgeManager.testBridgeConnection(bridge);
          res.json({ connected: isConnected });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/bridges', async (req, res) => {
        try {
          if (!bridgeManager) {
            return res.status(503).json({ error: 'Bridge manager not initialized' });
          }
          
          const bridge = req.body;
          await bridgeManager.addBridge(bridge);
          res.json({ success: true, message: 'Bridge added successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      router.put('/bridges/:bridgeId', async (req, res) => {
        try {
          if (!bridgeManager) {
            return res.status(503).json({ error: 'Bridge manager not initialized' });
          }
          
          const { bridgeId } = req.params;
          const bridge = req.body;
          await bridgeManager.updateBridge(bridgeId, bridge);
          res.json({ success: true, message: 'Bridge updated successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      router.delete('/bridges/:bridgeId', async (req, res) => {
        try {
          if (!bridgeManager) {
            return res.status(503).json({ error: 'Bridge manager not initialized' });
          }
          
          const { bridgeId } = req.params;
          await bridgeManager.removeBridge(bridgeId);
          res.json({ success: true, message: 'Bridge deleted successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      router.get('/monitoring', async (_req, res) => {
        try {
          if (!mosquittoManager) {
            return res.status(503).json({ error: 'Mosquitto manager not initialized' });
          }
          
          const monitoring = await mosquittoManager.getMonitoringMetrics();
          res.json(monitoring);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      // User management routes
      router.get('/users', async (_req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const users = await securityManager.getUsers();
          res.json(users);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/users', async (req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const user = req.body;
          await securityManager.addUser(user);
          res.json({ success: true, message: 'User added successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      router.put('/users/:username', async (req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const { username } = req.params;
          const user = req.body;
          await securityManager.updateUser(username, user);
          res.json({ success: true, message: 'User updated successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      router.delete('/users/:username', async (req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const { username } = req.params;
          await securityManager.removeUser(username);
          res.json({ success: true, message: 'User deleted successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      // ACL management routes
      router.get('/acls', async (_req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const acls = await securityManager.getAcls();
          res.json(acls);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/acls', async (req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const acl = req.body;
          await securityManager.addAcl(acl);
          res.json({ success: true, message: 'ACL rule added successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      router.delete('/acls', async (req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          const acl = req.body;
          await securityManager.removeAcl(acl);
          res.json({ success: true, message: 'ACL rule deleted successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ error: errorMessage });
        }
      });

      // Certificate generation route
      router.post('/certificates/generate', async (_req, res) => {
        try {
          if (!securityManager) {
            return res.status(503).json({ error: 'Security manager not initialized' });
          }
          
          await securityManager.generateCertificates();
          res.json({ success: true, message: 'Self-signed certificates generated successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      // Configuration management routes
      router.get('/config', async (_req, res) => {
        try {
          // Return complete configuration for webapp management
          const completeConfig = await loadWebappConfig();
          res.json(completeConfig);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/config', async (req, res) => {
        try {
          const newConfig = { ...currentCompleteConfig, ...req.body };
          
          // Validate the configuration
          const validation = require('./utils/validation').ValidationUtils.validateConfig(newConfig);
          if (!validation.valid) {
            return res.status(400).json({ error: `Configuration validation failed: ${validation.errors.join(', ')}` });
          }

          // Save webapp-managed configuration
          await saveWebappConfig(newConfig);
          
          // Update current complete configuration
          currentCompleteConfig = newConfig;
          
          // Apply configuration changes to services (without restarting plugin)
          if (mosquittoManager) {
            await mosquittoManager.restart();
          }
          
          res.json({ success: true, message: 'Configuration saved successfully' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      // Serve static files for the web interface
      const staticPath = path.resolve(__dirname, '..', 'public');
      router.use(express.static(staticPath));
    },

    signalKApiRoutes: (router: express.Router): express.Router => {
      console.log('Webapp API routes registered');
      return router;
    }
  };

  return pluginInstance;
}

module.exports = plugin;