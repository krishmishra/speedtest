# Speed Test Server

A lightweight, Dockerized speed test server with RESTful endpoints and WebSocket support for ping, download, and upload tests, along with web and mobile client implementations.

## Overview

This project provides a complete solution for network speed testing, including:

- A lightweight Nginx-based Docker container for the server
- RESTful API endpoints for ping, upload, and download tests
- WebSocket server for real-time speed testing
- JavaScript clients for browser-based testing (REST and WebSocket)
- Mobile SDKs for iOS (Swift) and React Native integration
- Support for token-based authentication (optional)
- Environment-specific configurations (dev/prod)

## Server Implementation

### Features

- **Lightweight**: Uses OpenResty Alpine as the base image with Node.js for WebSocket support
- **Dual API Support**: 
  - RESTful endpoints for traditional HTTP-based testing
  - WebSocket server for real-time, low-overhead testing
- **CORS Support**: Configured for cross-origin requests
- **JWT Authentication**: Robust JWT validation using lua-resty-jwt at the edge
- **Environment Configuration**: Separate dev and prod settings

### API Endpoints

#### REST API

- **GET /ping**: Simple ping test that returns a JSON response
  - Response: `{"status":"ok"}`
  - Used to measure basic latency

- **GET /download/1MB.test**: Download test endpoint
  - Serves a 1MB random file for download speed testing
  - Add a cache buster to prevent caching: `/download/1MB.test?cacheBuster=123456`

- **POST /upload**: Upload test endpoint
  - Accepts a file upload (up to 2MB) for upload speed testing
  - Returns: `{"status":"ok","size":1048576}`

#### WebSocket API

- **WebSocket /ws**: WebSocket endpoint for real-time speed testing
  - Supports authentication via query parameter: `/ws?token=your-token`
  - Message-based protocol for all test types

##### WebSocket Messages

**Client to Server:**

- Ping Test:
  ```json
  {
    "type": "ping",
    "requestId": "unique-request-id"
  }
  ```

- Download Test:
  ```json
  {
    "type": "download",
    "chunkSize": 102400,
    "requestId": "unique-request-id"
  }
  ```

- Upload Test:
  ```json
  {
    "type": "upload",
    "totalChunks": 10,
    "requestId": "unique-request-id"
  }
  ```

- Full Test:
  ```json
  {
    "type": "full_test",
    "chunkSize": 102400,
    "totalChunks": 10,
    "requestId": "unique-request-id"
  }
  ```

- Upload Complete:
  ```json
  {
    "type": "upload_complete",
    "requestId": "unique-request-id"
  }
  ```

**Server to Client:**

- Connection:
  ```json
  {
    "type": "connected",
    "message": "Connected to Speed Test WebSocket Server",
    "authEnabled": true|false
  }
  ```

- Ping Response:
  ```json
  {
    "type": "pong",
    "timestamp": 1627984567890,
    "requestId": "unique-request-id"
  }
  ```

- Download Start:
  ```json
  {
    "type": "download_start",
    "totalChunks": 10,
    "chunkSize": 102400,
    "totalSize": 1048576,
    "requestId": "unique-request-id"
  }
  ```

- Download Progress:
  ```json
  {
    "type": "download_progress",
    "chunk": 5,
    "totalChunks": 10,
    "bytesSent": 524288,
    "totalBytes": 1048576,
    "progress": 50.0,
    "requestId": "unique-request-id"
  }
  ```

- Download Complete:
  ```json
  {
    "type": "download_complete",
    "totalBytes": 1048576,
    "timestamp": 1627984567890,
    "requestId": "unique-request-id"
  }
  ```

- Upload Ready:
  ```json
  {
    "type": "upload_ready",
    "timestamp": 1627984567890,
    "requestId": "unique-request-id"
  }
  ```

- Upload Progress:
  ```json
  {
    "type": "upload_progress",
    "chunk": 5,
    "totalChunks": 10,
    "bytesReceived": 524288,
    "progress": 50.0,
    "requestId": "unique-request-id"
  }
  ```

- Upload Result:
  ```json
  {
    "type": "upload_result",
    "bytesReceived": 1048576,
    "duration": 1.5,
    "bitsPerSecond": 5592405.33,
    "timestamp": 1627984567890,
    "requestId": "unique-request-id"
  }
  ```

- Error:
  ```json
  {
    "type": "error",
    "message": "Error message",
    "requestId": "unique-request-id"
  }
  ```

### Endpoints

1. **Ping Endpoint** (`/ping`):
   - Method: GET
   - Returns: `{"status":"ok"}` with JSON content type
   - Used for: Measuring round-trip time

2. **Download Endpoint** (`/download/1MB.test`):
   - Method: GET
   - Returns: 1MB test file
   - Used for: Measuring download speed

3. **Upload Endpoint** (`/upload`):
   - Method: POST
   - Accepts: Any data (up to 2MB)
   - Returns: `{"status":"ok"}` with JSON content type
   - Used for: Measuring upload speed

### Authentication

The server supports robust JWT-based authentication for all endpoints. This can be enabled or disabled via the `ENABLE_AUTH` environment variable.

### Configuration

- `ENABLE_AUTH`: Set to `true` to enable authentication, `false` to disable
- `TOKEN_HEADER`: The HTTP header name for the token (e.g., `Authorization`)
- `TOKEN_PREFIX`: The prefix for the token value (e.g., `Bearer `)
- `JWT_SECRET`: Secret key used to verify JWT signatures

### JWT Implementation

The server uses OpenResty with the `lua-resty-jwt` module to validate JWT tokens directly at the edge:

1. **REST API Authentication**:
   - The server checks for a valid JWT token in the specified header
   - The token is verified using the configured JWT secret
   - If the token is missing, invalid, or expired, the server returns a 401 Unauthorized response
   - If the token is valid, the request proceeds normally

2. **WebSocket Authentication**:
   - For WebSocket connections, the token is passed as a query parameter: `/ws?token=your-jwt-token`
   - The token is verified using the same JWT secret
   - If the token is invalid, the WebSocket connection is rejected

### JWT Token Format

The server expects JWT tokens in the standard format with the following claims:

```json
{
  "sub": "user-identifier",  // Subject (user ID)
  "iss": "issuer",          // Issuer (e.g., "your-auth-service")
  "exp": 1627984567890,     // Expiration time (Unix timestamp)
  "iat": 1627984567000      // Issued at time (Unix timestamp)
}
```

### OpenResty Integration

The project uses OpenResty (Nginx + Lua) to perform JWT validation directly in the web server layer:

- **Performance**: Token validation happens at the edge without requiring backend processing
- **Security**: Unauthorized requests are rejected before reaching application code
- **Flexibility**: Authentication can be enabled/disabled via configuration

### Endpoints

1. **Ping Endpoint** (`/ping`):
   - Method: GET
   - Returns: `{"status":"ok"}` with JSON content type
   - Used for: Measuring round-trip time

2. **Download Endpoint** (`/download/1MB.test`):
   - Method: GET
   - Returns: 1MB test file
   - Used for: Measuring download speed

3. **Upload Endpoint** (`/upload`):
   - Method: POST
   - Accepts: Any data (up to 2MB)
   - Returns: `{"status":"ok"}` with JSON content type
   - Used for: Measuring upload speed

### Client Implementation

### Web Clients

#### REST API Client

A simple HTML/JavaScript client for the REST API is provided in `speedtest-client.html`. It includes:

- Buttons for individual ping, download, and upload tests
- A button for running a full test
- Real-time display of test results
- Progress indicators for download and upload tests

#### WebSocket Client

A WebSocket-based client is provided in `speedtest-websocket-client.html`. It offers:

- Real-time speed testing using WebSockets
- Lower overhead for more accurate measurements
- Continuous progress updates during tests
- Support for authentication via token
- Improved latency measurement
- **Progress Indicators**: Visual feedback during tests
- **Results Display**: Formatted results with appropriate units

### Mobile SDKs

#### REST API SDKs

##### Swift SDK

The Swift SDK (`SpeedTestSDK.swift`) provides a native interface for iOS applications:

```swift
// Initialize the SDK
let speedTest = SpeedTestSDK(baseUrl: "http://example.com", tokenHeader: "Authorization", tokenValue: "Bearer your-token")

// Test ping
speedTest.testPing { result in
    switch result {
    case .success(let pingTime):
        print("Ping: \(pingTime) ms")
    case .failure(let error):
        print("Error: \(error)")
    }
}

// Test download speed
speedTest.testDownloadSpeed(progress: { progress in
    print("Download progress: \(progress)%")
}) { result in
    switch result {
    case .success(let speed):
        print("Download speed: \(speed.formattedString())")
    case .failure(let error):
        print("Error: \(error)")
    }
}

// Test upload speed
speedTest.testUploadSpeed(progress: { progress in
    print("Upload progress: \(progress)%")
}) { result in
    switch result {
    case .success(let speed):
        print("Upload speed: \(speed.formattedString())")
    case .failure(let error):
        print("Error: \(error)")
    }
}
```

##### React Native SDK

The React Native SDK (`SpeedTestSdk.js`) can be used in React Native applications:

```javascript
import SpeedTestSdk from './SpeedTestSdk';

// Initialize the SDK
const speedTest = new SpeedTestSdk('http://example.com', {
  tokenHeader: 'Authorization',
  tokenValue: 'Bearer your-token'
});

// Test ping
speedTest.testPing()
  .then(pingTime => console.log(`Ping: ${pingTime} ms`))
  .catch(error => console.error('Error:', error));

// Test download speed
speedTest.testDownloadSpeed({
  onProgress: progress => console.log(`Download progress: ${progress}%`)
})
  .then(speed => console.log(`Download speed: ${SpeedTestSdk.formatSpeed(speed)}`))
  .catch(error => console.error('Error:', error));

// Test upload speed
speedTest.testUploadSpeed({
  onProgress: progress => console.log(`Upload progress: ${progress}%`)
})
  .then(speed => console.log(`Upload speed: ${SpeedTestSdk.formatSpeed(speed)}`))
  .catch(error => console.error('Error:', error));
```

#### WebSocket SDKs

##### Swift WebSocket SDK

The Swift WebSocket SDK (`SpeedTestWebSocketSDK.swift`) provides a WebSocket-based interface for iOS applications:

```swift
// Initialize the WebSocket SDK
let wsUrl = URL(string: "ws://example.com/ws")!
let speedTest = SpeedTestWebSocketSDK(serverUrl: wsUrl, authToken: "your-token")

// Test ping
speedTest.testPing { result in
    switch result {
    case .success(let pingTime):
        print("WebSocket Ping: \(pingTime) ms")
    case .failure(let error):
        print("Error: \(error)")
    }
}

// Test download speed
speedTest.testDownloadSpeed(progress: { progress in
    print("Download progress: \(progress)%")
}) { result in
    switch result {
    case .success(let speed):
        print("Download speed: \(SpeedTestResult(pingTime: nil, downloadSpeed: speed, uploadSpeed: nil).formattedDownloadSpeed() ?? "")")
    case .failure(let error):
        print("Error: \(error)")
    }
}

// Test upload speed
speedTest.testUploadSpeed(progress: { progress in
    print("Upload progress: \(progress)%")
}) { result in
    switch result {
    case .success(let speed):
        print("Upload speed: \(SpeedTestResult(pingTime: nil, downloadSpeed: nil, uploadSpeed: speed).formattedUploadSpeed() ?? "")")
    case .failure(let error):
        print("Error: \(error)")
    }
}

// Run full test
speedTest.runFullTest(progress: { progress in
    print("Test progress: \(progress)%")
}) { result in
    switch result {
    case .success(let testResult):
        print("Ping: \(testResult.formattedPingTime() ?? "")")
        print("Download: \(testResult.formattedDownloadSpeed() ?? "")")
        print("Upload: \(testResult.formattedUploadSpeed() ?? "")")
    case .failure(let error):
        print("Error: \(error)")
    }
}

// Don't forget to disconnect when done
speedTest.disconnect()
```

##### React Native WebSocket SDK

The React Native WebSocket SDK (`SpeedTestWebSocketSdk.js`) provides a WebSocket-based interface for React Native applications:

```javascript
import SpeedTestWebSocketSdk from './SpeedTestWebSocketSdk';

// Initialize the WebSocket SDK
const speedTest = new SpeedTestWebSocketSdk('ws://example.com/ws', {
  authToken: 'your-token'
});

// Test ping
speedTest.testPing()
  .then(pingTime => console.log(`WebSocket Ping: ${pingTime} ms`))
  .catch(error => console.error('Error:', error));

// Test download speed
speedTest.testDownloadSpeed({
  onProgress: progress => console.log(`Download progress: ${progress}%`)
})
  .then(speed => console.log(`Download speed: ${SpeedTestWebSocketSdk.formatSpeed(speed)}`))
  .catch(error => console.error('Error:', error));

// Test upload speed
speedTest.testUploadSpeed({
  onProgress: progress => console.log(`Upload progress: ${progress}%`)
})
  .then(speed => console.log(`Upload speed: ${SpeedTestWebSocketSdk.formatSpeed(speed)}`))
  .catch(error => console.error('Error:', error));

// Run full test
speedTest.runFullTest({
  onProgress: progress => console.log(`Test progress: ${progress}%`)
})
  .then(results => {
    console.log(`Ping: ${results.pingTime} ms`);
    console.log(`Download: ${SpeedTestWebSocketSdk.formatSpeed(results.downloadSpeed)}`);
    console.log(`Upload: ${SpeedTestWebSocketSdk.formatSpeed(results.uploadSpeed)}`);
  })
  .catch(error => console.error('Error:', error));

// Don't forget to disconnect when done
speedTest.disconnect();
```

## Test Results

All endpoints have been tested and verified:

1. **Ping Endpoint**:
   ```
   HTTP/1.1 200 OK
   Server: nginx/1.29.0
   Content-Type: application/json
   Content-Length: 15
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   Access-Control-Allow-Headers: Content-Type, Authorization

   {"status":"ok"}
   ```

2. **Download Endpoint**:
   ```
   HTTP/1.1 200 OK
   Server: nginx/1.29.0
   Content-Type: application/octet-stream
   Content-Length: 1048576
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   Access-Control-Allow-Headers: Content-Type, Authorization
   Accept-Ranges: bytes
   ```

3. **Upload Endpoint**:
   ```
   HTTP/1.1 200 OK
   Server: nginx/1.29.0
   Content-Type: application/json
   Content-Length: 15
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   Access-Control-Allow-Headers: Content-Type, Authorization

   {"status":"ok"}
   ```

## Building and Running
docker stop speedtest-server && docker rm speedtest-server && docker build -t speedtest-server . && docker run -d --name speedtest-server -p 8080:8080 -p 8090:8090 speedtest-server
### Development Mode

```bash
# Build the Docker image
docker build -t speedtest-server:dev .

# Run the container
docker run -p 8080:80 -p 8090:8090 speedtest-server:dev

# Run the container in detached mode
docker run -d -p 8080:80 -p 8090:8090 --name speedtest-server speedtest-server:dev
```

### Production Mode

```bash
# Build the Docker image with production environment
docker build --build-arg ENV=prod -t speedtest-server:prod .

# Run the container
docker run -p 8080:80 -p 8090:8090 speedtest-server:prod
```

### JWT Configuration

Before deploying to production, make sure to:

1. Set a secure JWT secret in `.env.prod`:
   ```
   JWT_SECRET=your-secure-random-secret-key
   ```

2. Enable authentication:
   ```
   ENABLE_AUTH=true
   ```

3. Configure your client applications to include valid JWT tokens in requests

## Project Structure

- `Dockerfile`: OpenResty-based Docker configuration for the server
- `openresty-config.sh`: Script to generate OpenResty config with JWT validation
- `lua/jwt_auth.lua`: Lua script for JWT token validation
- `.env.dev`, `.env.prod`: Environment-specific configuration files
- `websocket-server.js`: Node.js WebSocket server for real-time speed testing
- `speedtest-client.html`: Web client for REST API-based speed testing
- `speedtest-websocket-client.html`: Web client for WebSocket-based speed testing
- `SpeedTestSDK.swift`: Swift SDK for REST API integration
- `SpeedTestWebSocketSDK.swift`: Swift SDK for WebSocket integration
- `SpeedTestSdk.js`: JavaScript SDK for REST API integration
- `SpeedTestWebSocketSdk.js`: JavaScript SDK for WebSocket integration

## Notes

- JWT validation is now handled directly by OpenResty using lua-resty-jwt
- For local testing, authentication can be disabled via environment variables
- The client generates a 1MB payload for upload tests
- The server provides a 1MB test file for download tests
- 1MB is a practical choice for mobile/iPad use cases, especially if offline data packages are in the range of 5-50MB
