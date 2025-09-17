A professional WebRTC-enabled SIP client add-on for Home Assistant that provides high-quality video calling capabilities through an intuitive dashboard interface.

[![CI/CD Status](https://github.com/homeassistant-community/addon-sip-webrtc/workflows/CI%2FCD/badge.svg)](https://github.com/homeassistant-community/addon-sip-webrtc/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5.svg)](https://www.home-assistant.io/)

## Features

### 🎥 Advanced Video Calling
- **High-Definition Video**: Support for up to 1080p video calls with adaptive quality
- **Multiple Codecs**: H.264, VP8, VP9, and AV1 video codec support
- **Audio Excellence**: OPUS, G.722, and PCMU audio codecs with echo cancellation
- **Fullscreen Mode**: Click-to-fullscreen with keyboard shortcuts
- **Camera Switching**: Front/back camera toggle for mobile devices

### 🔧 Professional Dashboard Integration  
- **Custom Dashboard Card**: LitElement-based card with modern UI
- **Real-time Controls**: In-call mute, hold, video toggle, and quality selection
- **Connection Monitoring**: Live connection status and call state indicators
- **Mobile Responsive**: Touch-friendly interface optimized for all screen sizes
- **Theme Support**: Auto, light, and dark theme compatibility

### 🏠 Deep Home Assistant Integration
- **7 Entities Created**: Connection status, call states, media controls, and metrics
- **Automation Ready**: Fire events for call state changes and connection events
- **REST API**: Complete API for external integrations and automations
- **Entity Management**: Automatic device registration with proper identification

### 🔒 Enterprise Security
- **Configuration Validation**: Comprehensive Joi-based schema validation
- **Password Strength**: Advanced password complexity requirements
- **Rate Limiting**: Built-in protection against brute force attempts  
- **Secure Headers**: Full HTTP security header implementation
- **Encryption Support**: Sensitive data encryption for storage

### ⚙️ Advanced Configuration
- **Network Optimization**: STUN/TURN server configuration with validation
- **Media Settings**: Granular control over video/audio parameters
- **Call Management**: Auto-answer, timeout configuration, and call routing
- **Logging Levels**: Configurable logging from error to debug
- **Backup System**: Automatic configuration backup before changes

## Quick Start

### Installation

1. **Add Repository**:
   - Navigate to **Settings → Add-ons → Add-on Store**
   - Click the **⋮** menu → **Repositories**
   - Add: `https://github.com/homeassistant-community/addon-sip-webrtc`

2. **Install Add-on**:
   - Find "SIP WebRTC Video Client" in Local Add-ons
   - Click **Install**

3. **Configure**:
   ```
   sip_server: "sip.yourprovider.com" 
   sip_username: "your_username"
   sip_password: "YourSecurePassword123"
   video_enabled: true
   audio_enabled: true
   ```

4. **Start**: Click **Start** and check the logs for successful connection

### Dashboard Card Setup

Add to your Lovelace dashboard:

```
type: custom:sip-video-card
title: "Video Phone"
show_connection_status: true
show_video_controls: true
show_audio_controls: true
compact_mode: false
```

## Configuration Reference

### SIP Server Settings
| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `sip_server` | string | ✅ | SIP server IP address or domain |
| `sip_username` | string | ✅ | SIP account username (3-64 chars) |
| `sip_password` | string | ✅ | SIP password (8+ chars, mixed case + number) |
| `sip_domain` | string | ❌ | SIP domain (defaults to server) |

### Network Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `websocket_port` | integer | `8088` | WebSocket SIP signaling port |
| `stun_servers` | array | Google STUN | STUN servers for NAT traversal |
| `turn_servers` | array | `[]` | TURN servers for firewall traversal |

### Media Settings
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `video_enabled` | boolean | `true` | Enable video calling |
| `audio_enabled` | boolean | `true` | Enable audio calling |
| `codec_preferences` | object | See below | Preferred codecs |

```
codec_preferences:
  video: ["H264", "VP8", "VP9"]
  audio: ["OPUS", "G722", "PCMU"]
```

### Advanced Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_answer` | boolean | `false` | Automatically answer incoming calls |
| `call_timeout` | integer | `30` | Call timeout in seconds (5-300) |
| `ha_integration_enabled` | boolean | `true` | Enable Home Assistant entities |
| `entity_prefix` | string | `sip_client` | Prefix for created entities |
| `ui_theme` | string | `auto` | Dashboard theme (auto/light/dark) |
| `log_level` | string | `info` | Logging level (error/warn/info/debug) |

## Architecture Overview

### Service-Oriented Design
The add-on follows a modular, service-oriented architecture:

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Dashboard Card    │  │   SIP Client        │  │   Media Handler     │
│   (LitElement)      │  │   (SIP.js)          │  │   (WebRTC)          │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│ -  Video Display     │  │ -  Session Mgmt      │  │ -  Stream Capture    │
│ -  Call Controls     │  │ -  Signaling         │  │ -  Quality Control   │
│ -  Real-time Stats   │  │ -  Event Handling    │  │ -  Device Switching  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                   │
               ┌─────────────────────┴─────────────────────┐
               │            WebSocket API                  │
               │         (Express.js Server)               │
               ├───────────────────────────────────────────┤
               │ -  REST Endpoints    -  Event Broadcasting  │
               │ -  Health Checks     -  Configuration API   │
               └─────────────────────┬─────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                        │                        │
┌─────────▼───────┐  ┌─────────────▼────────┐  ┌───────────▼─────────┐
│ HA Integration  │  │ Config Validator     │  │ Security Manager    │
│ (REST API)      │  │ (Joi Schemas)        │  │ (Encryption/Auth)   │
└─────────────────┘  └──────────────────────┘  └─────────────────────┘
```

### Created Home Assistant Entities

The add-on automatically creates the following entities:

- `binary_sensor.sip_client_connected` - Connection status
- `sensor.sip_client_status` - Current client state  
- `sensor.sip_call_state` - Active call state
- `sensor.sip_current_caller` - Current caller information
- `sensor.sip_last_call_duration` - Last call duration
- `binary_sensor.sip_video_enabled` - Video state
- `binary_sensor.sip_audio_enabled` - Audio state

## API Reference

### REST Endpoints

- `GET /health` - Health check endpoint
- `GET /config` - Current configuration
- `POST /api/call` - Initiate outgoing call
- `POST /api/answer/:sessionId` - Answer incoming call  
- `POST /api/hangup/:sessionId` - End call

### WebSocket Events

- `registered` - SIP client registered
- `incoming_call` - Incoming call received
- `call_established` - Call connected
- `call_terminated` - Call ended
- `remoteStream` - Remote video stream available

### Home Assistant Events

- `sip_client_connection_changed` - Connection state changed
- `sip_call_state_changed` - Call state changed
- `sip_media_state_changed` - Media settings changed

## Troubleshooting

### Common Issues

**Connection Failed**
- Verify SIP server address and credentials
- Check firewall settings for WebSocket port
- Ensure STUN servers are accessible

**No Video/Audio**
- Grant camera/microphone permissions in browser
- Check codec compatibility with SIP server
- Verify media devices are not in use by other applications

**Dashboard Card Not Loading**
- Clear browser cache (Ctrl+F5)
- Check for JavaScript errors in browser console
- Verify custom card is properly installed

### Debug Mode

Enable detailed logging:
```
log_level: "debug"
```

Check logs in **Settings → Add-ons → SIP WebRTC Client → Logs**

### Network Diagnostics

The add-on includes built-in connectivity testing:
- DNS resolution for SIP server
- STUN server accessibility 
- WebSocket connection validation

## Development

### Local Development Setup

1. **Clone Repository**:
   ```
   git clone https://github.com/homeassistant-community/addon-sip-webrtc
   cd addon-sip-webrtc
   ```

2. **Install Dependencies**:
   ```
   npm install
   ```

3. **Run Tests**:
   ```
   npm test                # All tests
   npm run test:unit      # Unit tests only
   npm run test:e2e       # End-to-end tests
   ```

4. **Development Server**:
   ```
   npm run dev
   ```

### Testing

The project includes comprehensive testing:

- **Unit Tests**: Configuration validation, SIP client logic
- **Integration Tests**: Component interaction, API endpoints  
- **End-to-End Tests**: Full user workflows with Puppeteer
- **Security Tests**: Vulnerability scanning, authentication

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the full test suite
5. Submit a pull request

## Support

- **Documentation**: [Wiki](https://github.com/homeassistant-community/addon-sip-webrtc/wiki)
- **Issues**: [GitHub Issues](https://github.com/homeassistant-community/addon-sip-webrtc/issues)
- **Community**: [Home Assistant Community Forum](https://community.home-assistant.io)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

- Built with [SIP.js](https://sipjs.com/) WebRTC library
- Powered by [Home Assistant](https://www.home-assistant.io/) 
- Dashboard card uses [LitElement](https://lit.dev/)
- Security powered by [Joi](https://joi.dev/) validation

---

**Made with ❤️ for the Home Assistant Community**
