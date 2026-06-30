import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NodeParameterCard } from './NodeParameterCard';
import { WorkflowSchema, WorkflowNode, ParameterValues, NodeCategory } from '@/types/workflow';

interface WorkflowCanvasProps {
  schema: WorkflowSchema;
  values: ParameterValues;
  onChange: (parameterId: string, value: any) => void;
}

export function WorkflowCanvas({ schema, values, onChange }: WorkflowCanvasProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Group nodes by category
  const nodesByCategory = useMemo(() => {
    const categories: Record<string, WorkflowNode[]> = {};
    const configurableNodes = schema.nodes.filter(node => node.has_configurable_params);
    
    configurableNodes.forEach(node => {
      const category = node.category || 'misc';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(node);
    });

    return categories;
  }, [schema.nodes]);

  // Create node categories with metadata
  const categories: NodeCategory[] = useMemo(() => {
    const categoryInfo: Record<string, { name: string; color: string; description: string }> = {
      conditioning: {
        name: 'Conditioning',
        color: '#4f46e5',
        description: 'Text prompts and conditioning nodes',
      },
      sampling: {
        name: 'Sampling',
        color: '#7c3aed',
        description: 'Sampling and generation nodes',
      },
      image: {
        name: 'Image',
        color: '#059669',
        description: 'Image processing and manipulation nodes',
      },
      latent: {
        name: 'Latent',
        color: '#ea580c',
        description: 'Latent space operations',
      },
      loaders: {
        name: 'Loaders',
        color: '#dc2626',
        description: 'Model and resource loading nodes',
      },
      misc: {
        name: 'Miscellaneous',
        color: '#6b7280',
        description: 'Other utility nodes',
      },
    };

    return Object.entries(nodesByCategory).map(([categoryKey, nodes]) => ({
      name: categoryInfo[categoryKey]?.name || categoryKey,
      color: categoryInfo[categoryKey]?.color || '#6b7280',
      description: categoryInfo[categoryKey]?.description || 'Miscellaneous nodes',
      nodes: nodes.sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [nodesByCategory]);

  const toggleNodeCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const toggleCategoryCollapse = (categoryName: string) => {
    setCollapsedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  const expandAllNodes = () => {
    setCollapsedNodes(new Set());
    setCollapsedCategories(new Set());
  };

  const collapseAllNodes = () => {
    const allNodeIds = schema.nodes.map(node => node.id);
    setCollapsedNodes(new Set(allNodeIds));
    setCollapsedCategories(new Set(categories.map(cat => cat.name)));
  };

  const totalConfigurableParams = schema.nodes.reduce(
    (sum, node) => sum + node.parameters.length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">{schema.name}</CardTitle>
              <p className="text-sm text-gray-600 mt-1">{schema.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {schema.nodes.length} nodes
              </Badge>
              <Badge variant="outline">
                {totalConfigurableParams} parameters
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={expandAllNodes}
            >
              Expand All
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={collapseAllNodes}
            >
              Collapse All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="categories">By Category</TabsTrigger>
          <TabsTrigger value="all">All Nodes</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          {categories.map(category => (
            <motion.div
              key={category.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader 
                  className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleCategoryCollapse(category.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <div>
                        <CardTitle className="text-lg">{category.name}</CardTitle>
                        <p className="text-sm text-gray-600">{category.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {category.nodes.length} nodes
                      </Badge>
                      <Badge variant="outline">
                        {category.nodes.reduce((sum, node) => sum + node.parameters.length, 0)} params
                      </Badge>
                      <motion.div
                        animate={{ rotate: collapsedCategories.has(category.name) ? 0 : 180 }}
                        transition={{ duration: 0.2 }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </motion.div>
                    </div>
                  </div>
                </CardHeader>
                
                <AnimatePresence>
                  {!collapsedCategories.has(category.name) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {category.nodes.map(node => (
                            <NodeParameterCard
                              key={node.id}
                              node={node}
                              values={values}
                              onChange={onChange}
                              isCollapsed={collapsedNodes.has(node.id)}
                              onToggleCollapse={() => toggleNodeCollapse(node.id)}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4">
            {schema.nodes
              .filter(node => node.has_configurable_params)
              .map(node => (
                <NodeParameterCard
                  key={node.id}
                  node={node}
                  values={values}
                  onChange={onChange}
                  isCollapsed={collapsedNodes.has(node.id)}
                  onToggleCollapse={() => toggleNodeCollapse(node.id)}
                />
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 