const winston = require('winston');
const axios = require('axios');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

class HAIntegration {
    constructor() {
        this.haUrl = process.env.SUPERVISOR_HOST ? 
            'http://supervisor/core' : 
            'http://localhost:8123';
        this.haToken = process.env.SUPERVISOR_TOKEN || process.env.HA_TOKEN;
        this.addonSlug = 'local_sipwebrtc';
        this.deviceId = 'sip_webrtc_client';
        this.entities = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Test connection to Home Assistant
            await this.testConnection();
            
            // Create device and entities
            await this.createDevice();
            await this.createEntities();
            
            this.initialized = true;
            logger.info('Home Assistant integration initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Home Assistant integration:', error);
        }
    }

    async testConnection() {
        try {
            const response = await axios.get(`${this.haUrl}/api/`, {
                headers: {
                    'Authorization': `Bearer ${this.haToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
            
            logger.info(`Connected to Home Assistant: ${response.data.message}`);
            return true;
        } catch (error) {
            throw new Error(`Cannot connect to Home Assistant: ${error.message}`);
        }
    }

    async createDevice() {
        // Create the main SIP client device through REST API state creation
        const deviceInfo = {
            state: 'disconnected',
            attributes: {
                friendly_name: 'SIP WebRTC Client',
                device_class: 'connectivity',
                icon: 'mdi:phone-voip',
                integration: this.addonSlug,
                device_info: {
                    identifiers: [this.deviceId],
                    name: 'SIP WebRTC Client',
                    manufacturer: 'Home Assistant Community',
                    model: 'WebRTC SIP Client v1.0',
                    sw_version: '1.0.0'
                },
                supported_features: ['make_call', 'answer_call', 'hangup_call']
            }
        };

        await this.setState('binary_sensor.sip_client_connected', deviceInfo);
        logger.info('Created SIP client device in Home Assistant');
    }

    async createEntities() {
        const entities = [
            {
                entityId: 'sensor.sip_client_status',
                state: 'idle',
                attributes: {
                    friendly_name: 'SIP Client Status',
                    icon: 'mdi:phone-voip',
                    device_class: 'enum',
                    options: ['idle', 'connecting', 'connected', 'calling', 'ringing', 'active', 'disconnected']
                }
            },
            {
                entityId: 'sensor.sip_call_state',
                state: 'idle',
                attributes: {
                    friendly_name: 'SIP Call State',
                    icon: 'mdi:phone-in-talk',
                    device_class: 'enum',
                    options: ['idle', 'ringing', 'calling', 'active', 'ended']
                }
            },
            {
                entityId: 'sensor.sip_current_caller',
                state: 'none',
                attributes: {
                    friendly_name: 'Current Caller',
                    icon: 'mdi:account-voice'
                }
            },
            {
                entityId: 'sensor.sip_last_call_duration',
                state: '0',
                attributes: {
                    friendly_name: 'Last Call Duration',
                    unit_of_measurement: 'seconds',
                    device_class: 'duration',
                    icon: 'mdi:timer-outline'
                }
            },
            {
                entityId: 'binary_sensor.sip_video_enabled',
                state: 'on',
                attributes: {
                    friendly_name: 'SIP Video Enabled',
                    device_class: 'running',
                    icon: 'mdi:video'
                }
            },
            {
                entityId: 'binary_sensor.sip_audio_enabled',
                state: 'on',
                attributes: {
                    friendly_name: 'SIP Audio Enabled',
                    device_class: 'running',
                    icon: 'mdi:microphone'
                }
            },
            {
                entityId: 'switch.sip_auto_answer',
                state: process.env.AUTO_ANSWER === 'true' ? 'on' : 'off',
                attributes: {
                    friendly_name: 'SIP Auto Answer',
                    icon: 'mdi:phone-check'
                }
            }
        ];

        for (const entity of entities) {
            await this.setState(entity.entityId, {
                state: entity.state,
                attributes: {
                    ...entity.attributes,
                    device: {
                        identifiers: [this.deviceId],
                        name: 'SIP WebRTC Client'
                    }
                }
            });
            
            this.entities.set(entity.entityId, entity);
        }

        logger.info(`Created ${entities.length} SIP client entities in Home Assistant`);
    }

    async setState(entityId, data) {
        try {
            const response = await axios.post(
                `${this.haUrl}/api/states/${entityId}`,
                data,
                {
                    headers: {
                        'Authorization': `Bearer ${this.haToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );

            logger.debug(`Updated entity ${entityId}:`, data.state);
            return response.data;
        } catch (error) {
            logger.error(`Failed to update entity ${entityId}:`, error.message);
            throw error;
        }
    }

    async updateConnectionState(connected) {
        if (!this.initialized) return;

        const state = connected ? 'on' : 'off';
        const statusState = connected ? 'connected' : 'disconnected';

        await this.setState('binary_sensor.sip_client_connected', {
            state,
            attributes: {
                friendly_name: 'SIP Client Connected',
                device_class: 'connectivity',
                icon: connected ? 'mdi:phone-voip' : 'mdi:phone-voip-off',
                last_changed: new Date().toISOString()
            }
        });

        await this.setState('sensor.sip_client_status', {
            state: statusState,
            attributes: {
                friendly_name: 'SIP Client Status',
                icon: connected ? 'mdi:phone-voip' : 'mdi:phone-voip-off',
                last_changed: new Date().toISOString()
            }
        });

        // Fire connection event
        await this.fireEvent('sip_client_connection_changed', {
            connected,
            timestamp: new Date().toISOString()
        });
    }

    async updateCallState(callState, caller = null, duration = null) {
        if (!this.initialized) return;

        const callStartTime = callState === 'active' ? new Date().toISOString() : null;
        
        await this.setState('sensor.sip_call_state', {
            state: callState,
            attributes: {
                friendly_name: 'SIP Call State',
                icon: this.getCallStateIcon(callState),
                last_changed: new Date().toISOString(),
                call_start_time: callStartTime
            }
        });

        if (caller !== null) {
            await this.setState('sensor.sip_current_caller', {
                state: caller || 'none',
                attributes: {
                    friendly_name: 'Current Caller',
                    icon: 'mdi:account-voice',
                    last_changed: new Date().toISOString()
                }
            });
        }

        if (duration !== null) {
            await this.setState('sensor.sip_last_call_duration', {
                state: duration.toString(),
                attributes: {
                    friendly_name: 'Last Call Duration',
                    unit_of_measurement: 'seconds',
                    device_class: 'duration',
                    icon: 'mdi:timer-outline',
                    last_changed: new Date().toISOString()
                }
            });
        }

        // Fire call state event
        await this.fireEvent('sip_call_state_changed', {
            call_state: callState,
            caller,
            duration,
            timestamp: new Date().toISOString()
        });
    }

    async updateMediaState(videoEnabled, audioEnabled) {
        if (!this.initialized) return;

        await this.setState('binary_sensor.sip_video_enabled', {
            state: videoEnabled ? 'on' : 'off',
            attributes: {
                friendly_name: 'SIP Video Enabled',
                device_class: 'running',
                icon: videoEnabled ? 'mdi:video' : 'mdi:video-off',
                last_changed: new Date().toISOString()
            }
        });

        await this.setState('binary_sensor.sip_audio_enabled', {
            state: audioEnabled ? 'on' : 'off',
            attributes: {
                friendly_name: 'SIP Audio Enabled',
                device_class: 'running',
                icon: audioEnabled ? 'mdi:microphone' : 'mdi:microphone-off',
                last_changed: new Date().toISOString()
            }
        });

        // Fire media state event
        await this.fireEvent('sip_media_state_changed', {
            video_enabled: videoEnabled,
            audio_enabled: audioEnabled,
            timestamp: new Date().toISOString()
        });
    }

    async fireEvent(eventType, eventData) {
        try {
            await axios.post(
                `${this.haUrl}/api/events/${eventType}`,
                eventData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.haToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 3000
                }
            );

            logger.debug(`Fired event ${eventType}:`, eventData);
        } catch (error) {
            logger.error(`Failed to fire event ${eventType}:`, error.message);
        }
    }

    getCallStateIcon(state) {
        const iconMap = {
            'idle': 'mdi:phone-voip',
            'ringing': 'mdi:phone-ring',
            'calling': 'mdi:phone-dial',
            'active': 'mdi:phone-in-talk',
            'ended': 'mdi:phone-hangup'
        };
        return iconMap[state] || 'mdi:phone-voip';
    }

    // Service calls for automations
    async registerServices() {
        // Note: Add-ons cannot directly register services, but can provide
        // REST endpoints that can be called via rest_command integration
        logger.info('SIP client REST endpoints available for service registration');
        
        // Services that can be configured in Home Assistant configuration:
        // rest_command:
        //   sip_make_call:
        //     url: http://localhost:8088/api/call
        //     method: POST
        //     content_type: "application/json"
        //     payload: '{"target": "{{ target }}", "video": {{ video }}, "audio": {{ audio }}}'
        //   sip_hangup:
        //     url: http://localhost:8088/api/hangup/{{ session_id }}
        //     method: POST
    }

    async cleanup() {
        if (!this.initialized) return;

        try {
            // Set all entities to unavailable state
            for (const [entityId] of this.entities) {
                await this.setState(entityId, {
                    state: 'unavailable',
                    attributes: {
                        friendly_name: this.entities.get(entityId).attributes.friendly_name,
                        last_changed: new Date().toISOString()
                    }
                });
            }

            // Fire shutdown event
            await this.fireEvent('sip_client_shutdown', {
                timestamp: new Date().toISOString()
            });

            logger.info('Home Assistant integration cleaned up');
        } catch (error) {
            logger.error('Error during HA integration cleanup:', error);
        }
    }
}

module.exports = HAIntegration;