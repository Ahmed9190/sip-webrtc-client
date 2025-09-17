const { UserAgent, Inviter, Invitation } = require('sip.js');
const EventEmitter = require('events');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

class SIPClient extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.userAgent = null;
        this.activeSessions = new Map();
        this.connected = false;
    }

    connect() {
        const uri = `sip:${this.config.username}@${this.config.domain || this.config.server}`;
        const transportOptions = {
            wsServers: [`wss://${this.config.server}:${this.config.websocketPort}`],
            connectionTimeout: 30,
            maxReconnectionAttempts: 10,
            reconnectionTimeout: 4
        };

        const userAgentOptions = {
            uri,
            authorizationUsername: this.config.username,
            authorizationPassword: this.config.password,
            transportOptions,
            sessionDescriptionHandlerFactoryOptions: {
                constraints: {
                    audio: process.env.AUDIO_ENABLED === 'true',
                    video: process.env.VIDEO_ENABLED === 'true' ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    } : false
                },
                peerConnectionConfiguration: {
                    iceServers: this.config.stunServers.map(url => ({ urls: url }))
                }
            }
        };

        this.userAgent = new UserAgent(userAgentOptions);

        // Set up event handlers
        this.userAgent.delegate = {
            onConnect: () => {
                logger.info('SIP transport connected');
                this.connected = true;
            },
            
            onDisconnect: (error) => {
                logger.error('SIP transport disconnected:', error?.message || 'Unknown error');
                this.connected = false;
                this.emit('unregistered');
            },
            
            onInvite: (invitation) => {
                logger.info(`Incoming call from ${invitation.remoteIdentity.uri.user}`);
                this.handleIncomingCall(invitation);
            }
        };

        this.userAgent.stateChange.addListener((newState) => {
            logger.info(`User Agent state: ${newState}`);
            
            if (newState === 'Started') {
                this.register();
            }
        });

        this.userAgent.start().catch(error => {
            logger.error('Failed to start User Agent:', error);
        });
    }

    async register() {
        try {
            await this.userAgent.register();
            logger.info('SIP registration successful');
            this.emit('registered');
        } catch (error) {
            logger.error('SIP registration failed:', error);
            this.emit('unregistered');
        }
    }

    makeCall(target, options = {}) {
        if (!this.isConnected()) {
            throw new Error('SIP client not connected');
        }

        const uri = target.startsWith('sip:') ? target : `sip:${target}@${this.config.domain || this.config.server}`;
        
        const inviterOptions = {
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: options.audio !== false,
                    video: options.video !== false ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    } : false
                }
            }
        };

        const inviter = new Inviter(this.userAgent, uri, inviterOptions);
        const sessionId = this.generateSessionId();
        
        this.activeSessions.set(sessionId, inviter);
        
        inviter.stateChange.addListener((newState) => {
            logger.info(`Outgoing call state: ${newState}`);
            
            switch (newState) {
                case 'Established':
                    this.emit('established', { id: sessionId, ...inviter });
                    break;
                case 'Terminated':
                    this.activeSessions.delete(sessionId);
                    this.emit('terminated', { id: sessionId, ...inviter });
                    break;
            }
        });

        // Setup media handlers
        this.setupMediaHandlers(inviter, sessionId);

        inviter.invite().catch(error => {
            logger.error('Failed to make call:', error);
            this.activeSessions.delete(sessionId);
        });

        // Set call timeout
        const timeout = parseInt(process.env.CALL_TIMEOUT) * 1000 || 30000;
        setTimeout(() => {
            if (this.activeSessions.has(sessionId) && inviter.state !== 'Established') {
                logger.info(`Call timeout for session ${sessionId}`);
                inviter.cancel();
            }
        }, timeout);

        return sessionId;
    }

    answerCall(sessionId, options = {}) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !(session instanceof Invitation)) {
            throw new Error('Invalid session or session not found');
        }

        const acceptOptions = {
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: options.audio !== false,
                    video: options.video !== false ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    } : false
                }
            }
        };

        session.accept(acceptOptions).catch(error => {
            logger.error('Failed to answer call:', error);
        });
    }

    hangupCall(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        if (session instanceof Inviter) {
            if (session.state === 'Initial' || session.state === 'Establishing') {
                session.cancel();
            } else {
                session.bye();
            }
        } else if (session instanceof Invitation) {
            if (session.state === 'Initial') {
                session.reject();
            } else {
                session.bye();
            }
        }
    }

    handleIncomingCall(invitation) {
        const sessionId = this.generateSessionId();
        this.activeSessions.set(sessionId, invitation);

        invitation.stateChange.addListener((newState) => {
            logger.info(`Incoming call state: ${newState}`);
            
            switch (newState) {
                case 'Established':
                    this.emit('established', { id: sessionId, ...invitation });
                    break;
                case 'Terminated':
                    this.activeSessions.delete(sessionId);
                    this.emit('terminated', { id: sessionId, ...invitation });
                    break;
            }
        });

        this.setupMediaHandlers(invitation, sessionId);
        this.emit('invite', { id: sessionId, ...invitation });

        // Auto-answer if enabled
        if (process.env.AUTO_ANSWER === 'true') {
            setTimeout(() => {
                if (invitation.state === 'Initial') {
                    this.answerCall(sessionId);
                }
            }, 1000);
        }
    }

    setupMediaHandlers(session, sessionId) {
        session.sessionDescriptionHandler.peerConnection.addEventListener('track', (event) => {
            const [remoteStream] = event.streams;
            logger.info(`Remote media stream received for session ${sessionId}`);
            
            // Emit stream for dashboard card consumption
            this.emit('remoteStream', {
                sessionId,
                stream: remoteStream,
                tracks: event.track
            });
        });

        session.sessionDescriptionHandler.peerConnection.addEventListener('iceconnectionstatechange', () => {
            const state = session.sessionDescriptionHandler.peerConnection.iceConnectionState;
            logger.info(`ICE connection state for session ${sessionId}: ${state}`);
        });
    }

    isConnected() {
        return this.connected && this.userAgent?.isRegistered();
    }

    generateSessionId() {
        return Math.random().toString(36).substr(2, 9);
    }

    async disconnect() {
        // Terminate all active sessions
        for (const [sessionId, session] of this.activeSessions) {
            try {
                this.hangupCall(sessionId);
            } catch (error) {
                logger.error(`Error terminating session ${sessionId}:`, error);
            }
        }

        // Unregister and stop user agent
        if (this.userAgent) {
            try {
                await this.userAgent.unregister();
                await this.userAgent.stop();
            } catch (error) {
                logger.error('Error during SIP client shutdown:', error);
            }
        }

        this.connected = false;
    }
}

module.exports = SIPClient;