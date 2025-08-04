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
    console.log('DEBUG: Message type:', typeof message);
    console.log('DEBUG: Is Buffer:', Buffer.isBuffer(message));
    
    // Convert message to string to check if it's JSON or binary
    let messageStr;
    try {
      messageStr = message.toString('utf8');
      console.log('DEBUG: Message as string (first 100 chars):', messageStr.substring(0, 100));
    } catch (err) {
      console.error('DEBUG: Error converting message to string:', err);
      return;
    }
    
    // Check if this is a JSON message (starts and ends with braces)
    if (messageStr.trim().startsWith('{') && messageStr.trim().endsWith('}')) {
      console.log('DEBUG: JSON message detected, processing as text');
      // Handle JSON messages
    } else {
      console.log('DEBUG: Binary data detected, length:', message.length);
      // Handle binary data for upload test
      handleUploadChunk(ws, message);
      return;
    }
    
    console.log('DEBUG: Processing JSON text message:', messageStr);
    
    // Direct ping handling with immediate response
    if (messageStr.includes('"type":"ping"')) {
      console.log('DEBUG: Detected ping message via string matching');
      try {
        const msg = JSON.parse(messageStr);
        const requestId = msg.requestId;
        
        console.log('DEBUG: Creating pong response for requestId:', requestId);
        // Create pong response
        const pongResponse = {
          type: 'pong',
          timestamp: Date.now(),
          requestId: requestId
        };
        
        // Log the response
        console.log(`DEBUG: Sending pong response: ${JSON.stringify(pongResponse)}`);
        
        // Send the response immediately
        ws.send(JSON.stringify(pongResponse));
        console.log('DEBUG: Pong response sent successfully');
        return;
      } catch (err) {
        console.error('DEBUG: Error handling ping message:', err);
        return;
      }
    }
    
    // Handle other JSON messages
    try {
      console.log('DEBUG: Attempting to parse JSON message:', messageStr);
      const msg = JSON.parse(messageStr);
      console.log('DEBUG: Parsed message:', JSON.stringify(msg));
      
      // Extract message type and request ID
      const msgType = msg.type;
      const requestId = msg.requestId;
      
      console.log(`DEBUG: Processing message type: ${msgType}, requestId: ${requestId}`);
      
      // Route message to appropriate handler
      switch(msgType) {
        case 'download':
          console.log('DEBUG: Download message received with ID:', requestId);
          handleDownload(ws, msg);
          break;
          
        case 'upload':
          console.log('DEBUG: Upload message received with ID:', requestId);
          handleUpload(ws, msg);
          break;
          
        case 'upload_complete':
          console.log('DEBUG: Upload complete message received with ID:', requestId);
          // Send acknowledgment for upload completion
          ws.send(JSON.stringify({
            type: 'upload_complete_ack',
            requestId: requestId,
            timestamp: Date.now()
          }));
          break;
          
        case 'full_test':
          console.log('DEBUG: Full test message received with ID:', requestId);
          handleFullTest(ws, msg);
          break;
          
        default:
          console.log('DEBUG: Unknown message type:', msgType);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown command: ${msgType}`
          }));
      }
    } catch (error) {
      console.error('DEBUG: Error processing JSON message:', error, 'Raw message:', messageStr);
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
  console.log(`Received ping request with ID: ${msg.requestId}`);
  console.log('WebSocket state:', ws.readyState);
  
  // Create pong response
  const pongResponse = {
    type: 'pong',
    timestamp: Date.now(),
    requestId: msg.requestId
  };
  
  // Log the response
  console.log(`Sending pong response: ${JSON.stringify(pongResponse)}`);
  
  try {
    // Send the response
    ws.send(JSON.stringify(pongResponse), (err) => {
      if (err) {
        console.error(`Error sending pong response: ${err}`);
      } else {
        console.log('Pong response sent successfully');
      }
    });
  } catch (error) {
    console.error('Exception sending pong response:', error);
  }
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
  // If no upload tracker exists, this might be a browser artifact or other unexpected binary data
  // Just log it and ignore it rather than treating it as an error
  if (!ws.uploadTracker) {
    console.log('Received binary data but no active upload test - ignoring (likely browser WebSocket artifact)');
    return;
  }
  
  // Add bytes to the tracker
  ws.uploadTracker.receivedBytes += data.length;
  ws.uploadTracker.bytesReceived = ws.uploadTracker.receivedBytes; // Keep both properties in sync
  
  // Calculate progress
  const progress = Math.min((ws.uploadTracker.receivedBytes / ws.uploadTracker.totalSize) * 100, 100);
  
  // Send progress update every 10%
  if (progress >= ws.uploadTracker.lastProgressUpdate + 10 || progress >= 100) {
    ws.uploadTracker.lastProgressUpdate = Math.floor(progress / 10) * 10;
    
    ws.send(JSON.stringify({
      type: 'upload_progress',
      progress: progress,
      requestId: ws.uploadTracker.requestId
    }));
  }
  // If all chunks received, send result
  if (ws.uploadTracker.receivedBytes >= ws.uploadTracker.totalSize) {
    // Calculate results
    const duration = (Date.now() - ws.uploadTracker.startTime) / 1000; // seconds
    const bytesPerSecond = ws.uploadTracker.receivedBytes / duration;
    const bitsPerSecond = bytesPerSecond * 8;
    
    console.log('Upload complete:', ws.uploadTracker.receivedBytes, 'bytes received');
    
    // Send results
    ws.send(JSON.stringify({
      type: 'upload_result',
      bytesReceived: ws.uploadTracker.receivedBytes,
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
    receivedBytes: 0,
    totalSize: msg.size || 1024 * 1024, // Default to 1MB if not specified
    lastProgressUpdate: 0,
    requestId: msg.requestId
  };
  
  console.log(`Starting upload test with ID: ${msg.requestId}, size: ${uploadTracker.totalSize} bytes`);
  
  // Store tracker in the WebSocket object
  ws.uploadTracker = uploadTracker;
  
  // Send ready message
  ws.send(JSON.stringify({
    type: 'upload_ready',
    timestamp: Date.now(),
    requestId: msg.requestId
  }));
  
  console.log('Upload ready message sent');
  
  // Upload handling is now done by the binary message handler
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
