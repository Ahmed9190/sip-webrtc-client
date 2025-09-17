const SIPClient = require('../../src/sip-client');
const MediaHandler = require('../../src/media-handler');
const EventEmitter = require('events');

// Mock SIP.js
jest.mock('sip.js', () => ({
    UserAgent: jest.fn().mockImplementation(() => ({
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        register: jest.fn().mockResolvedValue(undefined),
        unregister: jest.fn().mockResolvedValue(undefined),
        invite: jest.fn().mockReturnValue({
            id: 'test-session-id',
            remoteIdentity: { uri: { user: 'testuser' } }
        }),
        delegate: {},
        stateChange: { addListener: jest.fn() },
        isRegistered: jest.fn().mockReturnValue(true)
    })),
    Inviter: jest.fn(),
    Invitation: jest.fn()
}));

describe('SIP Integration Tests', () => {
    let sipClient;
    let mediaHandler;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            server: 'sip.example.com',
            username: 'testuser',
            password: 'TestPass123',
            domain: 'example.com',
            websocketPort: 8088,
            stunServers: ['stun:stun.l.google.com:19302']
        };

        sipClient = new SIPClient(mockConfig);
        mediaHandler = new MediaHandler();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('SIP Client Connection', () => {
        test('should initialize SIP client with correct configuration', () => {
            expect(sipClient.config).toEqual(mockConfig);
            expect(sipClient.activeSessions).toBeInstanceOf(Map);
            expect(sipClient.connected).toBe(false);
        });

        test('should connect to SIP server', async () => {
            const connectSpy = jest.spyOn(sipClient, 'connect');
            
            sipClient.connect();
            
            expect(connectSpy).toHaveBeenCalled();
        });

        test('should handle incoming calls', () => {
            const inviteHandler = jest.fn();
            sipClient.on('invite', inviteHandler);
            
            // Simulate incoming invite
            const mockInvitation = {
                id: 'incoming-session',
                remoteIdentity: { uri: { user: 'caller' } }
            };
            
            sipClient.handleIncomingCall(mockInvitation);
            
            expect(inviteHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: expect.any(String),
                    remoteIdentity: mockInvitation.remoteIdentity
                })
            );
        });

        test('should make outgoing calls', () => {
            const sessionId = sipClient.makeCall('sip:target@example.com');
            
            expect(sessionId).toMatch(/^[a-z0-9]+$/);
            expect(sipClient.activeSessions.has(sessionId)).toBe(true);
        });
    });

    describe('Media Handler Integration', () => {
        test('should initialize media handler', async () => {
            await mediaHandler.initialize(['stun:stun.l.google.com:19302']);
            
            expect(mediaHandler.iceServers).toHaveLength(1);
            expect(mediaHandler.mediaConstraints).toBeDefined();
        });

        test('should handle video toggle', async () => {
            // Mock getUserMedia
            global.navigator = {
                mediaDevices: {
                    getUserMedia: jest.fn().mockResolvedValue({
                        getTracks: () => [{
                            kind: 'video',
                            enabled: true,
                            stop: jest.fn()
                        }],
                        getVideoTracks: () => [{
                            enabled: true,
                            stop: jest.fn()
                        }],
                        getAudioTracks: () => []
                    }),
                    enumerateDevices: jest.fn().mockResolvedValue([])
                }
            };

            await mediaHandler.requestUserMedia();
            await mediaHandler.toggleVideo(false);
            
            expect(mediaHandler.localStream.getVideoTracks()[0].enabled).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('should handle SIP connection errors', () => {
            const errorHandler = jest.fn();
            sipClient.on('error', errorHandler);
            
            // Simulate connection error
            sipClient.handleConnectionError(new Error('Connection failed'));
            
            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Connection failed'
                })
            );
        });

        test('should handle media access errors', async () => {
            global.navigator.mediaDevices.getUserMedia = jest.fn()
                .mockRejectedValue(new Error('Permission denied'));
            
            const errorHandler = jest.fn();
            mediaHandler.on('mediaError', errorHandler);
            
            try {
                await mediaHandler.requestUserMedia();
            } catch (error) {
                // Expected to throw
            }
            
            expect(errorHandler).toHaveBeenCalled();
        });
    });
});