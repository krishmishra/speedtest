import Foundation

/**
 * SpeedTestWebSocketSDK.swift
 * 
 * iOS SDK for network speed testing using WebSockets
 * Based on the JavaScript implementation in SpeedTestWebSocketSdk.js
 */
public class SpeedTestWebSocketSDK {
    private let serverUrl: String
    private let authToken: String?
    private let debug: Bool
    
    // WebSocket connection
    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var isConnected = false
    private var testInProgress = false
    private var currentRequestId: String?
    
    // Test timing
    private var pingStartTime: Date?
    private var downloadStartTime: Date?
    private var uploadStartTime: Date?
    
    // Download tracking
    private var receivedBytes = 0
    private var totalBytes = 0
    private var uploadedBytes = 0
    
    // Event handlers
    private var progressHandler: ((Double) -> Void)?
    private var completionHandler: ((SpeedTestWebSocketResult) -> Void)?
    private var errorHandler: ((Error) -> Void)?
    private var connectionHandler: ((Bool) -> Void)?
    
    /**
     * Initialize the WebSocket Speed Test SDK
     *
     * @param serverUrl - WebSocket server URL (e.g., "ws://localhost:8090")
     * @param authToken - Optional authentication token
     * @param debug - Enable debug logging (default: false)
     */
    public init(serverUrl: String, authToken: String? = nil, debug: Bool = false) {
        self.serverUrl = serverUrl
        self.authToken = authToken
        self.debug = debug
    }
    
    /**
     * Debug logging function
     */
    private func log(_ message: String, _ args: Any...) {
        if debug {
            var logMessage = "[SpeedTestWebSocketSDK] \(message)"
            if !args.isEmpty {
                logMessage += " \(args)"
            }
            print(logMessage)
        }
    }
    
    /**
     * Connect to the WebSocket server
     */
    public func connect() async throws {
        if isConnected {
            return
        }
        
        log("Connecting to: \(serverUrl)")
        
        do {
            let url = URL(string: serverUrl)!
            session = URLSession(configuration: .default)
            webSocket = session?.webSocketTask(with: url)
            
            webSocket?.resume()
            
            // Start receiving messages
            receiveMessage()
            
            isConnected = true
            connectionHandler?(true)
            
            // Wait for a brief moment to ensure connection is established
            try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
        } catch {
            log("Connection error: \(error)")
            isConnected = false
            connectionHandler?(false)
            throw error
        }
    }
    
    /**
     * Disconnect from the WebSocket server
     */
    public func disconnect() {
        if let webSocket = webSocket {
            webSocket.cancel(with: .normalClosure, reason: nil)
            self.webSocket = nil
        }
        isConnected = false
        testInProgress = false
        connectionHandler?(false)
    }
    
    /**
     * Receive WebSocket messages
     */
    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                switch message {
                case .data(let data):
                    self.handleBinaryMessage(data)
                case .string(let text):
                    self.handleTextMessage(text)
                @unknown default:
                    self.log("Unknown message type received")
                }
                
                // Continue receiving messages
                self.receiveMessage()
                
            case .failure(let error):
                self.log("WebSocket receive error: \(error)")
                self.isConnected = false
                self.errorHandler?(error)
            }
        }
    }
    
    /**
     * Send a JSON message to the server
     */
    private func sendMessage(_ message: [String: Any]) -> Bool {
        if !isConnected || webSocket == nil {
            log("Cannot send message: Not connected")
            return false
        }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: message)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                log("Sending message: \(jsonString)")
                webSocket?.send(.string(jsonString)) { error in
                    if let error = error {
                        self.log("Error sending message: \(error)")
                    }
                }
                return true
            }
            return false
        } catch {
            log("Error serializing message: \(error)")
            return false
        }
    }
    
    /**
     * Send binary data chunk
     */
    private func sendChunk(_ chunk: Data) -> Bool {
        if !isConnected || webSocket == nil {
            log("Cannot send chunk: not connected")
            return false
        }
        
        do {
            webSocket?.send(.data(chunk)) { error in
                if let error = error {
                    self.log("Error sending chunk: \(error)")
                }
            }
            uploadedBytes += chunk.count
            return true
        } catch {
            log("Error sending chunk: \(error)")
            return false
        }
    }
    
    /**
     * Handle text messages from the server
     */
    private func handleTextMessage(_ text: String) {
        do {
            guard let data = text.data(using: .utf8),
                  let message = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = message["type"] as? String else {
                log("Invalid message format")
                return
            }
            
            log("Received message: \(type)")
            
            switch type {
            case "connected":
                handleConnected(message)
            case "pong":
                handlePong(message)
            case "download_start":
                handleDownloadStart(message)
            case "download_progress":
                handleDownloadProgress(message)
            case "download_complete":
                handleDownloadComplete(message)
            case "upload_ready":
                handleUploadReady(message)
            case "upload_progress":
                handleUploadProgress(message)
            case "upload_result":
                handleUploadResult(message)
            case "upload_complete_ack":
                handleUploadCompleteAck(message)
            case "error":
                handleError(message)
            default:
                log("Unknown message type: \(type)")
            }
        } catch {
            log("Error parsing message: \(error)")
            errorHandler?(error)
        }
    }
    
    /**
     * Handle binary download data
     */
    private func handleBinaryMessage(_ data: Data) {
        let size = data.count
        receivedBytes += size
        log("Received binary chunk: \(size) bytes (total: \(receivedBytes)/\(totalBytes))")
        
        // Update progress if handler is set
        if totalBytes > 0 {
            let progress = min(Double(receivedBytes) / Double(totalBytes) * 100, 100)
            progressHandler?(progress)
        }
    }
    
    /**
     * Message type handlers
     */
    private func handleConnected(_ message: [String: Any]) {
        log("Connected to server")
        connectionHandler?(true)
    }
    
    private func handlePong(_ message: [String: Any]) {
        guard let startTime = pingStartTime else { return }
        let pingTime = Date().timeIntervalSince(startTime) * 1000 // Convert to milliseconds
        log("Ping result: \(pingTime)ms")
        
        completionHandler?(SpeedTestWebSocketResult(pingTime: pingTime))
    }
    
    private func handleDownloadStart(_ message: [String: Any]) {
        downloadStartTime = Date()
        receivedBytes = 0
        totalBytes = message["totalSize"] as? Int ?? 0
        log("Download started: \(totalBytes) bytes")
        
        progressHandler?(0)
    }
    
    private func handleDownloadProgress(_ message: [String: Any]) {
        let progress = min(message["progress"] as? Double ?? 0, 100)
        log("Download progress: \(progress)%")
        
        progressHandler?(progress)
    }
    
    private func handleDownloadComplete(_ message: [String: Any]) {
        guard let startTime = downloadStartTime else { return }
        let endTime = Date()
        let downloadTime = endTime.timeIntervalSince(startTime) // seconds
        
        // Client-side calculation
        let totalBytes = message["totalBytes"] as? Int ?? receivedBytes
        let bitsPerSecond = downloadTime > 0 ? Double(totalBytes * 8) / downloadTime : 0
        
        log("Download complete: \(formatSpeed(bitsPerSecond)) (\(downloadTime)s)")
        
        completionHandler?(SpeedTestWebSocketResult(downloadSpeed: bitsPerSecond))
    }
    
    private func handleUploadReady(_ message: [String: Any]) {
        log("Upload ready, starting data transmission")
        uploadStartTime = Date()
        uploadedBytes = 0
        
        progressHandler?(0)
        
        sendUploadData()
    }
    
    private func handleUploadProgress(_ message: [String: Any]) {
        let progress = min(message["progress"] as? Double ?? 0, 100)
        log("Upload progress: \(progress)%")
        
        progressHandler?(progress)
    }
    
    private func handleUploadResult(_ message: [String: Any]) {
        guard let startTime = uploadStartTime else { return }
        let endTime = Date()
        let uploadTime = endTime.timeIntervalSince(startTime) // seconds
        
        // Client-side calculation
        let totalBytes = message["totalBytes"] as? Int ?? uploadedBytes
        let bitsPerSecond = uploadTime > 0 ? Double(totalBytes * 8) / uploadTime : 0
        
        log("Upload result: \(formatSpeed(bitsPerSecond))")
        
        completionHandler?(SpeedTestWebSocketResult(uploadSpeed: bitsPerSecond))
        
        // Send upload complete message
        sendMessage([
            "type": "upload_complete",
            "requestId": currentRequestId ?? generateRequestId()
        ])
    }
    
    private func handleUploadCompleteAck(_ message: [String: Any]) {
        log("Upload completion acknowledged")
        // This is just an acknowledgment, no action needed
    }
    
    private func handleError(_ message: [String: Any]) {
        let errorMsg = message["message"] as? String ?? "Unknown error"
        log("Server error: \(errorMsg)")
        
        errorHandler?(NSError(domain: "SpeedTestWebSocketSDK", code: 1, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
    }
    
    /**
     * Send upload data in chunks
     */
    private func sendUploadData() {
        // Use large chunks for better performance
        let chunkSize = 262144 // 256KB chunks
        let totalSize = 512 * 1024 // 0.5MB total
        let numChunks = Int(ceil(Double(totalSize) / Double(chunkSize)))
        
        log("Sending upload data: \(numChunks) chunks of \(chunkSize) bytes")
        
        // Pre-generate all chunks at once for better performance
        var chunks = [Data]()
        var remainingBytes = totalSize
        
        // Create all chunks upfront
        for i in 0..<numChunks {
            let actualChunkSize = min(chunkSize, remainingBytes)
            var data = Data(count: actualChunkSize)
            
            // Fill with random data
            fillRandomData(&data)
            
            chunks.append(data)
            remainingBytes -= actualChunkSize
        }
        
        // Send all chunks without delay for maximum speed
        log("Sending all \(numChunks) chunks without delay for maximum speed")
        
        // Use a loop to send all chunks immediately
        for (i, chunk) in chunks.enumerated() {
            if !isConnected { break }
            
            // Send the chunk as binary data
            sendChunk(chunk)
            
            // Log every 4th chunk to reduce console spam
            if i % 4 == 0 || i == chunks.count - 1 {
                log("Sent upload chunk \(i + 1)/\(numChunks) (\(chunk.count) bytes)")
            }
        }
        
        log("All \(numChunks) chunks sent without delay")
    }
    
    /**
     * Fill an array with random data using a custom PRNG
     */
    private func fillRandomData(_ data: inout Data) {
        // For very small arrays, still use SecRandomCopyBytes for better randomness
        if data.count <= 65536 {
            data.withUnsafeMutableBytes { buffer in
                if let baseAddress = buffer.baseAddress {
                    _ = SecRandomCopyBytes(kSecRandomDefault, buffer.count, baseAddress)
                }
            }
            return
        }
        
        // For larger arrays, use a faster pseudo-random method
        // Start with a small truly random seed (32 bytes)
        var seed = [UInt32](repeating: 0, count: 8)
        seed.withUnsafeMutableBytes { buffer in
            if let baseAddress = buffer.baseAddress {
                _ = SecRandomCopyBytes(kSecRandomDefault, buffer.count, baseAddress)
            }
        }
        
        // Use the seed to initialize our PRNG state
        var s0 = seed[0]
        var s1 = seed[1]
        var s2 = seed[2]
        var s3 = seed[3]
        
        // Fill the array with pseudo-random data
        data.withUnsafeMutableBytes { buffer in
            guard let baseAddress = buffer.baseAddress else { return }
            
            for i in stride(from: 0, to: buffer.count, by: 4) {
                // xorshift128+ algorithm - fast and decent quality
                var t = s0
                t ^= t << 11
                t ^= t >> 8
                s0 = s1
                s1 = s2
                s2 = s3
                s3 = s3 ^ (s3 >> 19) ^ t ^ (t >> 8)
                
                // Convert to bytes and add to array
                let value = s3
                
                if i + 3 < buffer.count {
                    (baseAddress + i).storeBytes(of: UInt8(value & 0xFF), as: UInt8.self)
                    (baseAddress + i + 1).storeBytes(of: UInt8((value >> 8) & 0xFF), as: UInt8.self)
                    (baseAddress + i + 2).storeBytes(of: UInt8((value >> 16) & 0xFF), as: UInt8.self)
                    (baseAddress + i + 3).storeBytes(of: UInt8((value >> 24) & 0xFF), as: UInt8.self)
                } else {
                    // Handle edge case for last few bytes
                    for j in 0..<min(4, buffer.count - i) {
                        (baseAddress + i + j).storeBytes(of: UInt8((value >> (j * 8)) & 0xFF), as: UInt8.self)
                    }
                }
            }
        }
    }
    
    /**
     * Generate a unique request ID
     */
    private func generateRequestId() -> String {
        return UUID().uuidString
    }
    
    /**
     * Format speed with appropriate units
     */
    public func formatSpeed(_ bitsPerSecond: Double) -> String {
        let units = ["bps", "Kbps", "Mbps", "Gbps"]
        var speed = bitsPerSecond
        var unitIndex = 0
        
        while speed >= 1024 && unitIndex < units.count - 1 {
            speed /= 1024
            unitIndex += 1
        }
        
        return String(format: "%.2f %@", speed, units[unitIndex])
    }
    
    /**
     * Test ping latency
     */
    public func testPing() async throws -> Double {
        if testInProgress {
            throw NSError(domain: "SpeedTestWebSocketSDK", code: 1, userInfo: [NSLocalizedDescriptionKey: "A test is already in progress"])
        }
        
        testInProgress = true
        
        return try await withCheckedThrowingContinuation { continuation in
            Task {
                do {
                    try await connect()
                    
                    completionHandler = { result in
                        self.testInProgress = false
                        
                        if let pingTime = result.pingTime {
                            continuation.resume(returning: pingTime)
                        } else {
                            continuation.resume(throwing: NSError(domain: "SpeedTestWebSocketSDK", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid ping response"]))
                        }
                    }
                    
                    errorHandler = { error in
                        self.testInProgress = false
                        continuation.resume(throwing: error)
                    }
                    
                    pingStartTime = Date()
                    currentRequestId = generateRequestId()
                    
                    if !sendMessage([
                        "type": "ping",
                        "requestId": currentRequestId!
                    ]) {
                        testInProgress = false
                        continuation.resume(throwing: NSError(domain: "SpeedTestWebSocketSDK", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to send ping request"]))
                    }
                } catch {
                    testInProgress = false
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /**
     * Test download speed
     */
    public func testDownloadSpeed(progress: ((Double) -> Void)? = nil) async throws -> Double {
        if testInProgress {
            throw NSError(domain: "SpeedTestWebSocketSDK", code: 1, userInfo: [NSLocalizedDescriptionKey: "A test is already in progress"])
        }
        
        testInProgress = true
        progressHandler = progress
        
        return try await withCheckedThrowingContinuation { continuation in
            Task {
                do {
                    try await connect()
                    
                    completionHandler = { result in
                        self.testInProgress = false
                        
                        if let downloadSpeed = result.downloadSpeed {
                            continuation.resume(returning: downloadSpeed)
                        } else {
                            continuation.resume(throwing: NSError(domain: "SpeedTestWebSocketSDK", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid download response"]))
                        }
                    }
                    
                    errorHandler = { error in
                        self.testInProgress = false
                        continuation.resume(throwing: error)
                    }
                    
                    currentRequestId = generateRequestId()
                    let size = 512 * 1024 // Default 0.5MB
                    
                    if !sendMessage([
                        "type": "download",
                        "size": size,
                        "requestId": currentRequestId!
                    ]) {
                        testInProgress = false
                        continuation.resume(throwing: NSError(domain: "SpeedTestWebSocketSDK", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to send download request"]))
                    }
                } catch {
                    testInProgress = false
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /**
     * Test upload speed
     */
    public func testUploadSpeed(progress: ((Double) -> Void)? = nil) async throws -> Double {
        if testInProgress {
            throw NSError(domain: "SpeedTestWebSocketSDK", code: 1, userInfo: [NSLocalizedDescriptionKey: "A test is already in progress"])
        }
        
        testInProgress = true
        progressHandler = progress
        
        return try await withCheckedThrowingContinuation { continuation in
            Task {
                do {
                    try await connect()
                    
                    completionHandler = { result in
                        self.testInProgress = false
                        
                        if let uploadSpeed = result.uploadSpeed {
                            continuation.resume(returning: uploadSpeed)
                        } else {
                            continuation.resume(throwing: NSError(domain: "SpeedTestWebSocketSDK", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid upload response"]))
                        }
                    }
                    
                    errorHandler = { error in
                        self.testInProgress = false
                        continuation.resume(throwing: error)
                    }
                    
                    currentRequestId = generateRequestId()
                    let size = 512 * 1024 // Default 0.5MB
                    
                    if !sendMessage([
                        "type": "upload",
                        "size": size,
                        "requestId": currentRequestId!
                    ]) {
                        testInProgress = false
                        continuation.resume(throwing: NSError(domain: "SpeedTestWebSocketSDK", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to send upload request"]))
                    }
                } catch {
                    testInProgress = false
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /**
     * Run a full speed test (ping + download + upload)
     */
    public func runFullTest(progress: ((Double) -> Void)? = nil) async throws -> SpeedTestWebSocketFullResult {
        if testInProgress {
            throw NSError(domain: "SpeedTestWebSocketSDK", code: 1, userInfo: [NSLocalizedDescriptionKey: "A test is already in progress"])
        }
        
        let results = SpeedTestWebSocketFullResult()
        
        // Test ping (0-33%)
        progress?(0)
        results.pingTime = try await testPing()
        
        // Test download (33-66%)
        progress?(33)
        results.downloadSpeed = try await testDownloadSpeed(progress: { value in
            progress?(33 + value * 0.33)
        })
        
        // Test upload (66-100%)
        progress?(66)
        results.uploadSpeed = try await testUploadSpeed(progress: { value in
            progress?(66 + value * 0.34)
        })
        
        progress?(100)
        return results
    }
    
    /**
     * Set connection event handler
     */
    public func onConnection(_ handler: @escaping (Bool) -> Void) {
        connectionHandler = handler
    }
    
    /**
     * Check if currently connected
     */
    public var isConnectedToServer: Bool {
        return isConnected
    }
    
    /**
     * Check if test is in progress
     */
    public var isTestInProgress: Bool {
        return testInProgress
    }
}

/**
 * Speed test result model for individual tests
 */
public struct SpeedTestWebSocketResult {
    public var pingTime: Double?
    public var downloadSpeed: Double?
    public var uploadSpeed: Double?
    
    public init(pingTime: Double? = nil, downloadSpeed: Double? = nil, uploadSpeed: Double? = nil) {
        self.pingTime = pingTime
        self.downloadSpeed = downloadSpeed
        self.uploadSpeed = uploadSpeed
    }
}

/**
 * Speed test result model for full test
 */
public class SpeedTestWebSocketFullResult {
    public var pingTime: Double = 0
    public var downloadSpeed: Double = 0
    public var uploadSpeed: Double = 0
}

/**
 * Example usage:
 *
 * import SpeedTestWebSocketSDK
 *
 * // Create a new instance with your server URL and token
 * let speedTest = SpeedTestWebSocketSDK(
 *     serverUrl: "ws://localhost:8090",
 *     authToken: "your-token-here",
 *     debug: true
 * )
 *
 * // Test ping
 * Task {
 *     do {
 *         let pingTime = try await speedTest.testPing()
 *         print("Ping: \(String(format: "%.2f", pingTime)) ms")
 *     } catch {
 *         print("Ping test failed: \(error)")
 *     }
 * }
 *
 * // Test download speed
 * Task {
 *     do {
 *         let downloadSpeed = try await speedTest.testDownloadSpeed { progress in
 *             print("Download progress: \(progress)%")
 *         }
 *         print("Download speed: \(speedTest.formatSpeed(downloadSpeed))")
 *     } catch {
 *         print("Download test failed: \(error)")
 *     }
 * }
 *
 * // Test upload speed
 * Task {
 *     do {
 *         let uploadSpeed = try await speedTest.testUploadSpeed { progress in
 *             print("Upload progress: \(progress)%")
 *         }
 *         print("Upload speed: \(speedTest.formatSpeed(uploadSpeed))")
 *     } catch {
 *         print("Upload test failed: \(error)")
 *     }
 * }
 *
 * // Run all tests
 * Task {
 *     do {
 *         let result = try await speedTest.runFullTest { progress in
 *             print("Progress: \(progress)%")
 *         }
 *         print("Ping: \(String(format: "%.2f", result.pingTime)) ms")
 *         print("Download: \(speedTest.formatSpeed(result.downloadSpeed))")
 *         print("Upload: \(speedTest.formatSpeed(result.uploadSpeed))")
 *     } catch {
 *         print("Full test failed: \(error)")
 *     }
 * }
 */
