import Foundation

/**
 * SpeedTestSDK.swift
 * 
 * iOS SDK for network speed testing using REST API
 * Based on the JavaScript implementation in SpeedTestSdk.js
 */
public class SpeedTestSDK {
    private let serverURL: String
    private let tokenHeaderKey: String?
    private let tokenHeaderValue: String?
    private let testIterations: Int
    
    /**
     * Initialize the Speed Test SDK
     *
     * @param serverURL - Base URL of the speed test server
     * @param tokenHeaderKey - Optional authentication token header key
     * @param tokenHeaderValue - Optional authentication token header value
     * @param testIterations - Number of test iterations to run (default: 3)
     */
    public init(serverURL: String, tokenHeaderKey: String? = nil, tokenHeaderValue: String? = nil, testIterations: Int = 3) {
        self.serverURL = serverURL
        self.tokenHeaderKey = tokenHeaderKey
        self.tokenHeaderValue = tokenHeaderValue
        self.testIterations = testIterations
    }
    
    /**
     * Test ping time
     *
     * @returns Ping time in milliseconds
     */
    public func testPing() async throws -> Double {
        let startTime = Date()
        
        var request = URLRequest(url: URL(string: "\(serverURL)/ping?cacheBuster=\(Date().timeIntervalSince1970)")!)
        request.httpMethod = "GET"
        
        if let key = tokenHeaderKey, !key.isEmpty, let value = tokenHeaderValue {
            request.addValue(value, forHTTPHeaderField: key)
        }
        
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "SpeedTestSDK", code: 1, userInfo: [NSLocalizedDescriptionKey: "Ping failed"])
        }
        
        let endTime = Date()
        let pingTime = endTime.timeIntervalSince(startTime) * 1000 // Convert to milliseconds
        
        return pingTime
    }
    
    /**
     * Test download speed
     *
     * @param progressHandler - Optional progress handler (0-100)
     * @returns Download speed in bits per second
     */
    public func testDownloadSpeed(progressHandler: ((Double) -> Void)? = nil) async throws -> Double {
        var totalSpeed: Double = 0
        
        for i in 0..<testIterations {
            if let progressHandler = progressHandler {
                progressHandler(Double(i) / Double(testIterations) * 100)
            }
            
            let startTime = Date()
            
            var request = URLRequest(url: URL(string: "\(serverURL)/download/0.5MB.test?cacheBuster=\(Date().timeIntervalSince1970)")!)
            request.httpMethod = "GET"
            
            if let key = tokenHeaderKey, !key.isEmpty, let value = tokenHeaderValue {
                request.addValue(value, forHTTPHeaderField: key)
            }
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                throw NSError(domain: "SpeedTestSDK", code: 2, userInfo: [NSLocalizedDescriptionKey: "Download failed"])
            }
            
            let endTime = Date()
            
            let fileSizeInBits = Double(data.count * 8)
            let durationInSeconds = endTime.timeIntervalSince(startTime)
            let speedBps = fileSizeInBits / durationInSeconds
            
            totalSpeed += speedBps
        }
        
        if let progressHandler = progressHandler {
            progressHandler(100)
        }
        
        let averageSpeed = totalSpeed / Double(testIterations)
        return averageSpeed
    }
    
    /**
     * Test upload speed
     *
     * @param progressHandler - Optional progress handler (0-100)
     * @returns Upload speed in bits per second
     */
    public func testUploadSpeed(progressHandler: ((Double) -> Void)? = nil) async throws -> Double {
        // Create a 0.5MB file to upload
        var testData = Data(count: 512 * 1024) // 0.5MB of data
        testData.withUnsafeMutableBytes { bytes in
            if let baseAddress = bytes.baseAddress {
                for i in 0..<bytes.count {
                    (baseAddress + i).storeBytes(of: UInt8.random(in: 0...255), as: UInt8.self)
                }
            }
        }
        
        var totalSpeed: Double = 0
        
        for i in 0..<testIterations {
            if let progressHandler = progressHandler {
                progressHandler(Double(i) / Double(testIterations) * 100)
            }
            
            let startTime = Date()
            
            var request = URLRequest(url: URL(string: "\(serverURL)/upload?cacheBuster=\(Date().timeIntervalSince1970)")!)
            request.httpMethod = "POST"
            
            if let key = tokenHeaderKey, !key.isEmpty, let value = tokenHeaderValue {
                request.addValue(value, forHTTPHeaderField: key)
            }
            
            // Create multipart form data
            let boundary = "Boundary-\(UUID().uuidString)"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            
            var body = Data()
            
            // Add file data
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"file\"; filename=\"speedtest.bin\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
            body.append(testData)
            body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
            
            request.httpBody = body
            
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                throw NSError(domain: "SpeedTestSDK", code: 3, userInfo: [NSLocalizedDescriptionKey: "Upload failed"])
            }
            
            let endTime = Date()
            
            let fileSizeInBits = Double(testData.count * 8)
            let durationInSeconds = endTime.timeIntervalSince(startTime)
            let speedBps = fileSizeInBits / durationInSeconds
            
            totalSpeed += speedBps
        }
        
        if let progressHandler = progressHandler {
            progressHandler(100)
        }
        
        let averageSpeed = totalSpeed / Double(testIterations)
        return averageSpeed
    }
    
    /**
     * Run a full speed test (ping + download + upload)
     *
     * @param progressHandler - Optional progress handler (0-100)
     * @returns Test results (pingTime, downloadSpeed, uploadSpeed)
     */
    public func runFullTest(progressHandler: ((Double) -> Void)? = nil) async throws -> SpeedTestResult {
        // Test ping (0-33%)
        progressHandler?(0)
        let pingTime = try await testPing()
        
        // Test download (33-66%)
        progressHandler?(33)
        let downloadSpeed = try await testDownloadSpeed(progressHandler: { progress in
            progressHandler?(33 + progress * 0.33)
        })
        
        // Test upload (66-100%)
        progressHandler?(66)
        let uploadSpeed = try await testUploadSpeed(progressHandler: { progress in
            progressHandler?(66 + progress * 0.34)
        })
        
        progressHandler?(100)
        
        return SpeedTestResult(pingTime: pingTime, downloadSpeed: downloadSpeed, uploadSpeed: uploadSpeed)
    }
    
    /**
     * Format speed with appropriate units
     *
     * @param bitsPerSecond - Speed in bits per second
     * @returns Formatted speed string
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
}

/**
 * Speed test result model
 */
public struct SpeedTestResult {
    public let pingTime: Double
    public let downloadSpeed: Double
    public let uploadSpeed: Double
    
    public init(pingTime: Double, downloadSpeed: Double, uploadSpeed: Double) {
        self.pingTime = pingTime
        self.downloadSpeed = downloadSpeed
        self.uploadSpeed = uploadSpeed
    }
}

/**
 * Example usage:
 *
 * import SpeedTestSDK
 *
 * // Create a new instance with your server URL and token
 * let speedTest = SpeedTestSDK(
 *     serverURL: "http://api.example.com",
 *     tokenHeaderKey: "Authorization",
 *     tokenHeaderValue: "Bearer your-token-here"
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
 *         let downloadSpeed = try await speedTest.testDownloadSpeed()
 *         print("Download speed: \(speedTest.formatSpeed(downloadSpeed))")
 *     } catch {
 *         print("Download test failed: \(error)")
 *     }
 * }
 *
 * // Test upload speed
 * Task {
 *     do {
 *         let uploadSpeed = try await speedTest.testUploadSpeed()
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
