/**
 * WebSocket Server for Speed Testing
 * 
 * This server provides WebSocket endpoints for ping, download, and upload speed tests.
 * It runs alongside the REST API to provide real-time speed testing capabilities.
 */

const WebSocket = require('ws');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
let envFile = '.env';
if (process.env.ENV) {
  const envSpecificFile = `.env.${process.env.ENV}`;
  if (fs.existsSync(envSpecificFile)) {
    envFile = envSpecificFile;
    console.log(`Using environment file: ${envSpecificFile}`);
  }
}
dotenv.config({ path: envFile });

// Configuration
const PORT = process.env.WS_PORT || 8090;
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';
const TOKEN_HEADER = process.env.TOKEN_HEADER || 'Authorization';
const TOKEN_PREFIX = process.env.TOKEN_PREFIX || 'Bearer ';

// Create a 1MB test file in memory for download tests
const TEST_FILE_SIZE = 1024 * 1024; // 1MB
const testData = crypto.randomBytes(TEST_FILE_SIZE);

// Create WebSocket server
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket Speed Test Server running on port ${PORT}`);
console.log(`Authentication ${ENABLE_AUTH ? 'enabled' : 'disabled'}`);

// Connection handler
wss.on('connection', function connection(ws, req) {
  // Client information
  const clientIp = req.socket.remoteAddress;
  console.log(`New connection from ${clientIp}`);
  
  // Authentication check
  if (ENABLE_AUTH) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    
    if (!token || !validateToken(token)) {
      console.log(`Authentication failed for ${clientIp}`);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Authentication failed' 
      }));
      ws.close();
      return;
    }
  }
  
  // Send welcome message
  ws.send(JSON.stringify({ 
    type: 'connected',
    message: 'Connected to Speed Test WebSocket Server',
    authEnabled: ENABLE_AUTH
  }));
  
  // Message handler
  ws.on('message', function incoming(message) {
    // Check if message is binary data (for upload test)
    if (Buffer.isBuffer(message)) {
      // Handle binary data for upload test
      handleUploadChunk(ws, message);
      return;
    }
    
    try {
      const msg = JSON.parse(message);
      
      switch(msg.type) {
        case 'ping':
          handlePing(ws, msg);
          break;
          
        case 'download':
          handleDownload(ws, msg);
          break;
          
        case 'upload':
          handleUpload(ws, msg);
          break;
          
        case 'full_test':
          handleFullTest(ws, msg);
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown command: ${msg.type}`
          }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Close handler
  ws.on('close', function() {
    console.log(`Connection closed from ${clientIp}`);
  });
});

/**
 * Handle ping test
 */
function handlePing(ws, msg) {
  // Simply echo back with timestamp for client to calculate RTT
  ws.send(JSON.stringify({
    type: 'pong',
    timestamp: Date.now(),
    requestId: msg.requestId
  }));
}

/**
 * Handle download test
 */
function handleDownload(ws, msg) {
  const chunkSize = msg.chunkSize || 102400; // Default 100KB chunks
  const chunks = Math.ceil(TEST_FILE_SIZE / chunkSize);
  const totalSize = TEST_FILE_SIZE;
  
  console.log(`Starting download test: ${chunks} chunks of ${chunkSize} bytes`);
  
  // Send test info
  ws.send(JSON.stringify({
    type: 'download_start',
    totalChunks: chunks,
    chunkSize: chunkSize,
    totalSize: totalSize,
    requestId: msg.requestId
  }));
  
  // Send chunks with progress updates
  let sentChunks = 0;
  let sentBytes = 0;
  
  function sendNextChunk() {
    if (sentChunks >= chunks) {
      // Test complete
      ws.send(JSON.stringify({
        type: 'download_complete',
        totalBytes: sentBytes,
        timestamp: Date.now(),
        requestId: msg.requestId
      }));
      return;
    }
    
    const start = sentChunks * chunkSize;
    const end = Math.min(start + chunkSize, totalSize);
    const chunkData = testData.slice(start, end);
    
    // Send binary data
    ws.send(chunkData, { binary: true }, (err) => {
      if (err) {
        console.error('Error sending chunk:', err);
        return;
      }
      
      sentBytes += (end - start);
      sentChunks++;
      
      // Send progress update
      ws.send(JSON.stringify({
        type: 'download_progress',
        chunk: sentChunks,
        totalChunks: chunks,
        bytesSent: sentBytes,
        totalBytes: totalSize,
        progress: (sentChunks / chunks) * 100,
        requestId: msg.requestId
      }));
      
      // Schedule next chunk
      setTimeout(sendNextChunk, 0);
    });
  }
  
  // Start sending chunks
  sendNextChunk();
}

/**
 * Handle binary upload chunks
 */
function handleUploadChunk(ws, data) {
  // If no upload tracker exists, ignore the chunk
  if (!ws.uploadTracker) {
    console.log('Received binary data but no active upload test');
    return;
  }
  
  // Update tracker
  ws.uploadTracker.bytesReceived += data.length;
  ws.uploadTracker.chunksReceived++;
  
  // Calculate progress
  const progress = Math.min(100, Math.floor((ws.uploadTracker.chunksReceived / ws.uploadTracker.totalChunks) * 100));
  
  // Send progress update
  ws.send(JSON.stringify({
    type: 'upload_progress',
    chunk: ws.uploadTracker.chunksReceived,
    totalChunks: ws.uploadTracker.totalChunks,
    bytesReceived: ws.uploadTracker.bytesReceived,
    progress: progress,
    requestId: ws.uploadTracker.requestId
  }));
  
  // If all chunks received, send result
  if (ws.uploadTracker.chunksReceived >= ws.uploadTracker.totalChunks) {
    // Calculate results
    const duration = (Date.now() - ws.uploadTracker.startTime) / 1000; // seconds
    const bytesPerSecond = ws.uploadTracker.bytesReceived / duration;
    const bitsPerSecond = bytesPerSecond * 8;
    
    console.log('Upload complete:', ws.uploadTracker.bytesReceived, 'bytes received');
    
    // Send results
    ws.send(JSON.stringify({
      type: 'upload_result',
      bytesReceived: ws.uploadTracker.bytesReceived,
      duration: duration,
      bitsPerSecond: bitsPerSecond,
      timestamp: Date.now(),
      requestId: ws.uploadTracker.requestId
    }));
    
    // Clear upload tracker
    ws.uploadTracker = null;
  }
}

/**
 * Handle upload test
 */
function handleUpload(ws, msg) {
  // Initialize upload tracking
  const uploadTracker = {
    startTime: Date.now(),
    bytesReceived: 0,
    chunksReceived: 0,
    totalChunks: msg.totalChunks || 0,
    requestId: msg.requestId
  };
  
  // Store tracker in the WebSocket object
  ws.uploadTracker = uploadTracker;
  
  // Send ready message
  ws.send(JSON.stringify({
    type: 'upload_ready',
    timestamp: Date.now(),
    requestId: msg.requestId
  }));
  
  // Upload handling is now done by the global message handler
  // which detects binary data and routes it to handleUploadChunk
}

/**
 * Handle full test (ping, download, upload in sequence)
 * The client will control the sequence by sending individual test requests
 */
function handleFullTest(ws, msg) {
  console.log('Full test requested with requestId:', msg.requestId);
  
  // Send start message to client
  ws.send(JSON.stringify({
    type: 'full_test_start',
    timestamp: Date.now(),
    requestId: msg.requestId
  }));
  
  // Start with ping test - client will handle the sequence from here
  handlePing(ws, {
    type: 'ping',
    requestId: msg.requestId
  });
}

/**
 * Validate authentication token
 * In a real implementation, this would verify the token with Okta or other provider
 */
function validateToken(token) {
  if (!ENABLE_AUTH) return true;
  
  // For development, accept any non-empty token
  // In production, this would validate with Okta
  return token && token.length > 0;
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
