import json
import os
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class ParameterType(Enum):
    TEXT = "text"
    IMAGE = "image"
    NUMBER = "number"
    SLIDER = "slider"
    DROPDOWN = "dropdown"
    CHECKBOX = "checkbox"
    SEED = "seed"

@dataclass
class Parameter:
    id: str
    name: str
    type: ParameterType
    node_id: str
    input_key: str
    required: bool = True
    default: Any = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    options: Optional[List[str]] = None
    description: Optional[str] = None

@dataclass
class WorkflowNode:
    id: str
    class_type: str
    title: str
    parameters: List[Parameter]
    inputs: Dict[str, Any]
    outputs: List[str]
    metadata: Dict[str, Any]

@dataclass
class WorkflowSchema:
    workflow_id: str
    name: str
    description: str
    parameters: List[Parameter]
    nodes: List[WorkflowNode]
    metadata: Dict[str, Any]

class WorkflowAnalyzer:
    """
    Dynamic workflow analyzer that can detect user-configurable parameters
    from any ComfyUI workflow JSON file.
    """
    
    def __init__(self):
        self.workflow_cache = {}
        
    def analyze_workflow(self, workflow_path: str) -> WorkflowSchema:
        """
        Analyze a workflow JSON file and return a schema with user-configurable parameters.
        """
        try:
            with open(workflow_path, 'r') as f:
                workflow_data = json.load(f)
            
            workflow_id = os.path.basename(workflow_path).replace('.json', '')
            
            # Extract parameters and nodes from the workflow
            parameters, nodes = self._extract_parameters_and_nodes(workflow_data)
            
            # Create workflow schema
            schema = WorkflowSchema(
                workflow_id=workflow_id,
                name=self._generate_workflow_name(workflow_id),
                description=self._generate_workflow_description(workflow_data, parameters),
                parameters=parameters,
                nodes=nodes,
                metadata=self._extract_metadata(workflow_data)
            )
            
            # Cache the schema
            self.workflow_cache[workflow_id] = schema
            
            logger.info(f"Analyzed workflow '{workflow_id}' with {len(parameters)} parameters")
            return schema
            
        except Exception as e:
            logger.error(f"Error analyzing workflow {workflow_path}: {e}")
            raise
    
    def _extract_parameters_and_nodes(self, workflow_data: Dict) -> Tuple[List[Parameter], List[WorkflowNode]]:
        """
        Extract user-configurable parameters and nodes from workflow data.
        """
        parameters = []
        nodes = []
        
        for node_id, node_data in workflow_data.items():
            if not isinstance(node_data, dict):
                continue
                
            class_type = node_data.get('class_type', '')
            inputs = node_data.get('inputs', {})
            meta = node_data.get('_meta', {})
            
            # Extract parameters for this node
            node_parameters = []
            for input_key, input_value in inputs.items():
                param = self._analyze_input(node_id, input_key, input_value, class_type, meta)
                if param:
                    parameters.append(param)
                    node_parameters.append(param)
            
            # Extract output connections (what this node connects to)
            outputs = self._extract_node_outputs(node_id, workflow_data)
            
            # Create node object
            node = WorkflowNode(
                id=node_id,
                class_type=class_type,
                title=meta.get('title', self._generate_node_title(class_type)),
                parameters=node_parameters,
                inputs=inputs,
                outputs=outputs,
                metadata={
                    'position': meta.get('position', None),
                    'size': meta.get('size', None),
                    'color': self._get_node_color(class_type),
                    'category': self._get_node_category(class_type),
                    'has_configurable_params': len(node_parameters) > 0
                }
            )
            nodes.append(node)
        
        return parameters, nodes
    
    def _analyze_input(self, node_id: str, input_key: str, input_value: Any, 
                      class_type: str, meta: Dict) -> Optional[Parameter]:
        """
        Analyze a single input to determine if it's user-configurable.
        """
        # Skip inputs that are connections to other nodes (arrays)
        if isinstance(input_value, list) and len(input_value) == 2:
            return None
        
        # Determine parameter type based on class_type and input_key
        param_type = self._determine_parameter_type(class_type, input_key, input_value)
        
        if param_type is None:
            return None
        
        # Generate parameter ID and name
        param_id = f"{node_id}_{input_key}"
        param_name = self._generate_parameter_name(input_key, class_type, meta)
        
        # Create parameter with constraints
        parameter = Parameter(
            id=param_id,
            name=param_name,
            type=param_type,
            node_id=node_id,
            input_key=input_key,
            default=input_value,
            description=self._generate_parameter_description(input_key, class_type, param_type)
        )
        
        # Add type-specific constraints
        self._add_parameter_constraints(parameter, class_type, input_key, input_value)
        
        return parameter
    
    def _determine_parameter_type(self, class_type: str, input_key: str, input_value: Any) -> Optional[ParameterType]:
        """
        Determine the parameter type based on ComfyUI node characteristics.
        """
        # Text inputs
        if class_type == 'CLIPTextEncode' and input_key == 'text':
            return ParameterType.TEXT
        
        # Image inputs
        if class_type == 'LoadImage' and input_key == 'image':
            return ParameterType.IMAGE
        if class_type == 'LoadImageFromUrl' and input_key == 'image':
            return ParameterType.IMAGE
        
        # Numeric inputs with different UI types
        if class_type == 'KSampler':
            if input_key == 'seed':
                return ParameterType.SEED
            elif input_key in ['steps', 'cfg']:
                return ParameterType.SLIDER
            elif input_key in ['sampler_name', 'scheduler']:
                return ParameterType.DROPDOWN
        
        # Checkpoint/model selection
        if class_type == 'CheckpointLoaderSimple' and input_key == 'ckpt_name':
            return ParameterType.DROPDOWN
        
        # Image dimensions
        if class_type == 'EmptyLatentImage' and input_key in ['width', 'height']:
            return ParameterType.NUMBER
        
        # Guidance values (sliders)
        if class_type == 'FluxGuidance' and input_key == 'guidance':
            return ParameterType.SLIDER
        
        # Boolean values
        if isinstance(input_value, bool):
            return ParameterType.CHECKBOX
        
        # Numeric values (default to number input)
        if isinstance(input_value, (int, float)):
            return ParameterType.NUMBER
        
        # String values (default to text input)
        if isinstance(input_value, str) and not input_value.startswith('['):
            return ParameterType.TEXT
        
        return None
    
    def _add_parameter_constraints(self, parameter: Parameter, class_type: str, input_key: str, input_value: Any):
        """
        Add type-specific constraints to parameters.
        """
        if parameter.type == ParameterType.SLIDER:
            if class_type == 'KSampler':
                if input_key == 'steps':
                    parameter.min_value = 1
                    parameter.max_value = 100
                    parameter.step = 1
                elif input_key == 'cfg':
                    parameter.min_value = 0.0
                    parameter.max_value = 20.0
                    parameter.step = 0.1
            elif class_type == 'FluxGuidance' and input_key == 'guidance':
                parameter.min_value = 0.0
                parameter.max_value = 10.0
                parameter.step = 0.1
        
        elif parameter.type == ParameterType.NUMBER:
            if class_type == 'EmptyLatentImage' and input_key in ['width', 'height']:
                parameter.min_value = 64
                parameter.max_value = 2048
                parameter.step = 8
        
        elif parameter.type == ParameterType.DROPDOWN:
            if class_type == 'KSampler':
                if input_key == 'sampler_name':
                    parameter.options = ['euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpm_fast', 'dpm_adaptive', 'ddim', 'plms']
                elif input_key == 'scheduler':
                    parameter.options = ['normal', 'karras', 'exponential', 'simple', 'ddim_uniform']
        
        elif parameter.type == ParameterType.SEED:
            parameter.min_value = 0
            parameter.max_value = 2**32 - 1
            parameter.step = 1
    
    def _generate_parameter_name(self, input_key: str, class_type: str, meta: Dict) -> str:
        """
        Generate a human-readable parameter name.
        """
        # Use meta title if available
        title = meta.get('title', '')
        if title and input_key in title.lower():
            return title
        
        # Generate name based on input key
        name_map = {
            'text': 'Prompt',
            'image': 'Input Image',
            'steps': 'Steps',
            'cfg': 'CFG Scale',
            'seed': 'Seed',
            'sampler_name': 'Sampler',
            'scheduler': 'Scheduler',
            'width': 'Width',
            'height': 'Height',
            'guidance': 'Guidance',
            'ckpt_name': 'Model',
            'denoise': 'Denoise',
        }
        
        return name_map.get(input_key, input_key.replace('_', ' ').title())
    
    def _generate_parameter_description(self, input_key: str, class_type: str, param_type: ParameterType) -> str:
        """
        Generate helpful descriptions for parameters.
        """
        descriptions = {
            'text': 'Enter your prompt describing the image you want to generate',
            'image': 'Upload an input image for processing',
            'steps': 'Number of sampling steps (higher = more quality, longer time)',
            'cfg': 'How closely to follow the prompt (higher = more faithful)',
            'seed': 'Random seed for reproducible results',
            'sampler_name': 'Sampling method to use',
            'scheduler': 'Noise schedule for sampling',
            'width': 'Output image width in pixels',
            'height': 'Output image height in pixels',
            'guidance': 'Guidance strength for the model',
            'ckpt_name': 'Checkpoint model to use for generation',
            'denoise': 'Denoising strength (1.0 = full denoise, 0.0 = no denoise)',
        }
        
        return descriptions.get(input_key, f'{param_type.value.title()} parameter')
    
    def _generate_workflow_name(self, workflow_id: str) -> str:
        """
        Generate a human-readable workflow name.
        """
        name_map = {
            'flux.kontext': 'Flux Kontext (Image Enhancement)',
            'basic_api_test': 'Basic Text-to-Image',
            'basic': 'Basic Workflow',
        }
        
        return name_map.get(workflow_id, workflow_id.replace('_', ' ').title())
    
    def _generate_workflow_description(self, workflow_data: Dict, parameters: List[Parameter]) -> str:
        """
        Generate a description for the workflow.
        """
        # Count parameter types
        has_text = any(p.type == ParameterType.TEXT for p in parameters)
        has_image = any(p.type == ParameterType.IMAGE for p in parameters)
        
        if has_text and has_image:
            return "Image-to-image generation with text prompts"
        elif has_text:
            return "Text-to-image generation"
        elif has_image:
            return "Image processing workflow"
        else:
            return "AI generation workflow"
    
    def _extract_metadata(self, workflow_data: Dict) -> Dict[str, Any]:
        """
        Extract metadata from the workflow.
        """
        return {
            'node_count': len(workflow_data),
            'node_types': list(set(node.get('class_type', '') for node in workflow_data.values() if isinstance(node, dict))),
        }
    
    def get_workflow_schema(self, workflow_id: str) -> Optional[WorkflowSchema]:
        """
        Get cached workflow schema or analyze if not cached.
        """
        if workflow_id in self.workflow_cache:
            return self.workflow_cache[workflow_id]
        
        workflow_path = f"workflows/{workflow_id}.json"
        if os.path.exists(workflow_path):
            return self.analyze_workflow(workflow_path)
        
        return None
    
    def list_available_workflows(self) -> List[str]:
        """
        List all available workflow files.
        """
        workflows = []
        if os.path.exists("workflows"):
            for filename in os.listdir("workflows"):
                if filename.endswith(".json"):
                    workflows.append(filename.replace(".json", ""))
        return workflows
    
    def _extract_node_outputs(self, node_id: str, workflow_data: Dict) -> List[str]:
        """
        Extract what nodes this node outputs to.
        """
        outputs = []
        for other_node_id, other_node_data in workflow_data.items():
            if not isinstance(other_node_data, dict):
                continue
            
            inputs = other_node_data.get('inputs', {})
            for input_key, input_value in inputs.items():
                # Check if this input references our node
                if (isinstance(input_value, list) and 
                    len(input_value) == 2 and 
                    input_value[0] == node_id):
                    outputs.append(f"{other_node_id}:{input_key}")
        
        return outputs
    
    def _generate_node_title(self, class_type: str) -> str:
        """
        Generate a human-readable title for a node based on its class type.
        """
        title_map = {
            'CLIPTextEncode': 'Text Prompt',
            'KSampler': 'Sampler',
            'VAEDecode': 'VAE Decode',
            'VAEEncode': 'VAE Encode',
            'SaveImage': 'Save Image',
            'LoadImage': 'Load Image',
            'LoadImageFromUrl': 'Load Image from URL',
            'CheckpointLoaderSimple': 'Load Checkpoint',
            'VAELoader': 'Load VAE',
            'EmptyLatentImage': 'Empty Latent',
            'FluxGuidance': 'Flux Guidance',
            'DualCLIPLoader': 'Dual CLIP Loader',
            'ImageStitch': 'Image Stitch',
            'ReferenceLatent': 'Reference Latent',
            'ConditioningZeroOut': 'Conditioning Zero Out',
            'NunchakuFluxDiTLoader': 'Nunchaku Flux DiT Loader',
            'FluxKontextImageScale': 'Flux Kontext Image Scale',
        }
        
        return title_map.get(class_type, class_type.replace('_', ' ').title())
    
    def _get_node_color(self, class_type: str) -> str:
        """
        Get a color for the node based on its category.
        """
        color_map = {
            # Input nodes
            'CLIPTextEncode': '#4f46e5',  # Indigo
            'LoadImage': '#059669',       # Green
            'LoadImageFromUrl': '#059669',
            'EmptyLatentImage': '#dc2626', # Red
            
            # Processing nodes
            'KSampler': '#7c3aed',        # Purple
            'VAEDecode': '#ea580c',       # Orange
            'VAEEncode': '#ea580c',
            'FluxGuidance': '#7c3aed',
            'ImageStitch': '#0891b2',     # Cyan
            'ReferenceLatent': '#7c3aed',
            'ConditioningZeroOut': '#7c3aed',
            'FluxKontextImageScale': '#0891b2',
            
            # Model loaders
            'CheckpointLoaderSimple': '#dc2626',
            'VAELoader': '#dc2626',
            'DualCLIPLoader': '#dc2626',
            'NunchakuFluxDiTLoader': '#dc2626',
            
            # Output nodes
            'SaveImage': '#059669',
        }
        
        return color_map.get(class_type, '#6b7280')  # Default gray
    
    def _get_node_category(self, class_type: str) -> str:
        """
        Get the category of a node for organization.
        """
        category_map = {
            # Input/Output
            'CLIPTextEncode': 'conditioning',
            'LoadImage': 'image',
            'LoadImageFromUrl': 'image',
            'SaveImage': 'image',
            'EmptyLatentImage': 'latent',
            
            # Processing
            'KSampler': 'sampling',
            'VAEDecode': 'latent',
            'VAEEncode': 'latent',
            'FluxGuidance': 'conditioning',
            'ImageStitch': 'image',
            'ReferenceLatent': 'conditioning',
            'ConditioningZeroOut': 'conditioning',
            'FluxKontextImageScale': 'image',
            
            # Loaders
            'CheckpointLoaderSimple': 'loaders',
            'VAELoader': 'loaders',
            'DualCLIPLoader': 'loaders',
            'NunchakuFluxDiTLoader': 'loaders',
        }
        
        return category_map.get(class_type, 'misc')
    
    def map_parameters_to_workflow(self, workflow_id: str, user_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map user parameters to workflow node inputs.
        """
        schema = self.get_workflow_schema(workflow_id)
        if not schema:
            raise ValueError(f"Workflow schema not found for {workflow_id}")
        
        # Load the original workflow
        workflow_path = f"workflows/{workflow_id}.json"
        with open(workflow_path, 'r') as f:
            workflow_data = json.load(f)
        
        # Apply user parameters
        for param in schema.parameters:
            param_value = user_params.get(param.id)
            if param_value is not None:
                # Handle special cases
                if param.type == ParameterType.SEED and param_value == -1:
                    # Generate random seed
                    import random
                    param_value = random.randint(0, 2**32 - 1)
                
                # Apply to workflow
                workflow_data[param.node_id]["inputs"][param.input_key] = param_value
        
        return workflow_data 