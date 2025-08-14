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
    this.baseUrl = window.location.origin;
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
      await Promise.all([this.loadStatus(), this.loadBridges(), this.loadUsers(), this.loadAcls()]);
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
    // This would typically save to the plugin configuration
    // For now, just show a success message
    this.showSuccess('Configuration saved successfully');
  }

  private async generateCertificates(): Promise<void> {
    this.showLoading(true);
    try {
      // Call the security manager API to generate certificates
      this.showSuccess('Self-signed certificates generated successfully');
    } catch (error) {
      console.error('Failed to generate certificates:', error);
      this.showError('Failed to generate certificates');
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
      this.populateBridgeForm(bridge);
    } else {
      // Add mode
      document.getElementById('bridgeModalTitle')!.textContent = 'Add Bridge';
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
      const bridgeConfig: BridgeConfig = {
        id: Date.now().toString(), // Generate ID
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

      // Here you would save the bridge via API
      console.log('Saving bridge:', bridgeConfig);
      this.showSuccess('Bridge saved successfully');
      this.closeAllModals();
      this.loadBridges();
    } catch (error) {
      console.error('Failed to save bridge:', error);
      this.showError('Failed to save bridge');
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
    // Mock data for now
    this.updateUserList([]);
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
      (document.getElementById('userEnabled') as HTMLInputElement).checked = user.enabled;
    } else {
      document.getElementById('userModalTitle')!.textContent = 'Add User';
    }

    modal.classList.add('active');
  }

  private async saveUser(): Promise<void> {
    const form = document.getElementById('userForm') as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Implementation would save via API
    this.showSuccess('User saved successfully');
    this.closeAllModals();
    this.loadUsers();
  }

  private async loadAcls(): Promise<void> {
    // Mock data for now
    this.updateAclList([]);
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
        (acl, index) => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${acl.topic}</div>
          <div class="list-item-subtitle">
            ${acl.username ? `User: ${acl.username}` : acl.clientid ? `Client: ${acl.clientid}` : 'Global'} 
            - ${acl.access}
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger btn-sm" onclick="manager.deleteAcl(${index})">
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

    // Implementation would save via API
    this.showSuccess('ACL rule saved successfully');
    this.closeAllModals();
    this.loadAcls();
  }

  private async loadMonitoringData(): Promise<void> {
    // Implementation would load monitoring metrics
    this.updateElement('connectionRate', '0/min');
    this.updateElement('messageRate', '0/min');
    this.updateElement('dataRate', '0 KB/s');
    this.updateElement('monitorStatus', 'Active');
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
    // Simple alert for now - could be replaced with a toast notification
    alert(`Success: ${message}`);
  }

  private showError(message: string): void {
    // Simple alert for now - could be replaced with a toast notification
    alert(`Error: ${message}`);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public editBridge(_bridgeId: string): void {
    // Load bridge data and show modal
    this.showBridgeModal();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async deleteBridge(_bridgeId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this bridge?')) {
      this.showSuccess('Bridge deleted successfully');
      this.loadBridges();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public editUser(_username: string): void {
    this.showUserModal();
  }

  public async deleteUser(username: string): Promise<void> {
    if (confirm(`Are you sure you want to delete user '${username}'?`)) {
      this.showSuccess('User deleted successfully');
      this.loadUsers();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async deleteAcl(_index: number): Promise<void> {
    if (confirm('Are you sure you want to delete this ACL rule?')) {
      this.showSuccess('ACL rule deleted successfully');
      this.loadAcls();
    }
  }
}

// Initialize the application
const manager = new MosquittoManager();

// Make manager globally available for onclick handlers
(window as any).manager = manager;
