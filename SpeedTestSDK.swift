import Foundation

class SpeedTestSDK {
    // Configuration
    private let serverURL: String
    private let tokenHeaderKey: String
    private let tokenHeaderValue: String
    private let testIterations: Int
    
    // Initialize with server URL and authentication token
    init(serverURL: String, tokenHeaderKey: String, tokenHeaderValue: String, testIterations: Int = 3) {
        self.serverURL = serverURL
        self.tokenHeaderKey = tokenHeaderKey
        self.tokenHeaderValue = tokenHeaderValue
        self.testIterations = testIterations
    }
    
    // MARK: - Speed Test Methods
    
    // Test ping time
    func testPing(completion: @escaping (Result<Double, Error>) -> Void) {
        let startTime = Date()
        
        var request = URLRequest(url: URL(string: "\(serverURL)/ping?cacheBuster=\(Date().timeIntervalSince1970)")!)
        request.httpMethod = "GET"
        request.addValue(tokenHeaderValue, forHTTPHeaderField: tokenHeaderKey)
        
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                completion(.failure(NSError(domain: "SpeedTestError", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                return
            }
            
            let endTime = Date()
            let pingTime = endTime.timeIntervalSince(startTime) * 1000 // Convert to milliseconds
            completion(.success(pingTime))
        }
        
        task.resume()
    }
    
    // Test download speed
    func testDownloadSpeed(completion: @escaping (Result<Double, Error>) -> Void) {
        var totalSpeed: Double = 0
        var completedTests = 0
        
        for _ in 0..<testIterations {
            let startTime = Date()
            
            var request = URLRequest(url: URL(string: "\(serverURL)/download/1MB.test?cacheBuster=\(Date().timeIntervalSince1970)")!)
            request.httpMethod = "GET"
            request.addValue(tokenHeaderValue, forHTTPHeaderField: tokenHeaderKey)
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    completion(.failure(error))
                    return
                }
                
                guard let data = data else {
                    completion(.failure(NSError(domain: "SpeedTestError", code: 0, userInfo: [NSLocalizedDescriptionKey: "No data received"])))
                    return
                }
                
                let endTime = Date()
                let duration = endTime.timeIntervalSince(startTime)
                let fileSizeInBits = Double(data.count * 8)
                let speedBps = fileSizeInBits / duration
                
                totalSpeed += speedBps
                completedTests += 1
                
                if completedTests == self.testIterations {
                    let averageSpeed = totalSpeed / Double(self.testIterations)
                    completion(.success(averageSpeed))
                }
            }
            
            task.resume()
        }
    }
    
    // Test upload speed
    func testUploadSpeed(completion: @escaping (Result<Double, Error>) -> Void) {
        // Create 1MB of test data
        let testData = Data(count: 1024 * 1024) // 1MB of data
        
        var totalSpeed: Double = 0
        var completedTests = 0
        
        for _ in 0..<testIterations {
            let startTime = Date()
            
            var request = URLRequest(url: URL(string: "\(serverURL)/upload?cacheBuster=\(Date().timeIntervalSince1970)")!)
            request.httpMethod = "POST"
            request.addValue(tokenHeaderValue, forHTTPHeaderField: tokenHeaderKey)
            request.httpBody = testData
            
            let task = URLSession.shared.dataTask(with: request) { _, response, error in
                if let error = error {
                    completion(.failure(error))
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                    completion(.failure(NSError(domain: "SpeedTestError", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                    return
                }
                
                let endTime = Date()
                let duration = endTime.timeIntervalSince(startTime)
                let fileSizeInBits = Double(testData.count * 8)
                let speedBps = fileSizeInBits / duration
                
                totalSpeed += speedBps
                completedTests += 1
                
                if completedTests == self.testIterations {
                    let averageSpeed = totalSpeed / Double(self.testIterations)
                    completion(.success(averageSpeed))
                }
            }
            
            task.resume()
        }
    }
    
    // Format speed for display
    func formatSpeed(_ speedBps: Double) -> String {
        let units = ["bps", "Kbps", "Mbps", "Gbps"]
        var speed = speedBps
        var unitIndex = 0
        
        while speed >= 1024 && unitIndex < units.count - 1 {
            speed /= 1024
            unitIndex += 1
        }
        
        return String(format: "%.2f %@", speed, units[unitIndex])
    }
}

// Example usage:
/*
let speedTest = SpeedTestSDK(
    serverURL: "http://api.example.com", 
    tokenHeaderKey: "Authorization", 
    tokenHeaderValue: "Bearer your-token-here"
)

// Test ping
speedTest.testPing { result in
    switch result {
    case .success(let pingTime):
        print("Ping: \(pingTime) ms")
    case .failure(let error):
        print("Ping test failed: \(error.localizedDescription)")
    }
}

// Test download speed
speedTest.testDownloadSpeed { result in
    switch result {
    case .success(let speedBps):
        print("Download speed: \(speedTest.formatSpeed(speedBps))")
    case .failure(let error):
        print("Download test failed: \(error.localizedDescription)")
    }
}

// Test upload speed
speedTest.testUploadSpeed { result in
    switch result {
    case .success(let speedBps):
        print("Upload speed: \(speedTest.formatSpeed(speedBps))")
    case .failure(let error):
        print("Upload test failed: \(error.localizedDescription)")
    }
}
*/