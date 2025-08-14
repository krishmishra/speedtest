/**
 * CDNSpeedTestSdk.js
 * 
 * A CDN-optimized speed test SDK with key-based authentication
 * This implementation is designed to work purely with CDN edge locations
 * and doesn't require any backend services.
 */

class CDNSpeedTestSdk {
    /**
     * Initialize the CDN Speed Test SDK
     * 
     * @param {string} cdnUrl - CDN endpoint URL
     * @param {string} apiKey - API key for authentication
     * @param {number} testIterations - Number of test iterations (default: 3)
     */
    constructor(cdnUrl, apiKey, testIterations = 3) {
        this.cdnUrl = cdnUrl;
        this.apiKey = apiKey;
        this.testIterations = testIterations;
        this.testSizes = {
            ping: 0, // No data for ping
            download: 125 * 1024, // 125KB for 5Mbps test
            upload: 125 * 1024   // 125KB for 5Mbps test
        };
    }

    /**
     * Generate authentication headers
     */
    getAuthHeaders() {
        return {
            'X-API-Key': this.apiKey,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };
    }

    /**
     * Test CDN ping time
     */
    async testPing() {
        try {
            const startTime = performance.now();
            
            const response = await fetch(`${this.cdnUrl}/ping?cacheBuster=${Date.now()}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Ping failed');
            
            const endTime = performance.now();
            const pingTime = endTime - startTime;
            
            return pingTime;
        } catch (error) {
            console.error('Ping test error:', error);
            throw error;
        }
    }

    /**
     * Test download speed using CDN edge locations
     */
    async testDownloadSpeed() {
        try {
            let totalSpeed = 0;
            
            for (let i = 0; i < this.testIterations; i++) {
                const startTime = performance.now();
                
                const response = await fetch(`${this.cdnUrl}/download/125KB.test?cacheBuster=${Date.now()}`, {
                    method: 'GET',
                    headers: this.getAuthHeaders()
                });
                
                if (!response.ok) throw new Error('Download failed');
                
                const blob = await response.blob();
                const endTime = performance.now();
                
                const fileSizeInBits = blob.size * 8;
                const durationInSeconds = (endTime - startTime) / 1000;
                const speedBps = fileSizeInBits / durationInSeconds;
                
                totalSpeed += speedBps;
            }
            
            const averageSpeed = totalSpeed / this.testIterations;
            return averageSpeed;
        } catch (error) {
            console.error('Download test error:', error);
            throw error;
        }
    }

    /**
     * Test upload speed using CDN edge locations
     */
    async testUploadSpeed() {
        try {
            let totalSpeed = 0;
            
            for (let i = 0; i < this.testIterations; i++) {
                // Create 125KB test file
                const testData = new Uint8Array(this.testSizes.upload);
                for (let i = 0; i < testData.length; i++) {
                    testData[i] = Math.floor(Math.random() * 256);
                }
                const testBlob = new Blob([testData]);
                
                const formData = new FormData();
                formData.append('file', testBlob, 'speedtest.bin');
                
                const startTime = performance.now();
                
                const response = await fetch(`${this.cdnUrl}/upload?cacheBuster=${Date.now()}`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: formData
                });
                
                if (!response.ok) throw new Error('Upload failed');
                
                const endTime = performance.now();
                
                const fileSizeInBits = testBlob.size * 8;
                const durationInSeconds = (endTime - startTime) / 1000;
                const speedBps = fileSizeInBits / durationInSeconds;
                
                totalSpeed += speedBps;
            }
            
            const averageSpeed = totalSpeed / this.testIterations;
            return averageSpeed;
        } catch (error) {
            console.error('Upload test error:', error);
            throw error;
        }
    }

    /**
     * Format speed for display
     */
    formatSpeed(speedBps) {
        const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
        let speed = speedBps;
        let unitIndex = 0;
        
        while (speed >= 1024 && unitIndex < units.length - 1) {
            speed /= 1024;
            unitIndex++;
        }
        
        return `${speed.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Run full test sequence
     */
    async runFullTest() {
        try {
            const results = {};
            
            // Run ping test
            const pingTime = await this.testPing();
            results.ping = pingTime;
            
            // Run download test
            const downloadSpeed = await this.testDownloadSpeed();
            results.download = {
                speedBps: downloadSpeed,
                formatted: this.formatSpeed(downloadSpeed)
            };
            
            // Run upload test
            const uploadSpeed = await this.testUploadSpeed();
            results.upload = {
                speedBps: uploadSpeed,
                formatted: this.formatSpeed(uploadSpeed)
            };
            
            return results;
        } catch (error) {
            console.error('Full test error:', error);
            throw error;
        }
    }
}

// Export the class as default export for ES6 modules
export default CDNSpeedTestSdk;

// Example usage:
/*
const speedTest = new CDNSpeedTestSdk(
    'https://your-cdn-domain.com',
    'your-api-key-here'
);

// Run full test
speedTest.runFullTest()
    .then(results => {
        console.log('Test Results:', results);
    })
    .catch(error => {
        console.error('Test failed:', error);
    });
*/
