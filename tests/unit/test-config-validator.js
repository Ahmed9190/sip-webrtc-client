const ConfigValidator = require('../../src/config-validator');
const fs = require('fs').promises;
const path = require('path');

describe('ConfigValidator', () => {
    let validator;
    let mockConfig;

    beforeEach(() => {
        validator = new ConfigValidator();
        mockConfig = {
            sip_server: 'sip.example.com',
            sip_username: 'testuser',
            sip_password: 'TestPass123',
            sip_domain: 'example.com',
            websocket_port: 8088,
            video_enabled: true,
            audio_enabled: true,
            auto_answer: false,
            ha_integration_enabled: true,
            entity_prefix: 'sip_client',
            stun_servers: ['stun:stun.l.google.com:19302'],
            turn_servers: [],
            codec_preferences: {
                video: ['H264', 'VP8'],
                audio: ['OPUS', 'G722']
            },
            ui_theme: 'auto',
            call_timeout: 30,
            log_level: 'info'
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Configuration Validation', () => {
        test('should validate correct configuration', async () => {
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(true);
            expect(result.config).toBeDefined();
            expect(result.errors).toBeUndefined();
        });

        test('should reject invalid SIP server format', async () => {
            mockConfig.sip_server = 'invalid-server-format@#$';
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('sip_server');
        });

        test('should reject weak password', async () => {
            mockConfig.sip_password = 'weak';
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.field === 'sip_password')).toBe(true);
        });

        test('should validate port ranges', async () => {
            mockConfig.websocket_port = 80; // Below minimum
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.field === 'websocket_port')).toBe(true);
        });

        test('should validate codec preferences', async () => {
            mockConfig.codec_preferences.video = ['INVALID_CODEC'];
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.field.includes('codec_preferences'))).toBe(true);
        });
    });

    describe('Security Validation', () => {
        test('should reject common passwords', async () => {
            mockConfig.sip_password = 'Password123';
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.type === 'security.validation.password')).toBe(true);
        });

        test('should reject password containing username', async () => {
            mockConfig.sip_password = 'testuser123A';
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.type === 'security.validation.password')).toBe(true);
        });
    });

    describe('Cross Validation', () => {
        test('should default domain to server if not provided', async () => {
            delete mockConfig.sip_domain;
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(true);
            expect(result.config.sip_domain).toBe(mockConfig.sip_server);
        });

        test('should require at least one STUN or TURN server', async () => {
            mockConfig.stun_servers = [];
            mockConfig.turn_servers = [];
            
            const result = await validator.validateConfiguration(mockConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.type === 'cross.validation.network')).toBe(true);
        });
    });
});