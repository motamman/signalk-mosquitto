import { PluginServerApp } from '@signalk/server-api';
import { MosquittoPluginConfig, UserConfig, AclConfig, SecurityManager } from '../types/interfaces';
import { FileUtils } from '../utils/file-utils';
import { ValidationUtils } from '../utils/validation';
import * as crypto from 'crypto';
import * as forge from 'node-forge';
import * as path from 'path';

export class SecurityManagerImpl implements SecurityManager {
  private app: PluginServerApp;
  private config: MosquittoPluginConfig;
  private dataDir: string;
  private configDir: string;
  private passwordFile: string;
  private aclFile: string;
  private usersFile: string;
  private aclsFile: string;
  private certsDir: string;

  constructor(app: PluginServerApp, config: MosquittoPluginConfig) {
    this.app = app;
    this.config = config;
    this.dataDir = FileUtils.getDataDir('signalk-mosquitto');
    this.configDir = path.join(this.dataDir, 'config');
    this.passwordFile = path.join(this.configDir, 'passwd');
    this.aclFile = path.join(this.configDir, 'acl');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.aclsFile = path.join(this.dataDir, 'acls.json');
    this.certsDir = path.join(this.dataDir, 'certs');
  }

  async addUser(user: UserConfig): Promise<void> {
    try {
      const validation = ValidationUtils.validateUser(user);
      if (validation.length > 0) {
        throw new Error(`User validation failed: ${validation.join(', ')}`);
      }

      const existingUsers = await this.getUsers();

      const existingUser = existingUsers.find(u => u.username === user.username);
      if (existingUser) {
        throw new Error(`User '${user.username}' already exists`);
      }

      const hashedPassword = await this.hashPassword(user.password);
      const userWithHashedPassword = { ...user, password: hashedPassword };

      existingUsers.push(userWithHashedPassword);
      await this.saveUsers(existingUsers);
      await this.generatePasswordFile(existingUsers);

      console.log(`User '${user.username}' added successfully`);
    } catch (error) {
      console.error(`Failed to add user: ${(error as Error).message}`);
      throw error;
    }
  }

  async removeUser(username: string): Promise<void> {
    try {
      const existingUsers = await this.getUsers();
      const userIndex = existingUsers.findIndex(u => u.username === username);

      if (userIndex === -1) {
        throw new Error(`User '${username}' not found`);
      }

      existingUsers.splice(userIndex, 1);
      await this.saveUsers(existingUsers);
      await this.generatePasswordFile(existingUsers);

      console.log(`User '${username}' removed successfully`);
    } catch (error) {
      console.error(`Failed to remove user: ${(error as Error).message}`);
      throw error;
    }
  }

  async updateUser(username: string, user: UserConfig): Promise<void> {
    try {
      const validation = ValidationUtils.validateUser(user);
      if (validation.length > 0) {
        throw new Error(`User validation failed: ${validation.join(', ')}`);
      }

      const existingUsers = await this.getUsers();
      const userIndex = existingUsers.findIndex(u => u.username === username);

      if (userIndex === -1) {
        throw new Error(`User '${username}' not found`);
      }

      if (user.username !== username) {
        user.username = username;
      }

      const hashedPassword = await this.hashPassword(user.password);
      const userWithHashedPassword = { ...user, password: hashedPassword };

      existingUsers[userIndex] = userWithHashedPassword;
      await this.saveUsers(existingUsers);
      await this.generatePasswordFile(existingUsers);

      console.log(`User '${username}' updated successfully`);
    } catch (error) {
      console.error(`Failed to update user: ${(error as Error).message}`);
      throw error;
    }
  }

  async getUsers(): Promise<UserConfig[]> {
    try {
      if (!(await FileUtils.fileExists(this.usersFile))) {
        return [];
      }

      const content = await FileUtils.readFile(this.usersFile);
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load users: ${(error as Error).message}`);
      return [];
    }
  }

  async hashPassword(password: string): Promise<string> {
    try {
      const salt = crypto.randomBytes(12);
      const saltBase64 = salt.toString('base64');
      const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
      const hashBase64 = hash.toString('base64');

      return `PBKDF2$sha256$10000$${saltBase64}$${hashBase64}`;
    } catch (error) {
      console.error(`Failed to hash password: ${(error as Error).message}`);
      throw error;
    }
  }

  async addAcl(acl: AclConfig): Promise<void> {
    try {
      const validation = ValidationUtils.validateAcl(acl);
      if (validation.length > 0) {
        throw new Error(`ACL validation failed: ${validation.join(', ')}`);
      }

      const existingAcls = await this.getAcls();

      const duplicateAcl = existingAcls.find(
        a =>
          a.username === acl.username &&
          a.clientid === acl.clientid &&
          a.topic === acl.topic &&
          a.access === acl.access
      );

      if (duplicateAcl) {
        throw new Error('Identical ACL rule already exists');
      }

      existingAcls.push(acl);
      await this.saveAcls(existingAcls);
      await this.generateAclFile(existingAcls);

      console.log('ACL rule added successfully');
    } catch (error) {
      console.error(`Failed to add ACL: ${(error as Error).message}`);
      throw error;
    }
  }

  async removeAcl(acl: AclConfig): Promise<void> {
    try {
      const existingAcls = await this.getAcls();
      const aclIndex = existingAcls.findIndex(
        a =>
          a.username === acl.username &&
          a.clientid === acl.clientid &&
          a.topic === acl.topic &&
          a.access === acl.access
      );

      if (aclIndex === -1) {
        throw new Error('ACL rule not found');
      }

      existingAcls.splice(aclIndex, 1);
      await this.saveAcls(existingAcls);
      await this.generateAclFile(existingAcls);

      console.log('ACL rule removed successfully');
    } catch (error) {
      console.error(`Failed to remove ACL: ${(error as Error).message}`);
      throw error;
    }
  }

  async getAcls(): Promise<AclConfig[]> {
    try {
      if (!(await FileUtils.fileExists(this.aclsFile))) {
        return [];
      }

      const content = await FileUtils.readFile(this.aclsFile);
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load ACLs: ${(error as Error).message}`);
      return [];
    }
  }

  async generateCertificates(): Promise<void> {
    try {
      await FileUtils.ensureDir(this.certsDir);

      const caKeyPath = path.join(this.certsDir, 'ca-key.pem');
      const caCertPath = path.join(this.certsDir, 'ca-cert.pem');
      const serverKeyPath = path.join(this.certsDir, 'server-key.pem');
      const serverCertPath = path.join(this.certsDir, 'server-cert.pem');

      if (
        (await FileUtils.fileExists(caCertPath)) &&
        (await FileUtils.fileExists(serverCertPath))
      ) {
        console.log('Certificates already exist, skipping generation');
        return;
      }

      console.log('Generating TLS certificates...');

      const caKeys = forge.pki.rsa.generateKeyPair(2048);
      const caCert = forge.pki.createCertificate();

      caCert.publicKey = caKeys.publicKey;
      caCert.serialNumber = '01';
      caCert.validity.notBefore = new Date();
      caCert.validity.notAfter = new Date();
      caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);

      const caAttrs = [
        {
          name: 'commonName',
          value: 'SignalK Mosquitto CA',
        },
        {
          name: 'countryName',
          value: 'US',
        },
        {
          name: 'organizationName',
          value: 'SignalK',
        },
      ];

      caCert.setSubject(caAttrs);
      caCert.setIssuer(caAttrs);

      caCert.setExtensions([
        {
          name: 'basicConstraints',
          cA: true,
        },
        {
          name: 'keyUsage',
          keyCertSign: true,
          digitalSignature: true,
          keyEncipherment: true,
        },
      ]);

      caCert.sign(caKeys.privateKey);

      const serverKeys = forge.pki.rsa.generateKeyPair(2048);
      const serverCert = forge.pki.createCertificate();

      serverCert.publicKey = serverKeys.publicKey;
      serverCert.serialNumber = '02';
      serverCert.validity.notBefore = new Date();
      serverCert.validity.notAfter = new Date();
      serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 5);

      const serverAttrs = [
        {
          name: 'commonName',
          value: 'localhost',
        },
        {
          name: 'countryName',
          value: 'US',
        },
        {
          name: 'organizationName',
          value: 'SignalK',
        },
      ];

      serverCert.setSubject(serverAttrs);
      serverCert.setIssuer(caAttrs);

      serverCert.setExtensions([
        {
          name: 'basicConstraints',
          cA: false,
        },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
        },
        {
          name: 'subjectAltName',
          altNames: [
            {
              type: 2,
              value: 'localhost',
            },
            {
              type: 7,
              ip: '127.0.0.1',
            },
          ],
        },
      ]);

      serverCert.sign(caKeys.privateKey);

      const caPem = forge.pki.certificateToPem(caCert);
      const caKeyPem = forge.pki.privateKeyToPem(caKeys.privateKey);
      const serverCertPem = forge.pki.certificateToPem(serverCert);
      const serverKeyPem = forge.pki.privateKeyToPem(serverKeys.privateKey);

      await FileUtils.writeFile(caCertPath, caPem);
      await FileUtils.writeFile(caKeyPath, caKeyPem);
      await FileUtils.writeFile(serverCertPath, serverCertPem);
      await FileUtils.writeFile(serverKeyPath, serverKeyPem);

      await FileUtils.chmod(caKeyPath, '600');
      await FileUtils.chmod(serverKeyPath, '600');

      this.config.tlsCertPath = serverCertPath;
      this.config.tlsKeyPath = serverKeyPath;
      this.config.tlsCaPath = caCertPath;

      console.log('TLS certificates generated successfully');
    } catch (error) {
      console.error(`Failed to generate certificates: ${(error as Error).message}`);
      throw error;
    }
  }

  async validateCertificates(): Promise<boolean> {
    try {
      if (!this.config.tlsCertPath || !this.config.tlsKeyPath) {
        return false;
      }

      const certExists = await FileUtils.fileExists(this.config.tlsCertPath);
      const keyExists = await FileUtils.fileExists(this.config.tlsKeyPath);

      if (!certExists || !keyExists) {
        return false;
      }

      const certContent = await FileUtils.readFile(this.config.tlsCertPath);
      const keyContent = await FileUtils.readFile(this.config.tlsKeyPath);

      try {
        const cert = forge.pki.certificateFromPem(certContent);
        forge.pki.privateKeyFromPem(keyContent); // Validate private key format

        const now = new Date();
        if (cert.validity.notAfter <= now) {
          console.log('Certificate has expired');
          return false;
        }

        if (cert.validity.notBefore > now) {
          console.log('Certificate is not yet valid');
          return false;
        }

        return true;
      } catch (parseError) {
        console.log(`Certificate parsing error: ${(parseError as Error).message}`);
        return false;
      }
    } catch (error) {
      console.error(`Certificate validation error: ${(error as Error).message}`);
      return false;
    }
  }

  private async saveUsers(users: UserConfig[]): Promise<void> {
    await FileUtils.ensureDir(this.dataDir);
    await FileUtils.writeFile(this.usersFile, JSON.stringify(users, null, 2));
  }

  private async saveAcls(acls: AclConfig[]): Promise<void> {
    await FileUtils.ensureDir(this.dataDir);
    await FileUtils.writeFile(this.aclsFile, JSON.stringify(acls, null, 2));
  }

  private async generatePasswordFile(users: UserConfig[]): Promise<void> {
    try {
      await FileUtils.ensureDir(this.configDir);

      const lines: string[] = [];
      for (const user of users) {
        if (user.enabled) {
          lines.push(`${user.username}:${user.password}`);
        }
      }

      await FileUtils.writeFile(this.passwordFile, lines.join('\n') + '\n');
      await FileUtils.chmod(this.passwordFile, '600');

      console.log(`Password file generated with ${lines.length} users`);
    } catch (error) {
      console.error(`Failed to generate password file: ${(error as Error).message}`);
      throw error;
    }
  }

  private async generateAclFile(acls: AclConfig[]): Promise<void> {
    try {
      await FileUtils.ensureDir(this.configDir);

      const lines: string[] = [];

      lines.push('# ACL file generated by SignalK Mosquitto plugin');
      lines.push('# Do not edit manually - changes will be overwritten');
      lines.push('');

      const userGroups = new Map<string, AclConfig[]>();
      const clientGroups = new Map<string, AclConfig[]>();
      const globalAcls: AclConfig[] = [];

      for (const acl of acls) {
        if (acl.username) {
          if (!userGroups.has(acl.username)) {
            userGroups.set(acl.username, []);
          }
          userGroups.get(acl.username)!.push(acl);
        } else if (acl.clientid) {
          if (!clientGroups.has(acl.clientid)) {
            clientGroups.set(acl.clientid, []);
          }
          clientGroups.get(acl.clientid)!.push(acl);
        } else {
          globalAcls.push(acl);
        }
      }

      if (globalAcls.length > 0) {
        lines.push('# Global ACLs');
        for (const acl of globalAcls) {
          lines.push(`topic ${this.formatAclAccess(acl.access)} ${acl.topic}`);
        }
        lines.push('');
      }

      for (const [username, userAcls] of userGroups) {
        lines.push(`user ${username}`);
        for (const acl of userAcls) {
          lines.push(`topic ${this.formatAclAccess(acl.access)} ${acl.topic}`);
        }
        lines.push('');
      }

      for (const [clientid, clientAcls] of clientGroups) {
        lines.push(`clientid ${clientid}`);
        for (const acl of clientAcls) {
          lines.push(`topic ${this.formatAclAccess(acl.access)} ${acl.topic}`);
        }
        lines.push('');
      }

      await FileUtils.writeFile(this.aclFile, lines.join('\n'));
      await FileUtils.chmod(this.aclFile, '644');

      console.log(`ACL file generated with ${acls.length} rules`);
    } catch (error) {
      console.error(`Failed to generate ACL file: ${(error as Error).message}`);
      throw error;
    }
  }

  private formatAclAccess(access: string): string {
    switch (access) {
      case 'read':
        return 'read';
      case 'write':
        return 'write';
      case 'readwrite':
        return 'readwrite';
      default:
        return 'read';
    }
  }

  async enableUser(username: string): Promise<void> {
    const users = await this.getUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    user.enabled = true;
    await this.updateUser(username, user);
  }

  async disableUser(username: string): Promise<void> {
    const users = await this.getUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    user.enabled = false;
    await this.updateUser(username, user);
  }

  async changePassword(username: string, newPassword: string): Promise<void> {
    const users = await this.getUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    user.password = newPassword;
    await this.updateUser(username, user);
  }

  async exportSecurityConfig(): Promise<string> {
    const users = await this.getUsers();
    const acls = await this.getAcls();

    return JSON.stringify(
      {
        users: users.map(u => ({ ...u, password: '[REDACTED]' })),
        acls,
      },
      null,
      2
    );
  }

  async importSecurityConfig(
    configJson: string,
    overwrite: boolean = false
  ): Promise<{ users: number; acls: number }> {
    try {
      const importedConfig = JSON.parse(configJson);
      let importedUsers = 0;
      let importedAcls = 0;

      if (importedConfig.users && Array.isArray(importedConfig.users)) {
        const existingUsers = await this.getUsers();

        for (const user of importedConfig.users) {
          if (user.password === '[REDACTED]') {
            console.log(`Skipping user '${user.username}' with redacted password`);
            continue;
          }

          const validation = ValidationUtils.validateUser(user);
          if (validation.length > 0) {
            console.log(`Skipping invalid user '${user.username}': ${validation.join(', ')}`);
            continue;
          }

          const existingUserIndex = existingUsers.findIndex(u => u.username === user.username);

          if (existingUserIndex >= 0) {
            if (overwrite) {
              existingUsers[existingUserIndex] = user;
              importedUsers++;
            }
          } else {
            existingUsers.push(user);
            importedUsers++;
          }
        }

        if (importedUsers > 0) {
          await this.saveUsers(existingUsers);
          await this.generatePasswordFile(existingUsers);
        }
      }

      if (importedConfig.acls && Array.isArray(importedConfig.acls)) {
        const existingAcls = await this.getAcls();

        for (const acl of importedConfig.acls) {
          const validation = ValidationUtils.validateAcl(acl);
          if (validation.length > 0) {
            console.log(`Skipping invalid ACL: ${validation.join(', ')}`);
            continue;
          }

          const duplicateAcl = existingAcls.find(
            a =>
              a.username === acl.username &&
              a.clientid === acl.clientid &&
              a.topic === acl.topic &&
              a.access === acl.access
          );

          if (!duplicateAcl || overwrite) {
            if (duplicateAcl && overwrite) {
              const index = existingAcls.indexOf(duplicateAcl);
              existingAcls[index] = acl;
            } else if (!duplicateAcl) {
              existingAcls.push(acl);
            }
            importedAcls++;
          }
        }

        if (importedAcls > 0) {
          await this.saveAcls(existingAcls);
          await this.generateAclFile(existingAcls);
        }
      }

      return { users: importedUsers, acls: importedAcls };
    } catch (error) {
      console.error(`Failed to import security config: ${(error as Error).message}`);
      throw error;
    }
  }
}
