import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History as HistoryIcon, Clock, Search, Filter, RotateCcw, Download, Heart, Trash2 } from 'lucide-react';

interface GenerationHistoryItem {
  id: string;
  prompt: string;
  workflow: string;
  parameters: Record<string, any>;
  imagePath?: string;
  status: 'completed' | 'failed' | 'in_progress';
  timestamp: Date;
  generationTime?: number;
  errorMessage?: string;
  isFavorite: boolean;
}

// Mock data for demonstration
const mockHistory: GenerationHistoryItem[] = [
  {
    id: '1',
    prompt: 'A beautiful landscape with mountains and lakes',
    workflow: 'flux.kontext',
    parameters: { image_url: 'landscape.jpg', prompt: 'A beautiful landscape with mountains and lakes' },
    imagePath: '/output/ComfyUI_00158_.png',
    status: 'completed',
    timestamp: new Date('2025-01-14T10:30:00'),
    generationTime: 45,
    isFavorite: false
  },
  {
    id: '2',
    prompt: 'Colorize this black-and-white photo with realistic colors',
    workflow: 'flux.kontext',
    parameters: { image_url: 'oldphoto.jpg', prompt: 'Colorize this black-and-white photo with realistic colors' },
    imagePath: '/output/ComfyUI_00160_.png',
    status: 'completed',
    timestamp: new Date('2025-01-14T11:15:00'),
    generationTime: 52,
    isFavorite: true
  },
  {
    id: '3',
    prompt: 'Transform this car to a different color, like red glossy shiny',
    workflow: 'flux.kontext',
    parameters: { image_url: 'car.jpg', prompt: 'Transform this car to a different color, like red glossy shiny' },
    imagePath: '/output/ComfyUI_00162_.png',
    status: 'completed',
    timestamp: new Date('2025-01-14T12:00:00'),
    generationTime: 38,
    isFavorite: false
  },
  {
    id: '4',
    prompt: 'A futuristic city with flying cars',
    workflow: 'basic_api_test',
    parameters: { prompt: 'A futuristic city with flying cars' },
    status: 'failed',
    timestamp: new Date('2025-01-14T13:30:00'),
    errorMessage: 'Model not found',
    isFavorite: false
  },
  {
    id: '5',
    prompt: 'A cyberpunk warrior in neon-lit streets',
    workflow: 'flux.kontext',
    parameters: { prompt: 'A cyberpunk warrior in neon-lit streets' },
    status: 'in_progress',
    timestamp: new Date('2025-01-14T14:00:00'),
    isFavorite: false
  }
];

export function History() {
  const [history, setHistory] = useState<GenerationHistoryItem[]>(mockHistory);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'completed' | 'failed' | 'favorites'>('all');

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.prompt.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterBy === 'all' || 
                         (filterBy === 'completed' && item.status === 'completed') ||
                         (filterBy === 'failed' && item.status === 'failed') ||
                         (filterBy === 'favorites' && item.isFavorite);
    return matchesSearch && matchesFilter;
  });

  const toggleFavorite = (id: string) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    ));
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const retryGeneration = (item: GenerationHistoryItem) => {
    // TODO: Implement retry logic
    console.log('Retrying generation for:', item.prompt);
  };

  const downloadImage = (item: GenerationHistoryItem) => {
    if (!item.imagePath) return;
    
    const link = document.createElement('a');
    link.href = item.imagePath;
    link.download = `generated-image-${item.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusColor = (status: GenerationHistoryItem['status']) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'in_progress': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: GenerationHistoryItem['status']) => {
    switch (status) {
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'in_progress': return '⏳';
      default: return '?';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <HistoryIcon className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">Generation History</h1>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search history by prompt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={filterBy} onValueChange={(value) => setFilterBy(value as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* History Timeline */}
      <div className="space-y-4">
        {filteredHistory.map((item, index) => (
          <Card key={item.id} className="relative">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`text-lg font-mono ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{item.prompt}</h3>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {item.timestamp.toLocaleString()}
                        </span>
                        <span>Workflow: {item.workflow}</span>
                        {item.generationTime && (
                          <span>Duration: {item.generationTime}s</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Parameters */}
                  <div className="bg-muted/50 p-3 rounded-lg mb-3">
                    <Label className="text-sm font-medium">Parameters</Label>
                    <div className="mt-1 text-sm space-y-1">
                      {Object.entries(item.parameters).map(([key, value]) => (
                        <div key={key} className="flex">
                          <span className="font-mono text-xs text-muted-foreground w-20">
                            {key}:
                          </span>
                          <span className="text-xs">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Error Message */}
                  {item.status === 'failed' && item.errorMessage && (
                    <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                      <Label className="text-sm font-medium text-red-800">Error</Label>
                      <p className="text-sm text-red-700 mt-1">{item.errorMessage}</p>
                    </div>
                  )}
                </div>

                {/* Image Preview */}
                {item.imagePath && (
                  <div className="ml-4">
                    <img
                      src={item.imagePath}
                      alt={item.prompt}
                      className="w-24 h-24 object-cover rounded-lg border"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleFavorite(item.id)}
                  >
                    <Heart className={`w-4 h-4 mr-2 ${item.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                    {item.isFavorite ? 'Unfavorite' : 'Favorite'}
                  </Button>
                  
                  {item.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryGeneration(item)}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  )}
                  
                  {item.imagePath && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadImage(item)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteHistoryItem(item.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredHistory.length === 0 && (
        <div className="text-center py-12">
          <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No history found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? 'Try adjusting your search terms' : 'Your generation history will appear here'}
          </p>
        </div>
      )}

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">
                {history.filter(item => item.status === 'completed').length}
              </div>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">
                {history.filter(item => item.status === 'failed').length}
              </div>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">
                {history.filter(item => item.status === 'in_progress').length}
              </div>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">
                {history.filter(item => item.isFavorite).length}
              </div>
              <p className="text-sm text-muted-foreground">Favorites</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 