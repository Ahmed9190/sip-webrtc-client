const crypto = require('crypto');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

class SecurityManager {
    constructor() {
        this.encryptionKey = this.generateOrLoadKey();
        this.rateLimiters = new Map();
        this.securityEvents = [];
        this.maxSecurityEvents = 1000;
    }

    generateOrLoadKey() {
        // In production, this should load from a secure storage
        // For now, generate a consistent key based on environment
        const keyMaterial = process.env.SUPERVISOR_TOKEN || 'default-key-material';
        return crypto.createHash('sha256').update(keyMaterial).digest();
    }

    encryptSensitiveData(data) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return {
                encrypted: encrypted,
                iv: iv.toString('hex')
            };
        } catch (error) {
            logger.error('Failed to encrypt sensitive data:', error);
            throw new Error('Encryption failed');
        }
    }

    decryptSensitiveData(encryptedData, iv) {
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
            
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            logger.error('Failed to decrypt sensitive data:', error);
            throw new Error('Decryption failed');
        }
    }

    sanitizeConfiguration(config) {
        const sanitized = { ...config };
        
        // Mask sensitive fields in logs
        if (sanitized.sip_password) {
            sanitized.sip_password = '*'.repeat(sanitized.sip_password.length);
        }
        
        // Remove any potential injection characters
        Object.keys(sanitized).forEach(key => {
            if (typeof sanitized[key] === 'string') {
                sanitized[key] = sanitized[key]
                    .replace(/[<>'"]/g, '')
                    .trim();
            }
        });
        
        return sanitized;
    }

    validateRequestSource(req) {
        const allowedOrigins = [
            'http://supervisor',
            'https://supervisor',
            process.env.HOME_ASSISTANT_URL
        ].filter(Boolean);

        const origin = req.headers.origin || req.headers.referer;
        
        if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed))) {
            this.logSecurityEvent('unauthorized_origin', {
                origin,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            return false;
        }
        
        return true;
    }

    rateLimit(identifier, maxRequests = 60, windowMs = 60000) {
        const now = Date.now();
        const windowStart = now - windowMs;
        
        if (!this.rateLimiters.has(identifier)) {
            this.rateLimiters.set(identifier, []);
        }
        
        const requests = this.rateLimiters.get(identifier);
        
        // Remove old requests outside the window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        
        if (validRequests.length >= maxRequests) {
            this.logSecurityEvent('rate_limit_exceeded', {
                identifier,
                requestCount: validRequests.length,
                maxRequests,
                windowMs
            });
            return false;
        }
        
        validRequests.push(now);
        this.rateLimiters.set(identifier, validRequests);
        
        return true;
    }

    validateSIPCredentials(username, password, domain) {
        const issues = [];
        
        // Username validation
        if (username.length < 3) {
            issues.push('Username too short');
        }
        
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
            issues.push('Username contains invalid characters');
        }
        
        // Password strength validation
        if (password.length < 8) {
            issues.push('Password too short');
        }
        
        if (!/(?=.*[a-z])/.test(password)) {
            issues.push('Password must contain lowercase letters');
        }
        
        if (!/(?=.*[A-Z])/.test(password)) {
            issues.push('Password must contain uppercase letters');
        }
        
        if (!/(?=.*\d)/.test(password)) {
            issues.push('Password must contain numbers');
        }
        
        // Check for common patterns
        const commonPatterns = [
            /(.)\1{3,}/, // Repeated characters
            /123456/,    // Sequential numbers
            /qwerty/i,   // Keyboard patterns
            /password/i  // Common words
        ];
        
        if (commonPatterns.some(pattern => pattern.test(password))) {
            issues.push('Password contains common patterns');
        }
        
        // Domain validation if provided
        if (domain && !/^[a-zA-Z0-9.-]+$/.test(domain)) {
            issues.push('Domain contains invalid characters');
        }
        
        if (issues.length > 0) {
            this.logSecurityEvent('credential_validation_failed', {
                username,
                issues
            });
        }
        
        return {
            valid: issues.length === 0,
            issues
        };
    }

    generateSecureHeaders() {
        return {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        };
    }

    logSecurityEvent(eventType, details) {
        const securityEvent = {
            timestamp: new Date().toISOString(),
            type: eventType,
            details,
            severity: this.getEventSeverity(eventType)
        };
        
        this.securityEvents.push(securityEvent);
        
        // Maintain event history limit
        if (this.securityEvents.length > this.maxSecurityEvents) {
            this.securityEvents = this.securityEvents.slice(-this.maxSecurityEvents);
        }
        
        // Log based on severity
        const logMessage = `Security Event [${eventType}]: ${JSON.stringify(details)}`;
        
        switch (securityEvent.severity) {
            case 'high':
                logger.error(logMessage);
                break;
            case 'medium':
                logger.warn(logMessage);
                break;
            default:
                logger.info(logMessage);
        }
        
        return securityEvent;
    }

    getEventSeverity(eventType) {
        const severityMap = {
            'unauthorized_origin': 'high',
            'rate_limit_exceeded': 'medium',
            'credential_validation_failed': 'medium',
            'invalid_configuration': 'medium',
            'encryption_failure': 'high',
            'authentication_failure': 'high',
            'suspicious_activity': 'high'
        };
        
        return severityMap[eventType] || 'low';
    }

    getSecuritySummary() {
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);
        
        const recentEvents = this.securityEvents.filter(
            event => new Date(event.timestamp).getTime() > last24Hours
        );
        
        const eventsByType = {};
        const eventsBySeverity = { high: 0, medium: 0, low: 0 };
        
        recentEvents.forEach(event => {
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
            eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
        });
        
        return {
            totalEvents: recentEvents.length,
            eventsByType,
            eventsBySeverity,
            timeframe: '24 hours',
            lastEvent: this.securityEvents.length > 0 
                ? this.securityEvents[this.securityEvents.length - 1].timestamp 
                : null
        };
    }

    cleanup() {
        // Clear sensitive data from memory
        this.rateLimiters.clear();
        this.securityEvents = [];
        
        if (this.encryptionKey) {
            this.encryptionKey.fill(0);
        }
        
        logger.info('Security manager cleanup completed');
    }
}

module.exports = SecurityManager;