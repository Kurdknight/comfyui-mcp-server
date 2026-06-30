import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Upload, Sparkles, Play, Download, X, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { WebSocketService } from '@/services/websocketService';
import { UploadService } from '@/services/uploadService';
import { useAuth } from '@/lib/auth-context';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import { WorkflowSchema, WorkflowInfo, ParameterValues } from '@/types/workflow';

interface GenerationResult {
  image_path?: string;
  error?: string;
}

const AIGeneration: React.FC = () => {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowInfo | null>(null);
  const [workflowSchema, setWorkflowSchema] = useState<WorkflowSchema | null>(null);
  const [parameters, setParameters] = useState<ParameterValues>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [wsService] = useState(() => {
    console.log('Creating new WebSocketService instance');
    return new WebSocketService();
  });
  const [uploadService] = useState(() => new UploadService());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Record<string, string>>({});

  // Initialize WebSocket connection
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        console.log('Initializing WebSocket connection in AIGeneration component');
        await wsService.connect();
        setConnectionStatus('connected');
        await loadWorkflows();
      } catch (error) {
        setConnectionStatus('disconnected');
        console.error('Failed to connect to WebSocket:', error);
        toast.error('Failed to connect to ComfyUI server');
      }
    };

    // Only initialize if not already connected
    if (!wsService.isConnected) {
      initializeConnection();
    } else {
      console.log('WebSocket already connected, loading workflows');
      setConnectionStatus('connected');
      loadWorkflows();
    }

    // Don't clean up WebSocket connection on unmount to prevent constant reconnections
  }, []);

  const loadWorkflows = async () => {
    try {
      const response = await wsService.listWorkflows();
      if (response.workflows) {
        setWorkflows(response.workflows);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
      toast.error('Failed to load workflows');
    }
  };

  const handleWorkflowSelect = async (workflow: WorkflowInfo) => {
    setSelectedWorkflow(workflow);
    setWorkflowSchema(null);
    setParameters({});
    setGenerationResult(null);
    
    try {
      const response = await wsService.getWorkflowSchema(workflow.id);
      if (response.schema) {
        setWorkflowSchema(response.schema);
        // Initialize parameters with defaults
        const defaultParams: ParameterValues = {};
        response.schema.parameters.forEach((param: any) => {
          defaultParams[param.id] = param.default;
        });
        setParameters(defaultParams);
      }
    } catch (error) {
      console.error('Failed to load workflow schema:', error);
      toast.error('Failed to load workflow parameters');
    }
  };

  const handleParameterChange = (name: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageUpload = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (!uploadService.isValidImageFile(file)) {
        toast.error(`Invalid file: ${file.name}`);
        continue;
      }

      try {
        const dataUrl = await uploadService.processImageForTemp(file);
        setUploadedImages(prev => ({
          ...prev,
          [file.name]: dataUrl
        }));
        toast.success(`Uploaded: ${file.name}`);
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(`Failed to upload: ${file.name}`);
      }
    }
  }, [uploadService]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleImageUpload,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif']
    },
    multiple: true
  });

  const handleGenerate = async () => {
    console.log('handleGenerate called');
    console.log('selectedWorkflow:', selectedWorkflow);
    console.log('wsService.isConnected:', wsService.isConnected);
    
    if (!selectedWorkflow) {
      console.error('No workflow selected');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationResult(null);

    // Set up progress handler for real-time updates
    wsService.onMessage('progress', (data) => {
      console.log('📊 Received progress update:', data);
      if (data.progress !== undefined) {
        setGenerationProgress(data.progress);
      }
    });

    try {
      // Check if user is authenticated
      if (!user) {
        toast.error('Please log in to generate images');
        return;
      }

      // Process parameters to match backend expectations
      const processedParams: Record<string, any> = {
        workflow_id: selectedWorkflow.id,
        user_id: user.uid, // Add user ID to parameters
        user_email: user.email || 'unknown', // Add user email for identification
      };

      // Map the new parameter ID system to backend-expected format
      Object.entries(parameters).forEach(([parameterId, value]) => {
        // Add all parameters with their parameter IDs
        processedParams[parameterId] = value;
      });

      // Add uploaded images - map to the first image parameter found
      if (Object.keys(uploadedImages).length > 0 && workflowSchema) {
        const firstImageParam = workflowSchema.parameters.find(p => p.type === 'image');
        if (firstImageParam) {
          const firstImageUrl = Object.values(uploadedImages)[0];
          processedParams[firstImageParam.id] = firstImageUrl;
        }
      }

      const generationParams = processedParams;

      console.log('Sending generation params:', generationParams);

      console.log('Calling wsService.generateImage...');
      const result = await wsService.generateImage(generationParams);
      console.log('Received result from wsService.generateImage:', result);
      
      setGenerationProgress(100);
      setGenerationResult(result);
      
      if (result.image_path) {
        toast.success('Image generated successfully!');
        console.log('✅ Generation completed successfully!');
        console.log('Generated image path:', result.image_path);
        console.log('User ID:', result.user_id);
      }
    } catch (error) {
      console.error('Error in handleGenerate:', error);
      setGenerationProgress(0);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setGenerationResult({ error: errorMessage });
      toast.error(`Generation failed: ${errorMessage}`);
    } finally {
      console.log('Generation finished, setting isGenerating to false');
      setIsGenerating(false);
    }
  };



  const removeUploadedImage = (filename: string) => {
    setUploadedImages(prev => {
      const newImages = { ...prev };
      delete newImages[filename];
      return newImages;
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">AI Image Generation</h1>
        <Badge variant={connectionStatus === 'connected' ? 'default' : 'destructive'}>
          {connectionStatus}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Workflow Selection & Parameters */}
        <div className="space-y-6">
          {/* Workflow Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Workflow</CardTitle>
              <CardDescription>Choose an AI generation workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {workflows.map((workflow) => (
                  <Card
                    key={workflow.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedWorkflow?.id === workflow.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => handleWorkflowSelect(workflow)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">{workflow.name}</h4>
                          <p className="text-sm text-muted-foreground">{workflow.description}</p>
                        </div>
                        <Badge variant="secondary">
                          {workflow.parameter_count || 0} params
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Images</CardTitle>
              <CardDescription>Upload reference images for your generation</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isDragActive ? 'Drop images here' : 'Drag & drop images or click to select'}
                </p>
              </div>
              
              {Object.entries(uploadedImages).length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {Object.entries(uploadedImages).map(([filename, dataUrl]) => (
                    <div key={filename} className="relative">
                      <img
                        src={dataUrl}
                        alt={filename}
                        className="w-full h-20 object-cover rounded-lg"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                        onClick={() => removeUploadedImage(filename)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parameters */}
          {workflowSchema && (
            <div className="space-y-4">
              <WorkflowCanvas
                schema={workflowSchema}
                values={parameters}
                onChange={handleParameterChange}
              />
            </div>
          )}
        </div>

        {/* Right Column - Generation & Results */}
        <div className="space-y-6">
          {/* Generation Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
              <CardDescription>Start the AI image generation process</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => {
                  console.log('Generate button clicked');
                  console.log('Button disabled state:', !selectedWorkflow || isGenerating || connectionStatus !== 'connected');
                  console.log('selectedWorkflow exists:', !!selectedWorkflow);
                  console.log('selectedWorkflow:', selectedWorkflow);
                  console.log('isGenerating:', isGenerating);
                  console.log('connectionStatus:', connectionStatus);
                  console.log('wsService.isConnected:', wsService.isConnected);
                  console.log('WebSocket readyState:', wsService.readyState);
                  console.log('WebSocket OPEN constant:', WebSocket.OPEN);
                  handleGenerate();
                }}
                disabled={!selectedWorkflow || isGenerating || connectionStatus !== 'connected'}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Generate Image
                  </>
                )}
              </Button>



              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(generationProgress)}%</span>
                  </div>
                  <Progress value={generationProgress} className="w-full" />
                </div>
              )}

              {connectionStatus !== 'connected' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Not connected to ComfyUI server. Please make sure the server is running on localhost:9500
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {generationResult && (
            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
              </CardHeader>
              <CardContent>
                {generationResult.error ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{generationResult.error}</AlertDescription>
                  </Alert>
                ) : generationResult.image_path ? (
                  <div className="space-y-4">
                    <img
                      src={generationResult.image_path}
                      alt="Generated image"
                      className="w-full rounded-lg shadow-md"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = generationResult.image_path!;
                        link.download = 'generated-image.png';
                        link.click();
                      }}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Image
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIGeneration; 