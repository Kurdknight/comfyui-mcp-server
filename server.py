import asyncio
import json
import logging
from typing import AsyncIterator
from contextlib import asynccontextmanager
import websockets
from mcp.server.fastmcp import FastMCP
from comfyui_client import ComfyUIClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MCP_Server")

# Global ComfyUI client (fallback since context isn’t available)
comfyui_client = ComfyUIClient("http://localhost:8188")

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
async def handle_websocket(websocket, path):
    logger.info("WebSocket client connected")
    try:
        async for message in websocket:
            request = json.loads(message)
            logger.info(f"Received message: {request}")
            if request.get("tool") == "generate_image":
                try:
                    params = json.loads(request.get("params", "{}"))
                    logger.info(f"Executing generate_image with: {params}")
                    
                    # Pass all params dynamically to the generate_image function
                    image_path = comfyui_client.generate_image(**params)
                    
                    result = {"image_path": image_path}
                    await websocket.send(json.dumps(result))
                except Exception as e:
                    logger.error(f"Error processing generate_image: {e}")
                    await websocket.send(json.dumps({"error": str(e)}))
            else:
                await websocket.send(json.dumps({"error": "Unknown tool"}))
    except websockets.ConnectionClosed:
        logger.info("WebSocket client disconnected")

# Main server loop
async def main():
    logger.info("Starting MCP server on ws://localhost:9000...")
    async with websockets.serve(handle_websocket, "localhost", 9000):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())