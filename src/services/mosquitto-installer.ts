import { PluginServerApp } from '@signalk/server-api';
import { FileUtils } from '../utils/file-utils';
import * as os from 'os';
import * as path from 'path';

export class MosquittoInstaller {
  private app: PluginServerApp;
  private platform: NodeJS.Platform;

  constructor(app: PluginServerApp) {
    this.app = app;
    this.platform = process.platform;
  }

  async isInstalled(): Promise<boolean> {
    try {
      // Check if mosquitto command is available
      if (await FileUtils.isCommandAvailable('mosquitto')) {
        return true;
      }

      // Check common installation paths
      const commonPaths = this.getCommonInstallPaths();
      for (const binPath of commonPaths) {
        if (await FileUtils.fileExists(binPath)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.log(`Error checking Mosquitto installation: ${(error as Error).message}`);
      return false;
    }
  }

  async install(): Promise<void> {
    console.log(`Installing Mosquitto on ${this.platform}...`);

    try {
      switch (this.platform) {
        case 'darwin':
          await this.installOnMacOS();
          break;
        case 'linux':
          await this.installOnLinux();
          break;
        case 'win32':
          await this.installOnWindows();
          break;
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }

      // Verify installation
      const installed = await this.isInstalled();
      if (!installed) {
        throw new Error('Mosquitto installation verification failed');
      }

      // Setup system service if needed
      await this.setupSystemService();

      console.log('Mosquitto installation completed successfully');
    } catch (error) {
      console.error(`Mosquitto installation failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async installOnMacOS(): Promise<void> {
    console.log('Installing Mosquitto on macOS...');

    // Check if Homebrew is available
    if (await FileUtils.isCommandAvailable('brew')) {
      console.log('Using Homebrew to install Mosquitto');
      await FileUtils.executeCommand('brew', ['update']);
      await FileUtils.executeCommand('brew', ['install', 'mosquitto']);

      // Start and enable the service
      await FileUtils.executeCommand('brew', ['services', 'start', 'mosquitto']);
      return;
    }

    // Check if MacPorts is available
    if (await FileUtils.isCommandAvailable('port')) {
      console.log('Using MacPorts to install Mosquitto');
      await FileUtils.executeCommand('sudo', ['port', 'install', 'mosquitto']);
      return;
    }

    // Fallback: Download and compile from source
    console.log('No package manager found, installing from source');
    await this.installFromSource();
  }

  private async installOnLinux(): Promise<void> {
    console.log('Installing Mosquitto on Linux...');

    const distro = await this.getLinuxDistribution();
    console.log(`Detected Linux distribution: ${distro}`);

    if (distro.includes('ubuntu') || distro.includes('debian')) {
      await this.installOnDebian();
    } else if (
      distro.includes('centos') ||
      distro.includes('rhel') ||
      distro.includes('rocky') ||
      distro.includes('almalinux')
    ) {
      await this.installOnRedHat();
    } else if (distro.includes('fedora')) {
      await this.installOnFedora();
    } else if (distro.includes('arch') || distro.includes('manjaro')) {
      await this.installOnArch();
    } else if (distro.includes('alpine')) {
      await this.installOnAlpine();
    } else if (distro.includes('opensuse') || distro.includes('suse')) {
      await this.installOnOpenSUSE();
    } else {
      console.log('Unknown distribution, attempting generic installation');
      await this.attemptGenericLinuxInstall();
    }
  }

  private async installOnDebian(): Promise<void> {
    console.log('Installing on Debian/Ubuntu...');

    // Update package list
    await FileUtils.executeCommand('sudo', ['apt-get', 'update']);

    // Install Mosquitto and clients
    await FileUtils.executeCommand('sudo', [
      'apt-get',
      'install',
      '-y',
      'mosquitto',
      'mosquitto-clients',
    ]);

    // Enable and start service
    if (await FileUtils.isCommandAvailable('systemctl')) {
      await FileUtils.executeCommand('sudo', ['systemctl', 'enable', 'mosquitto']);
      await FileUtils.executeCommand('sudo', ['systemctl', 'start', 'mosquitto']);
    }
  }

  private async installOnRedHat(): Promise<void> {
    console.log('Installing on RHEL/CentOS...');

    // Check if we need to enable EPEL repository
    try {
      await FileUtils.executeCommand('sudo', ['yum', 'install', '-y', 'epel-release']);
    } catch {
      console.log('EPEL repository already available or not needed');
    }

    // Install Mosquitto
    if (await FileUtils.isCommandAvailable('dnf')) {
      await FileUtils.executeCommand('sudo', [
        'dnf',
        'install',
        '-y',
        'mosquitto',
        'mosquitto-clients',
      ]);
    } else {
      await FileUtils.executeCommand('sudo', [
        'yum',
        'install',
        '-y',
        'mosquitto',
        'mosquitto-clients',
      ]);
    }

    // Enable and start service
    if (await FileUtils.isCommandAvailable('systemctl')) {
      await FileUtils.executeCommand('sudo', ['systemctl', 'enable', 'mosquitto']);
      await FileUtils.executeCommand('sudo', ['systemctl', 'start', 'mosquitto']);
    }
  }

  private async installOnFedora(): Promise<void> {
    console.log('Installing on Fedora...');

    await FileUtils.executeCommand('sudo', [
      'dnf',
      'install',
      '-y',
      'mosquitto',
      'mosquitto-clients',
    ]);

    // Enable and start service
    if (await FileUtils.isCommandAvailable('systemctl')) {
      await FileUtils.executeCommand('sudo', ['systemctl', 'enable', 'mosquitto']);
      await FileUtils.executeCommand('sudo', ['systemctl', 'start', 'mosquitto']);
    }
  }

  private async installOnArch(): Promise<void> {
    console.log('Installing on Arch Linux...');

    await FileUtils.executeCommand('sudo', ['pacman', '-S', '--noconfirm', 'mosquitto']);

    // Enable and start service
    if (await FileUtils.isCommandAvailable('systemctl')) {
      await FileUtils.executeCommand('sudo', ['systemctl', 'enable', 'mosquitto']);
      await FileUtils.executeCommand('sudo', ['systemctl', 'start', 'mosquitto']);
    }
  }

  private async installOnAlpine(): Promise<void> {
    console.log('Installing on Alpine Linux...');

    await FileUtils.executeCommand('sudo', ['apk', 'update']);
    await FileUtils.executeCommand('sudo', ['apk', 'add', 'mosquitto', 'mosquitto-clients']);

    // Enable service using OpenRC
    if (await FileUtils.isCommandAvailable('rc-update')) {
      await FileUtils.executeCommand('sudo', ['rc-update', 'add', 'mosquitto', 'default']);
      await FileUtils.executeCommand('sudo', ['rc-service', 'mosquitto', 'start']);
    }
  }

  private async installOnOpenSUSE(): Promise<void> {
    console.log('Installing on openSUSE...');

    await FileUtils.executeCommand('sudo', ['zypper', 'refresh']);
    await FileUtils.executeCommand('sudo', [
      'zypper',
      'install',
      '-y',
      'mosquitto',
      'mosquitto-clients',
    ]);

    // Enable and start service
    if (await FileUtils.isCommandAvailable('systemctl')) {
      await FileUtils.executeCommand('sudo', ['systemctl', 'enable', 'mosquitto']);
      await FileUtils.executeCommand('sudo', ['systemctl', 'start', 'mosquitto']);
    }
  }

  private async installOnWindows(): Promise<void> {
    console.log('Installing Mosquitto on Windows...');

    // Check if Chocolatey is available
    if (await FileUtils.isCommandAvailable('choco')) {
      console.log('Using Chocolatey to install Mosquitto');
      await FileUtils.executeCommand('choco', ['install', 'mosquitto', '-y']);
      return;
    }

    // Check if Scoop is available
    if (await FileUtils.isCommandAvailable('scoop')) {
      console.log('Using Scoop to install Mosquitto');
      await FileUtils.executeCommand('scoop', ['install', 'mosquitto']);
      return;
    }

    // Manual installation guidance
    throw new Error(
      'Please install Mosquitto manually from https://mosquitto.org/download/ or install Chocolatey/Scoop first'
    );
  }

  private async attemptGenericLinuxInstall(): Promise<void> {
    console.log('Attempting generic Linux installation...');

    // Try different package managers in order of preference
    const packageManagers = [
      {
        cmd: 'apt-get',
        args: ['update'],
        installArgs: ['install', '-y', 'mosquitto', 'mosquitto-clients'],
      },
      { cmd: 'yum', args: [], installArgs: ['install', '-y', 'mosquitto', 'mosquitto-clients'] },
      { cmd: 'dnf', args: [], installArgs: ['install', '-y', 'mosquitto', 'mosquitto-clients'] },
      { cmd: 'pacman', args: [], installArgs: ['-S', '--noconfirm', 'mosquitto'] },
      {
        cmd: 'zypper',
        args: ['refresh'],
        installArgs: ['install', '-y', 'mosquitto', 'mosquitto-clients'],
      },
      { cmd: 'apk', args: ['update'], installArgs: ['add', 'mosquitto', 'mosquitto-clients'] },
    ];

    for (const pm of packageManagers) {
      if (await FileUtils.isCommandAvailable(pm.cmd)) {
        console.log(`Using ${pm.cmd} package manager`);

        if (pm.args.length > 0) {
          await FileUtils.executeCommand('sudo', [pm.cmd, ...pm.args]);
        }

        await FileUtils.executeCommand('sudo', [pm.cmd, ...pm.installArgs]);
        return;
      }
    }

    // If no package manager found, try building from source
    console.log('No package manager found, building from source');
    await this.installFromSource();
  }

  private async installFromSource(): Promise<void> {
    console.log('Installing Mosquitto from source...');

    const tempDir = path.join(os.tmpdir(), 'mosquitto-build');
    await FileUtils.ensureDir(tempDir);

    try {
      // Download source
      const version = '2.0.18'; // Latest stable version
      const tarUrl = `https://mosquitto.org/files/source/mosquitto-${version}.tar.gz`;

      // This is a simplified version - in practice you'd need more robust downloading
      await FileUtils.executeCommand('wget', [
        '-O',
        path.join(tempDir, 'mosquitto.tar.gz'),
        tarUrl,
      ]);

      // Extract
      await FileUtils.executeCommand('tar', [
        '-xzf',
        path.join(tempDir, 'mosquitto.tar.gz'),
        '-C',
        tempDir,
      ]);

      // Build and install
      const sourceDir = path.join(tempDir, `mosquitto-${version}`);
      process.chdir(sourceDir);

      await FileUtils.executeCommand('make');
      await FileUtils.executeCommand('sudo', ['make', 'install']);

      console.log('Mosquitto built and installed from source');
    } finally {
      // Cleanup
      try {
        await FileUtils.executeCommand('rm', ['-rf', tempDir]);
      } catch (error) {
        console.log(`Failed to clean up temp directory: ${(error as Error).message}`);
      }
    }
  }

  private async setupSystemService(): Promise<void> {
    // Stop the system mosquitto service to avoid conflicts
    // We'll manage our own mosquitto instance
    try {
      if (await FileUtils.isCommandAvailable('systemctl')) {
        await FileUtils.executeCommand('sudo', ['systemctl', 'stop', 'mosquitto']);
        await FileUtils.executeCommand('sudo', ['systemctl', 'disable', 'mosquitto']);
        console.log('Disabled system Mosquitto service to avoid conflicts');
      }
    } catch (error) {
      console.log(`Could not disable system service: ${(error as Error).message}`);
    }
  }

  private getCommonInstallPaths(): string[] {
    const paths: string[] = [];

    switch (this.platform) {
      case 'darwin':
        paths.push('/usr/local/bin/mosquitto', '/opt/homebrew/bin/mosquitto');
        break;
      case 'linux':
        paths.push('/usr/bin/mosquitto', '/usr/local/bin/mosquitto', '/usr/sbin/mosquitto');
        break;
      case 'win32':
        paths.push('C:\\Program Files\\mosquitto\\mosquitto.exe', 'C:\\mosquitto\\mosquitto.exe');
        break;
    }

    return paths;
  }

  private async getLinuxDistribution(): Promise<string> {
    try {
      // Try reading os-release file
      if (await FileUtils.fileExists('/etc/os-release')) {
        const content = await FileUtils.readFile('/etc/os-release');
        return content.toLowerCase();
      }

      // Try lsb_release command
      if (await FileUtils.isCommandAvailable('lsb_release')) {
        const { stdout } = await FileUtils.executeCommand('lsb_release', ['-a']);
        return stdout.toLowerCase();
      }

      // Try reading various release files
      const releaseFiles = [
        '/etc/redhat-release',
        '/etc/debian_version',
        '/etc/alpine-release',
        '/etc/arch-release',
      ];

      for (const file of releaseFiles) {
        if (await FileUtils.fileExists(file)) {
          const content = await FileUtils.readFile(file);
          return content.toLowerCase();
        }
      }

      return 'unknown';
    } catch (error) {
      console.log(`Failed to detect Linux distribution: ${(error as Error).message}`);
      return 'unknown';
    }
  }

  async uninstall(): Promise<void> {
    console.log('Uninstalling Mosquitto...');

    try {
      // Stop any running processes first
      const pids = await FileUtils.findProcessByName('mosquitto');
      for (const pid of pids) {
        await FileUtils.killProcess(pid);
      }

      switch (this.platform) {
        case 'darwin':
          await this.uninstallOnMacOS();
          break;
        case 'linux':
          await this.uninstallOnLinux();
          break;
        case 'win32':
          await this.uninstallOnWindows();
          break;
      }

      console.log('Mosquitto uninstalled successfully');
    } catch (error) {
      console.error(`Mosquitto uninstallation failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async uninstallOnMacOS(): Promise<void> {
    if (await FileUtils.isCommandAvailable('brew')) {
      await FileUtils.executeCommand('brew', ['services', 'stop', 'mosquitto']);
      await FileUtils.executeCommand('brew', ['uninstall', 'mosquitto']);
    }
  }

  private async uninstallOnLinux(): Promise<void> {
    const distro = await this.getLinuxDistribution();

    if (distro.includes('ubuntu') || distro.includes('debian')) {
      await FileUtils.executeCommand('sudo', [
        'apt-get',
        'remove',
        '-y',
        'mosquitto',
        'mosquitto-clients',
      ]);
    } else if (distro.includes('centos') || distro.includes('rhel') || distro.includes('fedora')) {
      const cmd = (await FileUtils.isCommandAvailable('dnf')) ? 'dnf' : 'yum';
      await FileUtils.executeCommand('sudo', [
        cmd,
        'remove',
        '-y',
        'mosquitto',
        'mosquitto-clients',
      ]);
    } else if (distro.includes('arch')) {
      await FileUtils.executeCommand('sudo', ['pacman', '-R', '--noconfirm', 'mosquitto']);
    }
  }

  private async uninstallOnWindows(): Promise<void> {
    if (await FileUtils.isCommandAvailable('choco')) {
      await FileUtils.executeCommand('choco', ['uninstall', 'mosquitto', '-y']);
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await FileUtils.executeCommand('mosquitto', ['-h']);
      const versionMatch = stdout.match(/mosquitto version (\d+\.\d+\.\d+)/i);
      return versionMatch ? versionMatch[1] : 'unknown';
    } catch (error) {
      console.log(`Failed to get Mosquitto version: ${(error as Error).message}`);
      return 'unknown';
    }
  }
}
