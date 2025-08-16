// Types and interfaces for SignalK Mosquitto plugin

// Simplified plugin configuration (SignalK admin interface)
export interface MosquittoPluginConfig {
  enabled: boolean;
  brokerPort: number;
  brokerHost: string;
  enableSecurity: boolean;
  autoStart: boolean;
}

// Complete configuration for internal use and webapp management
export interface MosquittoCompleteConfig extends MosquittoPluginConfig {
  enableWebsockets: boolean;
  websocketPort: number;
  maxConnections: number;
  allowAnonymous: boolean;
  enableLogging: boolean;
  logLevel: 'error' | 'warning' | 'notice' | 'information' | 'debug';
  persistence: boolean;
  persistenceLocation: string;
  tlsEnabled: boolean;
  tlsCertPath: string;
  tlsKeyPath: string;
  tlsCaPath: string;
  bridges: BridgeConfig[];
  users: UserConfig[];
  acls: AclConfig[];
}

export interface BridgeConfig {
  id: string;
  enabled: boolean;
  name: string;
  remoteHost: string;
  remotePort: number;
  remoteUsername?: string;
  remotePassword?: string;
  topics: BridgeTopicConfig[];
  tlsEnabled: boolean;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  tlsCaPath?: string;
  keepalive: number;
  cleanSession: boolean;
  tryPrivate: boolean;
}

export interface BridgeTopicConfig {
  pattern: string;
  direction: 'in' | 'out' | 'both';
  qos: 0 | 1 | 2;
  localPrefix?: string;
  remotePrefix?: string;
}

export interface UserConfig {
  username: string;
  password: string;
  enabled: boolean;
}

export interface AclConfig {
  username?: string;
  clientid?: string;
  topic: string;
  access: 'read' | 'write' | 'readwrite';
}

export interface MosquittoStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  version?: string;
  connectedClients: number;
  totalConnections: number;
  messagesReceived: number;
  messagesPublished: number;
  bytesReceived: number;
  bytesPublished: number;
}

export interface MonitoringMetrics {
  connectionRate: string;
  messageRate: string;
  dataRate: string;
  monitorStatus: string;
}

export interface MosquittoManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): Promise<MosquittoStatus>;
  getMonitoringMetrics(): Promise<MonitoringMetrics>;
  generateConfig(config: MosquittoCompleteConfig): Promise<string>;
  writeConfig(configContent: string): Promise<void>;
  validateConfig(): Promise<boolean>;
}

export interface BridgeManager {
  addBridge(bridge: BridgeConfig): Promise<void>;
  removeBridge(bridgeId: string): Promise<void>;
  updateBridge(bridgeId: string, bridge: BridgeConfig): Promise<void>;
  getBridges(): Promise<BridgeConfig[]>;
  testBridgeConnection(bridge: BridgeConfig): Promise<boolean>;
}

export interface SecurityManager {
  addUser(user: UserConfig): Promise<void>;
  removeUser(username: string): Promise<void>;
  updateUser(username: string, user: UserConfig): Promise<void>;
  getUsers(): Promise<UserConfig[]>;
  hashPassword(password: string): Promise<string>;
  addAcl(acl: AclConfig): Promise<void>;
  removeAcl(acl: AclConfig): Promise<void>;
  getAcls(): Promise<AclConfig[]>;
  generateCertificates(): Promise<void>;
  validateCertificates(): Promise<boolean>;
}

export interface ProcessMonitor {
  start(): void;
  stop(): void;
  isHealthy(): Promise<boolean>;
  getMetrics(): Promise<MosquittoStatus>;
}
