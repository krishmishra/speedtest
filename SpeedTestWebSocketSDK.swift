import Foundation

/**
 * SpeedTestWebSocketSDK - A Swift SDK for WebSocket-based network speed testing
 *
 * This SDK provides methods to test ping, download speed, and upload speed using WebSockets.
 * It supports authentication via token headers and provides real-time progress updates.
 */
public class SpeedTestWebSocketSDK {
    // MARK: - Properties
    
    /// The base URL of the speed test server
    private let serverUrl: URL
    
    /// Authentication token (if required)
    private let authToken: String?
    
    /// WebSocket connection
    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    
    /// Test state
    private var isConnected = false
    private var testInProgress = false
    private var pingStartTime: Date?
    private var downloadStartTime: Date?
    private var uploadStartTime: Date?
    private var currentRequestId: String?
    
    /// Progress tracking
    private var totalBytes: Int = 0
    private var receivedBytes: Int = 0
    
    /// Delegates
    private var progressHandler: ((Double) -> Void)?
    private var completionHandler: ((Result<SpeedTestResult, Error>) -> Void)?
    
    // MARK: - Initialization
    
    /**
     Initialize the SpeedTestWebSocketSDK
     
     - Parameters:
        - serverUrl: The base URL of the speed test server (e.g., "ws://example.com/ws")
        - authToken: Optional authentication token
     */
    public init(serverUrl: URL, authToken: String? = nil) {
        self.serverUrl = serverUrl
        self.authToken = authToken
    }
    
    // MARK: - Public Methods
    
    /**
     Test ping to the server
     
     - Parameters:
        - completion: Completion handler with ping result in milliseconds
     */
    public func testPing(completion: @escaping (Result<Double, Error>) -> Void) {
        guard !testInProgress else {
            completion(.failure(SpeedTestError.testInProgress))
            return
        }
        
        testInProgress = true
        pingStartTime = Date()
        currentRequestId = generateRequestId()
        
        connectWebSocket { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success:
                let message = ["type": "ping", "requestId": self.currentRequestId ?? ""]
                self.sendMessage(message)
                
            case .failure(let error):
                self.testInProgress = false
                completion(.failure(error))
            }
        }
        
        // Set up completion handler
        self.completionHandler = { result in
            self.testInProgress = false
            
            switch result {
            case .success(let speedResult):
                if let pingTime = speedResult.pingTime {
                    completion(.success(pingTime))
                } else {
                    completion(.failure(SpeedTestError.invalidResponse))
                }
                
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
    
    /**
     Test download speed
     
     - Parameters:
        - progress: Optional progress handler (0-100)
        - completion: Completion handler with download speed in bits per second
     */
    public func testDownloadSpeed(
        progress: ((Double) -> Void)? = nil,
        completion: @escaping (Result<Double, Error>) -> Void
    ) {
        guard !testInProgress else {
            completion(.failure(SpeedTestError.testInProgress))
            return
        }
        
        testInProgress = true
        downloadStartTime = Date()
        currentRequestId = generateRequestId()
        progressHandler = progress
        
        connectWebSocket { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success:
                let message = [
                    "type": "download",
                    "chunkSize": 102400, // 100KB chunks
                    "requestId": self.currentRequestId ?? ""
                ]
                self.sendMessage(message)
                
            case .failure(let error):
                self.testInProgress = false
                completion(.failure(error))
            }
        }
        
        // Set up completion handler
        self.completionHandler = { result in
            self.testInProgress = false
            
            switch result {
            case .success(let speedResult):
                if let downloadSpeed = speedResult.downloadSpeed {
                    completion(.success(downloadSpeed))
                } else {
                    completion(.failure(SpeedTestError.invalidResponse))
                }
                
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
    
    /**
     Test upload speed
     
     - Parameters:
        - progress: Optional progress handler (0-100)
        - completion: Completion handler with upload speed in bits per second
     */
    public func testUploadSpeed(
        progress: ((Double) -> Void)? = nil,
        completion: @escaping (Result<Double, Error>) -> Void
    ) {
        guard !testInProgress else {
            completion(.failure(SpeedTestError.testInProgress))
            return
        }
        
        testInProgress = true
        uploadStartTime = Date()
        currentRequestId = generateRequestId()
        progressHandler = progress
        
        connectWebSocket { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success:
                let message = [
                    "type": "upload",
                    "totalChunks": 10,
                    "requestId": self.currentRequestId ?? ""
                ]
                self.sendMessage(message)
                
            case .failure(let error):
                self.testInProgress = false
                completion(.failure(error))
            }
        }
        
        // Set up completion handler
        self.completionHandler = { result in
            self.testInProgress = false
            
            switch result {
            case .success(let speedResult):
                if let uploadSpeed = speedResult.uploadSpeed {
                    completion(.success(uploadSpeed))
                } else {
                    completion(.failure(SpeedTestError.invalidResponse))
                }
                
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
    
    /**
     Run a full speed test (ping, download, upload)
     
     - Parameters:
        - progress: Optional progress handler (0-100)
        - completion: Completion handler with all test results
     */
    public func runFullTest(
        progress: ((Double) -> Void)? = nil,
        completion: @escaping (Result<SpeedTestResult, Error>) -> Void
    ) {
        guard !testInProgress else {
            completion(.failure(SpeedTestError.testInProgress))
            return
        }
        
        testInProgress = true
        currentRequestId = generateRequestId()
        progressHandler = progress
        
        connectWebSocket { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success:
                let message = [
                    "type": "full_test",
                    "chunkSize": 102400, // 100KB chunks for download
                    "totalChunks": 10, // 10 chunks for upload
                    "requestId": self.currentRequestId ?? ""
                ]
                self.sendMessage(message)
                
            case .failure(let error):
                self.testInProgress = false
                completion(.failure(error))
            }
        }
        
        // Set up completion handler
        self.completionHandler = { result in
            self.testInProgress = false
            completion(result)
        }
    }
    
    /**
     Close the WebSocket connection
     */
    public func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        isConnected = false
    }
    
    // MARK: - Private Methods
    
    /**
     Connect to the WebSocket server
     
     - Parameters:
        - completion: Completion handler with connection result
     */
    private func connectWebSocket(completion: @escaping (Result<Void, Error>) -> Void) {
        // If already connected, just return success
        if isConnected && webSocket != nil {
            completion(.success(()))
            return
        }
        
        // Create URL with auth token if provided
        var urlComponents = URLComponents(url: serverUrl, resolvingAgainstBaseURL: true)
        
        if let authToken = authToken {
            urlComponents?.queryItems = [URLQueryItem(name: "token", value: authToken)]
        }
        
        guard let url = urlComponents?.url else {
            completion(.failure(SpeedTestError.invalidUrl))
            return
        }
        
        // Create session and WebSocket task
        session = URLSession(configuration: .default)
        webSocket = session?.webSocketTask(with: url)
        
        // Set up message receiver
        receiveMessage()
        
        // Connect
        webSocket?.resume()
        
        // Wait for connection confirmation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self = self else { return }
            
            if self.isConnected {
                completion(.success(()))
            } else {
                completion(.failure(SpeedTestError.connectionFailed))
            }
        }
    }
    
    /**
     Send a message to the WebSocket server
     
     - Parameters:
        - message: The message to send
     */
    private func sendMessage(_ message: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: message),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            completionHandler?(.failure(SpeedTestError.invalidMessage))
            return
        }
        
        webSocket?.send(.string(jsonString)) { [weak self] error in
            if let error = error {
                self?.completionHandler?(.failure(error))
            }
        }
    }
    
    /**
     Send binary data to the WebSocket server
     
     - Parameters:
        - data: The data to send
     */
    private func sendData(_ data: Data) {
        webSocket?.send(.data(data)) { [weak self] error in
            if let error = error {
                self?.completionHandler?(.failure(error))
            }
        }
    }
    
    /**
     Receive messages from the WebSocket server
     */
    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleTextMessage(text)
                    
                case .data(let data):
                    self.handleBinaryMessage(data)
                    
                @unknown default:
                    break
                }
                
                // Continue receiving messages
                self.receiveMessage()
                
            case .failure(let error):
                self.isConnected = false
                self.completionHandler?(.failure(error))
            }
        }
    }
    
    /**
     Handle text messages from the WebSocket server
     
     - Parameters:
        - text: The message text
     */
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let messageType = json["type"] as? String else {
            return
        }
        
        // Check if this message is for our current request
        let requestId = json["requestId"] as? String
        if let currentId = currentRequestId, let requestId = requestId, currentId != requestId {
            // This message is not for our current request
            return
        }
        
        switch messageType {
        case "connected":
            isConnected = true
            
        case "pong":
            guard let pingStartTime = pingStartTime else { return }
            let pingTime = Date().timeIntervalSince(pingStartTime) * 1000 // Convert to ms
            let result = SpeedTestResult(pingTime: pingTime, downloadSpeed: nil, uploadSpeed: nil)
            completionHandler?(.success(result))
            
        case "download_start":
            downloadStartTime = Date()
            totalBytes = json["totalSize"] as? Int ?? 0
            receivedBytes = 0
            
        case "download_progress":
            if let progress = json["progress"] as? Double {
                progressHandler?(progress)
            }
            
        case "download_complete":
            guard let downloadStartTime = downloadStartTime,
                  let totalBytes = json["totalBytes"] as? Int else { return }
            
            let duration = Date().timeIntervalSince(downloadStartTime)
            let bytesPerSecond = Double(totalBytes) / duration
            let bitsPerSecond = bytesPerSecond * 8
            
            let result = SpeedTestResult(pingTime: nil, downloadSpeed: bitsPerSecond, uploadSpeed: nil)
            completionHandler?(.success(result))
            
        case "upload_ready":
            uploadStartTime = Date()
            sendUploadData()
            
        case "upload_progress":
            if let progress = json["progress"] as? Double {
                progressHandler?(progress)
            }
            
        case "upload_result":
            guard let bitsPerSecond = json["bitsPerSecond"] as? Double else { return }
            
            let result = SpeedTestResult(pingTime: nil, downloadSpeed: nil, uploadSpeed: bitsPerSecond)
            completionHandler?(.success(result))
            
        case "error":
            let errorMessage = json["message"] as? String ?? "Unknown error"
            completionHandler?(.failure(SpeedTestError.serverError(errorMessage)))
            
        default:
            break
        }
    }
    
    /**
     Handle binary messages from the WebSocket server
     
     - Parameters:
        - data: The binary data
     */
    private func handleBinaryMessage(_ data: Data) {
        // Update received bytes for download test
        receivedBytes += data.count
        
        // Calculate progress if total bytes is known
        if totalBytes > 0 {
            let progress = Double(receivedBytes) / Double(totalBytes) * 100
            progressHandler?(progress)
        }
    }
    
    /**
     Send test data for upload test
     */
    private func sendUploadData() {
        let chunkSize = 102400 // 100KB
        let chunks = 10
        
        for i in 0..<chunks {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.2) { [weak self] in
                guard let self = self, self.isConnected else { return }
                
                // Create random data
                var data = Data(count: chunkSize)
                _ = data.withUnsafeMutableBytes { bytes in
                    if let baseAddress = bytes.baseAddress {
                        arc4random_buf(baseAddress, chunkSize)
                    }
                }
                
                // Send the chunk
                self.sendData(data)
                
                // Update progress
                let progress = Double(i + 1) / Double(chunks) * 100
                self.progressHandler?(progress)
                
                // If last chunk, send completion message
                if i == chunks - 1 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        let message = [
                            "type": "upload_complete",
                            "requestId": self.currentRequestId ?? ""
                        ]
                        self.sendMessage(message)
                    }
                }
            }
        }
    }
    
    /**
     Generate a random request ID
     
     - Returns: A random string ID
     */
    private func generateRequestId() -> String {
        return UUID().uuidString
    }
}

// MARK: - Supporting Types

/**
 Speed test result containing ping time and speeds
 */
public struct SpeedTestResult {
    /// Ping time in milliseconds
    public let pingTime: Double?
    
    /// Download speed in bits per second
    public let downloadSpeed: Double?
    
    /// Upload speed in bits per second
    public let uploadSpeed: Double?
    
    /**
     Format download speed as a string with appropriate units
     
     - Returns: Formatted speed string
     */
    public func formattedDownloadSpeed() -> String? {
        guard let speed = downloadSpeed else { return nil }
        return formatSpeed(speed)
    }
    
    /**
     Format upload speed as a string with appropriate units
     
     - Returns: Formatted speed string
     */
    public func formattedUploadSpeed() -> String? {
        guard let speed = uploadSpeed else { return nil }
        return formatSpeed(speed)
    }
    
    /**
     Format ping time as a string
     
     - Returns: Formatted ping string
     */
    public func formattedPingTime() -> String? {
        guard let time = pingTime else { return nil }
        return "\(String(format: "%.2f", time)) ms"
    }
    
    /**
     Format speed with appropriate units
     
     - Parameters:
        - bitsPerSecond: Speed in bits per second
     - Returns: Formatted speed string
     */
    private func formatSpeed(_ bitsPerSecond: Double) -> String {
        let units = ["bps", "Kbps", "Mbps", "Gbps"]
        var speed = bitsPerSecond
        var unitIndex = 0
        
        while speed >= 1024 && unitIndex < units.count - 1 {
            speed /= 1024
            unitIndex += 1
        }
        
        return "\(String(format: "%.2f", speed)) \(units[unitIndex])"
    }
}

/**
 Speed test errors
 */
public enum SpeedTestError: Error {
    case invalidUrl
    case connectionFailed
    case testInProgress
    case invalidResponse
    case invalidMessage
    case serverError(String)
    
    public var localizedDescription: String {
        switch self {
        case .invalidUrl:
            return "Invalid server URL"
        case .connectionFailed:
            return "Failed to connect to server"
        case .testInProgress:
            return "A test is already in progress"
        case .invalidResponse:
            return "Invalid response from server"
        case .invalidMessage:
            return "Failed to create message"
        case .serverError(let message):
            return "Server error: \(message)"
        }
    }
}
