/**
 * SpeedTestWebSocketSdkNew.js
 * 
 * A modern WebSocket SDK for network speed testing
 * Based on the proven working implementation from speedtest-websocket-client-new.html
 * 
 * Features:
 * - Ping latency testing
 * - Download speed testing with real-time progress
 * - Upload speed testing with chunked data
 * - Full test sequence (ping + download + upload)
 * - Authentication token support
 * - Comprehensive error handling and debugging
 * - Perfect protocol alignment with websocket-server.js
 */

class SpeedTestWebSocketSdkNew {
    /**
     * Initialize the WebSocket Speed Test SDK
     * 
     * @param {string} serverUrl - WebSocket server URL (e.g., "ws://localhost:8090")
     * @param {Object} options - Configuration options
     * @param {string} options.authToken - Optional authentication token
     * @param {Object} options.headers - Optional additional headers
     * @param {boolean} options.debug - Enable debug logging (default: false)
     */
    constructor(serverUrl, options = {}) {
        this.serverUrl = serverUrl;
        this.authToken = options.authToken || null;
        this.headers = options.headers || {};
        this.debug = options.debug || false;
        
        // WebSocket connection
        this.ws = null;
        this.isConnected = false;
        this.testInProgress = false;
        this.currentRequestId = null;
        
        // Test timing
        this.pingStartTime = 0;
        this.downloadStartTime = 0;
        this.uploadStartTime = 0;
        
        // Download tracking
        this.receivedBytes = 0;
        this.totalBytes = 0;
        
        // Event handlers
        this.progressHandler = null;
        this.completionHandler = null;
        this.errorHandler = null;
        this.connectionHandler = null;
    }

    /**
     * Debug logging function
     */
    log(...args) {
        if (this.debug) {
            console.log('[SpeedTestSDK]', ...args);
        }
    }

    /**
     * Connect to the WebSocket server
     * 
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                resolve();
                return;
            }

            this.log('Connecting to:', this.serverUrl);
            
            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    this.log('WebSocket connected');
                    this.isConnected = true;
                    if (this.connectionHandler) {
                        this.connectionHandler({ connected: true });
                    }
                    resolve();
                };
                
                this.ws.onclose = () => {
                    this.log('WebSocket disconnected');
                    this.isConnected = false;
                    if (this.connectionHandler) {
                        this.connectionHandler({ connected: false });
                    }
                };
                
                this.ws.onerror = (error) => {
                    this.log('WebSocket error:', error);
                    this.isConnected = false;
                    if (this.errorHandler) {
                        this.errorHandler(new Error('WebSocket connection failed'));
                    }
                    reject(new Error('WebSocket connection failed'));
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(event);
                };
                
            } catch (error) {
                this.log('Connection error:', error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.testInProgress = false;
    }

    /**
     * Send a JSON message to the server
     * 
     * @param {Object} message - Message to send
     * @returns {boolean} - Success status
     */
    sendMessage(message) {
        if (!this.isConnected || !this.ws) {
            this.log('Cannot send message: Not connected');
            return false;
        }
        
        try {
            const jsonString = JSON.stringify(message);
            this.log('Sending message:', jsonString);
            
            if (this.ws.readyState !== WebSocket.OPEN) {
                this.log('WebSocket is not in OPEN state:', this.ws.readyState);
                return false;
            }
            
            this.ws.send(jsonString);
            return true;
        } catch (error) {
            this.log('Error sending message:', error);
            return false;
        }
    }

    /**
     * Send binary data chunk
     * 
     * @param {ArrayBuffer} chunk - Binary data chunk
     */
    sendChunk(chunk) {
        if (!this.isConnected || !this.ws) {
            this.log('Cannot send chunk: not connected');
            return false;
        }
        
        try {
            this.ws.send(chunk);
            // Track uploaded bytes for client-side calculation
            if (chunk instanceof ArrayBuffer) {
                this.uploadedBytes += chunk.byteLength;
            } else if (chunk instanceof Blob) {
                this.uploadedBytes += chunk.size;
            }
            return true;
        } catch (error) {
            this.log('Error sending chunk:', error);
            return false;
        }
    }

    /**
     * Handle incoming WebSocket messages
     * 
     * @param {MessageEvent} event - WebSocket message event
     */
    handleMessage(event) {
        try {
            // Handle binary data (download test)
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                this.handleBinaryMessage(event.data);
                return;
            }
            
            // Handle JSON messages
            const message = JSON.parse(event.data);
            this.log('Received message:', message);
            
            switch (message.type) {
                case 'connected':
                    this.handleConnected(message);
                    break;
                case 'pong':
                    this.handlePong(message);
                    break;
                case 'download_start':
                    this.handleDownloadStart(message);
                    break;
                case 'download_progress':
                    this.handleDownloadProgress(message);
                    break;
                case 'download_complete':
                    this.handleDownloadComplete(message);
                    break;
                case 'upload_ready':
                    this.handleUploadReady(message);
                    break;
                case 'upload_progress':
                    this.handleUploadProgress(message);
                    break;
                case 'upload_result':
                    this.handleUploadResult(message);
                    break;
                case 'upload_complete_ack':
                    this.handleUploadCompleteAck(message);
                    break;
                case 'error':
                    this.handleError(message);
                    break;
                default:
                    this.log('Unknown message type:', message.type);
            }
        } catch (error) {
            this.log('Error handling message:', error);
            if (this.errorHandler) {
                this.errorHandler(new Error('Message parsing failed'));
            }
        }
    }

    /**
     * Handle binary download data
     * 
     * @param {ArrayBuffer|Blob} data - Binary data
     */
    async handleBinaryMessage(data) {
        let size;
        if (data instanceof ArrayBuffer) {
            size = data.byteLength;
        } else if (data instanceof Blob) {
            size = data.size;
        } else {
            this.log('Unknown binary data type');
            return;
        }
        
        this.receivedBytes += size;
        this.log(`Received binary chunk: ${size} bytes (total: ${this.receivedBytes}/${this.totalBytes})`);
        
        // Update progress if handler is set
        if (this.progressHandler && this.totalBytes > 0) {
            const progress = Math.min((this.receivedBytes / this.totalBytes) * 100, 100);
            this.progressHandler(progress);
        }
    }

    /**
     * Message type handlers
     */
    handleConnected(message) {
        this.log('Connected to server:', message);
        if (this.connectionHandler) {
            this.connectionHandler({ connected: true, message });
        }
    }

    handlePong(message) {
        const pingTime = Date.now() - this.pingStartTime;
        this.log(`Ping result: ${pingTime}ms`);
        
        if (this.completionHandler) {
            this.completionHandler({ pingTime });
        }
    }

    handleDownloadStart(message) {
        this.downloadStartTime = Date.now();
        this.receivedBytes = 0;
        this.totalBytes = message.totalSize || 0;
        this.log(`Download started: ${message.totalChunks} chunks, ${this.totalBytes} bytes`);
        
        if (this.progressHandler) {
            this.progressHandler(0);
        }
    }

    handleDownloadProgress(message) {
        const progress = Math.min(message.progress || 0, 100);
        this.log(`Download progress: ${progress}%`);
        
        if (this.progressHandler) {
            this.progressHandler(progress);
        }
    }

    handleDownloadComplete(message) {
        const endTime = Date.now();
        const downloadTime = (endTime - this.downloadStartTime) / 1000; // seconds
        
        // Client-side calculation
        const totalBytes = message.totalBytes || this.receivedBytes;
        const bitsPerSecond = downloadTime > 0 ? (totalBytes * 8) / downloadTime : 0;
        
        this.log(`Download complete: ${this.formatSpeed(bitsPerSecond)} (${downloadTime}s)`);
        
        if (this.completionHandler) {
            this.completionHandler({ downloadSpeed: bitsPerSecond });
        }
    }

    handleUploadReady(message) {
        this.log('Upload ready, starting data transmission');
        this.uploadStartTime = Date.now();
        this.uploadedBytes = 0;
        
        if (this.progressHandler) {
            this.progressHandler(0);
        }
        
        this.sendUploadData();
    }

    handleUploadProgress(message) {
        const progress = Math.min(message.progress || 0, 100);
        this.log(`Upload progress: ${progress}%`);
        
        if (this.progressHandler) {
            this.progressHandler(progress);
        }
    }

    handleUploadResult(message) {
        const endTime = Date.now();
        const uploadTime = (endTime - this.uploadStartTime) / 1000; // seconds
        
        // Client-side calculation
        const totalBytes = message.totalBytes || this.uploadedBytes;
        const bitsPerSecond = uploadTime > 0 ? (totalBytes * 8) / uploadTime : 0;
        
        this.log(`Upload result: ${this.formatSpeed(bitsPerSecond)}`);
        
        if (this.completionHandler) {
            this.completionHandler({ uploadSpeed: bitsPerSecond });
        }
    }

    handleUploadCompleteAck(message) {
        this.log('Upload completion acknowledged');
        // This is just an acknowledgment, no action needed
    }

    handleError(message) {
        const errorMsg = message.message || 'Unknown error';
        this.log('Server error:', errorMsg);
        
        if (this.errorHandler) {
            this.errorHandler(new Error(errorMsg));
        }
    }

    /**
     * Send upload data in chunks
     */
    sendUploadData() {
        // Optimized chunk size: 64KB chunks (maximum for crypto.getRandomValues)
        const chunkSize = 65536; // 64KB chunks - crypto API limit
        const totalSize = 512 * 1024; // 0.5MB total
        const numChunks = Math.ceil(totalSize / chunkSize);
        
        this.log(`Sending upload data: ${numChunks} chunks of ${chunkSize} bytes`);
        
        // Pre-generate all chunks at once for better performance
        const chunks = [];
        let remainingBytes = totalSize;
        
        // Create all chunks upfront
        for (let i = 0; i < numChunks; i++) {
            const actualChunkSize = Math.min(chunkSize, remainingBytes);
            const data = new Uint8Array(actualChunkSize);
            
            // Fill with random data safely (respecting the 64KB limit)
            this.fillRandomData(data);
            
            chunks.push(data.buffer);
            remainingBytes -= actualChunkSize;
        }
        
        // Send chunks with minimal delay
        let chunkIndex = 0;
        const sendNextChunk = () => {
            if (chunkIndex >= chunks.length || !this.isConnected) return;
            
            // Send the chunk as binary data
            this.ws.send(chunks[chunkIndex]);
            
            this.log(`Sent upload chunk ${chunkIndex + 1}/${numChunks} (${chunks[chunkIndex].byteLength} bytes)`);
            
            // Schedule next chunk with minimal delay
            chunkIndex++;
            if (chunkIndex < chunks.length) {
                setTimeout(sendNextChunk, 5); // 5ms delay between chunks for better network utilization
            }
        };
        
        // Start sending chunks
        sendNextChunk();
    }

    /**
     * Generate a unique request ID
     * 
     * @returns {string} - Random request ID
     */
    generateRequestId() {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * Format speed with appropriate units
     * 
     * @param {number} bitsPerSecond - Speed in bits per second
     * @returns {string} - Formatted speed string
     */
    formatSpeed(bitsPerSecond) {
        const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
        let speed = bitsPerSecond;
        let unitIndex = 0;
        
        while (speed >= 1024 && unitIndex < units.length - 1) {
            speed /= 1024;
            unitIndex++;
        }
        
        return `${speed.toFixed(2)} ${units[unitIndex]}`;
    }
    
    /**
     * Fill an array with random data safely, respecting the crypto API's 64KB limit
     * 
     * @param {Uint8Array} array - Array to fill with random data
     */
    fillRandomData(array) {
        const CRYPTO_CHUNK_SIZE = 65536; // 64KB - maximum size for crypto.getRandomValues()
        let offset = 0;
        
        while (offset < array.length) {
            const length = Math.min(CRYPTO_CHUNK_SIZE, array.length - offset);
            const chunk = new Uint8Array(length);
            
            // Generate random values for this chunk
            window.crypto.getRandomValues(chunk);
            
            // Copy the chunk into the main array
            array.set(chunk, offset);
            offset += length;
        }
    }

    /**
     * Test ping latency
     * 
     * @param {Object} options - Test options
     * @param {function} options.onProgress - Progress callback (optional)
     * @param {function} options.onError - Error callback (optional)
     * @returns {Promise<number>} - Ping time in milliseconds
     */
    async testPing(options = {}) {
        if (this.testInProgress) {
            throw new Error('A test is already in progress');
        }
        
        this.testInProgress = true;
        this.progressHandler = options.onProgress;
        this.errorHandler = options.onError;
        
        try {
            await this.connect();
            
            return new Promise((resolve, reject) => {
                this.completionHandler = (result) => {
                    this.testInProgress = false;
                    
                    if (result.pingTime !== undefined) {
                        resolve(result.pingTime);
                    } else {
                        reject(new Error('Invalid ping response'));
                    }
                };
                
                this.pingStartTime = Date.now();
                this.currentRequestId = this.generateRequestId();
                
                if (!this.sendMessage({
                    type: 'ping',
                    requestId: this.currentRequestId
                })) {
                    this.testInProgress = false;
                    reject(new Error('Failed to send ping request'));
                }
            });
        } catch (error) {
            this.testInProgress = false;
            throw error;
        }
    }

    /**
     * Test download speed
     * 
     * @param {Object} options - Test options
     * @param {function} options.onProgress - Progress callback (0-100)
     * @param {function} options.onError - Error callback (optional)
     * @param {number} options.size - Download size in bytes (default: 1MB)
     * @returns {Promise<number>} - Download speed in bits per second
     */
    async testDownloadSpeed(options = {}) {
        if (this.testInProgress) {
            throw new Error('A test is already in progress');
        }
        
        this.testInProgress = true;
        this.progressHandler = options.onProgress;
        this.errorHandler = options.onError;
        
        try {
            await this.connect();
            
            return new Promise((resolve, reject) => {
                this.completionHandler = (result) => {
                    this.testInProgress = false;
                    
                    if (result.downloadSpeed !== undefined) {
                        resolve(result.downloadSpeed);
                    } else {
                        reject(new Error('Invalid download response'));
                    }
                };
                
                this.currentRequestId = this.generateRequestId();
                const size = options.size || (512 * 1024); // Default 0.5MB
                
                if (!this.sendMessage({
                    type: 'download',
                    size: size,
                    requestId: this.currentRequestId
                })) {
                    this.testInProgress = false;
                    reject(new Error('Failed to send download request'));
                }
            });
        } catch (error) {
            this.testInProgress = false;
            throw error;
        }
    }

    /**
     * Test upload speed
     * 
     * @param {Object} options - Test options
     * @param {function} options.onProgress - Progress callback (0-100)
     * @param {function} options.onError - Error callback (optional)
     * @param {number} options.size - Upload size in bytes (default: 1MB)
     * @returns {Promise<number>} - Upload speed in bits per second
     */
    async testUploadSpeed(options = {}) {
        if (this.testInProgress) {
            throw new Error('A test is already in progress');
        }
        
        this.testInProgress = true;
        this.progressHandler = options.onProgress;
        this.errorHandler = options.onError;
        
        try {
            await this.connect();
            
            return new Promise((resolve, reject) => {
                this.completionHandler = (result) => {
                    this.testInProgress = false;
                    
                    if (result.uploadSpeed !== undefined) {
                        resolve(result.uploadSpeed);
                    } else {
                        reject(new Error('Invalid upload response'));
                    }
                };
                
                this.currentRequestId = this.generateRequestId();
                const size = options.size || (512 * 1024); // Default 1MB
                
                if (!this.sendMessage({
                    type: 'upload',
                    size: size,
                    requestId: this.currentRequestId
                })) {
                    this.testInProgress = false;
                    reject(new Error('Failed to send upload request'));
                }
            });
        } catch (error) {
            this.testInProgress = false;
            throw error;
        }
    }

    /**
     * Run a full speed test (ping + download + upload)
     * 
     * @param {Object} options - Test options
     * @param {function} options.onProgress - Progress callback (0-100)
     * @param {function} options.onError - Error callback (optional)
     * @param {number} options.size - Test size in bytes (default: 1MB)
     * @returns {Promise<Object>} - Test results { pingTime, downloadSpeed, uploadSpeed }
     */
    async runFullTest(options = {}) {
        if (this.testInProgress) {
            throw new Error('A test is already in progress');
        }
        
        const results = {};
        const onProgress = options.onProgress;
        
        try {
            // Test ping (0-33%)
            if (onProgress) onProgress(0);
            results.pingTime = await this.testPing({
                onError: options.onError
            });
            
            // Test download (33-66%)
            if (onProgress) onProgress(33);
            results.downloadSpeed = await this.testDownloadSpeed({
                onProgress: (progress) => {
                    if (onProgress) onProgress(33 + (progress * 0.33));
                },
                onError: options.onError,
                size: options.size
            });
            
            // Test upload (66-100%)
            if (onProgress) onProgress(66);
            results.uploadSpeed = await this.testUploadSpeed({
                onProgress: (progress) => {
                    if (onProgress) onProgress(66 + (progress * 0.34));
                },
                onError: options.onError,
                size: options.size
            });
            
            if (onProgress) onProgress(100);
            return results;
            
        } catch (error) {
            if (options.onError) {
                options.onError(error);
            }
            throw error;
        }
    }

    /**
     * Set connection event handler
     * 
     * @param {function} handler - Connection event handler
     */
    onConnection(handler) {
        this.connectionHandler = handler;
    }

    /**
     * Check if currently connected
     * 
     * @returns {boolean} - Connection status
     */
    isConnectedToServer() {
        return this.isConnected;
    }

    /**
     * Check if test is in progress
     * 
     * @returns {boolean} - Test status
     */
    isTestInProgress() {
        return this.testInProgress;
    }
}

// Export for ES6 modules
export default SpeedTestWebSocketSdkNew;

// Export for CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpeedTestWebSocketSdkNew;
}

/**
 * Example Usage:
 * 
 * // Initialize the SDK
 * const speedTest = new SpeedTestWebSocketSdkNew('ws://localhost:8090', {
 *     authToken: 'your-token-here', // Optional
 *     debug: true // Enable debug logging
 * });
 * 
 * // Test ping
 * try {
 *     const pingTime = await speedTest.testPing();
 *     console.log(`Ping: ${pingTime} ms`);
 * } catch (error) {
 *     console.error('Ping test failed:', error);
 * }
 * 
 * // Test download speed with progress
 * try {
 *     const downloadSpeed = await speedTest.testDownloadSpeed({
 *         onProgress: (progress) => console.log(`Download: ${progress}%`)
 *     });
 *     console.log(`Download Speed: ${speedTest.formatSpeed(downloadSpeed)}`);
 * } catch (error) {
 *     console.error('Download test failed:', error);
 * }
 * 
 * // Test upload speed with progress
 * try {
 *     const uploadSpeed = await speedTest.testUploadSpeed({
 *         onProgress: (progress) => console.log(`Upload: ${progress}%`)
 *     });
 *     console.log(`Upload Speed: ${speedTest.formatSpeed(uploadSpeed)}`);
 * } catch (error) {
 *     console.error('Upload test failed:', error);
 * }
 * 
 * // Run full test with progress
 * try {
 *     const results = await speedTest.runFullTest({
 *         onProgress: (progress) => console.log(`Test Progress: ${progress}%`)
 *     });
 *     console.log('Full Test Results:');
 *     console.log(`  Ping: ${results.pingTime} ms`);
 *     console.log(`  Download: ${speedTest.formatSpeed(results.downloadSpeed)}`);
 *     console.log(`  Upload: ${speedTest.formatSpeed(results.uploadSpeed)}`);
 * } catch (error) {
 *     console.error('Full test failed:', error);
 * }
 * 
 * // Clean up
 * speedTest.disconnect();
 */
