// Add more detailed logging to the WebSocket server
console.log('Adding enhanced logging to WebSocket server');

// Log all incoming messages as raw data
const originalOnMessage = WebSocket.prototype.onmessage;
WebSocket.prototype.onmessage = function(event) {
  console.log('Raw message received:', event.data);
  originalOnMessage.call(this, event);
};
