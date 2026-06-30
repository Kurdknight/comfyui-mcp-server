import requests
import json
import time
import logging
import os
import shutil
import websockets
import asyncio
import requests
from workflow_analyzer import WorkflowAnalyzer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ComfyUIClient")

# Legacy mapping for backward compatibility
DEFAULT_MAPPING = {
    "prompt": ("6", "text"),
    "image_url": ("192", "image"),
   # "width": ("5", "width"),
   # "height": ("5", "height"),
   # "model": ("4", "ckpt_name")
}

class ComfyUIClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.ws_url = base_url.replace("http://", "ws://") + "/ws"
        self.available_models = self._get_available_models()
        self.workflow_analyzer = WorkflowAnalyzer()

    def _get_available_models(self):
        """Fetch list of available checkpoint models from ComfyUI"""
        try:
            response = requests.get(f"{self.base_url}/object_info/CheckpointLoaderSimple")
            if response.status_code != 200:
                logger.warning("Failed to fetch model list; using default handling")
                return []
            data = response.json()
            models = data["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
            logger.info(f"Available models: {models}")
            return models
        except Exception as e:
            logger.warning(f"Error fetching models: {e}")
            return []

    def generate_image(self, prompt, image_url=None, workflow_id="flux.kontext"):
        """Legacy method for backward compatibility"""
        params = {"prompt": prompt}
        if image_url:
            params["image_url"] = image_url
        return self.generate_image_from_params(workflow_id, params)

    def generate_image_from_workflow(self, workflow_data, params):
        """Generate image using pre-processed workflow data"""
        return self._execute_workflow(workflow_data, params)

    def generate_image_from_params(self, workflow_id, params):
        """Generate image using workflow ID and parameters (enhanced with dynamic mapping)"""
        try:
            # Use the new workflow analyzer for parameter mapping
            workflow = self.workflow_analyzer.map_parameters_to_workflow(workflow_id, params)
            return self._execute_workflow(workflow, params)

        except FileNotFoundError:
            raise Exception(f"Workflow file 'workflows/{workflow_id}.json' not found")
        except ValueError as e:
            # Fallback to legacy mapping if dynamic analysis fails
            logger.warning(f"Dynamic analysis failed for {workflow_id}: {e}")
            return self._generate_image_legacy(workflow_id, params)
        except Exception as e:
            raise Exception(f"ComfyUI API error: {e}")
    
    def _generate_image_legacy(self, workflow_id, params):
        """Legacy fallback method using hardcoded mapping"""
        try:
            workflow_file = f"workflows/{workflow_id}.json"
            with open(workflow_file, "r") as f:
                workflow = json.load(f)

            # Apply parameters using the legacy DEFAULT_MAPPING
            for param_key, value in params.items():
                if param_key in DEFAULT_MAPPING:
                    node_id, input_key = DEFAULT_MAPPING[param_key]
                    if node_id not in workflow:
                        raise Exception(f"Node {node_id} not found in workflow {workflow_id}")
                    workflow[node_id]["inputs"][input_key] = value

            return self._execute_workflow(workflow, params)

        except FileNotFoundError:
            raise Exception(f"Workflow file '{workflow_file}' not found")
        except KeyError as e:
            raise Exception(f"Workflow error - invalid node or input: {e}")
        except requests.RequestException as e:
            raise Exception(f"ComfyUI API error: {e}")

    def _execute_workflow(self, workflow, params):
        """Execute a workflow and return the generated image path"""
        try:
            logger.info(f"Submitting workflow to ComfyUI...")
            response = requests.post(f"{self.base_url}/prompt", json={"prompt": workflow})
            if response.status_code != 200:
                raise Exception(f"Failed to queue workflow: {response.status_code} - {response.text}")

            prompt_id = response.json()["prompt_id"]
            logger.info(f"Queued workflow with prompt_id: {prompt_id}")

            # Use simple polling without progress callback to avoid asyncio conflicts
            result = self._execute_with_polling(prompt_id)
            return result

        except requests.RequestException as e:
            raise Exception(f"ComfyUI API error: {e}")

    async def _execute_with_progress(self, prompt_id, progress_callback):
        """Execute workflow with real-time progress updates via WebSocket"""
        try:
            # Get client ID for WebSocket connection
            client_id = f"client_{int(time.time())}"
            ws_url = f"{self.ws_url}?clientId={client_id}"
            
            logger.info(f"Connecting to ComfyUI WebSocket at {ws_url}")
            
            async with websockets.connect(ws_url) as websocket:
                logger.info("Connected to ComfyUI WebSocket")
                
                # Listen for progress updates
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type")
                        
                        if msg_type == "progress":
                            # Send progress update
                            progress_data = data.get("data", {})
                            value = progress_data.get("value", 0)
                            max_value = progress_data.get("max", 100)
                            progress_percent = (value / max_value * 100) if max_value > 0 else 0
                            
                            logger.info(f"Progress: {progress_percent:.1f}% ({value}/{max_value})")
                            progress_callback(progress_percent)
                            
                        elif msg_type == "executing":
                            # Check if execution is complete
                            node_id = data.get("data", {}).get("node")
                            if node_id is None:
                                logger.info("Workflow execution completed")
                                break
                                
                        elif msg_type == "executed":
                            # Node execution completed
                            node_id = data.get("data", {}).get("node")
                            logger.info(f"Node {node_id} executed")
                            
                    except json.JSONDecodeError:
                        logger.warning("Received non-JSON message from ComfyUI WebSocket")
                    except Exception as e:
                        logger.error(f"Error processing WebSocket message: {e}")
                        
            # After WebSocket closes, get the final result
            return self._get_final_result(prompt_id)
            
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            raise

    def _execute_with_polling(self, prompt_id):
        """Execute workflow with polling (fallback method)"""
        max_attempts = 30
        for _ in range(max_attempts):
            history = requests.get(f"{self.base_url}/history/{prompt_id}").json()
            if history.get(prompt_id):
                return self._get_final_result_from_history(prompt_id, history)
            time.sleep(1)
        raise Exception(f"Workflow {prompt_id} didn't complete within {max_attempts} seconds")



    def _get_final_result(self, prompt_id):
        """Get the final result after workflow completion"""
        history = requests.get(f"{self.base_url}/history/{prompt_id}").json()
        return self._get_final_result_from_history(prompt_id, history)

    def _get_final_result_from_history(self, prompt_id, history):
        """Extract final result from history data"""
        outputs = history[prompt_id]["outputs"]
        # Log the full output for detailed debugging
        logger.info("Full workflow outputs received: %s", json.dumps(outputs, indent=2))
        final_image_data = None
        for node_id, node_output in outputs.items():
            if "images" in node_output:
                for image in node_output["images"]:
                    if image.get("type") == "output":
                        final_image_data = image
                        break
            if final_image_data:
                break

        if not final_image_data:
            raise Exception(f"No output node with images of type 'output' found: {outputs}")

        image_filename = final_image_data["filename"]
        image_url = f"{self.base_url}/view?filename={image_filename}&subfolder=&type=output"
        logger.info(f"Generated image URL: {image_url}")

        output_dir = "output"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        response = requests.get(image_url, stream=True)
        if response.status_code == 200:
            local_filepath = os.path.join(output_dir, image_filename)
            with open(local_filepath, 'wb') as f:
                response.raw.decode_content = True
                shutil.copyfileobj(response.raw, f)
            logger.info(f"Image saved to {local_filepath}")
            return local_filepath
        else:
            logger.error(f"Failed to download image from {image_url}")
            return image_url  # Fallback to returning URL
    
    # New enhanced API methods
    def get_workflow_schema(self, workflow_id: str) -> dict:
        """Get parameter schema for a workflow"""
        try:
            schema = self.workflow_analyzer.get_workflow_schema(workflow_id)
            if not schema:
                raise ValueError(f"Workflow '{workflow_id}' not found")
            
            # Convert to dictionary format for API response
            return {
                "workflow_id": schema.workflow_id,
                "name": schema.name,
                "description": schema.description,
                "metadata": schema.metadata,
                "parameters": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "type": p.type.value,
                        "node_id": p.node_id,
                        "input_key": p.input_key,
                        "required": p.required,
                        "default": p.default,
                        "min_value": p.min_value,
                        "max_value": p.max_value,
                        "step": p.step,
                        "options": p.options,
                        "description": p.description,
                    }
                    for p in schema.parameters
                ],
                "nodes": [
                    {
                        "id": n.id,
                        "class_type": n.class_type,
                        "title": n.title,
                        "category": n.metadata.get('category', 'misc'),
                        "color": n.metadata.get('color', '#6b7280'),
                        "has_configurable_params": n.metadata.get('has_configurable_params', False),
                        "outputs": n.outputs,
                        "parameters": [
                            {
                                "id": p.id,
                                "name": p.name,
                                "type": p.type.value,
                                "input_key": p.input_key,
                                "required": p.required,
                                "default": p.default,
                                "min_value": p.min_value,
                                "max_value": p.max_value,
                                "step": p.step,
                                "options": p.options,
                                "description": p.description,
                            }
                            for p in n.parameters
                        ]
                    }
                    for n in schema.nodes
                ]
            }
        except Exception as e:
            logger.error(f"Error getting workflow schema for {workflow_id}: {e}")
            raise
    
    def list_workflows(self) -> list:
        """List all available workflows with metadata"""
        try:
            workflow_ids = self.workflow_analyzer.list_available_workflows()
            workflows = []
            
            for workflow_id in workflow_ids:
                try:
                    schema = self.workflow_analyzer.get_workflow_schema(workflow_id)
                    if schema:
                        workflows.append({
                            "id": schema.workflow_id,
                            "name": schema.name,
                            "description": schema.description,
                            "parameter_count": len(schema.parameters),
                            "metadata": schema.metadata
                        })
                except Exception as e:
                    logger.warning(f"Error analyzing workflow {workflow_id}: {e}")
                    continue
            
            return workflows
        except Exception as e:
            logger.error(f"Error listing workflows: {e}")
            raise
    
    def get_workflow_info(self, workflow_id: str) -> dict:
        """Get detailed workflow information"""
        try:
            schema = self.workflow_analyzer.get_workflow_schema(workflow_id)
            if not schema:
                raise ValueError(f"Workflow '{workflow_id}' not found")
            
            return {
                "id": schema.workflow_id,
                "name": schema.name,
                "description": schema.description,
                "metadata": schema.metadata,
                "parameter_types": {
                    param_type.value: len([p for p in schema.parameters if p.type == param_type])
                    for param_type in set(p.type for p in schema.parameters)
                },
                "has_image_input": any(p.type.value == "image" for p in schema.parameters),
                "has_text_input": any(p.type.value == "text" for p in schema.parameters),
            }
        except Exception as e:
            logger.error(f"Error getting workflow info for {workflow_id}: {e}")
            raise