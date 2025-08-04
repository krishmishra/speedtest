#!/bin/bash

# Determine which environment file to use
ENV_FILE="/usr/share/nginx/html/.env"

# Check for environment argument or ENV environment variable
if [ -n "$1" ]; then
    ENV="$1"
elif [ -n "$ENV" ]; then
    # Use ENV from environment
    echo "Using environment: $ENV"
else
    # Default to dev if not specified
    ENV="dev"
fi

# Try to load environment-specific file first, then fall back to default
if [ -f "/usr/share/nginx/html/.env.$ENV" ]; then
    ENV_FILE="/usr/share/nginx/html/.env.$ENV"
    echo "Loading environment file: $ENV_FILE"
else
    echo "Environment file for $ENV not found, using default"
fi

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
    echo "Loaded environment variables from $ENV_FILE"
else
    echo "No environment file found at $ENV_FILE"
fi

# Add WebSocket port to environment if not set
WS_PORT=${WS_PORT:-8090}
export WS_PORT

# Default values if not set in environment
ENABLE_AUTH=${ENABLE_AUTH:-false}
TOKEN_HEADER=${TOKEN_HEADER:-Authorization}
TOKEN_PREFIX=${TOKEN_PREFIX:-Bearer }
JWT_SECRET=${JWT_SECRET:-"default-secret-key-for-development-only"}

# Export environment variables for Lua scripts
echo "export ENABLE_AUTH=${ENABLE_AUTH}" > /etc/profile.d/env.sh
echo "export JWT_SECRET=${JWT_SECRET}" >> /etc/profile.d/env.sh
chmod +x /etc/profile.d/env.sh
source /etc/profile.d/env.sh

echo "Generating OpenResty configuration with JWT auth ${ENABLE_AUTH}"

# Create the main Nginx configuration file
cat > /usr/local/openresty/nginx/conf/nginx.conf << EOF
worker_processes auto;

events {
    worker_connections 1024;
}

env ENABLE_AUTH;
env JWT_SECRET;

http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile        on;
    keepalive_timeout  65;

    # Lua package path
    lua_package_path "/usr/local/openresty/lualib/?.lua;;";

    server {
        listen 8080 default_server;
        listen [::]:8080 default_server;
        
        # Increase the client body size limit to allow 2MB uploads
        client_max_body_size 2M;
        
        root /usr/share/nginx/html;
        index index.html;
        
        # CORS headers will be added in location blocks
        
        # WebSocket proxy with JWT validation
        location /ws {
            if (\$request_method = 'OPTIONS') {
                add_header 'Access-Control-Allow-Origin' '*';
                add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
                add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection';
                add_header 'Access-Control-Max-Age' 1728000;
                add_header 'Content-Type' 'text/plain charset=UTF-8';
                add_header 'Content-Length' 0;
                return 204;
            }
            
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection' always;
            access_by_lua_block {
                if os.getenv("ENABLE_AUTH") == "true" then
                    local jwt = require "resty.jwt"
                    local token = ngx.req.get_uri_args()["token"]
                    
                    if not token then
                        ngx.status = ngx.HTTP_UNAUTHORIZED
                        ngx.header.content_type = "application/json"
                        ngx.say('{"status":"error","message":"Unauthorized: Missing token"}')
                        return ngx.exit(ngx.HTTP_UNAUTHORIZED)
                    end
                    
                    local jwt_secret = os.getenv("JWT_SECRET")
                    local jwt_obj = jwt:verify(jwt_secret, token)
                    
                    if not jwt_obj.verified then
                        ngx.status = ngx.HTTP_UNAUTHORIZED
                        ngx.header.content_type = "application/json"
                        ngx.say('{"status":"error","message":"Unauthorized: Invalid token"}')
                        return ngx.exit(ngx.HTTP_UNAUTHORIZED)
                    end
                end
            }
            
            proxy_pass http://localhost:8090;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_read_timeout 86400; # 24 hours
        }

        location / {
            try_files \$uri \$uri/ =404;
        }
EOF

# Add JWT validation for protected endpoints if auth is enabled
if [ "$ENABLE_AUTH" = "true" ]; then
    # Add endpoints with JWT validation
    for endpoint in "/ping" "/upload" "/download/0.5MB.test"; do
        cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
        
        # Protected endpoint: ${endpoint}
        location = ${endpoint} {
            access_by_lua_file /usr/local/openresty/nginx/lua/jwt_auth.lua;
EOF
        
        # Add specific endpoint configuration
        if [ "$endpoint" = "/ping" ]; then
            cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
            default_type application/json;
            return 200 '{"status":"ok"}';
EOF
        elif [ "$endpoint" = "/upload" ]; then
            cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
            # Only allow POST and OPTIONS methods
            limit_except POST OPTIONS {
                deny all;
            }
            default_type application/json;
            return 200 '{"status":"ok"}';
EOF
        elif [ "$endpoint" = "/download/0.5MB.test" ]; then
            cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
            alias /usr/share/nginx/html/0.5MB.test;
EOF
        fi
        
        cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
        }
EOF
    done
else
    # No auth - simple endpoints
    cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
        
        # Ping endpoint
        location = /ping {
            if (\$request_method = 'OPTIONS') {
                add_header 'Access-Control-Allow-Origin' '*';
                add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
                add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection';
                add_header 'Access-Control-Max-Age' 1728000;
                add_header 'Content-Type' 'text/plain charset=UTF-8';
                add_header 'Content-Length' 0;
                return 204;
            }
            
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection' always;
            default_type application/json;
            return 200 '{"status":"ok"}';
        }
        
        # Upload endpoint
        location = /upload {
            if (\$request_method = 'OPTIONS') {
                add_header 'Access-Control-Allow-Origin' '*';
                add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
                add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection';
                add_header 'Access-Control-Max-Age' 1728000;
                add_header 'Content-Type' 'text/plain charset=UTF-8';
                add_header 'Content-Length' 0;
                return 204;
            }
            
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection' always;
            
            # Only allow POST and OPTIONS methods
            limit_except POST OPTIONS {
                deny all;
            }
            default_type application/json;
            return 200 '{"status":"ok"}';
        }
        
        # Download endpoint
        location = /download/0.5MB.test {
            if (\$request_method = 'OPTIONS') {
                add_header 'Access-Control-Allow-Origin' '*';
                add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
                add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection';
                add_header 'Access-Control-Max-Age' 1728000;
                add_header 'Content-Type' 'text/plain charset=UTF-8';
                add_header 'Content-Length' 0;
                return 204;
            }
            
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, ${TOKEN_HEADER}, Upgrade, Connection' always;
            alias /usr/share/nginx/html/0.5MB.test;
        }
EOF
fi

# Close the server and http blocks
cat >> /usr/local/openresty/nginx/conf/nginx.conf << EOF
    }
}
EOF

echo "Generated OpenResty configuration with JWT auth ${ENABLE_AUTH}"
cat /usr/local/openresty/nginx/conf/nginx.conf
