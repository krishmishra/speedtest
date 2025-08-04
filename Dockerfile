FROM openresty/openresty:alpine

# Build argument for environment (dev, prod)
ARG ENV=dev

# Set environment variables
ENV ENV=${ENV}
ENV WS_PORT=8090

# Install necessary tools
RUN apk add --no-cache coreutils bash nodejs npm

# Install lua-resty-jwt and dependencies
RUN apk add --no-cache curl \
    && mkdir -p /usr/local/openresty/lualib/resty/jwt \
    && mkdir -p /usr/local/openresty/lualib/resty/jwt-validators \
    && curl -L -o /usr/local/openresty/lualib/resty/jwt.lua https://raw.githubusercontent.com/cdbattags/lua-resty-jwt/master/lib/resty/jwt.lua \
    && curl -L -o /usr/local/openresty/lualib/resty/evp.lua https://raw.githubusercontent.com/cdbattags/lua-resty-jwt/master/lib/resty/evp.lua \
    && curl -L -o /usr/local/openresty/lualib/resty/hmac.lua https://raw.githubusercontent.com/cdbattags/lua-resty-jwt/master/lib/resty/hmac.lua \
    && curl -L -o /usr/local/openresty/lualib/resty/jwt/validators.lua https://raw.githubusercontent.com/SkyLothar/lua-resty-jwt-validators/master/lib/resty/jwt-validators/validators.lua

# Set working directory
WORKDIR /usr/share/nginx/html

# Create a 1MB test file for testing
RUN dd if=/dev/urandom of=1MB.test bs=1M count=1

# Create a simple JSON endpoint for ping tests (for backward compatibility)
RUN echo '{"status":"ok"}' > empty.json

# Copy configuration files
COPY .env /usr/share/nginx/html/.env
COPY .env.dev /usr/share/nginx/html/.env.dev
COPY .env.prod /usr/share/nginx/html/.env.prod
COPY openresty-config.sh /usr/share/nginx/html/openresty-config.sh
RUN chmod +x /usr/share/nginx/html/openresty-config.sh

# Create directory for Lua scripts
RUN mkdir -p /usr/local/openresty/nginx/lua

# Copy JWT authentication Lua script
COPY lua/jwt_auth.lua /usr/local/openresty/nginx/lua/

# Set up WebSocket server
WORKDIR /app
COPY package.json /app/
RUN npm install && npm install ws
COPY websocket-server.js /app/

# Copy WebSocket server to HTML directory for consistency with start script
RUN cp /app/websocket-server.js /usr/share/nginx/html/ && \
    cd /usr/share/nginx/html && npm install ws dotenv

# Copy start services script
COPY start-services.sh /usr/local/bin/start-services.sh
RUN chmod +x /usr/local/bin/start-services.sh

ENV WS_PORT=8090

# Expose port 80
EXPOSE 8080
# Expose WebSocket port
EXPOSE 8090

# Set the entrypoint to our start script
CMD ["/usr/local/bin/start-services.sh"]
