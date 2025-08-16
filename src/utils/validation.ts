import { MosquittoCompleteConfig, BridgeConfig, UserConfig, AclConfig } from '../types/interfaces';

export class ValidationUtils {
  static validateConfig(config: MosquittoCompleteConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.brokerPort < 1 || config.brokerPort > 65535) {
      errors.push('Broker port must be between 1 and 65535');
    }

    if (config.enableWebsockets && (config.websocketPort < 1 || config.websocketPort > 65535)) {
      errors.push('WebSocket port must be between 1 and 65535');
    }

    if (config.maxConnections < 1) {
      errors.push('Maximum connections must be at least 1');
    }

    if (config.tlsEnabled) {
      if (!config.tlsCertPath || !config.tlsKeyPath) {
        errors.push('TLS certificate and key paths are required when TLS is enabled');
      }
    }

    config.bridges.forEach((bridge, index) => {
      const bridgeErrors = this.validateBridge(bridge);
      bridgeErrors.forEach(error => errors.push(`Bridge ${index + 1}: ${error}`));
    });

    config.users.forEach((user, index) => {
      const userErrors = this.validateUser(user);
      userErrors.forEach(error => errors.push(`User ${index + 1}: ${error}`));
    });

    config.acls.forEach((acl, index) => {
      const aclErrors = this.validateAcl(acl);
      aclErrors.forEach(error => errors.push(`ACL ${index + 1}: ${error}`));
    });

    return { valid: errors.length === 0, errors };
  }

  static validateBridge(bridge: BridgeConfig): string[] {
    const errors: string[] = [];

    if (!bridge.name || bridge.name.trim() === '') {
      errors.push('Bridge name is required');
    }

    if (!bridge.remoteHost || bridge.remoteHost.trim() === '') {
      errors.push('Remote host is required');
    }

    if (bridge.remotePort < 1 || bridge.remotePort > 65535) {
      errors.push('Remote port must be between 1 and 65535');
    }

    if (bridge.keepalive < 5) {
      errors.push('Keep alive must be at least 5 seconds');
    }

    if (bridge.topics.length === 0) {
      errors.push('At least one topic must be configured');
    }

    bridge.topics.forEach((topic, index) => {
      if (!topic.pattern || topic.pattern.trim() === '') {
        errors.push(`Topic ${index + 1}: pattern is required`);
      }

      if (!this.isValidTopicPattern(topic.pattern)) {
        errors.push(`Topic ${index + 1}: invalid topic pattern`);
      }
    });

    if (bridge.tlsEnabled) {
      if (bridge.tlsCertPath && !this.isValidPath(bridge.tlsCertPath)) {
        errors.push('Invalid TLS certificate path');
      }
      if (bridge.tlsKeyPath && !this.isValidPath(bridge.tlsKeyPath)) {
        errors.push('Invalid TLS key path');
      }
      if (bridge.tlsCaPath && !this.isValidPath(bridge.tlsCaPath)) {
        errors.push('Invalid TLS CA path');
      }
    }

    return errors;
  }

  static validateUser(user: UserConfig): string[] {
    const errors: string[] = [];

    if (!user.username || user.username.trim() === '') {
      errors.push('Username is required');
    }

    if (!user.password || user.password.length < 4) {
      errors.push('Password must be at least 4 characters long');
    }

    if (!this.isValidUsername(user.username)) {
      errors.push('Username contains invalid characters');
    }

    return errors;
  }

  static validateAcl(acl: AclConfig): string[] {
    const errors: string[] = [];

    if (!acl.username && !acl.clientid) {
      errors.push('Either username or client ID must be specified');
    }

    if (!acl.topic || acl.topic.trim() === '') {
      errors.push('Topic pattern is required');
    }

    if (!this.isValidTopicPattern(acl.topic)) {
      errors.push('Invalid topic pattern');
    }

    if (acl.username && !this.isValidUsername(acl.username)) {
      errors.push('Username contains invalid characters');
    }

    return errors;
  }

  static isValidTopicPattern(pattern: string): boolean {
    if (!pattern || pattern.trim() === '') {
      return false;
    }

    const invalidChars = /[+#]/g;
    let match;

    while ((match = invalidChars.exec(pattern)) !== null) {
      if (match[0] === '+') {
        const before = pattern[match.index - 1];
        const after = pattern[match.index + 1];

        if ((before && before !== '/') || (after && after !== '/')) {
          return false;
        }
      }

      if (match[0] === '#') {
        if (match.index !== pattern.length - 1) {
          return false;
        }
        const before = pattern[match.index - 1];
        if (before && before !== '/') {
          return false;
        }
      }
    }

    return true;
  }

  static isValidUsername(username: string): boolean {
    if (!username || username.trim() === '') {
      return false;
    }

    const validPattern = /^[a-zA-Z0-9_.-]+$/;
    return validPattern.test(username) && username.length <= 64;
  }

  static isValidPath(filePath: string): boolean {
    if (!filePath || filePath.trim() === '') {
      return false;
    }

    const invalidChars = /[<>:"|?*]/;
    return !invalidChars.test(filePath);
  }

  static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  static isValidHostname(hostname: string): boolean {
    if (!hostname || hostname.trim() === '') {
      return false;
    }

    const hostnamePattern =
      /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
    const ipPattern =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    return hostnamePattern.test(hostname) || ipPattern.test(hostname) || hostname === 'localhost';
  }

  static sanitizeConfigValue(value: string): string {
    return value.replace(/['"\\]/g, '\\$&');
  }

  static validateLogLevel(level: string): boolean {
    const validLevels = ['error', 'warning', 'notice', 'information', 'debug'];
    return validLevels.includes(level);
  }
}
