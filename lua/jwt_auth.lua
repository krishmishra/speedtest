-- jwt_auth.lua
-- JWT validation script for OpenResty

local jwt = require "resty.jwt"
local validators = require "resty.jwt-validators"
local cjson = require "cjson"

-- Get JWT secret from environment variable
local jwt_secret = os.getenv("JWT_SECRET")
if not jwt_secret then
    ngx.log(ngx.ERR, "JWT_SECRET environment variable not set")
    return ngx.exit(ngx.HTTP_UNAUTHORIZED)
end

-- Function to validate JWT token
local function validate_jwt_token()
    -- Get the token from the Authorization header
    local auth_header = ngx.var.http_authorization
    if not auth_header then
        ngx.log(ngx.ERR, "No Authorization header")
        return false
    end
    
    -- Extract the token (remove "Bearer " prefix if present)
    local _, _, token = string.find(auth_header, "Bearer%s+(.+)")
    if not token then
        token = auth_header  -- No Bearer prefix, use the whole header
    end
    
    -- Verify the token
    local jwt_obj = jwt:verify(jwt_secret, token)
    if not jwt_obj.verified then
        ngx.log(ngx.ERR, "Invalid JWT: ", jwt_obj.reason)
        return false
    end
    
    -- Check if token is expired
    if jwt_obj.payload.exp and jwt_obj.payload.exp < ngx.time() then
        ngx.log(ngx.ERR, "JWT token expired")
        return false
    end
    
    -- Store user info in Nginx variables for potential use in other parts of the config
    if jwt_obj.payload.sub then
        ngx.var.jwt_user = jwt_obj.payload.sub
    end
    
    return true
end

-- Main execution
local enable_auth = os.getenv("ENABLE_AUTH")
if enable_auth == "true" then
    if not validate_jwt_token() then
        ngx.status = ngx.HTTP_UNAUTHORIZED
        ngx.header.content_type = "application/json"
        ngx.say(cjson.encode({status = "error", message = "Unauthorized: Invalid or missing JWT token"}))
        return ngx.exit(ngx.HTTP_UNAUTHORIZED)
    end
else
    ngx.log(ngx.INFO, "JWT authentication disabled")
end
