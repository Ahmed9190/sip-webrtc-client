const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const SIPClient = require('./sip-client');
const HAIntegration = require('./ha-integration');
const path = require('path');

// Configure logging
const logger = winston.createLogger({
    level: process.env.SIP_DEBUG === 'true' ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

class SIPWebRTCService {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.sipClient = null;
        this.haIntegration = null;
        this.port = process.env.WEBSOCKET_PORT || 8088;
        
        this.setupExpress();
        this.setupWebSocket();
        this.setupSIPClient();
        this.setupHAIntegration();
    }

    setupExpress() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false // Allow inline scripts for WebRTC
        }));
        
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../www')));

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const status = {
                status: 'ok',
                sipConnected: this.sipClient?.isConnected() || false,
                timestamp: new Date().toISOString()
            };
            res.json(status);
        });

        // Configuration endpoint
        this.app.get('/config', (req, res) => {
            const config = {
                sipServer: process.env.SIP_SERVER,
                sipDomain: process.env.SIP_DOMAIN || process.env.SIP_SERVER,
                videoEnabled: process.env.VIDEO_ENABLED === 'true',
                audioEnabled: process.env.AUDIO_ENABLED === 'true',
                autoAnswer: process.env.AUTO_ANSWER === 'true',
                stunServers: this.parseStunServers(),
                callTimeout: parseInt(process.env.CALL_TIMEOUT) || 30
            };
            res.json(config);
        });

        // SIP endpoints
        this.app.post('/api/call', (req, res) => {
            const { target, video = true, audio = true } = req.body;
            
            if (!target) {
                return res.status(400).json({ error: 'Target is required' });
            }

            try {
                const sessionId = this.sipClient.makeCall(target, { video, audio });
                res.json({ sessionId, status: 'calling' });
            } catch (error) {
                logger.error('Failed to make call:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/answer/:sessionId', (req, res) => {
            const { sessionId } = req.params;
            const { video = true, audio = true } = req.body;

            try {
                this.sipClient.answerCall(sessionId, { video, audio });
                res.json({ status: 'answered' });
            } catch (error) {
                logger.error('Failed to answer call:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/hangup/:sessionId', (req, res) => {
            const { sessionId } = req.params;

            try {
                this.sipClient.hangupCall(sessionId);
                res.json({ status: 'hangup' });
            } catch (error) {
                logger.error('Failed to hangup call:', error);
                res.status(500).json({ error: error.message });
            }
        });
    }

    setupWebSocket() {
        this.server = this.app.listen(this.port, () => {
            logger.info(`SIP WebRTC Service listening on port ${this.port}`);
        });

        this.wss = new WebSocket.Server({ 
            server: this.server,
            path: '/ws'
        });

        this.wss.on('connection', (ws, req) => {
            logger.info('WebSocket client connected');

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(ws, message);
                } catch (error) {
                    logger.error('Invalid WebSocket message:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Invalid message format'
                    }));
                }
            });

            ws.on('close', () => {
                logger.info('WebSocket client disconnected');
            });

            // Send initial status
            ws.send(JSON.stringify({
                type: 'status',
                connected: this.sipClient?.isConnected() || false
            }));
        });
    }

    setupSIPClient() {
        this.sipClient = new SIPClient({
            server: process.env.SIP_SERVER,
            username: process.env.SIP_USERNAME,
            password: process.env.SIP_PASSWORD,
            domain: process.env.SIP_DOMAIN,
            websocketPort: this.port,
            stunServers: this.parseStunServers()
        });

        // Forward SIP events to WebSocket clients
        this.sipClient.on('registered', () => {
            this.broadcastToClients({ type: 'registered' });
            this.haIntegration?.updateConnectionState(true);
        });

        this.sipClient.on('unregistered', () => {
            this.broadcastToClients({ type: 'unregistered' });
            this.haIntegration?.updateConnectionState(false);
        });

        this.sipClient.on('invite', (session) => {
            this.broadcastToClients({
                type: 'incoming_call',
                sessionId: session.id,
                caller: session.remoteIdentity.uri.user
            });
            this.haIntegration?.updateCallState('ringing', session.remoteIdentity.uri.user);
        });

        this.sipClient.on('established', (session) => {
            this.broadcastToClients({
                type: 'call_established',
                sessionId: session.id
            });
            this.haIntegration?.updateCallState('active', session.remoteIdentity.uri.user);
        });

        this.sipClient.on('terminated', (session) => {
            this.broadcastToClients({
                type: 'call_terminated',
                sessionId: session.id
            });
            this.haIntegration?.updateCallState('idle');
        });

        this.sipClient.connect();
    }

    setupHAIntegration() {
        this.haIntegration = new HAIntegration();
        this.haIntegration.initialize();
    }

    handleWebSocketMessage(ws, message) {
        switch (message.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
            
            case 'get_status':
                ws.send(JSON.stringify({
                    type: 'status',
                    connected: this.sipClient?.isConnected() || false
                }));
                break;
                
            default:
                logger.warn('Unknown WebSocket message type:', message.type);
        }
    }

    broadcastToClients(message) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }

    parseStunServers() {
        const stunServers = process.env.STUN_SERVERS || '';
        return stunServers.split(',')
            .map(s => Buffer.from(s, 'base64').toString())
            .filter(s => s.length > 0);
    }

    async shutdown() {
        logger.info('Shutting down SIP WebRTC Service...');
        
        if (this.sipClient) {
            await this.sipClient.disconnect();
        }
        
        if (this.wss) {
            this.wss.close();
        }
        
        if (this.server) {
            this.server.close();
        }
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    if (global.sipService) {
        await global.sipService.shutdown();
    }
    process.exit(0);
});

// Start the service
global.sipService = new SIPWebRTCService();

module.exports = SIPWebRTCService;