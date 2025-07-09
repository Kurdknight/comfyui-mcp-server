import asyncio
import websockets
import json

payload = {
    "tool": "generate_image",
    "params": json.dumps({
        "prompt": "transform this car to a different color, like red glossy shiny",

        "image_url": "\\\\ds918\\home\\Photos\\MobileBackup\\GalaxyS20U\\DCIM\\Camera\\2024\\08\\20240805_163031.jpg",
        "workflow_id": "flux.kontext"
    })
}

async def test_mcp_server():
    uri = "ws://localhost:9000"
    try:
        async with websockets.connect(uri) as ws:
            print("Connected to MCP server")
            await ws.send(json.dumps(payload))
            response = await ws.recv()
            print("Response from server:")
            print(json.dumps(json.loads(response), indent=2))
    except Exception as e:
        print(f"WebSocket error: {e}")

if __name__ == "__main__":
    print("Testing MCP server with WebSocket...")
    asyncio.run(test_mcp_server())