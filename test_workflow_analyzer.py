#!/usr/bin/env python3

import json
import os
import logging
from workflow_analyzer import WorkflowAnalyzer
from comfyui_client import ComfyUIClient

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_workflow_analyzer():
    """Test the WorkflowAnalyzer with existing workflow files"""
    
    print("🧪 Testing WorkflowAnalyzer...")
    analyzer = WorkflowAnalyzer()
    
    # Test 1: List available workflows
    print("\n📋 Test 1: List available workflows")
    workflows = analyzer.list_available_workflows()
    print(f"Found workflows: {workflows}")
    
    # Test 2: Analyze each workflow
    print("\n📋 Test 2: Analyze each workflow")
    for workflow_id in workflows:
        print(f"\n🔍 Analyzing workflow: {workflow_id}")
        try:
            schema = analyzer.get_workflow_schema(workflow_id)
            if schema:
                print(f"  Name: {schema.name}")
                print(f"  Description: {schema.description}")
                print(f"  Parameters found: {len(schema.parameters)}")
                
                for param in schema.parameters:
                    print(f"    - {param.name} ({param.type.value})")
                    if param.default is not None:
                        print(f"      Default: {param.default}")
                    if param.min_value is not None:
                        print(f"      Range: {param.min_value} - {param.max_value}")
                    if param.options:
                        print(f"      Options: {param.options}")
                    print(f"      Description: {param.description}")
                    
        except Exception as e:
            print(f"  ❌ Error analyzing {workflow_id}: {e}")

def test_comfyui_client():
    """Test the enhanced ComfyUIClient"""
    
    print("\n🧪 Testing Enhanced ComfyUIClient...")
    client = ComfyUIClient("http://localhost:8188")
    
    # Test 1: List workflows
    print("\n📋 Test 1: List workflows via client")
    try:
        workflows = client.list_workflows()
        print(f"Client found {len(workflows)} workflows:")
        for workflow in workflows:
            print(f"  - {workflow['name']} (ID: {workflow['id']})")
            print(f"    Description: {workflow['description']}")
            print(f"    Parameters: {workflow['parameter_count']}")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    # Test 2: Get workflow schema
    print("\n📋 Test 2: Get workflow schema")
    for workflow_id in ["flux.kontext", "basic_api_test"]:
        try:
            schema = client.get_workflow_schema(workflow_id)
            print(f"  Schema for '{workflow_id}':")
            print(f"    Name: {schema['name']}")
            print(f"    Parameters: {len(schema['parameters'])}")
            print(f"    Nodes: {len(schema['nodes'])}")
            
            # Show nodes with parameters
            for node in schema['nodes']:
                if node['has_configurable_params']:
                    print(f"      📦 Node {node['id']}: {node['title']} ({node['category']})")
                    for param in node['parameters']:
                        print(f"        - {param['name']} ({param['type']})")
        except Exception as e:
            print(f"  ❌ Error getting schema for {workflow_id}: {e}")
    
    # Test 3: Get workflow info
    print("\n📋 Test 3: Get workflow info")
    try:
        info = client.get_workflow_info("flux.kontext")
        print(f"  Info for 'flux.kontext':")
        print(f"    Name: {info['name']}")
        print(f"    Has image input: {info['has_image_input']}")
        print(f"    Has text input: {info['has_text_input']}")
        print(f"    Parameter types: {info['parameter_types']}")
    except Exception as e:
        print(f"  ❌ Error getting info: {e}")

def test_parameter_mapping():
    """Test parameter mapping functionality"""
    
    print("\n🧪 Testing Parameter Mapping...")
    analyzer = WorkflowAnalyzer()
    
    # Test with flux.kontext workflow
    workflow_id = "flux.kontext"
    print(f"\n📋 Testing parameter mapping for '{workflow_id}'")
    
    # Get schema first
    schema = analyzer.get_workflow_schema(workflow_id)
    if schema:
        print(f"Schema parameters:")
        for param in schema.parameters:
            print(f"  - {param.id}: {param.name} ({param.type.value})")
        
        # Test parameter mapping
        test_params = {
            "6_text": "A beautiful sunset over mountains",
            "192_image": "test_image.png",
        }
        
        print(f"\nMapping test parameters: {test_params}")
        try:
            mapped_workflow = analyzer.map_parameters_to_workflow(workflow_id, test_params)
            print("✅ Parameter mapping successful!")
            print(f"Mapped workflow keys: {list(mapped_workflow.keys())}")
            
            # Check specific mappings
            if "6" in mapped_workflow:
                print(f"Node 6 text input: {mapped_workflow['6']['inputs'].get('text', 'NOT FOUND')}")
            if "192" in mapped_workflow:
                print(f"Node 192 image input: {mapped_workflow['192']['inputs'].get('image', 'NOT FOUND')}")
                
        except Exception as e:
            print(f"❌ Parameter mapping failed: {e}")

def main():
    print("🚀 Testing Dynamic Workflow Analysis System")
    print("=" * 50)
    
    # Check if workflow files exist
    if not os.path.exists("workflows"):
        print("❌ 'workflows' directory not found. Please make sure workflow files are available.")
        return
    
    # Run tests
    test_workflow_analyzer()
    test_comfyui_client()
    test_parameter_mapping()
    
    print("\n" + "=" * 50)
    print("✅ Testing completed!")

if __name__ == "__main__":
    main() 