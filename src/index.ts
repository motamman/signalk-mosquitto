import { Plugin, PluginServerApp } from '@signalk/server-api';
import { MosquittoPluginConfig } from './types/interfaces';
import { MosquittoManagerImpl } from './services/mosquitto-manager';
import { BridgeManagerImpl } from './services/bridge-manager';
import { SecurityManagerImpl } from './services/security-manager';
import { ProcessMonitorImpl } from './services/process-monitor';
import { MosquittoInstaller } from './services/mosquitto-installer';
import * as express from 'express';
import * as path from 'path';

const defaultConfig: MosquittoPluginConfig = {
  enabled: false,
  brokerPort: 1883,
  brokerHost: '0.0.0.0',
  enableWebsockets: true,
  websocketPort: 9001,
  maxConnections: 1000,
  allowAnonymous: true,
  enableLogging: true,
  logLevel: 'information',
  persistence: true,
  persistenceLocation: '/tmp/mosquitto.db',
  enableSecurity: true,
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
  let currentConfig: MosquittoPluginConfig;

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
          default: false
        },
        brokerPort: {
          type: 'number',
          title: 'MQTT Port',
          default: 1883,
          minimum: 1,
          maximum: 65535
        },
        brokerHost: {
          type: 'string',
          title: 'Bind Address',
          default: '0.0.0.0'
        },
        enableWebsockets: {
          type: 'boolean',
          title: 'Enable WebSocket Support',
          default: true
        },
        websocketPort: {
          type: 'number',
          title: 'WebSocket Port',
          default: 9001,
          minimum: 1,
          maximum: 65535
        },
        maxConnections: {
          type: 'number',
          title: 'Maximum Connections',
          default: 1000,
          minimum: 1
        },
        allowAnonymous: {
          type: 'boolean',
          title: 'Allow Anonymous Access',
          default: false
        },
        enableLogging: {
          type: 'boolean',
          title: 'Enable Logging',
          default: true
        },
        logLevel: {
          type: 'string',
          title: 'Log Level',
          enum: ['error', 'warning', 'notice', 'information', 'debug'],
          default: 'information'
        },
        persistence: {
          type: 'boolean',
          title: 'Enable Persistence',
          default: true
        },
        persistenceLocation: {
          type: 'string',
          title: 'Persistence Database Path',
          default: '/tmp/mosquitto.db'
        },
        enableSecurity: {
          type: 'boolean',
          title: 'Enable Authentication',
          default: true
        },
        tlsEnabled: {
          type: 'boolean',
          title: 'Enable TLS/SSL',
          default: false
        },
        tlsCertPath: {
          type: 'string',
          title: 'TLS Certificate Path',
          default: ''
        },
        tlsKeyPath: {
          type: 'string',
          title: 'TLS Private Key Path',
          default: ''
        },
        tlsCaPath: {
          type: 'string',
          title: 'TLS CA Certificate Path',
          default: ''
        },
        bridges: {
          type: 'array',
          title: 'Bridge Connections',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', title: 'Bridge ID' },
              enabled: { type: 'boolean', title: 'Enabled', default: true },
              name: { type: 'string', title: 'Bridge Name' },
              remoteHost: { type: 'string', title: 'Remote Host' },
              remotePort: { type: 'number', title: 'Remote Port', default: 1883 },
              remoteUsername: { type: 'string', title: 'Remote Username' },
              remotePassword: { type: 'string', title: 'Remote Password' },
              tlsEnabled: { type: 'boolean', title: 'Use TLS', default: false },
              keepalive: { type: 'number', title: 'Keep Alive (seconds)', default: 60 },
              cleanSession: { type: 'boolean', title: 'Clean Session', default: true },
              topics: {
                type: 'array',
                title: 'Topics',
                items: {
                  type: 'object',
                  properties: {
                    pattern: { type: 'string', title: 'Topic Pattern' },
                    direction: { type: 'string', enum: ['in', 'out', 'both'], title: 'Direction' },
                    qos: { type: 'number', enum: [0, 1, 2], title: 'QoS Level' },
                    localPrefix: { type: 'string', title: 'Local Prefix' },
                    remotePrefix: { type: 'string', title: 'Remote Prefix' }
                  }
                }
              }
            }
          }
        },
        users: {
          type: 'array',
          title: 'Users',
          items: {
            type: 'object',
            properties: {
              username: { type: 'string', title: 'Username' },
              password: { type: 'string', title: 'Password' },
              enabled: { type: 'boolean', title: 'Enabled', default: true }
            }
          }
        },
        acls: {
          type: 'array',
          title: 'Access Control Rules',
          items: {
            type: 'object',
            properties: {
              username: { type: 'string', title: 'Username' },
              clientid: { type: 'string', title: 'Client ID' },
              topic: { type: 'string', title: 'Topic Pattern' },
              access: { type: 'string', enum: ['read', 'write', 'readwrite'], title: 'Access Level' }
            }
          }
        }
      }
    }),

    start: async (config: object, restart: (newConfiguration: object) => void): Promise<void> => {
      currentConfig = { ...defaultConfig, ...(config as MosquittoPluginConfig) };
      
      try {
        mosquittoInstaller = new MosquittoInstaller(app);
        mosquittoManager = new MosquittoManagerImpl(app, currentConfig);
        bridgeManager = new BridgeManagerImpl(app, currentConfig);
        securityManager = new SecurityManagerImpl(app, currentConfig);
        processMonitor = new ProcessMonitorImpl(app, mosquittoManager);

        if (currentConfig.enabled) {
          const isInstalled = await mosquittoInstaller.isInstalled();
          if (!isInstalled) {
            console.log('Mosquitto not installed, installing...');
            await mosquittoInstaller.install();
          }

          console.log('Starting Mosquitto broker...');
          await mosquittoManager.start();
          processMonitor.start();
          
          // Plugin status management would be handled by server
          console.log('Mosquitto broker running');
        } else {
          console.log('Mosquitto broker disabled');
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
          res.json(currentConfig);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      });

      router.post('/config', async (req, res) => {
        try {
          const newConfig = { ...currentConfig, ...req.body };
          
          // Validate the configuration
          const validation = require('./utils/validation').ValidationUtils.validateConfig(newConfig);
          if (!validation.valid) {
            return res.status(400).json({ error: `Configuration validation failed: ${validation.errors.join(', ')}` });
          }

          // Update current configuration
          currentConfig = newConfig;
          
          // Restart the plugin with new configuration
          // Note: In a real SignalK plugin, you would use the restart callback
          // For now, we'll just update the configuration without restarting
          
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