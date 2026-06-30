import asyncio
import json
import logging
import os
import base64
import uuid
import time
import requests
from typing import AsyncIterator
from contextlib import asynccontextmanager
import websockets
from mcp.server.fastmcp import FastMCP
from comfyui_client import ComfyUIClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MCP_Server")

# Create temp directory if it doesn't exist
TEMP_DIR = "temp"
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# Global ComfyUI client (fallback since context isn't available)
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://localhost:8188")
comfyui_client = ComfyUIClient(COMFYUI_URL)

# Define application context (for future use)
class AppContext:
    def __init__(self, comfyui_client: ComfyUIClient):
        self.comfyui_client = comfyui_client

# Lifespan management (placeholder for future context support)
@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """Manage application lifecycle"""
    logger.info("Starting MCP server lifecycle...")
    try:
        # Startup: Could add ComfyUI health check here in the future
        logger.info("ComfyUI client initialized globally")
        yield AppContext(comfyui_client=comfyui_client)
    finally:
        # Shutdown: Cleanup (if needed)
        logger.info("Shutting down MCP server")

# Initialize FastMCP with lifespan
mcp = FastMCP("ComfyUI_MCP_Server", lifespan=app_lifespan)

def save_uploaded_image(image_data: str, filename: str) -> str:
    """Save uploaded image data to temp folder"""
    try:
        # Handle data URLs
        if image_data.startswith('data:image/'):
            # Extract base64 data from data URL
            header, data = image_data.split(',', 1)
            image_bytes = base64.b64decode(data)
            
            # Extract file extension from data URL
            file_extension = header.split(';')[0].split('/')[-1]
            if file_extension == 'jpeg':
                file_extension = 'jpg'
            
            # Remove any existing extension from filename and add the correct one
            base_filename = filename.split('.')[0] if '.' in filename else filename
            unique_filename = f"{uuid.uuid4()}_{base_filename}.{file_extension}"
            file_path = os.path.join(TEMP_DIR, unique_filename)
            
            # Save file
            with open(file_path, 'wb') as f:
                f.write(image_bytes)
            
            logger.info(f"Saved uploaded image to: {file_path}")
            return os.path.abspath(file_path)
        else:
            # If it's already a file path, return it as absolute path
            return os.path.abspath(image_data)
    except Exception as e:
        logger.error(f"Error saving uploaded image: {e}")
        return None

def create_user_specific_image(original_image_path: str, user_id: str, user_email: str, prompt: str, workflow_id: str) -> str:
    """Create user-specific copy of generated image with metadata"""
    try:
        # Create user-specific output directory
        user_output_dir = os.path.join("output", f"user_{user_id}")
        if not os.path.exists(user_output_dir):
            os.makedirs(user_output_dir)
        
        # Create user-specific filename with timestamp
        timestamp = int(time.time())
        original_filename = os.path.basename(original_image_path)
        name_parts = original_filename.split('.')
        if len(name_parts) > 1:
            base_name = '.'.join(name_parts[:-1])
            extension = name_parts[-1]
        else:
            base_name = original_filename
            extension = 'png'
        
        # Create user-specific filename
        user_filename = f"{user_id}_{timestamp}_{base_name}.{extension}"
        user_image_path = os.path.join(user_output_dir, user_filename)
        
        # Copy the original image to user-specific location
        import shutil
        shutil.copy2(original_image_path, user_image_path)
        
        # Create metadata file
        metadata = {
            "user_id": user_id,
            "user_email": user_email,
            "prompt": prompt,
            "workflow_id": workflow_id,
            "timestamp": timestamp,
            "original_filename": original_filename,
            "user_filename": user_filename,
            "creation_time": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(timestamp))
        }
        
        metadata_path = os.path.join(user_output_dir, f"{user_filename}.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Created user-specific image: {user_image_path}")
        logger.info(f"Created metadata file: {metadata_path}")
        
        return user_image_path
    except Exception as e:
        logger.error(f"Error creating user-specific image: {e}")
        return original_image_path  # Return original path as fallback

def get_user_images(user_id: str) -> list:
    """Get all images for a specific user"""
    try:
        user_output_dir = os.path.join("output", f"user_{user_id}")
        if not os.path.exists(user_output_dir):
            return []
        
        images = []
        for filename in os.listdir(user_output_dir):
            if filename.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
                image_path = os.path.join(user_output_dir, filename)
                metadata_path = os.path.join(user_output_dir, f"{filename}.json")
                
                # Load metadata if it exists
                metadata = {}
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r') as f:
                            metadata = json.load(f)
                    except Exception as e:
                        logger.warning(f"Failed to load metadata for {filename}: {e}")
                
                images.append({
                    "filename": filename,
                    "image_path": image_path,
                    "metadata": metadata
                })
        
        # Sort by timestamp (newest first)
        images.sort(key=lambda x: x.get('metadata', {}).get('timestamp', 0), reverse=True)
        return images
    except Exception as e:
        logger.error(f"Error getting user images: {e}")
        return []

# Define the image generation tool
@mcp.tool()
def generate_image(params: str) -> dict:
    """Generate an image using ComfyUI"""
    logger.info(f"Received request with params: {params}")
    try:
        param_dict = json.loads(params)
        prompt = param_dict["prompt"]
    except Exception as e:
        logger.error(f"Error: {e}")
        return {"error": str(e)}

# WebSocket server
async def handle_websocket(websocket):
    client_id = f"client_{int(time.time())}"
    logger.info(f"🔌 WebSocket client connected: {client_id}")
    
    try:
        async for message in websocket:
            try:
                request = json.loads(message)
                tool = request.get('tool')
                logger.info(f"📨 [{client_id}] Received message - Tool: {tool}")
                
                if tool != 'ping':  # Don't spam logs with ping messages
                    logger.info(f"📋 [{client_id}] Full message: {request}")
                    logger.info(f"📋 [{client_id}] Message type: {type(request)}")
                    
            except Exception as e:
                logger.error(f"❌ [{client_id}] Error parsing message: {e}")
                await websocket.send(json.dumps({"error": f"Invalid message format: {e}"}))
                continue
                
            if request.get("tool") == "generate_image":
                try:
                    params = json.loads(request.get("params", "{}"))
                    request_id = request.get("request_id")
                    logger.info(f"=== GENERATE_IMAGE REQUEST RECEIVED ===")
                    logger.info(f"Request ID: {request_id}")
                    logger.info(f"Executing generate_image with: {params}")
                    
                    # Send progress update
                    progress_data = {"status": "starting", "progress": 0}
                    if request_id:
                        progress_data["request_id"] = request_id
                    await websocket.send(json.dumps(progress_data))
                    
                    # Extract user information
                    user_id = params.get("user_id")
                    user_email = params.get("user_email", "unknown")
                    
                    # Validate user authentication
                    if not user_id:
                        logger.error("No user_id provided in request")
                        error_data = {"error": "User authentication required"}
                        if request_id:
                            error_data["request_id"] = request_id
                        await websocket.send(json.dumps(error_data))
                        continue
                    
                    logger.info(f"Processing request for user: {user_email} (ID: {user_id})")
                    
                    # Process image_url if it's a data URL - make sure it's absolute path
                    if "image_url" in params and params["image_url"]:
                        image_data = params["image_url"]
                        if image_data.startswith('data:image/'):
                            # Convert data URL to file path with user-specific naming
                            saved_path = save_uploaded_image(image_data, f"upload_{user_id}")
                            if saved_path:
                                params["image_url"] = saved_path  # save_uploaded_image already returns absolute path
                                logger.info(f"Converted data URL to absolute file path: {saved_path}")
                            else:
                                logger.error("Failed to save uploaded image")
                                error_data = {"error": "Failed to save uploaded image"}
                                if request_id:
                                    error_data["request_id"] = request_id
                                await websocket.send(json.dumps(error_data))
                                continue
                    
                    # Send progress update
                    progress_data = {"status": "processing", "progress": 10}
                    if request_id:
                        progress_data["request_id"] = request_id
                    await websocket.send(json.dumps(progress_data))
                    
                    # Create clean params for ComfyUI client (remove user-specific params)
                    comfyui_params = {k: v for k, v in params.items() if k not in ["user_id", "user_email"]}
                    
                    # Send progress updates manually at key points
                    progress_data = {"status": "processing", "progress": 30}
                    if request_id:
                        progress_data["request_id"] = request_id
                    await websocket.send(json.dumps(progress_data))
                    
                    # Pass all params dynamically to the generate_image function
                    logger.info("=== CALLING COMFYUI CLIENT ===")
                    workflow_id = comfyui_params.get("workflow_id", "flux.kontext")
                    image_path = comfyui_client.generate_image_from_params(workflow_id, comfyui_params)
                    logger.info(f"=== COMFYUI CLIENT RETURNED: {image_path} ===")
                    
                    # Send near completion progress
                    progress_data = {"status": "processing", "progress": 95}
                    if request_id:
                        progress_data["request_id"] = request_id
                    await websocket.send(json.dumps(progress_data))
                    
                    # Create user-specific image with metadata
                    user_image_path = create_user_specific_image(
                        image_path, 
                        user_id, 
                        user_email, 
                        params.get("prompt", ""), 
                        params.get("workflow_id", "flux.kontext")
                    )
                    
                    # Create ComfyUI web URL for the generated image
                    original_filename = os.path.basename(image_path)
                    comfyui_url = f"{COMFYUI_URL}/view?filename={original_filename}&subfolder=&type=output"
                    
                    # Send final result with ComfyUI URL
                    result = {
                        "image_path": comfyui_url,  # Use ComfyUI URL instead of local path
                        "local_path": user_image_path,  # Keep local path for reference
                        "status": "completed", 
                        "progress": 100,
                        "user_id": user_id
                    }
                    if request_id:
                        result["request_id"] = request_id
                    logger.info(f"=== SENDING FINAL RESULT: {result} ===")
                    await websocket.send(json.dumps(result))
                    logger.info("=== RESULT SENT SUCCESSFULLY ===")
                except Exception as e:
                    logger.error(f"Error processing generate_image: {e}")
                    error_data = {"error": str(e)}
                    if request_id:
                        error_data["request_id"] = request_id
                    await websocket.send(json.dumps(error_data))
            
            elif request.get("tool") == "list_workflows":
                try:
                    # Use dynamic workflow analysis
                    workflows = comfyui_client.list_workflows()
                    result = {"workflows": workflows}
                    await websocket.send(json.dumps(result))
                except Exception as e:
                    logger.error(f"Error listing workflows: {e}")
                    await websocket.send(json.dumps({"error": str(e)}))
            
            elif request.get("tool") == "get_workflow_schema":
                try:
                    workflow_id = request.get("workflow_id")
                    if not workflow_id:
                        await websocket.send(json.dumps({"error": "workflow_id is required"}))
                        continue
                    
                    # Use dynamic workflow schema generation
                    schema = comfyui_client.get_workflow_schema(workflow_id)
                    result = {"schema": schema}
                    await websocket.send(json.dumps(result))
                except Exception as e:
                    logger.error(f"Error getting workflow schema: {e}")
                    await websocket.send(json.dumps({"error": str(e)}))
            
            elif request.get("tool") == "get_workflow_info":
                try:
                    workflow_id = request.get("workflow_id")
                    if not workflow_id:
                        await websocket.send(json.dumps({"error": "workflow_id is required"}))
                        continue
                    
                    # Use dynamic workflow info generation
                    info = comfyui_client.get_workflow_info(workflow_id)
                    result = {"info": info}
                    await websocket.send(json.dumps(result))
                except Exception as e:
                    logger.error(f"Error getting workflow info: {e}")
                    await websocket.send(json.dumps({"error": str(e)}))
            
            elif request.get("tool") == "get_user_images":
                try:
                    user_id = request.get("user_id")
                    logger.info(f"=== GET_USER_IMAGES REQUEST RECEIVED ===")
                    logger.info(f"User ID: {user_id}")
                    
                    if not user_id:
                        logger.error("No user_id provided")
                        await websocket.send(json.dumps({"error": "user_id is required"}))
                        continue
                    
                    # Get user-specific images
                    logger.info("=== CALLING get_user_images FUNCTION ===")
                    images = get_user_images(user_id)
                    logger.info(f"=== FOUND {len(images)} IMAGES ===")
                    
                    # Convert local paths to ComfyUI web URLs
                    web_images = []
                    for image in images:
                        # Extract filename from the user-specific path
                        filename = os.path.basename(image["image_path"])
                        
                        # Check if this corresponds to an original ComfyUI output
                        original_filename = image.get("metadata", {}).get("original_filename", filename)
                        
                        # Create ComfyUI web URL
                        comfyui_url = f"{COMFYUI_URL}/view?filename={original_filename}&subfolder=&type=output"
                        
                        web_image = {
                            **image,
                            "image_path": comfyui_url,  # Use ComfyUI URL instead of local path
                            "web_url": comfyui_url,     # Same as image_path for compatibility
                            "local_path": image["image_path"]  # Keep original path for reference
                        }
                        web_images.append(web_image)
                        logger.info(f"Converted path: {image['image_path']} -> {comfyui_url}")
                    
                    result = {"images": web_images, "user_id": user_id}
                    logger.info(f"=== SENDING GET_USER_IMAGES RESULT: {len(web_images)} images ===")
                    await websocket.send(json.dumps(result))
                    logger.info("=== GET_USER_IMAGES RESULT SENT SUCCESSFULLY ===")
                except Exception as e:
                    logger.error(f"Error getting user images: {e}", exc_info=True)
                    await websocket.send(json.dumps({"error": str(e)}))
            
            elif request.get("tool") == "get_queue_status":
                try:
                    # Get ComfyUI queue status
                    queue_response = requests.get(f"{comfyui_client.base_url}/queue")
                    if queue_response.status_code == 200:
                        queue_data = queue_response.json()
                        result = {
                            "queue_running": len(queue_data.get("queue_running", [])),
                            "queue_pending": len(queue_data.get("queue_pending", [])),
                            "queue_data": queue_data
                        }
                        await websocket.send(json.dumps(result))
                    else:
                        await websocket.send(json.dumps({"error": "Failed to get queue status"}))
                except Exception as e:
                    logger.error(f"Error getting queue status: {e}")
                    await websocket.send(json.dumps({"error": str(e)}))
            
            elif request.get("tool") == "ping":
                # Simple ping/pong to keep connection alive
                await websocket.send(json.dumps({"pong": True}))
            
            else:
                logger.warning(f"❓ [{client_id}] Unknown tool: {tool}")
                await websocket.send(json.dumps({"error": "Unknown tool"}))
    except websockets.ConnectionClosed:
        logger.info(f"🔌 [{client_id}] WebSocket client disconnected normally")
    except Exception as e:
        logger.error(f"❌ [{client_id}] WebSocket error: {e}")

# Main server loop
async def main():
    host = os.environ.get("MCP_HOST", "0.0.0.0")
    port = int(os.environ.get("MCP_PORT", "9500"))
    logger.info(f"Starting MCP server on ws://{host}:{port}...")
    async with websockets.serve(handle_websocket, host, port):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())