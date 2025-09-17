import { html, LitElement, css } from 'https://unpkg.com/lit-element@2.4.0/lit-element.js?module';

class SIPVideoCard extends LitElement {
    static get properties() {
        return {
            hass: { type: Object },
            config: { type: Object },
            _connected: { type: Boolean },
            _currentCall: { type: Object },
            _localStream: { type: Object },
            _remoteStream: { type: Object },
            _callState: { type: String },
            _videoEnabled: { type: Boolean },
            _audioEnabled: { type: Boolean },
            _streamQuality: { type: String },
            _isFullscreen: { type: Boolean },
            _streamStats: { type: Object }
        };
    }

    static get styles() {
        return css`
            :host {
                display: block;
                background: var(--ha-card-background, var(--card-background-color, white));
                border-radius: var(--ha-card-border-radius, 12px);
                box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
                padding: 16px;
                position: relative;
            }

            :host([fullscreen]) {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10000;
                border-radius: 0;
                padding: 0;
                background: #000;
            }

            .card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
                font-size: 18px;
                font-weight: 500;
                color: var(--primary-text-color);
            }

            :host([fullscreen]) .card-header {
                position: absolute;
                top: 16px;
                left: 16px;
                right: 16px;
                z-index: 10001;
                color: white;
                background: rgba(0,0,0,0.7);
                padding: 12px;
                border-radius: 8px;
            }

            .connection-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
            }

            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--error-color, #ff5722);
                transition: background-color 0.3s;
            }

            .status-indicator.connected {
                background-color: var(--success-color, #4caf50);
            }

            .video-container {
                position: relative;
                width: 100%;
                height: 240px;
                background: #000;
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 16px;
                cursor: pointer;
            }

            :host([fullscreen]) .video-container {
                height: 100vh;
                border-radius: 0;
                margin: 0;
            }

            .video-remote {
                width: 100%;
                height: 100%;
                object-fit: cover;
                background: #000;
            }

            .video-local {
                position: absolute;
                top: 12px;
                right: 12px;
                width: 120px;
                height: 90px;
                background: #222;
                border-radius: 6px;
                object-fit: cover;
                border: 2px solid rgba(255, 255, 255, 0.8);
                cursor: pointer;
                transition: all 0.3s;
            }

            :host([fullscreen]) .video-local {
                width: 200px;
                height: 150px;
            }

            .video-local:hover {
                border-color: var(--primary-color, #03a9f4);
                transform: scale(1.05);
            }

            .call-placeholder {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: rgba(255, 255, 255, 0.7);
                font-size: 16px;
                text-align: center;
                gap: 16px;
            }

            .call-placeholder ha-circular-progress {
                --mdc-theme-primary: var(--primary-color, #03a9f4);
            }

            .video-controls {
                position: absolute;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 12px;
                opacity: 0;
                transition: opacity 0.3s;
                background: rgba(0,0,0,0.7);
                padding: 12px;
                border-radius: 24px;
            }

            .video-container:hover .video-controls {
                opacity: 1;
            }

            :host([fullscreen]) .video-controls {
                opacity: 1;
                bottom: 32px;
                gap: 16px;
                padding: 16px;
            }

            .controls-section {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            :host([fullscreen]) .controls-section {
                position: absolute;
                bottom: 32px;
                left: 32px;
                right: 32px;
                background: rgba(0,0,0,0.8);
                padding: 20px;
                border-radius: 12px;
            }

            .call-input {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .call-input ha-textfield {
                flex: 1;
            }

            .button-group {
                display: flex;
                gap: 8px;
                justify-content: center;
                flex-wrap: wrap;
            }

            .control-button {
                min-width: 44px;
                height: 44px;
                border-radius: 22px;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                transition: all 0.2s;
                position: relative;
            }

            :host([fullscreen]) .control-button {
                min-width: 56px;
                height: 56px;
                border-radius: 28px;
                font-size: 20px;
            }

            .control-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .call-button {
                background: var(--success-color, #4caf50);
                color: white;
            }

            .call-button:hover:not(:disabled) {
                background: var(--success-color, #43a047);
                transform: scale(1.05);
            }

            .answer-button {
                background: var(--success-color, #4caf50);
                color: white;
                animation: pulse 2s infinite;
            }

            .hangup-button {
                background: var(--error-color, #f44336);
                color: white;
            }

            .hangup-button:hover:not(:disabled) {
                background: var(--error-color, #d32f2f);
                transform: scale(1.05);
            }

            .toggle-button {
                background: var(--primary-color, #03a9f4);
                color: white;
            }

            .toggle-button:hover:not(:disabled) {
                background: var(--primary-color, #0288d1);
                transform: scale(1.05);
            }

            .toggle-button.disabled {
                background: var(--disabled-color, #bdbdbd);
            }

            .fullscreen-button {
                background: var(--primary-color, #03a9f4);
                color: white;
                position: absolute;
                top: 12px;
                left: 12px;
                z-index: 100;
            }

            .quality-selector {
                position: absolute;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 100;
            }

            .quality-selector ha-select {
                --mdc-theme-primary: white;
                --mdc-select-fill-color: rgba(0,0,0,0.7);
                --mdc-select-ink-color: white;
                --mdc-select-label-ink-color: rgba(255,255,255,0.7);
            }

            .stream-stats {
                position: absolute;
                bottom: 12px;
                left: 12px;
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                opacity: 0;
                transition: opacity 0.3s;
                font-family: monospace;
            }

            .video-container:hover .stream-stats {
                opacity: 1;
            }

            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }

            .call-info {
                text-align: center;
                color: var(--secondary-text-color);
                font-size: 14px;
                margin: 8px 0;
            }

            .settings-section {
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid var(--divider-color, #e0e0e0);
            }

            .setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin: 8px 0;
                font-size: 14px;
            }

            .error-message {
                background: var(--error-color, #f44336);
                color: white;
                padding: 12px;
                border-radius: 6px;
                margin-bottom: 16px;
                text-align: center;
            }
        `;
    }

    constructor() {
        super();
        this._connected = false;
        this._currentCall = null;
        this._localStream = null;
        this._remoteStream = null;
        this._callState = 'idle';
        this._callTarget = '';
        this._videoEnabled = true;
        this._audioEnabled = true;
        this._streamQuality = 'hd';
        this._isFullscreen = false;
        this._streamStats = null;
        this._ws = null;
        this._connectionRetries = 0;
        this._maxRetries = 5;
        this._mediaPermissionError = null;
        this._statsInterval = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.initializeWebSocket();
        this.requestMediaPermissions();
        this.startStatsMonitoring();
        
        // Add keyboard shortcuts for fullscreen mode
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cleanup();
        document.removeEventListener('keydown', this.handleKeydown.bind(this));
    }

    handleKeydown(event) {
        if (!this._isFullscreen) return;
        
        switch (event.key) {
            case 'Escape':
                this.toggleFullscreen();
                break;
            case 'v':
                this.toggleVideo();
                break;
            case 'a':
                this.toggleAudio();
                break;
            case 'h':
                if (this._currentCall) this.hangupCall();
                break;
        }
    }

    async requestMediaPermissions() {
        try {
            this._localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            this._mediaPermissionError = null;
            this.setupStreamEventListeners();
            this.requestUpdate();
        } catch (error) {
            this._mediaPermissionError = this.getMediaErrorMessage(error);
            logger.error('Failed to get media permissions:', error);
            this.requestUpdate();
        }
    }

    getMediaErrorMessage(error) {
        switch (error.name) {
            case 'NotAllowedError':
                return 'Camera/microphone access denied. Please allow access and refresh.';
            case 'NotFoundError':
                return 'No camera or microphone found on this device.';
            case 'NotReadableError':
                return 'Camera/microphone is already in use by another application.';
            case 'OverconstrainedError':
                return 'Camera/microphone does not support the requested settings.';
            default:
                return 'Unable to access camera/microphone. Please check your device.';
        }
    }

    setupStreamEventListeners() {
        if (!this._localStream) return;

        this._localStream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
                console.warn(`${track.kind} track ended unexpectedly`);
                this.requestUpdate();
            });
        });
    }

    startStatsMonitoring() {
        this._statsInterval = setInterval(() => {
            this.updateStreamStats();
        }, 1000);
    }

    updateStreamStats() {
        if (!this._localStream && !this._remoteStream) return;

        const stats = {
            local: {
                video: null,
                audio: null
            },
            remote: {
                video: null,
                audio: null
            }
        };

        // Local stream stats
        if (this._localStream) {
            const videoTrack = this._localStream.getVideoTracks()[0];
            const audioTrack = this._localStream.getAudioTracks()[0];

            if (videoTrack) {
                const settings = videoTrack.getSettings();
                stats.local.video = {
                    enabled: videoTrack.enabled,
                    resolution: `${settings.width}×${settings.height}`,
                    frameRate: settings.frameRate
                };
            }

            if (audioTrack) {
                const settings = audioTrack.getSettings();
                stats.local.audio = {
                    enabled: audioTrack.enabled,
                    sampleRate: settings.sampleRate,
                    channelCount: settings.channelCount
                };
            }
        }

        // Remote stream stats
        if (this._remoteStream) {
            const videoTrack = this._remoteStream.getVideoTracks()[0];
            const audioTrack = this._remoteStream.getAudioTracks()[0];

            if (videoTrack) {
                const settings = videoTrack.getSettings();
                stats.remote.video = {
                    resolution: `${settings.width}×${settings.height}`,
                    frameRate: settings.frameRate
                };
            }

            if (audioTrack) {
                const settings = audioTrack.getSettings();
                stats.remote.audio = {
                    sampleRate: settings.sampleRate,
                    channelCount: settings.channelCount
                };
            }
        }

        this._streamStats = stats;
        this.requestUpdate();
    }

    async setStreamQuality(quality) {
        if (!this._localStream) return;

        const qualitySettings = {
            'low': { width: 640, height: 360, frameRate: 15 },
            'medium': { width: 960, height: 540, frameRate: 24 },
            'hd': { width: 1280, height: 720, frameRate: 30 },
            'fhd': { width: 1920, height: 1080, frameRate: 30 }
        };

        const settings = qualitySettings[quality];
        if (!settings) return;

        try {
            const videoTrack = this._localStream.getVideoTracks()[0];
            if (videoTrack) {
                await videoTrack.applyConstraints(settings);
                this._streamQuality = quality;
                this.requestUpdate();
            }
        } catch (error) {
            console.error('Failed to apply video constraints:', error);
        }
    }

    toggleFullscreen() {
        this._isFullscreen = !this._isFullscreen;
        
        if (this._isFullscreen) {
            this.setAttribute('fullscreen', '');
            document.body.style.overflow = 'hidden';
        } else {
            this.removeAttribute('fullscreen');
            document.body.style.overflow = '';
        }
        
        this.requestUpdate();
    }

    renderVideoContainer() {
        return html`
            <div class="video-container" @click=${this.handleVideoClick}>
                ${this._mediaPermissionError ? html`
                    <div class="error-message">
                        ${this._mediaPermissionError}
                    </div>
                ` : ''}
                
                ${this._remoteStream ? html`
                    <video 
                        class="video-remote" 
                        .srcObject=${this._remoteStream}
                        autoplay
                        playsinline>
                    </video>
                ` : html`
                    <div class="call-placeholder">
                        ${this._callState === 'idle' ? html`
                            <span>No active call</span>
                            ${this._localStream ? html`<span>Camera ready</span>` : ''}
                        ` : this._callState === 'ringing' ? html`
                            <ha-circular-progress active></ha-circular-progress>
                            <span>Incoming call from ${this._currentCall?.caller}</span>
                        ` : this._callState === 'calling' ? html`
                            <ha-circular-progress active></ha-circular-progress>
                            <span>Calling ${this._currentCall?.target}...</span>
                        ` : this._callState === 'active' ? html`
                            <ha-circular-progress active></ha-circular-progress>
                            <span>Call active - waiting for video</span>
                        ` : html`<span>Connecting...</span>`}
                    </div>
                `}
                
                ${this._localStream && this._videoEnabled ? html`
                    <video 
                        class="video-local" 
                        .srcObject=${this._localStream}
                        autoplay
                        muted
                        playsinline
                        @click=${this.switchCamera}>
                    </video>
                ` : ''}

                <div class="video-controls">
                    <button 
                        class="control-button fullscreen-button"
                        @click=${this.toggleFullscreen}
                        title="${this._isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}">
                        ${this._isFullscreen ? '⊡' : '⛶'}
                    </button>
                    
                    <button 
                        class="control-button toggle-button ${this._videoEnabled ? '' : 'disabled'}"
                        @click=${this.toggleVideo}
                        title="Toggle Video">
                        📹
                    </button>
                    
                    <button 
                        class="control-button toggle-button ${this._audioEnabled ? '' : 'disabled'}"
                        @click=${this.toggleAudio}
                        title="Toggle Audio">
                        🎤
                    </button>
                </div>

                <div class="quality-selector">
                    <ha-select
                        .value=${this._streamQuality}
                        @selected=${this.handleQualityChange}
                        label="Quality">
                        <mwc-list-item value="low">Low (360p)</mwc-list-item>
                        <mwc-list-item value="medium">Medium (540p)</mwc-list-item>
                        <mwc-list-item value="hd">HD (720p)</mwc-list-item>
                        <mwc-list-item value="fhd">Full HD (1080p)</mwc-list-item>
                    </ha-select>
                </div>

                ${this._streamStats ? html`
                    <div class="stream-stats">
                        ${this._streamStats.local.video ? html`
                            <div>Local: ${this._streamStats.local.video.resolution} @ ${this._streamStats.local.video.frameRate}fps</div>
                        ` : ''}
                        ${this._streamStats.remote.video ? html`
                            <div>Remote: ${this._streamStats.remote.video.resolution} @ ${this._streamStats.remote.video.frameRate}fps</div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    handleVideoClick(event) {
        // Don't trigger fullscreen if clicking on controls
        if (event.target.closest('.video-controls') || 
            event.target.closest('.quality-selector') ||
            event.target.classList.contains('video-local')) {
            return;
        }
        
        this.toggleFullscreen();
    }

    handleQualityChange(event) {
        const quality = event.target.value;
        this.setStreamQuality(quality);
    }

    async switchCamera() {
        if (!this._localStream) return;

        try {
            const videoTrack = this._localStream.getVideoTracks()[0];
            if (!videoTrack) return;

            const settings = videoTrack.getSettings();
            const currentFacingMode = settings.facingMode;
            const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

            // Stop current video track
            videoTrack.stop();
            this._localStream.removeTrack(videoTrack);

            // Get new video stream
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: newFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            const newVideoTrack = newStream.getVideoTracks()[0];
            if (newVideoTrack) {
                this._localStream.addTrack(newVideoTrack);
                this.requestUpdate();
            }
        } catch (error) {
            console.error('Failed to switch camera:', error);
        }
    }

    cleanup() {
        if (this._statsInterval) {
            clearInterval(this._statsInterval);
            this._statsInterval = null;
        }

        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        
        if (this._localStream) {
            this._localStream.getTracks().forEach(track => track.stop());
            this._localStream = null;
        }
        
        this._remoteStream = null;
        this._currentCall = null;
        this._callState = 'idle';
        
        if (this._isFullscreen) {
            document.body.style.overflow = '';
        }
    }

    // ... (rest of the methods from previous implementation remain the same)
    // Including: initializeWebSocket, handleWebSocketMessage, makeCall, answerCall, hangupCall, etc.

    render() {
        return html`
            <div class="card-header">
                <span>${this.config.title || 'SIP Video Client'}</span>
                ${this.config.show_connection_status ? html`
                    <div class="connection-status">
                        <div class="status-indicator ${this._connected ? 'connected' : ''}"></div>
                        <span>${this._connected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                ` : ''}
            </div>
            
            ${this.renderVideoContainer()}
            ${!this._isFullscreen ? this.renderControls() : ''}
        `;
    }

    getCardSize() {
        return this._isFullscreen ? 12 : (this.config.compact_mode ? 4 : 6);
    }
}

customElements.define('sip-video-card', SIPVideoCard);

