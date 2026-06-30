// Types for workflow schema and parameters
export interface Parameter {
  id: string;
  name: string;
  type: 'text' | 'image' | 'number' | 'slider' | 'dropdown' | 'checkbox' | 'seed';
  node_id: string;
  input_key: string;
  required: boolean;
  default: any;
  min_value?: number;
  max_value?: number;
  step?: number;
  options?: string[];
  description?: string;
}

export interface WorkflowNode {
  id: string;
  class_type: string;
  title: string;
  category: string;
  color: string;
  has_configurable_params: boolean;
  outputs: string[];
  parameters: Parameter[];
}

export interface WorkflowSchema {
  workflow_id: string;
  name: string;
  description: string;
  metadata: {
    node_count: number;
    node_types: string[];
  };
  parameters: Parameter[];
  nodes: WorkflowNode[];
}

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string;
  parameter_count: number;
  metadata: {
    node_count: number;
    node_types: string[];
  };
}

// Form values for parameters
export type ParameterValues = Record<string, any>;

// Node categories for visual grouping
export interface NodeCategory {
  name: string;
  color: string;
  description: string;
  nodes: WorkflowNode[];
}

// Admin dashboard types
export interface ParameterVisibility {
  workflow_id: string;
  parameter_id: string;
  visible: boolean;
  admin_only: boolean;
  user_groups?: string[];
}

export interface WorkflowPermissions {
  workflow_id: string;
  visible: boolean;
  admin_only: boolean;
  user_groups?: string[];
  parameter_overrides: ParameterVisibility[];
}

// User roles
export type UserRole = 'admin' | 'user' | 'guest';

export interface UserPermissions {
  role: UserRole;
  groups: string[];
  can_access_admin: boolean;
  can_modify_workflows: boolean;
} 