ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Node.js and system dependencies for media processing
RUN apk add --no-cache \
  nodejs \
  npm \
  python3 \
  py3-pip \
  build-base \
  linux-headers \
  ffmpeg \
  alsa-lib-dev \
  pulseaudio-dev \
  && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY rootfs/ /
COPY src/ ./src/
COPY www/ ./www/

# Set permissions
RUN chmod +x /etc/services.d/*/run \
  && chmod +x /etc/services.d/*/finish

# Expose ports
EXPOSE 8088

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD npm run health-check

# Labels
LABEL \
  io.hass.name="SIP WebRTC Video Client" \
  io.hass.description="WebRTC SIP client for video calling" \
  io.hass.arch="aarch64|amd64|armhf|armv7" \
  io.hass.type="addon" \
  io.hass.version="1.0.0"
