'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, Film, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  accept?: Record<string, string[]>;
  className?: string;
}

const fileIcon = (file: File) => {
  if (file.type.startsWith('image/')) return <ImageIcon size={16} />;
  if (file.type.startsWith('video/')) return <Film size={16} />;
  return <FileText size={16} />;
};

export default function FileUploader({ onFilesChange, maxFiles = 10, accept, className }: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = [...files, ...acceptedFiles].slice(0, maxFiles);
    setFiles(newFiles);
    onFilesChange(newFiles);
  }, [files, maxFiles, onFilesChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: accept ?? {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
  });

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFilesChange(updated);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed border-[#2D6A4F] rounded-[16px] p-8',
          'flex flex-col items-center justify-center gap-3 cursor-pointer',
          'transition-all duration-200',
          isDragActive && 'drag-active bg-[#EEF5EE]',
          !isDragActive && 'hover:bg-[#EEF5EE]'
        )}
      >
        <input {...getInputProps()} />
        <div className="w-12 h-12 rounded-full bg-[#D8EDDA] flex items-center justify-center">
          <Upload size={20} className="text-[#2D6A4F]" />
        </div>
        <div className="text-center">
          <p className="font-medium text-[#1B1F1A] text-sm">
            {isDragActive ? 'Drop files here' : 'Drop photos, videos, or documents here'}
          </p>
          <p className="text-xs text-[#8FA38F] mt-1">or click to browse</p>
        </div>
        <p className="text-xs text-[#8FA38F]">Supported: JPG, PNG, MP4, PDF, DOC, DOCX</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-[#F5F7F0] rounded-[10px]">
              <span className="text-[#2D6A4F]">{fileIcon(file)}</span>
              <span className="text-sm text-[#1B1F1A] flex-1 truncate">{file.name}</span>
              <span className="text-xs text-[#8FA38F]">{(file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-[#8FA38F] hover:text-[#E07A5F] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
