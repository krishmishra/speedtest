class SpeedTestSDK {
    constructor(serverURL, tokenHeaderKey, tokenHeaderValue, testIterations = 3) {
      this.serverURL = serverURL;
      this.tokenHeaderKey = tokenHeaderKey;
      this.tokenHeaderValue = tokenHeaderValue;
      this.testIterations = testIterations;
    }
  
    // Test ping time
    async testPing() {
      try {
        const startTime = performance.now();
        
        const headers = {};
        if (this.tokenHeaderKey && this.tokenHeaderKey.trim() !== '') {
          headers[this.tokenHeaderKey] = this.tokenHeaderValue;
        }
        
        const response = await fetch(`${this.serverURL}/ping?cacheBuster=${Date.now()}`, {
          method: 'GET',
          headers: headers
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
  
    // Test download speed
    async testDownloadSpeed() {
      try {
        let totalSpeed = 0;
        
        for (let i = 0; i < this.testIterations; i++) {
          const startTime = performance.now();
          
          const headers = {};
          if (this.tokenHeaderKey && this.tokenHeaderKey.trim() !== '') {
            headers[this.tokenHeaderKey] = this.tokenHeaderValue;
          }
          
          const response = await fetch(`${this.serverURL}/download/0.5MB.test?cacheBuster=${Date.now()}`, {
            method: 'GET',
            headers: headers
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
  
    // Test upload speed
    async testUploadSpeed() {
      try {
        // Create a 0.5MB file to upload
        const testData = new Uint8Array(512 * 1024); // 0.5MB of data
        for (let i = 0; i < testData.length; i++) {
          testData[i] = Math.floor(Math.random() * 256);
        }
        const testBlob = new Blob([testData]);
        
        let totalSpeed = 0;
        
        for (let i = 0; i < this.testIterations; i++) {
          const formData = new FormData();
          formData.append('file', testBlob, 'speedtest.bin');
          
          const startTime = performance.now();
          
          const headers = {};
          if (this.tokenHeaderKey && this.tokenHeaderKey.trim() !== '') {
            headers[this.tokenHeaderKey] = this.tokenHeaderValue;
          }
          
          const response = await fetch(`${this.serverURL}/upload?cacheBuster=${Date.now()}`, {
            method: 'POST',
            headers: headers,
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
  
    // Format speed for display
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
  }
  
  // Example usage:
  /*
  import { SpeedTestSDK } from './SpeedTestSDK';
  
  // Create a new instance with your server URL and token
  const speedTest = new SpeedTestSDK(
    'http://api.example.com',
    'Authorization',
    'Bearer your-token-here'
  );
  
  // Test ping
  const testPing = async () => {
    try {
      const pingTime = await speedTest.testPing();
      console.log(`Ping: ${pingTime.toFixed(2)} ms`);
      return pingTime;
    } catch (error) {
      console.error('Ping test failed:', error);
      return null;
    }
  };
  
  // Test download speed
  const testDownload = async () => {
    try {
      const downloadSpeed = await speedTest.testDownloadSpeed();
      console.log(`Download speed: ${speedTest.formatSpeed(downloadSpeed)}`);
      return downloadSpeed;
    } catch (error) {
      console.error('Download test failed:', error);
      return null;
    }
  };
  
  // Test upload speed
  const testUpload = async () => {
    try {
      const uploadSpeed = await speedTest.testUploadSpeed();
      console.log(`Upload speed: ${speedTest.formatSpeed(uploadSpeed)}`);
      return uploadSpeed;
    } catch (error) {
      console.error('Upload test failed:', error);
      return null;
    }
  };
  
  // Run all tests
  const runFullTest = async () => {
    await testPing();
    await testDownload();
    await testUpload();
  };
  */

// Export the class as default export for ES6 modules
export default SpeedTestSDK;