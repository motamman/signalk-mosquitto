interface MosquittoStatus {
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

interface BridgeConfig {
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

interface BridgeTopicConfig {
  pattern: string;
  direction: 'in' | 'out' | 'both';
  qos: 0 | 1 | 2;
  localPrefix?: string;
  remotePrefix?: string;
}

interface UserConfig {
  username: string;
  password: string;
  enabled: boolean;
}

interface AclConfig {
  username?: string;
  clientid?: string;
  topic: string;
  access: 'read' | 'write' | 'readwrite';
}

class MosquittoManager {
  private baseUrl: string;
  private autoRefreshInterval: number | null = null;
  private currentTab: string = 'overview';

  constructor() {
    this.baseUrl = '/plugins/signalk-mosquitto';
    this.init();
  }

  private init(): void {
    this.setupEventListeners();
    this.loadInitialData();
    this.startAutoRefresh();
  }

  private setupEventListeners(): void {
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', e => {
        const target = e.target as HTMLButtonElement;
        const tab = target.dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Modal controls
    document.querySelectorAll('.modal-close, [data-action="cancel"]').forEach(element => {
      element.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    // Restart broker
    document.getElementById('restartBtn')?.addEventListener('click', () => {
      this.restartBroker();
    });

    // Configuration form
    document.getElementById('configForm')?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveConfiguration();
    });

    // Generate certificates
    document.getElementById('generateCertsBtn')?.addEventListener('click', () => {
      this.generateCertificates();
    });

    // Bridge management
    document.getElementById('addBridgeBtn')?.addEventListener('click', () => {
      this.showBridgeModal();
    });

    document.getElementById('bridgeForm')?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveBridge();
    });

    document.getElementById('testBridgeBtn')?.addEventListener('click', () => {
      this.testBridge();
    });

    document.getElementById('addTopicBtn')?.addEventListener('click', () => {
      this.addTopicRow();
    });

    // User management
    document.getElementById('addUserBtn')?.addEventListener('click', () => {
      this.showUserModal();
    });

    document.getElementById('userForm')?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveUser();
    });

    // ACL management
    document.getElementById('addAclBtn')?.addEventListener('click', () => {
      this.showAclModal();
    });

    document.getElementById('aclForm')?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveAcl();
    });

    // Monitoring controls
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      this.refreshStatus();
    });

    document.getElementById('autoRefresh')?.addEventListener('change', e => {
      const target = e.target as HTMLInputElement;
      if (target.checked) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          this.closeAllModals();
        }
      });
    });
  }

  private async loadInitialData(): Promise<void> {
    this.showLoading(true);
    try {
      await Promise.all([
        this.loadStatus(),
        this.loadBridges(),
        this.loadUsers(),
        this.loadAcls(),
        this.loadConfiguration(),
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      this.showError('Failed to load application data');
    } finally {
      this.showLoading(false);
    }
  }

  private switchTab(tab: string): void {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tab)?.classList.add('active');

    this.currentTab = tab;

    // Load tab-specific data
    if (tab === 'monitoring') {
      this.loadMonitoringData();
    }
  }

  private async loadStatus(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) throw new Error('Failed to fetch status');

      const status: MosquittoStatus = await response.json();
      this.updateStatusDisplay(status);
    } catch (error) {
      console.error('Failed to load status:', error);
      this.updateStatusDisplay({
        running: false,
        connectedClients: 0,
        totalConnections: 0,
        messagesReceived: 0,
        messagesPublished: 0,
        bytesReceived: 0,
        bytesPublished: 0,
      });
    }
  }

  private updateStatusDisplay(status: MosquittoStatus): void {
    // Update header status
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    if (statusIndicator && statusText) {
      statusIndicator.className = 'status-indicator';
      if (status.running) {
        statusIndicator.classList.add('running');
        statusText.textContent = 'Running';
      } else {
        statusIndicator.classList.add('stopped');
        statusText.textContent = 'Stopped';
      }
    }

    // Update overview tab
    this.updateElement('brokerStatus', status.running ? 'Running' : 'Stopped');
    this.updateElement('brokerVersion', status.version || 'Unknown');
    this.updateElement(
      'brokerUptime',
      status.uptime ? this.formatUptime(status.uptime) : 'Unknown'
    );
    this.updateElement('brokerPid', status.pid ? status.pid.toString() : 'Unknown');
    this.updateElement('connectedClients', status.connectedClients.toString());
    this.updateElement('totalConnections', status.totalConnections.toString());
    this.updateElement('messagesReceived', status.messagesReceived.toString());
    this.updateElement('messagesPublished', status.messagesPublished.toString());
    this.updateElement('bytesReceived', this.formatBytes(status.bytesReceived));
    this.updateElement('bytesPublished', this.formatBytes(status.bytesPublished));
  }

  private async restartBroker(): Promise<void> {
    this.showLoading(true);
    try {
      const response = await fetch(`${this.baseUrl}/restart`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to restart broker');

      const result = await response.json();
      this.showSuccess(result.message || 'Broker restarted successfully');

      // Wait a moment then refresh status
      setTimeout(() => this.loadStatus(), 2000);
    } catch (error) {
      console.error('Failed to restart broker:', error);
      this.showError('Failed to restart broker');
    } finally {
      this.showLoading(false);
    }
  }

  private async saveConfiguration(): Promise<void> {
    this.showLoading(true);
    try {
      const config = {
        brokerPort: parseInt((document.getElementById('brokerPort') as HTMLInputElement).value),
        brokerHost: (document.getElementById('brokerHost') as HTMLInputElement).value,
        maxConnections: parseInt(
          (document.getElementById('maxConnections') as HTMLInputElement).value
        ),
        logLevel: (document.getElementById('logLevel') as HTMLSelectElement).value,
        enableWebsockets: (document.getElementById('enableWebsockets') as HTMLInputElement).checked,
        websocketPort: parseInt(
          (document.getElementById('websocketPort') as HTMLInputElement).value
        ),
        persistence: (document.getElementById('persistence') as HTMLInputElement).checked,
        persistenceLocation: (document.getElementById('persistenceLocation') as HTMLInputElement)
          .value,
        tlsEnabled: (document.getElementById('tlsEnabled') as HTMLInputElement).checked,
        tlsCertPath: (document.getElementById('tlsCertPath') as HTMLInputElement).value,
        tlsKeyPath: (document.getElementById('tlsKeyPath') as HTMLInputElement).value,
        tlsCaPath: (document.getElementById('tlsCaPath') as HTMLInputElement).value,
      };

      const response = await fetch(`${this.baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save configuration');
      }

      const result = await response.json();
      this.showSuccess(result.message || 'Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      this.showError((error as Error).message || 'Failed to save configuration');
    } finally {
      this.showLoading(false);
    }
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/config`);
      if (!response.ok) throw new Error('Failed to fetch configuration');

      const config = await response.json();
      this.populateConfigurationForm(config);
    } catch (error) {
      console.error('Failed to load configuration:', error);
      // Use default values if loading fails - form already has defaults
    }
  }

  private populateConfigurationForm(config: any): void {
    // Set form values with config data or defaults
    const brokerPort = document.getElementById('brokerPort') as HTMLInputElement;
    if (brokerPort && config.brokerPort) brokerPort.value = config.brokerPort.toString();

    const brokerHost = document.getElementById('brokerHost') as HTMLInputElement;
    if (brokerHost && config.brokerHost) brokerHost.value = config.brokerHost;

    const maxConnections = document.getElementById('maxConnections') as HTMLInputElement;
    if (maxConnections && config.maxConnections)
      maxConnections.value = config.maxConnections.toString();

    const logLevel = document.getElementById('logLevel') as HTMLSelectElement;
    if (logLevel && config.logLevel) logLevel.value = config.logLevel;

    const enableWebsockets = document.getElementById('enableWebsockets') as HTMLInputElement;
    if (enableWebsockets) enableWebsockets.checked = config.enableWebsockets ?? true;

    const websocketPort = document.getElementById('websocketPort') as HTMLInputElement;
    if (websocketPort && config.websocketPort)
      websocketPort.value = config.websocketPort.toString();

    const persistence = document.getElementById('persistence') as HTMLInputElement;
    if (persistence) persistence.checked = config.persistence ?? true;

    const persistenceLocation = document.getElementById('persistenceLocation') as HTMLInputElement;
    if (persistenceLocation && config.persistenceLocation)
      persistenceLocation.value = config.persistenceLocation;

    const tlsEnabled = document.getElementById('tlsEnabled') as HTMLInputElement;
    if (tlsEnabled) tlsEnabled.checked = config.tlsEnabled ?? false;

    const tlsCertPath = document.getElementById('tlsCertPath') as HTMLInputElement;
    if (tlsCertPath && config.tlsCertPath) tlsCertPath.value = config.tlsCertPath;

    const tlsKeyPath = document.getElementById('tlsKeyPath') as HTMLInputElement;
    if (tlsKeyPath && config.tlsKeyPath) tlsKeyPath.value = config.tlsKeyPath;

    const tlsCaPath = document.getElementById('tlsCaPath') as HTMLInputElement;
    if (tlsCaPath && config.tlsCaPath) tlsCaPath.value = config.tlsCaPath;
  }

  private async generateCertificates(): Promise<void> {
    this.showLoading(true);
    try {
      const response = await fetch(`${this.baseUrl}/certificates/generate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate certificates');
      }

      const result = await response.json();
      this.showSuccess(result.message || 'Self-signed certificates generated successfully');
    } catch (error) {
      console.error('Failed to generate certificates:', error);
      this.showError((error as Error).message || 'Failed to generate certificates');
    } finally {
      this.showLoading(false);
    }
  }

  private async loadBridges(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/bridges`);
      if (!response.ok) throw new Error('Failed to fetch bridges');

      const bridges: BridgeConfig[] = await response.json();
      this.updateBridgeList(bridges);
      this.updateBridgeOverview(bridges);
    } catch (error) {
      console.error('Failed to load bridges:', error);
      this.updateBridgeList([]);
      this.updateBridgeOverview([]);
    }
  }

  private updateBridgeList(bridges: BridgeConfig[]): void {
    const container = document.getElementById('bridgeList');
    if (!container) return;

    if (bridges.length === 0) {
      container.innerHTML = '<p class="text-muted">No bridges configured</p>';
      return;
    }

    container.innerHTML = bridges
      .map(
        bridge => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${bridge.name}</div>
          <div class="list-item-subtitle">
            ${bridge.remoteHost}:${bridge.remotePort} 
            <span class="bridge-status ${bridge.enabled ? 'connected' : 'disabled'}">
              <i class="fas fa-circle"></i>
              ${bridge.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-info btn-sm" onclick="manager.testBridgeConnection('${bridge.id}')">
            <i class="fas fa-satellite-dish"></i> Test
          </button>
          <button class="btn btn-secondary btn-sm" onclick="manager.editBridge('${bridge.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="manager.deleteBridge('${bridge.id}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `
      )
      .join('');
  }

  private updateBridgeOverview(bridges: BridgeConfig[]): void {
    const container = document.getElementById('bridgeOverview');
    if (!container) return;

    if (bridges.length === 0) {
      container.innerHTML = '<p class="text-muted">No bridges configured</p>';
      return;
    }

    const enabledCount = bridges.filter(b => b.enabled).length;
    container.innerHTML = `
      <div class="status-grid">
        <div class="status-item">
          <span class="label">Total Bridges:</span>
          <span class="value">${bridges.length}</span>
        </div>
        <div class="status-item">
          <span class="label">Enabled:</span>
          <span class="value">${enabledCount}</span>
        </div>
      </div>
    `;
  }

  private showBridgeModal(bridge?: BridgeConfig): void {
    const modal = document.getElementById('bridgeModal');
    const form = document.getElementById('bridgeForm') as HTMLFormElement;

    if (!modal || !form) return;

    // Reset form
    form.reset();

    // Clear existing topics
    const topicList = document.getElementById('topicList');
    if (topicList) {
      topicList.innerHTML = '';
      this.addTopicRow();
    }

    if (bridge) {
      // Edit mode
      document.getElementById('bridgeModalTitle')!.textContent = 'Edit Bridge';
      form.dataset.bridgeId = bridge.id;
      this.populateBridgeForm(bridge);
    } else {
      // Add mode
      document.getElementById('bridgeModalTitle')!.textContent = 'Add Bridge';
      delete form.dataset.bridgeId;
    }

    modal.classList.add('active');
  }

  private populateBridgeForm(bridge: BridgeConfig): void {
    (document.getElementById('bridgeName') as HTMLInputElement).value = bridge.name;
    (document.getElementById('remoteHost') as HTMLInputElement).value = bridge.remoteHost;
    (document.getElementById('remotePort') as HTMLInputElement).value =
      bridge.remotePort.toString();
    (document.getElementById('remoteUsername') as HTMLInputElement).value =
      bridge.remoteUsername || '';
    (document.getElementById('remotePassword') as HTMLInputElement).value =
      bridge.remotePassword || '';

    // Add topic rows
    const topicList = document.getElementById('topicList');
    if (topicList && bridge.topics.length > 0) {
      topicList.innerHTML = '';
      bridge.topics.forEach(topic => {
        this.addTopicRow(topic);
      });
    }
  }

  private addTopicRow(topic?: BridgeTopicConfig): void {
    const topicList = document.getElementById('topicList');
    if (!topicList) return;

    const row = document.createElement('div');
    row.className = 'topic-row';
    row.innerHTML = `
      <input type="text" placeholder="Topic pattern" class="topic-pattern" value="${topic?.pattern || ''}">
      <select class="topic-direction">
        <option value="both" ${topic?.direction === 'both' ? 'selected' : ''}>Both</option>
        <option value="in" ${topic?.direction === 'in' ? 'selected' : ''}>In</option>
        <option value="out" ${topic?.direction === 'out' ? 'selected' : ''}>Out</option>
      </select>
      <select class="topic-qos">
        <option value="0" ${topic?.qos === 0 ? 'selected' : ''}>QoS 0</option>
        <option value="1" ${topic?.qos === 1 ? 'selected' : ''}>QoS 1</option>
        <option value="2" ${topic?.qos === 2 ? 'selected' : ''}>QoS 2</option>
      </select>
      <button type="button" class="btn btn-danger btn-sm remove-topic">
        <i class="fas fa-trash"></i>
      </button>
    `;

    // Add remove handler
    row.querySelector('.remove-topic')?.addEventListener('click', () => {
      row.remove();
    });

    topicList.appendChild(row);
  }

  private async saveBridge(): Promise<void> {
    const form = document.getElementById('bridgeForm') as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    this.showLoading(true);
    try {
      const isEditMode = document.getElementById('bridgeModalTitle')!.textContent === 'Edit Bridge';
      const existingBridgeId = isEditMode ? form.dataset.bridgeId : undefined;

      const bridgeConfig: BridgeConfig = {
        id: existingBridgeId || Date.now().toString(),
        enabled: true,
        name: (document.getElementById('bridgeName') as HTMLInputElement).value,
        remoteHost: (document.getElementById('remoteHost') as HTMLInputElement).value,
        remotePort: parseInt((document.getElementById('remotePort') as HTMLInputElement).value),
        remoteUsername:
          (document.getElementById('remoteUsername') as HTMLInputElement).value || undefined,
        remotePassword:
          (document.getElementById('remotePassword') as HTMLInputElement).value || undefined,
        tlsEnabled: false,
        keepalive: 60,
        cleanSession: true,
        tryPrivate: false,
        topics: this.collectTopics(),
      };

      let response;
      if (isEditMode && existingBridgeId) {
        response = await fetch(`${this.baseUrl}/bridges/${existingBridgeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bridgeConfig),
        });
      } else {
        response = await fetch(`${this.baseUrl}/bridges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bridgeConfig),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save bridge');
      }

      const result = await response.json();
      this.showSuccess(result.message || 'Bridge saved successfully');
      this.closeAllModals();
      this.loadBridges();
    } catch (error) {
      console.error('Failed to save bridge:', error);
      this.showError((error as Error).message || 'Failed to save bridge');
    } finally {
      this.showLoading(false);
    }
  }

  private collectTopics(): BridgeTopicConfig[] {
    const topics: BridgeTopicConfig[] = [];
    const rows = document.querySelectorAll('.topic-row');

    rows.forEach(row => {
      const pattern = (row.querySelector('.topic-pattern') as HTMLInputElement).value;
      const direction = (row.querySelector('.topic-direction') as HTMLSelectElement).value as
        | 'in'
        | 'out'
        | 'both';
      const qos = parseInt((row.querySelector('.topic-qos') as HTMLSelectElement).value) as
        | 0
        | 1
        | 2;

      if (pattern.trim()) {
        topics.push({ pattern, direction, qos });
      }
    });

    return topics;
  }

  private async testBridge(): Promise<void> {
    const bridge: Partial<BridgeConfig> = {
      remoteHost: (document.getElementById('remoteHost') as HTMLInputElement).value,
      remotePort: parseInt((document.getElementById('remotePort') as HTMLInputElement).value),
      remoteUsername:
        (document.getElementById('remoteUsername') as HTMLInputElement).value || undefined,
      remotePassword:
        (document.getElementById('remotePassword') as HTMLInputElement).value || undefined,
    };

    this.showLoading(true);
    try {
      const response = await fetch(`${this.baseUrl}/bridges/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bridge),
      });

      if (!response.ok) throw new Error('Test failed');

      const result = await response.json();
      if (result.connected) {
        this.showSuccess('Connection test successful');
      } else {
        this.showError('Connection test failed');
      }
    } catch (error) {
      console.error('Failed to test bridge:', error);
      this.showError('Connection test failed');
    } finally {
      this.showLoading(false);
    }
  }

  private async loadUsers(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/users`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const users: UserConfig[] = await response.json();
      this.updateUserList(users);
    } catch (error) {
      console.error('Failed to load users:', error);
      this.updateUserList([]);
    }
  }

  private updateUserList(users: UserConfig[]): void {
    const container = document.getElementById('userList');
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = '<p class="text-muted">No users configured</p>';
      return;
    }

    container.innerHTML = users
      .map(
        user => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${user.username}</div>
          <div class="list-item-subtitle">
            <span class="bridge-status ${user.enabled ? 'connected' : 'disabled'}">
              <i class="fas fa-circle"></i>
              ${user.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="manager.editUser('${user.username}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="manager.deleteUser('${user.username}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `
      )
      .join('');
  }

  private showUserModal(user?: UserConfig): void {
    const modal = document.getElementById('userModal');
    if (!modal) return;

    const form = document.getElementById('userForm') as HTMLFormElement;
    form.reset();

    if (user) {
      document.getElementById('userModalTitle')!.textContent = 'Edit User';
      (document.getElementById('username') as HTMLInputElement).value = user.username;
      (document.getElementById('password') as HTMLInputElement).value = '';
      (document.getElementById('userEnabled') as HTMLInputElement).checked = user.enabled;

      // Make username readonly when editing
      (document.getElementById('username') as HTMLInputElement).readOnly = true;
    } else {
      document.getElementById('userModalTitle')!.textContent = 'Add User';
      (document.getElementById('username') as HTMLInputElement).readOnly = false;
    }

    modal.classList.add('active');
  }

  private async saveUser(): Promise<void> {
    const form = document.getElementById('userForm') as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    this.showLoading(true);
    try {
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const enabled = (document.getElementById('userEnabled') as HTMLInputElement).checked;

      const userConfig: UserConfig = {
        username,
        password,
        enabled,
      };

      const isEditMode = document.getElementById('userModalTitle')!.textContent === 'Edit User';

      let response;
      if (isEditMode) {
        response = await fetch(`${this.baseUrl}/users/${username}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userConfig),
        });
      } else {
        response = await fetch(`${this.baseUrl}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userConfig),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
      }

      const result = await response.json();
      this.showSuccess(result.message || 'User saved successfully');
      this.closeAllModals();
      this.loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      this.showError((error as Error).message || 'Failed to save user');
    } finally {
      this.showLoading(false);
    }
  }

  private async loadAcls(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/acls`);
      if (!response.ok) throw new Error('Failed to fetch ACLs');

      const acls: AclConfig[] = await response.json();
      this.updateAclList(acls);
    } catch (error) {
      console.error('Failed to load ACLs:', error);
      this.updateAclList([]);
    }
  }

  private updateAclList(acls: AclConfig[]): void {
    const container = document.getElementById('aclList');
    if (!container) return;

    if (acls.length === 0) {
      container.innerHTML = '<p class="text-muted">No ACL rules configured</p>';
      return;
    }

    container.innerHTML = acls
      .map(
        acl => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${acl.topic}</div>
          <div class="list-item-subtitle">
            ${acl.username ? `User: ${acl.username}` : acl.clientid ? `Client: ${acl.clientid}` : 'Global'} 
            - ${acl.access}
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger btn-sm" onclick="manager.deleteAcl('${encodeURIComponent(JSON.stringify(acl))}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `
      )
      .join('');
  }

  private showAclModal(): void {
    const modal = document.getElementById('aclModal');
    if (!modal) return;

    const form = document.getElementById('aclForm') as HTMLFormElement;
    form.reset();

    modal.classList.add('active');
  }

  private async saveAcl(): Promise<void> {
    const form = document.getElementById('aclForm') as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    this.showLoading(true);
    try {
      const username = (document.getElementById('aclUsername') as HTMLInputElement).value.trim();
      const clientid = (document.getElementById('aclClientId') as HTMLInputElement).value.trim();
      const topic = (document.getElementById('aclTopic') as HTMLInputElement).value.trim();
      const access = (document.getElementById('aclAccess') as HTMLSelectElement).value as
        | 'read'
        | 'write'
        | 'readwrite';

      const aclConfig: AclConfig = {
        topic,
        access,
      };

      if (username) {
        aclConfig.username = username;
      }

      if (clientid) {
        aclConfig.clientid = clientid;
      }

      const response = await fetch(`${this.baseUrl}/acls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aclConfig),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save ACL rule');
      }

      const result = await response.json();
      this.showSuccess(result.message || 'ACL rule saved successfully');
      this.closeAllModals();
      this.loadAcls();
    } catch (error) {
      console.error('Failed to save ACL rule:', error);
      this.showError((error as Error).message || 'Failed to save ACL rule');
    } finally {
      this.showLoading(false);
    }
  }

  private async loadMonitoringData(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/monitoring`);
      if (!response.ok) throw new Error('Failed to fetch monitoring data');

      const monitoring = await response.json();
      this.updateElement('connectionRate', monitoring.connectionRate);
      this.updateElement('messageRate', monitoring.messageRate);
      this.updateElement('dataRate', monitoring.dataRate);
      this.updateElement('monitorStatus', monitoring.monitorStatus);
    } catch (error) {
      console.error('Failed to load monitoring data:', error);
      this.updateElement('connectionRate', '0');
      this.updateElement('messageRate', '0/min');
      this.updateElement('dataRate', '0 KB/s');
      this.updateElement('monitorStatus', 'Error');
    }
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshInterval = window.setInterval(() => {
      this.refreshStatus();
    }, 10000); // 10 seconds
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  private async refreshStatus(): Promise<void> {
    await this.loadStatus();
    if (this.currentTab === 'monitoring') {
      this.loadMonitoringData();
    }
  }

  private closeAllModals(): void {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active');
    });
  }

  private showLoading(show: boolean): void {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      if (show) {
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
    }
  }

  private showSuccess(message: string): void {
    this.showToast('success', 'Success', message);
  }

  private showError(message: string): void {
    this.showToast('error', 'Error', message);
  }

  private showWarning(message: string): void {
    this.showToast('warning', 'Warning', message);
  }

  private showInfo(message: string): void {
    this.showToast('info', 'Info', message);
  }

  private showToast(
    type: 'success' | 'error' | 'warning' | 'info',
    title: string,
    message: string,
    duration: number = 5000
  ): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Get appropriate icon
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle',
    };

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="${icons[type]}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close">
        <i class="fas fa-times"></i>
      </button>
    `;

    // Add close functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => {
      this.removeToast(toast);
    });

    // Add to container
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    // Auto remove after duration
    setTimeout(() => {
      this.removeToast(toast);
    }, duration);
  }

  private removeToast(toast: HTMLElement): void {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  private async showConfirmDialog(
    title: string,
    message: string,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel'
  ): Promise<boolean> {
    return new Promise(resolve => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `
        <div class="confirm-header">
          <h3>${title}</h3>
        </div>
        <div class="confirm-body">
          <p>${message}</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">${cancelText}</button>
          <button class="btn btn-danger confirm-ok">${confirmText}</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Add event listeners
      const cancelBtn = dialog.querySelector('.confirm-cancel');
      const confirmBtn = dialog.querySelector('.confirm-ok');

      const cleanup = (): void => {
        document.body.removeChild(overlay);
      };

      cancelBtn?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      confirmBtn?.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      // Close on overlay click
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      // Focus confirm button
      setTimeout(() => {
        (confirmBtn as HTMLElement)?.focus();
      }, 100);
    });
  }

  private updateElement(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  // Public methods for global access
  public async testBridgeConnection(bridgeId: string): Promise<void> {
    this.showSuccess(`Testing bridge ${bridgeId}...`);
  }

  public async editBridge(bridgeId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/bridges`);
      if (!response.ok) throw new Error('Failed to fetch bridges');

      const bridges: BridgeConfig[] = await response.json();
      const bridge = bridges.find(b => b.id === bridgeId);

      if (!bridge) {
        this.showError(`Bridge with ID '${bridgeId}' not found`);
        return;
      }

      this.showBridgeModal(bridge);
    } catch (error) {
      console.error('Failed to load bridge for editing:', error);
      this.showError('Failed to load bridge data');
    }
  }

  public async deleteBridge(bridgeId: string): Promise<void> {
    const confirmed = await this.showConfirmDialog(
      'Delete Bridge',
      'Are you sure you want to delete this bridge? This action cannot be undone.',
      'Delete Bridge'
    );

    if (confirmed) {
      this.showLoading(true);
      try {
        const response = await fetch(`${this.baseUrl}/bridges/${bridgeId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete bridge');
        }

        const result = await response.json();
        this.showSuccess(result.message || 'Bridge deleted successfully');
        this.loadBridges();
      } catch (error) {
        console.error('Failed to delete bridge:', error);
        this.showError((error as Error).message || 'Failed to delete bridge');
      } finally {
        this.showLoading(false);
      }
    }
  }

  public async editUser(username: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/users`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const users: UserConfig[] = await response.json();
      const user = users.find(u => u.username === username);

      if (!user) {
        this.showError(`User '${username}' not found`);
        return;
      }

      this.showUserModal(user);
    } catch (error) {
      console.error('Failed to load user for editing:', error);
      this.showError('Failed to load user data');
    }
  }

  public async deleteUser(username: string): Promise<void> {
    const confirmed = await this.showConfirmDialog(
      'Delete User',
      `Are you sure you want to delete user '${username}'? This action cannot be undone.`,
      'Delete User'
    );

    if (confirmed) {
      this.showLoading(true);
      try {
        const response = await fetch(`${this.baseUrl}/users/${username}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete user');
        }

        const result = await response.json();
        this.showSuccess(result.message || 'User deleted successfully');
        this.loadUsers();
      } catch (error) {
        console.error('Failed to delete user:', error);
        this.showError((error as Error).message || 'Failed to delete user');
      } finally {
        this.showLoading(false);
      }
    }
  }

  public async deleteAcl(aclData: string): Promise<void> {
    const confirmed = await this.showConfirmDialog(
      'Delete ACL Rule',
      'Are you sure you want to delete this ACL rule? This action cannot be undone.',
      'Delete Rule'
    );

    if (confirmed) {
      this.showLoading(true);
      try {
        const acl = JSON.parse(decodeURIComponent(aclData)) as AclConfig;

        const response = await fetch(`${this.baseUrl}/acls`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acl),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete ACL rule');
        }

        const result = await response.json();
        this.showSuccess(result.message || 'ACL rule deleted successfully');
        this.loadAcls();
      } catch (error) {
        console.error('Failed to delete ACL rule:', error);
        this.showError((error as Error).message || 'Failed to delete ACL rule');
      } finally {
        this.showLoading(false);
      }
    }
  }
}

// Initialize the application
const manager = new MosquittoManager();

// Make manager globally available for onclick handlers
(window as any).manager = manager;
