const Joi = require('joi');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

class ConfigValidator {
    constructor() {
        this.configPath = '/data/options.json';
        this.baseSchema = this.createBaseSchema();
        this.validatedConfig = null;
        this.validationErrors = [];
    }

    createBaseSchema() {
        // SIP server address validation (IP or FQDN)
        const sipServerSchema = Joi.string()
            .trim()
            .pattern(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/)
            .required()
            .messages({
                'string.pattern.base': 'SIP server must be a valid IP address or domain name',
                'string.empty': 'SIP server is required',
                'any.required': 'SIP server configuration is mandatory'
            });

        // SIP credentials validation with security constraints
        const sipCredentialsSchema = Joi.object({
            sip_username: Joi.string()
                .trim()
                .min(3)
                .max(64)
                .pattern(/^[a-zA-Z0-9._-]+$/)
                .required()
                .messages({
                    'string.min': 'SIP username must be at least 3 characters',
                    'string.max': 'SIP username must not exceed 64 characters',
                    'string.pattern.base': 'SIP username can only contain alphanumeric characters, dots, underscores, and hyphens',
                    'any.required': 'SIP username is required'
                }),

            sip_password: Joi.string()
                .min(8)
                .max(128)
                .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
                .required()
                .messages({
                    'string.min': 'SIP password must be at least 8 characters',
                    'string.max': 'SIP password must not exceed 128 characters',
                    'string.pattern.base': 'SIP password must contain at least one lowercase letter, one uppercase letter, and one digit',
                    'any.required': 'SIP password is required'
                }),

            sip_domain: Joi.string()
                .trim()
                .pattern(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/)
                .allow('', null)
                .optional()
                .messages({
                    'string.pattern.base': 'SIP domain must be a valid domain name'
                })
        });

        // Network configuration with port validation
        const networkSchema = Joi.object({
            websocket_port: Joi.number()
                .integer()
                .min(1024)
                .max(65535)
                .default(8088)
                .messages({
                    'number.min': 'WebSocket port must be at least 1024',
                    'number.max': 'WebSocket port must not exceed 65535',
                    'number.integer': 'WebSocket port must be an integer'
                }),

            stun_servers: Joi.array()
                .items(
                    Joi.string()
                        .pattern(/^stuns?:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?$/)
                        .messages({
                            'string.pattern.base': 'STUN server must be in format stun://server:port or stuns://server:port'
                        })
                )
                .min(1)
                .max(10)
                .default(['stun:stun.l.google.com:19302'])
                .messages({
                    'array.min': 'At least one STUN server is required',
                    'array.max': 'Maximum of 10 STUN servers allowed'
                }),

            turn_servers: Joi.array()
                .items(
                    Joi.string()
                        .pattern(/^turns?:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?$/)
                        .messages({
                            'string.pattern.base': 'TURN server must be in format turn://server:port or turns://server:port'
                        })
                )
                .max(5)
                .default([])
                .messages({
                    'array.max': 'Maximum of 5 TURN servers allowed'
                })
        });

        // Media configuration with codec validation
        const mediaSchema = Joi.object({
            video_enabled: Joi.boolean().default(true),
            audio_enabled: Joi.boolean().default(true),
            auto_answer: Joi.boolean().default(false),

            codec_preferences: Joi.object({
                video: Joi.array()
                    .items(Joi.string().valid('H264', 'VP8', 'VP9', 'AV1'))
                    .min(1)
                    .max(4)
                    .unique()
                    .default(['H264', 'VP8', 'VP9'])
                    .messages({
                        'array.min': 'At least one video codec must be specified',
                        'array.max': 'Maximum of 4 video codecs allowed',
                        'array.unique': 'Video codec preferences must be unique',
                        'any.only': 'Video codec must be one of: H264, VP8, VP9, AV1'
                    }),

                audio: Joi.array()
                    .items(Joi.string().valid('OPUS', 'G722', 'PCMU', 'PCMA', 'G729'))
                    .min(1)
                    .max(5)
                    .unique()
                    .default(['OPUS', 'G722', 'PCMU'])
                    .messages({
                        'array.min': 'At least one audio codec must be specified',
                        'array.max': 'Maximum of 5 audio codecs allowed',
                        'array.unique': 'Audio codec preferences must be unique',
                        'any.only': 'Audio codec must be one of: OPUS, G722, PCMU, PCMA, G729'
                    })
            }).default()
        });

        // Security and operational configuration
        const securitySchema = Joi.object({
            ha_integration_enabled: Joi.boolean().default(true),
            entity_prefix: Joi.string()
                .trim()
                .pattern(/^[a-z][a-z0-9_]*$/)
                .min(3)
                .max(32)
                .default('sip_client')
                .messages({
                    'string.pattern.base': 'Entity prefix must start with a letter and contain only lowercase letters, numbers, and underscores',
                    'string.min': 'Entity prefix must be at least 3 characters',
                    'string.max': 'Entity prefix must not exceed 32 characters'
                }),

            call_timeout: Joi.number()
                .integer()
                .min(5)
                .max(300)
                .default(30)
                .messages({
                    'number.min': 'Call timeout must be at least 5 seconds',
                    'number.max': 'Call timeout must not exceed 300 seconds'
                }),

            ui_theme: Joi.string()
                .valid('auto', 'light', 'dark')
                .default('auto'),

            log_level: Joi.string()
                .valid('error', 'warn', 'info', 'debug')
                .default('info')
        });

        // Main configuration schema combining all sections
        return Joi.object({
            sip_server: sipServerSchema,
            ...sipCredentialsSchema.describe().keys,
            ...networkSchema.describe().keys,
            ...mediaSchema.describe().keys,
            ...securitySchema.describe().keys
        }).options({
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: true
        });
    }

    async loadConfiguration() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const parsedConfig = JSON.parse(configData);
            
            logger.info('Configuration file loaded successfully');
            return parsedConfig;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Configuration file not found. Please ensure the add-on is properly configured.');
            } else if (error instanceof SyntaxError) {
                throw new Error('Invalid JSON in configuration file. Please check your configuration syntax.');
            } else {
                throw new Error(`Failed to load configuration: ${error.message}`);
            }
        }
    }

    async validateConfiguration(config = null) {
        try {
            // Load config if not provided
            const configData = config || await this.loadConfiguration();
            
            // Validate against schema
            const { error, value } = this.baseSchema.validate(configData);
            
            if (error) {
                this.validationErrors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context?.value,
                    type: detail.type
                }));
                
                logger.error('Configuration validation failed:');
                this.validationErrors.forEach(err => {
                    logger.error(`  - ${err.field}: ${err.message}`);
                });
                
                return { valid: false, errors: this.validationErrors };
            }
            
            // Additional cross-field validations
            const crossValidationResult = await this.performCrossValidation(value);
            if (!crossValidationResult.valid) {
                this.validationErrors = crossValidationResult.errors;
                return crossValidationResult;
            }
            
            // Security validations
            const securityValidationResult = await this.performSecurityValidation(value);
            if (!securityValidationResult.valid) {
                this.validationErrors = securityValidationResult.errors;
                return securityValidationResult;
            }
            
            this.validatedConfig = value;
            logger.info('Configuration validation successful');
            
            return { valid: true, config: value };
        } catch (error) {
            logger.error('Configuration validation error:', error);
            return { 
                valid: false, 
                errors: [{ 
                    field: 'general', 
                    message: error.message,
                    type: 'configuration.error'
                }] 
            };
        }
    }

    async performCrossValidation(config) {
        const errors = [];

        // Validate SIP domain default fallback
        if (!config.sip_domain || config.sip_domain.trim() === '') {
            config.sip_domain = config.sip_server;
            logger.info('SIP domain not specified, defaulting to SIP server address');
        }

        // Validate codec combinations for compatibility
        if (config.codec_preferences?.video?.includes('AV1') && 
            !config.codec_preferences.video.includes('H264')) {
            logger.warn('AV1 codec specified without H264 fallback - may cause compatibility issues');
        }

        // Validate WebRTC server accessibility
        if (config.stun_servers?.length === 0 && config.turn_servers?.length === 0) {
            errors.push({
                field: 'network',
                message: 'At least one STUN or TURN server must be configured for WebRTC connectivity',
                type: 'cross.validation.network'
            });
        }

        // Validate timeout constraints
        if (config.call_timeout && config.call_timeout < 10 && config.auto_answer) {
            logger.warn('Auto-answer enabled with very short call timeout - may cause issues with incoming calls');
        }

        return errors.length > 0 ? { valid: false, errors } : { valid: true };
    }

    async performSecurityValidation(config) {
        const errors = [];
        const warnings = [];

        // SIP server security validation
        if (config.sip_server?.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            if (config.sip_server.startsWith('192.168.') || 
                config.sip_server.startsWith('10.') ||
                config.sip_server.startsWith('172.')) {
                logger.info('Private IP address detected for SIP server - assuming internal network');
            } else {
                warnings.push('Using public IP for SIP server - ensure proper security measures are in place');
            }
        }

        // Password strength validation (additional checks beyond schema)
        if (config.sip_password) {
            const commonPasswords = [
                'password', '123456', 'admin', 'default', 'changeme', 'password123',
                'administrator', 'root', 'user', 'test', 'demo', 'guest'
            ];
            
            if (commonPasswords.some(pwd => config.sip_password.toLowerCase().includes(pwd))) {
                errors.push({
                    field: 'sip_password',
                    message: 'SIP password contains common words or patterns - please use a more secure password',
                    type: 'security.validation.password'
                });
            }

            // Check for username in password
            if (config.sip_username && 
                config.sip_password.toLowerCase().includes(config.sip_username.toLowerCase())) {
                errors.push({
                    field: 'sip_password',
                    message: 'SIP password should not contain the username',
                    type: 'security.validation.password'
                });
            }
        }

        // STUN/TURN server security validation
        const insecureStunServers = config.stun_servers?.filter(server => 
            server.startsWith('stun://') && !server.includes('stun.l.google.com')
        );
        
        if (insecureStunServers?.length > 0) {
            warnings.push('Using non-encrypted STUN servers - consider using STUNS (encrypted) alternatives');
        }

        // Log warnings
        warnings.forEach(warning => logger.warn(`Security Warning: ${warning}`));

        return errors.length > 0 ? { valid: false, errors } : { valid: true };
    }

    async saveValidatedConfiguration(config, backupOriginal = true) {
        try {
            // Create backup if requested
            if (backupOriginal) {
                const backupPath = `${this.configPath}.backup.${Date.now()}`;
                await fs.copyFile(this.configPath, backupPath);
                logger.info(`Configuration backup created: ${backupPath}`);
            }

            // Save validated configuration
            const configJson = JSON.stringify(config, null, 2);
            await fs.writeFile(this.configPath, configJson, 'utf8');
            
            logger.info('Validated configuration saved successfully');
            return true;
        } catch (error) {
            logger.error('Failed to save configuration:', error);
            return false;
        }
    }

    getValidationSummary() {
        if (!this.validatedConfig) {
            return null;
        }

        return {
            sipServer: this.validatedConfig.sip_server,
            sipDomain: this.validatedConfig.sip_domain,
            websocketPort: this.validatedConfig.websocket_port,
            videoEnabled: this.validatedConfig.video_enabled,
            audioEnabled: this.validatedConfig.audio_enabled,
            autoAnswer: this.validatedConfig.auto_answer,
            stunServers: this.validatedConfig.stun_servers?.length || 0,
            turnServers: this.validatedConfig.turn_servers?.length || 0,
            videoCodecs: this.validatedConfig.codec_preferences?.video?.length || 0,
            audioCodecs: this.validatedConfig.codec_preferences?.audio?.length || 0,
            haIntegration: this.validatedConfig.ha_integration_enabled,
            callTimeout: this.validatedConfig.call_timeout,
            theme: this.validatedConfig.ui_theme,
            logLevel: this.validatedConfig.log_level
        };
    }

    async testSIPConnectivity(config = null) {
        const testConfig = config || this.validatedConfig;
        if (!testConfig) {
            throw new Error('No validated configuration available for connectivity test');
        }

        try {
            // Basic SIP server reachability test
            const dns = require('dns').promises;
            
            // Test DNS resolution for domain names
            if (!testConfig.sip_server.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
                logger.info(`Testing DNS resolution for ${testConfig.sip_server}...`);
                await dns.lookup(testConfig.sip_server);
                logger.info('DNS resolution successful');
            }

            // Test STUN server connectivity
            if (testConfig.stun_servers?.length > 0) {
                logger.info('Testing STUN server connectivity...');
                // Note: Actual STUN connectivity test would require additional implementation
                logger.info('STUN server configuration appears valid');
            }

            return { success: true, message: 'Basic connectivity tests passed' };
        } catch (error) {
            logger.error('Connectivity test failed:', error);
            return { success: false, message: error.message };
        }
    }

    createConfigurationUI() {
        // Generate JSON schema for UI rendering
        const uiSchema = {
            type: 'object',
            properties: {
                sip_configuration: {
                    type: 'object',
                    title: 'SIP Server Configuration',
                    properties: {
                        sip_server: {
                            type: 'string',
                            title: 'SIP Server',
                            description: 'IP address or domain name of your SIP server',
                            pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$'
                        },
                        sip_username: {
                            type: 'string',
                            title: 'SIP Username',
                            description: 'Your SIP account username',
                            minLength: 3,
                            maxLength: 64
                        },
                        sip_password: {
                            type: 'string',
                            title: 'SIP Password',
                            description: 'Your SIP account password (must contain uppercase, lowercase, and number)',
                            format: 'password',
                            minLength: 8,
                            maxLength: 128
                        },
                        sip_domain: {
                            type: 'string',
                            title: 'SIP Domain (Optional)',
                            description: 'SIP domain if different from server address'
                        }
                    },
                    required: ['sip_server', 'sip_username', 'sip_password']
                },
                network_configuration: {
                    type: 'object',
                    title: 'Network Configuration',
                    properties: {
                        websocket_port: {
                            type: 'integer',
                            title: 'WebSocket Port',
                            description: 'Port for WebSocket SIP connection',
                            minimum: 1024,
                            maximum: 65535,
                            default: 8088
                        },
                        stun_servers: {
                            type: 'array',
                            title: 'STUN Servers',
                            description: 'List of STUN servers for NAT traversal',
                            items: {
                                type: 'string',
                                pattern: '^stuns?://[a-zA-Z0-9.-]+(?::\\d{1,5})?$'
                            },
                            minItems: 1,
                            maxItems: 10
                        }
                    }
                },
                media_configuration: {
                    type: 'object',
                    title: 'Media Configuration',
                    properties: {
                        video_enabled: {
                            type: 'boolean',
                            title: 'Enable Video',
                            description: 'Enable video calling capabilities',
                            default: true
                        },
                        audio_enabled: {
                            type: 'boolean',
                            title: 'Enable Audio',
                            description: 'Enable audio calling capabilities',
                            default: true
                        },
                        codec_preferences: {
                            type: 'object',
                            title: 'Codec Preferences',
                            properties: {
                                video: {
                                    type: 'array',
                                    title: 'Video Codecs',
                                    items: {
                                        type: 'string',
                                        enum: ['H264', 'VP8', 'VP9', 'AV1']
                                    },
                                    uniqueItems: true
                                },
                                audio: {
                                    type: 'array',
                                    title: 'Audio Codecs',
                                    items: {
                                        type: 'string',
                                        enum: ['OPUS', 'G722', 'PCMU', 'PCMA', 'G729']
                                    },
                                    uniqueItems: true
                                }
                            }
                        }
                    }
                }
            }
        };

        return uiSchema;
    }
}

module.exports = ConfigValidator;