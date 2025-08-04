#!/bin/bash

# Generate OpenResty configuration
cd /usr/share/nginx/html
./openresty-config.sh

# Start WebSocket server in the background
node websocket-server.js &

# Start OpenResty in the foreground
openresty -g "daemon off;"
