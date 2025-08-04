/**
 * SpeedTestWebSocketSdk.js
 * 
 * A React Native SDK for WebSocket-based network speed testing
 * This SDK provides methods to test ping, download speed, and upload speed using WebSockets.
 * It supports authentication via token headers and provides real-time progress updates.
 */

class SpeedTestWebSocketSdk {
  /**
   * Initialize the SpeedTestWebSocketSdk
   * 
   * @param {string} serverUrl - The WebSocket server URL (e.g., "ws://example.com/ws")
   * @param {Object} options - Configuration options
   * @param {string} options.authToken - Optional authentication token
   * @param {Object} options.headers - Optional additional headers
   */
  constructor(serverUrl, options = {}) {
    this.serverUrl = serverUrl;
    this.authToken = options.authToken || null;
    this.headers = options.headers || {};
    
    this.webSocket = null;
    this.isConnected = false;
    this.testInProgress = false;
    this.currentRequestId = null;
    
    this.pingStartTime = 0;
    this.downloadStartTime = 0;
    this.uploadStartTime = 0;
    
    this.totalBytes = 0;
    this.receivedBytes = 0;
    
    this.progressHandler = null;
    this.completionHandler = null;
    
    this.messageHandlers = {
      connected: this.handleConnected.bind(this),
      pong: this.handlePong.bind(this),
      download_start: this.handleDownloadStart.bind(this),
      download_progress: this.handleDownloadProgress.bind(this),
      download_complete: this.handleDownloadComplete.bind(this),
      upload_ready: this.handleUploadReady.bind(this),
      upload_progress: this.handleUploadProgress.bind(this),
      upload_result: this.handleUploadResult.bind(this),
      error: this.handleError.bind(this)
    };
  }
  
  /**
   * Test ping to the server
   * 
   * @param {Object} options - Test options
   * @returns {Promise<number>} - Ping time in milliseconds
   */
  async testPing(options = {}) {
    if (this.testInProgress) {
      throw new Error('A test is already in progress');
    }
    
    this.testInProgress = true;
    this.pingStartTime = Date.now();
    this.currentRequestId = this.generateRequestId();
    
    try {
      await this.connectWebSocket();
      
      return new Promise((resolve, reject) => {
        this.completionHandler = (result) => {
          this.testInProgress = false;
          
          if (result.error) {
            reject(new Error(result.error));
          } else if (result.pingTime !== undefined) {
            resolve(result.pingTime);
          } else {
            reject(new Error('Invalid response'));
          }
        };
        
        this.sendMessage({
          type: 'ping',
          requestId: this.currentRequestId
        });
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
   * @returns {Promise<number>} - Download speed in bits per second
   */
  async testDownloadSpeed(options = {}) {
    if (this.testInProgress) {
      throw new Error('A test is already in progress');
    }
    
    this.testInProgress = true;
    this.downloadStartTime = Date.now();
    this.currentRequestId = this.generateRequestId();
    this.progressHandler = options.onProgress;
    
    try {
      await this.connectWebSocket();
      
      return new Promise((resolve, reject) => {
        this.completionHandler = (result) => {
          this.testInProgress = false;
          
          if (result.error) {
            reject(new Error(result.error));
          } else if (result.downloadSpeed !== undefined) {
            resolve(result.downloadSpeed);
          } else {
            reject(new Error('Invalid response'));
          }
        };
        
        this.sendMessage({
          type: 'download',
          chunkSize: options.chunkSize || 102400, // 100KB chunks
          requestId: this.currentRequestId
        });
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
   * @returns {Promise<number>} - Upload speed in bits per second
   */
  async testUploadSpeed(options = {}) {
    if (this.testInProgress) {
      throw new Error('A test is already in progress');
    }
    
    this.testInProgress = true;
    this.uploadStartTime = Date.now();
    this.currentRequestId = this.generateRequestId();
    this.progressHandler = options.onProgress;
    
    try {
      await this.connectWebSocket();
      
      return new Promise((resolve, reject) => {
        this.completionHandler = (result) => {
          this.testInProgress = false;
          
          if (result.error) {
            reject(new Error(result.error));
          } else if (result.uploadSpeed !== undefined) {
            resolve(result.uploadSpeed);
          } else {
            reject(new Error('Invalid response'));
          }
        };
        
        this.sendMessage({
          type: 'upload',
          totalChunks: options.totalChunks || 10,
          requestId: this.currentRequestId
        });
      });
    } catch (error) {
      this.testInProgress = false;
      throw error;
    }
  }
  
  /**
   * Run a full speed test (ping, download, upload)
   * 
   * @param {Object} options - Test options
   * @param {function} options.onProgress - Progress callback (0-100)
   * @returns {Promise<Object>} - Test results with ping, download, and upload speeds
   */
  async runFullTest(options = {}) {
    if (this.testInProgress) {
      throw new Error('A test is already in progress');
    }
    
    this.testInProgress = true;
    this.currentRequestId = this.generateRequestId();
    this.progressHandler = options.onProgress;
    
    try {
      await this.connectWebSocket();
      
      return new Promise((resolve, reject) => {
        this.completionHandler = (result) => {
          this.testInProgress = false;
          
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve({
              pingTime: result.pingTime,
              downloadSpeed: result.downloadSpeed,
              uploadSpeed: result.uploadSpeed
            });
          }
        };
        
        this.sendMessage({
          type: 'full_test',
          chunkSize: options.chunkSize || 102400, // 100KB chunks for download
          totalChunks: options.totalChunks || 10, // 10 chunks for upload
          requestId: this.currentRequestId
        });
      });
    } catch (error) {
      this.testInProgress = false;
      throw error;
    }
  }
  
  /**
   * Close the WebSocket connection
   */
  disconnect() {
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
      this.isConnected = false;
    }
  }
  
  /**
   * Connect to the WebSocket server
   * 
   * @returns {Promise<void>}
   */
  async connectWebSocket() {
    // If already connected, just return
    if (this.isConnected && this.webSocket) {
      return Promise.resolve();
    }
    
    // Create URL with auth token if provided
    let url = this.serverUrl;
    if (this.authToken) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}token=${encodeURIComponent(this.authToken)}`;
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.webSocket = new WebSocket(url);
        
        this.webSocket.onopen = () => {
          this.isConnected = true;
          resolve();
        };
        
        this.webSocket.onclose = () => {
          this.isConnected = false;
          
          // If we're in the middle of a test, fail it
          if (this.testInProgress && this.completionHandler) {
            this.completionHandler({ error: 'Connection closed' });
          }
        };
        
        this.webSocket.onerror = (error) => {
          if (!this.isConnected) {
            reject(new Error('Connection failed'));
          } else if (this.testInProgress && this.completionHandler) {
            this.completionHandler({ error: 'WebSocket error' });
          }
        };
        
        this.webSocket.onmessage = this.handleMessage.bind(this);
        
        // Set a timeout for connection
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Send a message to the WebSocket server
   * 
   * @param {Object} message - The message to send
   */
  sendMessage(message) {
    if (!this.isConnected || !this.webSocket) {
      if (this.completionHandler) {
        this.completionHandler({ error: 'Not connected' });
      }
      return;
    }
    
    try {
      const jsonString = JSON.stringify(message);
      this.webSocket.send(jsonString);
    } catch (error) {
      if (this.completionHandler) {
        this.completionHandler({ error: 'Failed to send message' });
      }
    }
  }
  
  /**
   * Send binary data to the WebSocket server
   * 
   * @param {ArrayBuffer} data - The data to send
   */
  sendData(data) {
    if (!this.isConnected || !this.webSocket) {
      if (this.completionHandler) {
        this.completionHandler({ error: 'Not connected' });
      }
      return;
    }
    
    try {
      this.webSocket.send(data);
    } catch (error) {
      if (this.completionHandler) {
        this.completionHandler({ error: 'Failed to send data' });
      }
    }
  }
  
  /**
   * Handle incoming WebSocket messages
   * 
   * @param {MessageEvent} event - The message event
   */
  handleMessage(event) {
    // Check if it's a binary message (for download test)
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
      this.handleBinaryMessage(event.data);
      return;
    }
    
    // Parse JSON message
    try {
      const message = JSON.parse(event.data);
      const messageType = message.type;
      
      // Check if this message is for our current request
      const requestId = message.requestId;
      if (this.currentRequestId && requestId && this.currentRequestId !== requestId) {
        // This message is not for our current request
        return;
      }
      
      // Call the appropriate handler
      if (messageType && this.messageHandlers[messageType]) {
        this.messageHandlers[messageType](message);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
  
  /**
   * Handle binary messages from the WebSocket server
   * 
   * @param {ArrayBuffer|Blob} data - The binary data
   */
  async handleBinaryMessage(data) {
    // Convert Blob to ArrayBuffer if needed
    let arrayBuffer = data;
    if (data instanceof Blob) {
      arrayBuffer = await data.arrayBuffer();
    }
    
    // Update received bytes for download test
    this.receivedBytes += arrayBuffer.byteLength;
    
    // Calculate progress if total bytes is known
    if (this.totalBytes > 0 && this.progressHandler) {
      const progress = (this.receivedBytes / this.totalBytes) * 100;
      this.progressHandler(progress);
    }
  }
  
  // Message handlers
  
  handleConnected(message) {
    this.isConnected = true;
    console.log('Connected to server:', message);
  }
  
  handlePong(message) {
    const pingTime = Date.now() - this.pingStartTime;
    if (this.completionHandler) {
      this.completionHandler({ pingTime });
    }
  }
  
  handleDownloadStart(message) {
    this.downloadStartTime = Date.now();
    this.totalBytes = message.totalSize || 0;
    this.receivedBytes = 0;
  }
  
  handleDownloadProgress(message) {
    if (this.progressHandler && message.progress) {
      this.progressHandler(message.progress);
    }
  }
  
  handleDownloadComplete(message) {
    const downloadTime = (Date.now() - this.downloadStartTime) / 1000; // seconds
    const totalBytes = message.totalBytes || this.receivedBytes;
    const bytesPerSecond = totalBytes / downloadTime;
    const bitsPerSecond = bytesPerSecond * 8;
    
    if (this.completionHandler) {
      this.completionHandler({ downloadSpeed: bitsPerSecond });
    }
  }
  
  handleUploadReady(message) {
    this.uploadStartTime = Date.now();
    this.sendUploadData();
  }
  
  handleUploadProgress(message) {
    if (this.progressHandler && message.progress) {
      this.progressHandler(message.progress);
    }
  }
  
  handleUploadResult(message) {
    if (this.completionHandler && message.bitsPerSecond) {
      this.completionHandler({ uploadSpeed: message.bitsPerSecond });
    }
  }
  
  handleError(message) {
    const errorMessage = message.message || 'Unknown error';
    if (this.completionHandler) {
      this.completionHandler({ error: errorMessage });
    }
  }
  
  /**
   * Send test data for upload test
   */
  sendUploadData() {
    const chunkSize = 102400; // 100KB
    const chunks = 10;
    
    for (let i = 0; i < chunks; i++) {
      setTimeout(() => {
        if (!this.isConnected) return;
        
        // Create random data
        const data = new ArrayBuffer(chunkSize);
        const view = new Uint8Array(data);
        for (let j = 0; j < chunkSize; j++) {
          view[j] = Math.floor(Math.random() * 256);
        }
        
        // Send the chunk
        this.sendData(data);
        
        // Update progress
        if (this.progressHandler) {
          const progress = ((i + 1) / chunks) * 100;
          this.progressHandler(progress);
        }
        
        // If last chunk, send completion message
        if (i === chunks - 1) {
          setTimeout(() => {
            this.sendMessage({
              type: 'upload_complete',
              requestId: this.currentRequestId
            });
          }, 100);
        }
      }, i * 200);
    }
  }
  
  /**
   * Generate a random request ID
   * 
   * @returns {string} - A random string ID
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
  static formatSpeed(bitsPerSecond) {
    const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    let speed = bitsPerSecond;
    let unitIndex = 0;
    
    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }
    
    return `${speed.toFixed(2)} ${units[unitIndex]}`;
  }
}

export default SpeedTestWebSocketSdk;

/**
 * Example usage:
 * 
 * import SpeedTestWebSocketSdk from './SpeedTestWebSocketSdk';
 * 
 * // Initialize the SDK
 * const speedTest = new SpeedTestWebSocketSdk('ws://example.com/ws', {
 *   authToken: 'your-auth-token' // Optional
 * });
 * 
 * // Test ping
 * speedTest.testPing()
 *   .then(pingTime => console.log(`Ping: ${pingTime} ms`))
 *   .catch(error => console.error('Ping test failed:', error));
 * 
 * // Test download speed
 * speedTest.testDownloadSpeed({
 *   onProgress: progress => console.log(`Download progress: ${progress}%`)
 * })
 *   .then(speed => console.log(`Download speed: ${SpeedTestWebSocketSdk.formatSpeed(speed)}`))
 *   .catch(error => console.error('Download test failed:', error));
 * 
 * // Test upload speed
 * speedTest.testUploadSpeed({
 *   onProgress: progress => console.log(`Upload progress: ${progress}%`)
 * })
 *   .then(speed => console.log(`Upload speed: ${SpeedTestWebSocketSdk.formatSpeed(speed)}`))
 *   .catch(error => console.error('Upload test failed:', error));
 * 
 * // Run full test
 * speedTest.runFullTest({
 *   onProgress: progress => console.log(`Test progress: ${progress}%`)
 * })
 *   .then(results => {
 *     console.log(`Ping: ${results.pingTime} ms`);
 *     console.log(`Download: ${SpeedTestWebSocketSdk.formatSpeed(results.downloadSpeed)}`);
 *     console.log(`Upload: ${SpeedTestWebSocketSdk.formatSpeed(results.uploadSpeed)}`);
 *   })
 *   .catch(error => console.error('Speed test failed:', error));
 */
