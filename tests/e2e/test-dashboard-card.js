const puppeteer = require('puppeteer');
const path = require('path');

describe('Dashboard Card E2E Tests', () => {
    let browser;
    let page;
    const testPort = 3001;
    const testUrl = `http://localhost:${testPort}`;

    beforeAll(async () => {
        browser = await puppeteer.launch({
            headless: process.env.CI === 'true',
            slowMo: 50,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream']
        });
    });

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
    });

    beforeEach(async () => {
        page = await browser.newPage();
        
        // Mock media permissions
        await page.evaluateOnNewDocument(() => {
            navigator.mediaDevices.getUserMedia = () => Promise.resolve({
                getTracks: () => [],
                getVideoTracks: () => [{
                    enabled: true,
                    kind: 'video',
                    stop: () => {},
                    addEventListener: () => {}
                }],
                getAudioTracks: () => [{
                    enabled: true,
                    kind: 'audio',
                    stop: () => {},
                    addEventListener: () => {}
                }]
            });
        });

        await page.goto(`${testUrl}/test-card.html`);
    });

    afterEach(async () => {
        if (page) {
            await page.close();
        }
    });

    describe('Card Initialization', () => {
        test('should load SIP video card', async () => {
            await page.waitForSelector('sip-video-card');
            
            const cardElement = await page.$('sip-video-card');
            expect(cardElement).toBeTruthy();
        });

        test('should display connection status', async () => {
            await page.waitForSelector('.connection-status');
            
            const statusText = await page.$eval('.connection-status span', 
                el => el.textContent);
            expect(statusText).toBe('Disconnected');
        });

        test('should show video placeholder when no call active', async () => {
            await page.waitForSelector('.call-placeholder');
            
            const placeholderText = await page.$eval('.call-placeholder', 
                el => el.textContent);
            expect(placeholderText).toContain('No active call');
        });
    });

    describe('User Interactions', () => {
        test('should open call input when clicking call button', async () => {
            await page.waitForSelector('.call-button');
            
            // Should show input field for call target
            const callInput = await page.$('.call-input ha-textfield');
            expect(callInput).toBeTruthy();
        });

        test('should toggle video controls', async () => {
            await page.waitForSelector('.toggle-button');
            
            const videoButton = await page.$('.toggle-button[title="Toggle Video"]');
            await videoButton.click();
            
            // Check if button state changed
            const buttonClass = await page.$eval('.toggle-button[title="Toggle Video"]', 
                el => el.className);
            expect(buttonClass).toContain('disabled');
        });

        test('should enter fullscreen mode', async () => {
            await page.waitForSelector('.video-container');
            
            const videoContainer = await page.$('.video-container');
            await videoContainer.click();
            
            // Check if fullscreen attribute is added
            await page.waitForSelector('sip-video-card[fullscreen]');
            const fullscreenCard = await page.$('sip-video-card[fullscreen]');
            expect(fullscreenCard).toBeTruthy();
        });
    });

    describe('Configuration Changes', () => {
        test('should update card title from config', async () => {
            await page.evaluate(() => {
                const card = document.querySelector('sip-video-card');
                card.setConfig({ title: 'Custom SIP Client' });
            });

            await page.waitForFunction(() => {
                const title = document.querySelector('.card-header span');
                return title && title.textContent === 'Custom SIP Client';
            });

            const titleText = await page.$eval('.card-header span', el => el.textContent);
            expect(titleText).toBe('Custom SIP Client');
        });

        test('should hide connection status when configured', async () => {
            await page.evaluate(() => {
                const card = document.querySelector('sip-video-card');
                card.setConfig({ show_connection_status: false });
            });

            const connectionStatus = await page.$('.connection-status');
            expect(connectionStatus).toBeFalsy();
        });
    });

    describe('WebSocket Communication', () => {
        test('should handle connection state changes', async () => {
            // Mock WebSocket connection
            await page.evaluate(() => {
                const card = document.querySelector('sip-video-card');
                card._connected = true;
                card.requestUpdate();
            });

            await page.waitForFunction(() => {
                const indicator = document.querySelector('.status-indicator');
                return indicator && indicator.classList.contains('connected');
            });

            const indicator = await page.$('.status-indicator.connected');
            expect(indicator).toBeTruthy();
        });

        test('should update call state on WebSocket messages', async () => {
            await page.evaluate(() => {
                const card = document.querySelector('sip-video-card');
                card.handleWebSocketMessage({
                    type: 'incoming_call',
                    sessionId: 'test-session',
                    caller: 'test-caller'
                });
            });

            await page.waitForFunction(() => {
                const placeholder = document.querySelector('.call-placeholder');
                return placeholder && placeholder.textContent.includes('Incoming call from test-caller');
            });

            const placeholderText = await page.$eval('.call-placeholder', el => el.textContent);
            expect(placeholderText).toContain('Incoming call from test-caller');
        });
    });

    describe('Responsive Design', () => {
        test('should adapt to mobile viewport', async () => {
            await page.setViewport({ width: 375, height: 667 });
            
            const videoContainer = await page.$eval('.video-container', 
                el => window.getComputedStyle(el));
            expect(parseInt(videoContainer.width)).toBeLessThan(400);
        });

        test('should maintain aspect ratio in fullscreen', async () => {
            await page.setViewport({ width: 1920, height: 1080 });
            
            const videoContainer = await page.$('.video-container');
            await videoContainer.click(); // Enter fullscreen
            
            await page.waitForSelector('sip-video-card[fullscreen]');
            
            const containerHeight = await page.$eval('.video-container', 
                el => el.getBoundingClientRect().height);
            expect(containerHeight).toBeCloseTo(1080, -1);
        });
    });
});