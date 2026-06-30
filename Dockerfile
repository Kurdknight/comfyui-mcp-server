FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py comfyui_client.py workflow_analyzer.py ./
COPY workflows ./workflows

ENV MCP_HOST=0.0.0.0 \
    MCP_PORT=9500 \
    COMFYUI_URL=http://localhost:8188

EXPOSE 9500

CMD ["python", "server.py"]
