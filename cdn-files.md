# CDN File Structure

## CDN Root Directory
```
/cdn
  ├── validator/
  │   ├── cdn-validator.js         # Edge function for API key validation
  │   └── validator-config.json    # Configuration for validator
  ├── test-files/
  │   ├── 125KB.test              # 125KB test file for 5Mbps test
  │   └── test-file-config.json    # Configuration for test files
  ├── sdk/
  │   ├── cdn-sdk.js              # CDN SDK for client integration
  │   └── sdk-config.json         # SDK configuration
  └── index.html                  # Optional: Sample client implementation
```

## CDN SDK Implementation
```javascript
// CDN SDK Usage
import CDNValidator from 'https://your-cdn-domain.com/cdn/validator/cdn-validator.js';

const speedTest = new CDNValidator(
    'https://your-cdn-domain.com',
    'your-api-key-here'
);

// Test CDN endpoints
async function testSpeed() {
    try {
        // Ping test
        const ping = await speedTest.ping();
        
        // Download test
        const downloadSpeed = await speedTest.downloadSpeed();
        
        // Upload test
        const uploadSpeed = await speedTest.uploadSpeed();
        
        return {
            ping,
            download: downloadSpeed,
            upload: uploadSpeed
        };
    } catch (error) {
        console.error('Speed test failed:', error);
        throw error;
    }
}
```

## CDN Validator Implementation
```javascript
// CDN Validator - Edge Function
function handler(event) {
    const request = event.request;
    const headers = request.headers;
    
    // Get API key
    const apiKey = headers['x-api-key']?.value;
    
    // Validate API key
    if (!apiKey || !isValidApiKey(apiKey)) {
        return {
            statusCode: 401,
            headers: {
                'content-type': { value: 'text/plain' },
                'cache-control': { value: 'no-cache' }
            },
            body: 'Unauthorized'
        };
    }
    
    // Add cache control
    request.headers['cache-control'] = { value: 'no-cache' };
    
    return request;
}

function isValidApiKey(apiKey) {
    // Validate against CDN environment variables
    return apiKey === process.env.API_KEY;
}
```

## CDN Configuration

### Azure Front Door
```json
{
    "rules": [
        {
            "name": "APIKeyValidation",
            "order": 1,
            "enabled": true,
            "conditions": [
                {
                    "name": "HeaderCondition",
                    "parameters": {
                        "headerName": "X-API-Key",
                        "operator": "Equal",
                        "values": ["${API_KEY}"]
                    }
                }
            ],
            "actions": [
                {
                    "name": "CacheConfiguration",
                    "parameters": {
                        "cacheDuration": "0s",
                        "cacheBehavior": "BypassCache"
                    }
                }
            ]
        }
    ]
}
```

### AWS CloudFront
```json
{
    "Function": {
        "Name": "validateApiKey",
        "Code": "function handler(event) {\n    const request = event.request;\n    const headers = request.headers;\n    \n    // Check for API key\n    const apiKey = headers['x-api-key']?.value;\n    if (!apiKey || apiKey !== process.env.API_KEY) {\n        return {\n            statusCode: 401,\n            headers: {\n                'content-type': { value: 'text/plain' },\n                'cache-control': { value: 'no-cache' }\n            },\n            body: 'Unauthorized'\n        };\n    }\n    \n    return request;\n}"
    }
}
```

## Client Integration

1. Import CDN SDK:
```html
<script type="module">
    import CDNValidator from 'https://your-cdn-domain.com/cdn/sdk/cdn-sdk.js';
    
    // Initialize validator
    const validator = new CDNValidator(
        'https://your-cdn-domain.com',
        'your-api-key-here'
    );
</script>
```

2. Test CDN endpoints:
```javascript
async function runTests() {
    try {
        const results = await validator.testSpeed();
        console.log('Test Results:', results);
    } catch (error) {
        console.error('Test failed:', error);
    }
}
```

## Security Considerations

1. Use HTTPS only
2. Implement proper CORS headers
3. Add rate limiting
4. Use environment variables for API keys
5. Implement proper caching
6. Add request validation
