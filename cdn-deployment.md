# CDN Deployment Guide

## File Structure
```
/public
  ├── cdn
  │   ├── cdn-client.html
  │   ├── cdn-config.json
  │   └── cdn-sdk/
  │       ├── CDNSpeedTestSdk.js
  │       └── index.js
```

## CDN SDK Setup

1. Create a CDN bucket/container:
   - Azure: Create a Storage Account with CDN endpoint
   - AWS: Create an S3 bucket with CloudFront distribution

2. Upload files to CDN:
```bash
# Azure
az storage blob upload-batch --source ./cdn --destination $CONTAINER_NAME --account-name $STORAGE_ACCOUNT

# AWS
aws s3 sync ./cdn s3://$BUCKET_NAME
```

3. CDN Configuration:
   - Enable CORS
   - Set cache control headers
   - Configure CDN rules for authentication

## CDN Client Usage

1. Import CDN-hosted SDK:
```html
<script type="module">
    import CDNSpeedTestSdk from 'https://your-cdn-domain.com/cdn/cdn-sdk/CDNSpeedTestSdk.js';
    
    // Initialize with CDN URL and API key
    const speedTest = new CDNSpeedTestSdk(
        'https://your-cdn-domain.com',
        'your-api-key-here'
    );
</script>
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
                        "values": ["your-api-key"]
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
        "Code": "function handler(event) {\n    const request = event.request;\n    const headers = request.headers;\n    \n    // Check for API key\n    const apiKey = headers['x-api-key']?.value;\n    if (!apiKey || apiKey !== process.env.API_KEY) {\n        return {\n            statusCode: 401,\n            headers: {\n                'content-type': { value: 'text/plain' }\n            },\n            body: 'Unauthorized'\n        };\n    }\n    \n    return request;\n}"
    }
}
```

## Security Considerations

1. Use HTTPS only
2. Implement rate limiting
3. Rotate API keys periodically
4. Use environment variables for sensitive data
5. Add request validation
6. Implement proper CORS headers

## Testing

1. Ping Test:
   - Measures latency
   - No data transfer
   - Uses CDN edge locations

2. Download Test:
   - 125KB file (5Mbps test)
   - Multiple iterations
   - CDN edge locations

3. Upload Test:
   - 125KB file (5Mbps test)
   - Multiple iterations
   - CDN edge locations
   - Form data upload

## Performance Optimization

1. Use CDN edge locations
2. Implement proper caching
3. Use chunked uploads/downloads
4. Add connection keep-alive
5. Implement proper error handling
