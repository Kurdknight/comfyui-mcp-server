import React, { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDropzone } from 'react-dropzone';
import { Parameter } from '@/types/workflow';

interface ParameterInputProps {
  parameter: Parameter;
  value: any;
  onChange: (value: any) => void;
}

export function ParameterInput({ parameter, value, onChange }: ParameterInputProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const reader = new FileReader();
        reader.onload = () => {
          onChange(reader.result);
        };
        reader.readAsDataURL(file);
      }
    },
    [onChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
    },
    maxFiles: 1,
  });

  const renderInput = () => {
    switch (parameter.type) {
      case 'text':
        if (parameter.default && typeof parameter.default === 'string' && parameter.default.length > 100) {
          return (
            <Textarea
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Enter ${parameter.name.toLowerCase()}...`}
              className="min-h-[100px]"
            />
          );
        }
        return (
          <Input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${parameter.name.toLowerCase()}...`}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value ?? parameter.default ?? 0}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={parameter.min_value}
            max={parameter.max_value}
            step={parameter.step || 1}
          />
        );

      case 'slider':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Slider
                value={[value ?? parameter.default ?? 0]}
                onValueChange={(vals) => onChange(vals[0])}
                min={parameter.min_value || 0}
                max={parameter.max_value || 100}
                step={parameter.step || 1}
                className="flex-1"
              />
              <Badge variant="outline" className="min-w-[60px] text-center">
                {value ?? parameter.default ?? 0}
              </Badge>
            </div>
          </div>
        );

      case 'dropdown':
        return (
          <Select value={value || parameter.default} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${parameter.name.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {parameter.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={value ?? parameter.default ?? false}
              onCheckedChange={onChange}
            />
            <Label className="text-sm font-normal">
              {value ?? parameter.default ?? false ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
        );

      case 'seed':
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value ?? parameter.default ?? 0}
              onChange={(e) => onChange(parseInt(e.target.value) || 0)}
              min={parameter.min_value || 0}
              max={parameter.max_value || 4294967295}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(Math.floor(Math.random() * 4294967295))}
            >
              🎲
            </Button>
          </div>
        );

      case 'image':
        return (
          <div className="space-y-2">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              {value ? (
                <div className="space-y-2">
                  <div className="text-sm text-green-600">✓ Image uploaded</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-gray-500">
                    {isDragActive
                      ? 'Drop image here...'
                      : 'Click or drag image here to upload'}
                  </div>
                  <div className="text-xs text-gray-400">
                    PNG, JPG, GIF, WebP up to 10MB
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <Input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${parameter.name.toLowerCase()}...`}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={parameter.id} className="text-sm font-medium">
          {parameter.name}
          {parameter.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {parameter.type}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {parameter.input_key}
          </Badge>
        </div>
      </div>
      {renderInput()}
      {parameter.description && (
        <p className="text-xs text-gray-500 mt-1">{parameter.description}</p>
      )}
    </div>
  );
} 