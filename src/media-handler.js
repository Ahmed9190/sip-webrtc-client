const winston = require('winston');
const EventEmitter = require('events');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

class MediaHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 60 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 48000
            },
            codecs: {
                video: ['H264', 'VP8', 'VP9'],
                audio: ['OPUS', 'G722', 'PCMU']
            },
            ...config
        };
        
        this.localStream = null;
        this.remoteStreams = new Map();
        this.peerConnections = new Map();
        this.mediaConstraints = null;
        this.iceServers = [];
        this.streamQuality = 'hd';
        this.adaptiveBitrate = true;
    }

    async initialize(iceServers = []) {
        this.iceServers = iceServers;
        await this.setupMediaConstraints();
        await this.requestUserMedia();
        
        logger.info('Media handler initialized successfully');
        this.emit('initialized');
    }

    async setupMediaConstraints() {
        // Build constraints based on configuration and device capabilities
        const deviceCapabilities = await this.getDeviceCapabilities();
        
        this.mediaConstraints = {
            video: {
                ...this.config.video,
                facingMode: 'user'
            },
            audio: {
                ...this.config.audio
            }
        };

        // Adjust constraints based on device capabilities
        if (deviceCapabilities.video) {
            this.mediaConstraints.video.width.max = Math.min(
                this.mediaConstraints.video.width.max,
                deviceCapabilities.video.width?.max || 1920
            );
            this.mediaConstraints.video.height.max = Math.min(
                this.mediaConstraints.video.height.max,
                deviceCapabilities.video.height?.max || 1080
            );
        }

        logger.info('Media constraints configured:', this.mediaConstraints);
    }

    async getDeviceCapabilities() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            const audioDevices = devices.filter(device => device.kind === 'audioinput');

            let capabilities = { video: null, audio: null };

            if (videoDevices.length > 0) {
                // Get capabilities from the first video device
                const track = await this.createTestTrack('video');
                if (track) {
                    capabilities.video = track.getCapabilities();
                    track.stop();
                }
            }

            if (audioDevices.length > 0) {
                // Get capabilities from the first audio device
                const track = await this.createTestTrack('audio');
                if (track) {
                    capabilities.audio = track.getCapabilities();
                    track.stop();
                }
            }

            return capabilities;
        } catch (error) {
            logger.error('Failed to get device capabilities:', error);
            return { video: null, audio: null };
        }
    }

    async createTestTrack(type) {
        try {
            const constraints = type === 'video' 
                ? { video: true, audio: false }
                : { video: false, audio: true };
                
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const tracks = type === 'video' ? stream.getVideoTracks() : stream.getAudioTracks();
            
            return tracks[0] || null;
        } catch (error) {
            logger.warn(`Failed to create test ${type} track:`, error);
            return null;
        }
    }

    async requestUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
            
            // Setup track event listeners
            this.localStream.getTracks().forEach(track => {
                track.addEventListener('ended', () => {
                    logger.info(`${track.kind} track ended`);
                    this.emit('trackEnded', { kind: track.kind, track });
                });

                track.addEventListener('mute', () => {
                    logger.info(`${track.kind} track muted`);
                    this.emit('trackMuted', { kind: track.kind, track });
                });

                track.addEventListener('unmute', () => {
                    logger.info(`${track.kind} track unmuted`);
                    this.emit('trackUnmuted', { kind: track.kind, track });
                });
            });

            // Apply codec preferences
            await this.applyCodecPreferences();
            
            logger.info('User media acquired successfully');
            this.emit('localStreamReady', this.localStream);
            
            return this.localStream;
        } catch (error) {
            logger.error('Failed to get user media:', error);
            this.handleMediaError(error);
            throw error;
        }
    }

    async applyCodecPreferences() {
        if (!this.localStream) return;

        // This would typically be handled at the RTCPeerConnection level
        // For SIP.js integration, codec preferences are set in the SDP
        const videoTrack = this.localStream.getVideoTracks()[0];
        const audioTrack = this.localStream.getAudioTracks()[0];

        if (videoTrack) {
            // Apply video track constraints for quality optimization
            try {
                await videoTrack.applyConstraints({
                    frameRate: this.getOptimalFrameRate(),
                    width: this.getOptimalWidth(),
                    height: this.getOptimalHeight()
                });
                
                logger.info('Video constraints applied successfully');
            } catch (error) {
                logger.warn('Failed to apply video constraints:', error);
            }
        }

        if (audioTrack) {
            // Apply audio track constraints
            try {
                await audioTrack.applyConstraints({
                    echoCancellation: this.config.audio.echoCancellation,
                    noiseSuppression: this.config.audio.noiseSuppression,
                    autoGainControl: this.config.audio.autoGainControl
                });
                
                logger.info('Audio constraints applied successfully');
            } catch (error) {
                logger.warn('Failed to apply audio constraints:', error);
            }
        }
    }

    getOptimalFrameRate() {
        const qualitySettings = {
            'low': 15,
            'medium': 24,
            'hd': 30,
            'fhd': 30
        };
        return qualitySettings[this.streamQuality] || 30;
    }

    getOptimalWidth() {
        const qualitySettings = {
            'low': 640,
            'medium': 960,
            'hd': 1280,
            'fhd': 1920
        };
        return qualitySettings[this.streamQuality] || 1280;
    }

    getOptimalHeight() {
        const qualitySettings = {
            'low': 360,
            'medium': 540,
            'hd': 720,
            'fhd': 1080
        };
        return qualitySettings[this.streamQuality] || 720;
    }

    async setStreamQuality(quality) {
        if (!['low', 'medium', 'hd', 'fhd'].includes(quality)) {
            throw new Error('Invalid quality setting');
        }

        this.streamQuality = quality;
        await this.applyCodecPreferences();
        
        logger.info(`Stream quality changed to: ${quality}`);
        this.emit('qualityChanged', quality);
    }

    async toggleVideo(enabled) {
        if (!this.localStream) return;

        const videoTracks = this.localStream.getVideoTracks();
        videoTracks.forEach(track => {
            track.enabled = enabled;
        });

        if (!enabled && videoTracks.length === 0) {
            // If no video track exists and we want to enable video, recreate stream
            await this.addVideoTrack();
        }

        logger.info(`Video ${enabled ? 'enabled' : 'disabled'}`);
        this.emit('videoToggled', enabled);
    }

    async toggleAudio(enabled) {
        if (!this.localStream) return;

        const audioTracks = this.localStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = enabled;
        });

        if (!enabled && audioTracks.length === 0) {
            // If no audio track exists and we want to enable audio, recreate stream
            await this.addAudioTrack();
        }

        logger.info(`Audio ${enabled ? 'enabled' : 'disabled'}`);
        this.emit('audioToggled', enabled);
    }

    async addVideoTrack() {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({
                video: this.mediaConstraints.video,
                audio: false
            });

            const videoTrack = videoStream.getVideoTracks()[0];
            if (videoTrack) {
                this.localStream.addTrack(videoTrack);
                await this.applyCodecPreferences();
                
                logger.info('Video track added to stream');
                this.emit('videoTrackAdded', videoTrack);
            }
        } catch (error) {
            logger.error('Failed to add video track:', error);
        }
    }

    async addAudioTrack() {
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: this.mediaConstraints.audio
            });

            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
                this.localStream.addTrack(audioTrack);
                
                logger.info('Audio track added to stream');
                this.emit('audioTrackAdded', audioTrack);
            }
        } catch (error) {
            logger.error('Failed to add audio track:', error);
        }
    }

    async switchCamera() {
        if (!this.localStream) return;

        try {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (!videoTrack) return;

            const currentFacingMode = videoTrack.getSettings().facingMode;
            const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

            // Stop current video track
            videoTrack.stop();
            this.localStream.removeTrack(videoTrack);

            // Get new video stream with different camera
            const newVideoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    ...this.mediaConstraints.video,
                    facingMode: newFacingMode
                },
                audio: false
            });

            const newVideoTrack = newVideoStream.getVideoTracks()[0];
            if (newVideoTrack) {
                this.localStream.addTrack(newVideoTrack);
                
                logger.info(`Camera switched to: ${newFacingMode}`);
                this.emit('cameraSwitched', newFacingMode);
            }
        } catch (error) {
            logger.error('Failed to switch camera:', error);
            // Try to restore video track if switching failed
            await this.addVideoTrack();
        }
    }

    addRemoteStream(sessionId, stream) {
        this.remoteStreams.set(sessionId, stream);
        
        // Monitor remote stream tracks
        stream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
                logger.info(`Remote ${track.kind} track ended for session ${sessionId}`);
                this.emit('remoteTrackEnded', { sessionId, kind: track.kind, track });
            });
        });

        logger.info(`Remote stream added for session: ${sessionId}`);
        this.emit('remoteStreamAdded', { sessionId, stream });
    }

    removeRemoteStream(sessionId) {
        const stream = this.remoteStreams.get(sessionId);
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            this.remoteStreams.delete(sessionId);
            
            logger.info(`Remote stream removed for session: ${sessionId}`);
            this.emit('remoteStreamRemoved', sessionId);
        }
    }

    getStreamStats(sessionId = null) {
        const stats = {
            local: {
                video: null,
                audio: null
            },
            remote: sessionId ? null : {}
        };

        // Local stream stats
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            const audioTrack = this.localStream.getAudioTracks()[0];

            if (videoTrack) {
                stats.local.video = {
                    enabled: videoTrack.enabled,
                    muted: videoTrack.muted,
                    settings: videoTrack.getSettings(),
                    constraints: videoTrack.getConstraints()
                };
            }

            if (audioTrack) {
                stats.local.audio = {
                    enabled: audioTrack.enabled,
                    muted: audioTrack.muted,
                    settings: audioTrack.getSettings(),
                    constraints: audioTrack.getConstraints()
                };
            }
        }

        // Remote stream stats
        if (sessionId && this.remoteStreams.has(sessionId)) {
            const stream = this.remoteStreams.get(sessionId);
            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            stats.remote = {
                video: videoTrack ? {
                    enabled: videoTrack.enabled,
                    muted: videoTrack.muted,
                    settings: videoTrack.getSettings()
                } : null,
                audio: audioTrack ? {
                    enabled: audioTrack.enabled,
                    muted: audioTrack.muted,
                    settings: audioTrack.getSettings()
                } : null
            };
        } else if (!sessionId) {
            // Get stats for all remote streams
            this.remoteStreams.forEach((stream, id) => {
                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];

                stats.remote[id] = {
                    video: videoTrack ? {
                        enabled: videoTrack.enabled,
                        muted: videoTrack.muted,
                        settings: videoTrack.getSettings()
                    } : null,
                    audio: audioTrack ? {
                        enabled: audioTrack.enabled,
                        muted: audioTrack.muted,
                        settings: audioTrack.getSettings()
                    } : null
                };
            });
        }

        return stats;
    }

    handleMediaError(error) {
        let errorMessage = 'Unknown media error';
        let errorType = 'unknown';

        switch (error.name) {
            case 'NotAllowedError':
                errorMessage = 'Camera/microphone access denied by user';
                errorType = 'permission';
                break;
            case 'NotFoundError':
                errorMessage = 'No camera/microphone device found';
                errorType = 'device';
                break;
            case 'NotReadableError':
                errorMessage = 'Camera/microphone already in use';
                errorType = 'busy';
                break;
            case 'OverconstrainedError':
                errorMessage = 'Requested media constraints not supported';
                errorType = 'constraints';
                break;
            case 'TypeError':
                errorMessage = 'Invalid media constraints';
                errorType = 'constraints';
                break;
            case 'AbortError':
                errorMessage = 'Media request was aborted';
                errorType = 'aborted';
                break;
        }

        logger.error(`Media error: ${errorMessage}`);
        this.emit('mediaError', { type: errorType, message: errorMessage, originalError: error });
    }

    async cleanup() {
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                logger.debug(`Stopped ${track.kind} track`);
            });
            this.localStream = null;
        }

        // Stop and remove all remote streams
        this.remoteStreams.forEach((stream, sessionId) => {
            stream.getTracks().forEach(track => track.stop());
        });
        this.remoteStreams.clear();

        // Clean up peer connections
        this.peerConnections.forEach((pc, sessionId) => {
            pc.close();
        });
        this.peerConnections.clear();

        logger.info('Media handler cleanup completed');
        this.emit('cleanup');
    }

    // Utility methods for integration
    getLocalStream() {
        return this.localStream;
    }

    getRemoteStream(sessionId) {
        return this.remoteStreams.get(sessionId);
    }

    hasVideo() {
        return this.localStream && this.localStream.getVideoTracks().length > 0;
    }

    hasAudio() {
        return this.localStream && this.localStream.getAudioTracks().length > 0;
    }

    isVideoEnabled() {
        const videoTrack = this.localStream?.getVideoTracks()[0];
        return videoTrack ? videoTrack.enabled : false;
    }

    isAudioEnabled() {
        const audioTrack = this.localStream?.getAudioTracks()[0];
        return audioTrack ? audioTrack.enabled : false;
    }
}

module.exports = MediaHandler;