import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ParameterInput } from './ParameterInput';
import { WorkflowNode, ParameterValues } from '@/types/workflow';

interface NodeParameterCardProps {
  node: WorkflowNode;
  values: ParameterValues;
  onChange: (parameterId: string, value: any) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function NodeParameterCard({
  node,
  values,
  onChange,
  isCollapsed = false,
  onToggleCollapse,
}: NodeParameterCardProps) {
  const categoryColors = {
    conditioning: 'bg-blue-100 text-blue-800 border-blue-200',
    sampling: 'bg-purple-100 text-purple-800 border-purple-200',
    image: 'bg-green-100 text-green-800 border-green-200',
    latent: 'bg-orange-100 text-orange-800 border-orange-200',
    loaders: 'bg-red-100 text-red-800 border-red-200',
    misc: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const categoryColor = categoryColors[node.category as keyof typeof categoryColors] || categoryColors.misc;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4"
    >
      <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: node.color }}>
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={onToggleCollapse}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: node.color }}
              />
              <div>
                <CardTitle className="text-lg">{node.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className={`text-xs ${categoryColor}`}>
                    {node.category}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Node {node.id}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {node.parameters.length} params
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {node.outputs.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  → {node.outputs.length} connections
                </Badge>
              )}
              <motion.div
                animate={{ rotate: isCollapsed ? 0 : 180 }}
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
        
        <motion.div
          initial={false}
          animate={{
            height: isCollapsed ? 0 : 'auto',
            opacity: isCollapsed ? 0 : 1,
          }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <CardContent className="pt-0">
            {node.parameters.length > 0 ? (
              <div className="space-y-4">
                {node.parameters.map((parameter) => (
                                     <ParameterInput
                     key={parameter.id}
                     parameter={parameter}
                     value={values[parameter.id] ?? parameter.default}
                     onChange={(value: any) => onChange(parameter.id, value)}
                   />
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 py-4 text-center">
                No configurable parameters for this node
              </div>
            )}
          </CardContent>
        </motion.div>
      </Card>
    </motion.div>
  );
} 