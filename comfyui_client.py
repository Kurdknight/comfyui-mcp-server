import requests
import json
import time
import logging
import os
import shutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ComfyUIClient")

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
        self.available_models = self._get_available_models()

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
        try:
            workflow_file = f"workflows/{workflow_id}.json"
            with open(workflow_file, "r") as f:
                workflow = json.load(f)

            # Prepare parameters, only including what's necessary
            params = {"prompt": prompt}
            if image_url:
                params["image_url"] = image_url

            for param_key, value in params.items():
                if param_key in DEFAULT_MAPPING:
                    node_id, input_key = DEFAULT_MAPPING[param_key]
                    if node_id not in workflow:
                        raise Exception(f"Node {node_id} not found in workflow {workflow_id}")
                    workflow[node_id]["inputs"][input_key] = value

            logger.info(f"Submitting workflow {workflow_id} to ComfyUI...")
            response = requests.post(f"{self.base_url}/prompt", json={"prompt": workflow})
            if response.status_code != 200:
                raise Exception(f"Failed to queue workflow: {response.status_code} - {response.text}")

            prompt_id = response.json()["prompt_id"]
            logger.info(f"Queued workflow with prompt_id: {prompt_id}")

            max_attempts = 30
            for _ in range(max_attempts):
                history = requests.get(f"{self.base_url}/history/{prompt_id}").json()
                if history.get(prompt_id):
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
                time.sleep(1)
            raise Exception(f"Workflow {prompt_id} didn’t complete within {max_attempts} seconds")

        except FileNotFoundError:
            raise Exception(f"Workflow file '{workflow_file}' not found")
        except KeyError as e:
            raise Exception(f"Workflow error - invalid node or input: {e}")
        except requests.RequestException as e:
            raise Exception(f"ComfyUI API error: {e}")