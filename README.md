# <img src="public/mosquitto.png" alt="Mosquitto Logo" width="64" height="64" style="vertical-align: middle;"> SignalK MQTT Mosquitto Manager

A SignalK plugin for managing a Mosquitto MQTT broker with bridge connections, security features, and real-time monitoring.

## Features

### 🚀 **Core Functionality**
- **Automatic Mosquitto Installation**: Multi-platform installer for macOS, Linux, and Windows
- **Broker Management**: Start, stop, restart, and monitor Mosquitto broker
- **Real-time Monitoring**: Live statistics including active connections, message rates, and data throughput
- **Web Management Interface**: Comprehensive web UI accessible through SignalK

### 🌉 **Bridge Management**
- **MQTT Bridge Connections**: Connect to remote MQTT brokers
- **Topic Mapping**: Flexible topic routing with prefixes and QoS control
- **Connection Testing**: Built-in bridge connection testing
- **TLS Support**: Secure bridge connections with SSL/TLS

### 🔐 **Security Features**
- **User Authentication**: Password-based user management
- **Access Control Lists (ACLs)**: Fine-grained topic access control
- **TLS/SSL Support**: Secure broker communications
- **Certificate Management**: Built-in certificate generation

### 📊 **Monitoring & Analytics**
- **Real-time Statistics**: Active connections, message rates, data throughput
- **System Health**: Broker status, uptime, and version information
- **Performance Metrics**: Bytes received/sent, message counts
- **Auto-refresh**: Configurable monitoring intervals

## Installation

### Prerequisites
- SignalK Node.js server (>=1.0.0)
- Node.js (>=16.0.0)

### Install via SignalK App Store
1. Open SignalK Admin Panel
2. Navigate to **App Store**
3. Search for "**SignalK MQTT Mosquitto Manager**"
4. Click **Install**

### Manual Installation
```bash
cd ~/.signalk/node_modules
git clone https://github.com/motamman/signalk-mosquitto.git
cd signalk-mosquitto
npm install
npm run build
```

## Configuration

### Basic Setup
1. **Enable Plugin**: Navigate to SignalK Admin → Server → Plugin Config → SignalK MQTT Mosquitto Manager
2. **Basic Settings**:
   ```json
   {
     "enabled": true,
     "brokerPort": 1883,
     "brokerHost": "0.0.0.0",
     "allowAnonymous": true,
     "enableWebsockets": true,
     "websocketPort": 9001
   }
   ```

### Security Configuration
```json
{
  "enableSecurity": true,
  "allowAnonymous": false,
  "users": [
    {
      "username": "signalk",
      "password": "your-password",
      "enabled": true
    }
  ],
  "acls": [
    {
      "username": "signalk",
      "topic": "vessels/#",
      "access": "readwrite"
    }
  ]
}
```

### Bridge Configuration
```json
{
  "bridges": [
    {
      "id": "remote-broker",
      "enabled": true,
      "name": "Remote MQTT Broker",
      "remoteHost": "mqtt.example.com",
      "remotePort": 1883,
      "remoteUsername": "user",
      "remotePassword": "pass",
      "topics": [
        {
          "pattern": "vessels/+/navigation/+",
          "direction": "out",
          "qos": 1,
          "localPrefix": "",
          "remotePrefix": "signalk/"
        }
      ]
    }
  ]
}
```

## Web Interface

Access the management interface at: `http://your-signalk-server:3000/plugins/signalk-mosquitto/`

### Interface Tabs

#### 📊 **Overview**
- Broker status and health information
- Connection statistics and broker version
- Quick restart functionality
- Real-time status indicators

#### ⚙️ **Configuration**
- Broker settings (ports, hosts, security)
- WebSocket configuration
- Persistence and logging options
- TLS/SSL certificate settings

#### 🌉 **Bridges**
- Manage MQTT bridge connections
- Add/edit/delete bridge configurations
- Topic mapping and QoS settings
- Connection testing tools

#### 🔐 **Security**
- User management (add/edit/delete users)
- Access Control Lists (ACL) configuration
- Password hashing and authentication
- Certificate generation utilities

#### 📈 **Monitoring**
- **Active Connections**: Current client count
- **Message Rate**: Messages per minute
- **Data Rate**: Bandwidth usage (KB/s)
- **Monitor Status**: System health indicator

## API Endpoints

The plugin exposes REST API endpoints for programmatic access:

### Status & Control
```bash
GET  /plugins/signalk-mosquitto/status      # Get broker status
POST /plugins/signalk-mosquitto/restart     # Restart broker
GET  /plugins/signalk-mosquitto/monitoring  # Get monitoring metrics
```

### Bridge Management
```bash
GET  /plugins/signalk-mosquitto/bridges          # List bridges
POST /plugins/signalk-mosquitto/bridges/test     # Test bridge connection
```

## Platform Support

### Automatic Installation
The plugin automatically detects and installs Mosquitto on:

- **macOS**: Homebrew or MacPorts
- **Linux**: 
  - Ubuntu/Debian (`apt-get`)
  - CentOS/RHEL/Fedora (`yum`/`dnf`)
  - Arch Linux (`pacman`)
- **Windows**: Chocolatey or Scoop
- **Source**: Fallback compilation from source

### Manual Installation
If automatic installation fails, install Mosquitto manually:

#### macOS
```bash
brew install mosquitto
# or
sudo port install mosquitto
```

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install mosquitto mosquitto-clients
```

#### CentOS/RHEL
```bash
sudo yum install epel-release
sudo yum install mosquitto mosquitto-clients
```

#### Windows
```bash
choco install mosquitto
# or
scoop install mosquitto
```

## Configuration Files

The plugin generates and manages:

- **`mosquitto.conf`**: Main broker configuration
- **`passwd`**: Password file (when authentication enabled)
- **`acl`**: Access control list file
- **`mosquitto.log`**: Broker log file
- **`mosquitto.pid`**: Process ID file

Files are stored in: `~/.signalk/plugin-config-data/signalk-mosquitto/`

## Default Settings

```json
{
  "enabled": false,
  "brokerPort": 1883,
  "brokerHost": "0.0.0.0",
  "enableWebsockets": true,
  "websocketPort": 9001,
  "maxConnections": 1000,
  "allowAnonymous": true,
  "enableLogging": true,
  "logLevel": "information",
  "persistence": true,
  "persistenceLocation": "/tmp/mosquitto.db",
  "enableSecurity": true,
  "tlsEnabled": false,
  "bridges": [],
  "users": [],
  "acls": []
}
```

## Troubleshooting

### Common Issues

#### 1. **Broker Won't Start**
```bash
# Check if port is in use
sudo lsof -i :1883

# Check logs
tail -f ~/.signalk/plugin-config-data/signalk-mosquitto/mosquitto.log
```

#### 2. **Permission Errors**
```bash
# Ensure Mosquitto is installed and accessible
which mosquitto
mosquitto -h
```

#### 3. **Bridge Connection Fails**
- Verify remote broker credentials
- Check network connectivity
- Use the built-in connection test feature
- Review bridge configuration for typos

#### 4. **WebSocket Issues**
- Ensure WebSocket port (default: 9001) is not blocked
- Check firewall settings
- Verify `enableWebsockets: true` in configuration

### Debugging

Enable debug logging in SignalK:
```bash
DEBUG=signalk-mosquitto signalk-server
```

Check plugin logs in SignalK Admin → Server → Logs

## Development

### Building from Source
```bash
git clone https://github.com/motamman/signalk-mosquitto.git
cd signalk-mosquitto
npm install
npm run build
```

### Development Commands
```bash
npm run dev          # Development build with watch
npm run lint         # ESLint checking
npm run format       # Prettier formatting
npm run typecheck    # TypeScript type checking
npm run test         # Run all checks
```

### Project Structure
```
signalk-mosquitto/
├── src/
│   ├── index.ts              # Main plugin entry point
│   ├── services/             # Core services
│   │   ├── mosquitto-manager.ts    # Broker management
│   │   ├── bridge-manager.ts       # Bridge management
│   │   ├── security-manager.ts     # Security & authentication
│   │   ├── process-monitor.ts      # Process monitoring
│   │   └── mosquitto-installer.ts  # Multi-platform installer
│   ├── types/                # TypeScript interfaces
│   ├── utils/                # Utility functions
│   └── web/                  # Web interface TypeScript
├── public/                   # Web interface assets
│   ├── index.html            # Main webapp HTML
│   ├── css/style.css         # Styling
│   ├── js/app.js            # Generated JavaScript
│   └── mosquitto.png        # Plugin icon
└── plugin/                   # Built JavaScript (generated)
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test`
5. Submit a pull request

### Code Style
- ESLint configuration with TypeScript support
- Prettier for code formatting
- Husky pre-commit hooks
- Conventional commit messages

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/motamman/signalk-mosquitto/issues)
- **Documentation**: This README and inline code comments

## Changelog

### v0.5.0-beta.1
- Initial beta release
- Complete Mosquitto broker management
- Web interface with monitoring
- Bridge connection support
- Security and authentication features
- Multi-platform automatic installation
- Real-time statistics and monitoring

## Future Features & Roadmap

The following features are planned for future releases. Contributions are welcome!

### 📤 **Data Management**
- [ ] **Bridge Import/Export**: Export bridge configurations to JSON and import from files
- [ ] **Security Config Import/Export**: Backup and restore user/ACL configurations


### 🚀 **Advanced Bridge Features**
- [ ] **Individual Bridge Control**: Enable/disable bridges without editing
- [ ] **Bridge Status Monitoring**: Real-time connection status indicators
- [ ] **Connection History**: Bridge connection logs and history
- [ ] **Auto-Reconnect**: Automatic bridge reconnection with exponential backoff
- [ ] **Bridge Load Balancing**: Distribute topics across multiple bridges

### 🔧 **Advanced Configuration**
- [ ] **TLS Integration**: Auto-populate certificate paths after generation
- [ ] **Advanced MQTT Settings**: Message persistence, retained messages, will messages
- [ ] **Performance Tuning**: Memory limits, connection timeouts, keep-alive settings
- [ ] **Plugin Profiles**: Environment-specific configurations (dev/staging/prod)

### 📊 **Enhanced Monitoring**
- [ ] **Message Flow Visualization**: Visual topic flow diagrams
- [ ] **Historical Data**: Charts and graphs of broker performance over time
- [ ] **Alerting System**: Email/webhook notifications for critical events
- [ ] **Client Connection Details**: Individual client information and statistics
- [ ] **Topic Analytics**: Most active topics and message frequency analysis

### 🎨 **UI/UX Improvements**
- [ ] **Dark Mode**: Theme switching for better user experience
- [ ] **Responsive Design**: Mobile-friendly interface improvements
- [ ] **Keyboard Shortcuts**: Power-user navigation and actions
- [ ] **Bulk Actions**: Multi-select for bridges, users, and ACL rules
- [ ] **Advanced Search**: Filter and search across all configurations

---