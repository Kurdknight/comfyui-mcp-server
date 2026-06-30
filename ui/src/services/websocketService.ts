export interface WebSocketMessage {
  tool: string;
  params?: string;
  workflow_id?: string;
  user_id?: string;
  request_id?: string;
}

export interface WebSocketResponse {
  image_path?: string;
  workflows?: any[];
  schema?: any;
  images?: any[];
  error?: string;
  status?: string;
  progress?: number;
  user_id?: string;
  request_id?: string;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: WebSocketResponse) => void> = new Map();
  private pendingRequests: Map<string, { resolve: (data: WebSocketResponse) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(private url: string = 'ws://localhost:9500') {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Close existing connection if any
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
          console.log('🔌 Closing existing WebSocket connection, state:', this.ws.readyState);
          this.ws.close();
        }

        console.log(`🔌 Connecting to WebSocket at ${this.url}`);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected to ComfyUI MCP server');
          this.reconnectAttempts = 0;
          
          // Start ping to keep connection alive
          this.startPing();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data: WebSocketResponse = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
          
          // Stop ping when connection closes
          this.stopPing();
          
          // DISABLE auto-reconnect for now to prevent instability
          // if (event.code !== 1000) {
          //   this.handleReconnect();
          // }
          console.log('Auto-reconnect disabled - connection will stay closed');
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      // Exponential backoff with longer delays
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Waiting ${delay}ms before reconnect attempt...`);
      
      setTimeout(() => {
        this.connect().catch(console.error);
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private handleMessage(data: WebSocketResponse & { status?: string; progress?: number; pong?: boolean }) {
    console.log('Received WebSocket message:', data);
    
    // Handle pong response (keep-alive)
    if (data.pong) {
      console.log('💓 Received pong - connection alive');
      return;
    }
    
    // Handle responses with request_id first (but only final results, not progress updates)
    if (data.request_id && data.status === 'completed') {
      console.log('🎯 Handling final response with request_id:', data.request_id);
      const pendingRequest = this.pendingRequests.get(data.request_id);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(data.request_id);
        
        if (data.error) {
          console.log('❌ Resolving request with error:', data.error);
          pendingRequest.reject(new Error(data.error));
        } else {
          console.log('✅ Resolving request successfully');
          pendingRequest.resolve(data);
        }
        return;
      } else {
        console.warn('⚠️ Received response for unknown request_id:', data.request_id);
      }
    }
    
    // Handle error responses with request_id
    if (data.request_id && data.error) {
      console.log('🎯 Handling error response with request_id:', data.request_id);
      const pendingRequest = this.pendingRequests.get(data.request_id);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(data.request_id);
        pendingRequest.reject(new Error(data.error));
        return;
      }
    }
    
    // Handle different types of responses (legacy system)
    if (data.image_path) {
      console.log('🖼️  Handling generate_image response');
      this.triggerHandler('generate_image', data);
    } else if (data.workflows) {
      console.log('📋 Handling list_workflows response');
      this.triggerHandler('list_workflows', data);
    } else if (data.schema) {
      console.log('🔧 Handling get_workflow_schema response');
      this.triggerHandler('get_workflow_schema', data);
    } else if (data.images) {
      console.log('🖼️  Handling get_user_images response with', data.images.length, 'images');
      this.triggerHandler('get_user_images', data);
    } else if (data.status) {
      console.log('📊 Handling progress update:', data.status, data.progress);
      // Handle progress updates
      this.triggerHandler('progress', data);
    } else if (data.error) {
      console.log('❌ Handling error response:', data.error);
      this.triggerHandler('error', data);
    } else {
      console.warn('🤷 Unknown message type:', data);
    }
  }

  private triggerHandler(type: string, data: WebSocketResponse) {
    const handler = this.messageHandlers.get(type);
    if (handler) {
      console.log(`Triggering handler for ${type}`);
      handler(data);
    } else {
      console.warn(`No handler found for message type: ${type}`);
    }
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
      throw new Error('WebSocket is not connected');
    }
  }

  // Convenience methods
  async generateImage(params: Record<string, any>): Promise<WebSocketResponse> {
    return new Promise((resolve, reject) => {
      console.log('🚀 generateImage called with params:', params);
      console.log('🔌 WebSocket connection state:', this.ws?.readyState);
      console.log('🔌 Is connected:', this.isConnected);
      
      // Check connection first
      if (!this.isConnected) {
        console.error('❌ WebSocket not connected, attempting to connect...');
        this.connect().then(() => {
          console.log('✅ Connected successfully, retrying request...');
          this.generateImage(params).then(resolve).catch(reject);
        }).catch((error) => {
          console.error('❌ Failed to connect:', error);
          reject(new Error('Failed to establish WebSocket connection'));
        });
        return;
      }
      
      // Generate unique request ID
      const requestId = `generate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('🎯 Generated request ID:', requestId);
      
      const timeout = setTimeout(() => {
        console.error('❌ Request timeout for generateImage, request ID:', requestId);
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 120000); // 2 minutes timeout

      // Store the pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send the request
      try {
        console.log('📤 Sending generate_image request with ID:', requestId);
        this.send({
          tool: 'generate_image',
          params: JSON.stringify(params),
          request_id: requestId
        });
        console.log('✅ generate_image request sent successfully');
      } catch (error) {
        console.error('❌ Error sending generate_image request:', error);
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async listWorkflows(): Promise<WebSocketResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      this.onMessage('list_workflows', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.onMessage('error', (data) => {
        clearTimeout(timeout);
        reject(new Error(data.error || 'Unknown error'));
      });

      this.send({ tool: 'list_workflows' });
    });
  }

  async getWorkflowSchema(workflowId: string): Promise<WebSocketResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      this.onMessage('get_workflow_schema', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.onMessage('error', (data) => {
        clearTimeout(timeout);
        reject(new Error(data.error || 'Unknown error'));
      });

      this.send({
        tool: 'get_workflow_schema',
        workflow_id: workflowId
      });
    });
  }

  async getUserImages(userId: string): Promise<WebSocketResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      this.onMessage('get_user_images', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.onMessage('error', (data) => {
        clearTimeout(timeout);
        reject(new Error(data.error || 'Unknown error'));
      });

      this.send({
        tool: 'get_user_images',
        user_id: userId
      });
    });
  }

  onMessage(type: string, handler: (data: WebSocketResponse) => void) {
    this.messageHandlers.set(type, handler);
  }

  disconnect() {
    console.log('Disconnecting WebSocket');
    
    // Stop ping
    this.stopPing();
    
    if (this.ws) {
      this.ws.close(1000, 'Deliberate disconnect');
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get readyState(): number | undefined {
    return this.ws?.readyState;
  }

  private startPing() {
    this.stopPing(); // Clear any existing ping
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        try {
          // Send a simple ping request
          this.send({ tool: 'ping' });
          console.log('💓 Sent ping to keep connection alive');
        } catch (error) {
          console.error('❌ Error sending ping:', error);
        }
      } else {
        console.log('⚠️ Not sending ping - WebSocket not connected');
      }
    }, 60000); // Ping every 60 seconds (reduced frequency)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }


} 