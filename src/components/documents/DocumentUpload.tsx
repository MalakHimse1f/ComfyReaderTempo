import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DocumentUploadProps {
  onUploadComplete: (file: File) => void;
}

export default function DocumentUpload({
  onUploadComplete,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    }
  };

  const handleFileSelection = (file: File) => {
    // Check if file is a valid document type
    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (!validTypes.includes(file.type)) {
      alert("Please select a valid document file (PDF, DOC, DOCX, TXT)");
      return;
    }

    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    setIsUploading(true);

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setUploadProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsUploading(false);
          onUploadComplete(selectedFile);
          setSelectedFile(null);
          setUploadProgress(0);
        }, 500);
      }
    }, 100);
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setIsUploading(false);
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt"
      />

      {!selectedFile ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">
            Drag & Drop Your Document
          </h3>
          <p className="text-gray-500 mb-4">
            Support for PDF, DOC, DOCX, and TXT files
          </p>
          <Button
            onClick={triggerFileInput}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Browse Files
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-6">
          <div className="flex items-center mb-4">
            <FileText className="h-10 w-10 text-blue-500 mr-4" />
            <div className="flex-grow">
              <h3 className="font-medium truncate">{selectedFile.name}</h3>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            {!isUploading && (
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>

          {isUploading ? (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-sm text-gray-500 text-center">
                Uploading... {uploadProgress}%
              </p>
            </div>
          ) : (
            <Button
              onClick={handleUpload}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Upload Document
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
