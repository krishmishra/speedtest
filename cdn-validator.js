/**
 * CDN Validator - Edge Function for API Key Validation
 */

function handler(event) {
    const request = event.request;
    const headers = request.headers;
    
    // Get API key from headers
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
    
    // Add cache control to prevent caching
    request.headers['cache-control'] = { value: 'no-cache' };
    
    return request;
}

/**
 * Validate API key
 */
function isValidApiKey(apiKey) {
    // In production, this would be replaced with proper key validation logic
    // For example, checking against a list of valid keys or using a key management service
    return apiKey === process.env.API_KEY;
}
