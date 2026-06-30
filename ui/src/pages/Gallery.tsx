import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Images, Search, Filter, Download, Heart, Trash2, Eye, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { WebSocketService } from '@/services/websocketService';
import { toast } from 'sonner';

interface GeneratedImage {
  filename: string;
  image_path: string;
  metadata: {
    user_id: string;
    user_email: string;
    prompt: string;
    workflow_id: string;
    timestamp: number;
    original_filename: string;
    user_filename: string;
    creation_time: string;
  };
}

export function Gallery() {
  const { user } = useAuth();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'recent' | 'workflow'>('all');
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [wsService] = useState(() => new WebSocketService());

  // Load user images on component mount
  useEffect(() => {
    const loadUserImages = async () => {
      if (!user) {
        console.log('👤 No user logged in, skipping image load');
        setLoading(false);
        return;
      }

      try {
        console.log('🔄 Loading images for user:', user.email);
        setLoading(true);
        
        // Connect to WebSocket
        console.log('🔌 Connecting to WebSocket...');
        await wsService.connect();
        console.log('✅ WebSocket connected, requesting user images...');
        
        // Request user images
        const response = await wsService.getUserImages(user.uid);
        console.log('📥 Received response:', response);
        
        if (response.images) {
          console.log('🖼️  Setting', response.images.length, 'images');
          setImages(response.images);
          toast.success(`Loaded ${response.images.length} images`);
        } else {
          console.log('📭 No images in response');
          setImages([]);
        }
      } catch (error) {
        console.error('❌ Failed to load user images:', error);
        toast.error('Failed to load your images');
        setImages([]);
      } finally {
        setLoading(false);
      }
    };

    loadUserImages();

    return () => {
      console.log('🔌 Disconnecting WebSocket from Gallery');
      wsService.disconnect();
    };
  }, [user, wsService]);

  const refreshImages = async () => {
    if (!user) return;
    
    try {
      console.log('🔄 Manually refreshing images...');
      setLoading(true);
      await wsService.connect();
      const response = await wsService.getUserImages(user.uid);
      
      if (response.images) {
        setImages(response.images);
        toast.success(`Refreshed ${response.images.length} images`);
      }
    } catch (error) {
      console.error('❌ Failed to refresh images:', error);
      toast.error('Failed to refresh images');
    } finally {
      setLoading(false);
    }
  };

  const filteredImages = images.filter(image => {
    const matchesSearch = image.metadata.prompt.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterBy === 'all' || 
                         (filterBy === 'recent' && Date.now() - image.metadata.timestamp * 1000 < 86400000) ||
                         (filterBy === 'workflow' && image.metadata.workflow_id === 'flux.kontext');
    return matchesSearch && matchesFilter;
  });

  const deleteImage = (filename: string) => {
    setImages(prev => prev.filter(img => img.filename !== filename));
    toast.success('Image deleted');
  };

  const downloadImage = (image: GeneratedImage) => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = image.image_path;
    link.download = image.metadata.user_filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Image downloaded');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Images className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Image Gallery</h1>
        </div>
        <Button 
          onClick={refreshImages} 
          disabled={loading || !user}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search images by prompt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={filterBy} onValueChange={(value) => setFilterBy(value as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading your images...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredImages.map((image) => (
            <Card key={image.filename} className="group hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="relative">
                  <img
                    src={image.image_path}
                    alt={image.metadata.prompt}
                    className="w-full h-48 object-cover rounded-t-lg"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg">
                    <div className="absolute top-2 right-2 flex space-x-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedImage(image)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadImage(image)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => deleteImage(image.filename)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm mb-2 line-clamp-2">
                    {image.metadata.prompt}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{image.metadata.workflow_id}</span>
                    <span>{new Date(image.metadata.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{image.metadata.creation_time}</span>
                    <span>{image.metadata.user_filename}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredImages.length === 0 && !loading && (
        <div className="text-center py-12">
          <Images className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No images found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? 'Try adjusting your search terms' : !user ? 'Please log in to view your images' : 'Generate your first image to see it here'}
          </p>
        </div>
      )}

      {/* Image Viewer Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Image Details</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedImage(null)}
              >
                ×
              </Button>
            </div>
            <div className="flex flex-col lg:flex-row">
              <div className="lg:w-2/3">
                <img
                  src={selectedImage.image_path}
                  alt={selectedImage.metadata.prompt}
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              </div>
              <div className="lg:w-1/3 p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium">Prompt</Label>
                  <p className="text-sm mt-1">{selectedImage.metadata.prompt}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Workflow</Label>
                  <p className="text-sm mt-1">{selectedImage.metadata.workflow_id}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Created</Label>
                  <p className="text-sm mt-1">{selectedImage.metadata.creation_time}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">User Email</Label>
                  <p className="text-sm mt-1">{selectedImage.metadata.user_email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Filename</Label>
                  <p className="text-sm mt-1">{selectedImage.metadata.user_filename}</p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => downloadImage(selectedImage)}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 