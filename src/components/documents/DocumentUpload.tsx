import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "../../../supabase/supabase";

// Import SUPABASE_URL from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

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
      "application/epub+zip",
      "application/epub",
    ];
    if (!validTypes.includes(file.type)) {
      alert("Please select a valid document file (PDF, DOC, DOCX, TXT, EPUB)");
      return;
    }

    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Create form data for the file upload
      const formData = new FormData();
      formData.append("file", selectedFile);

      setUploadProgress(30);

      // Upload to Supabase via edge function
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;

      if (!token) {
        throw new Error("Authentication required");
      }

      // Log auth info for debugging (without exposing the full token)
      console.log(`Auth token available: ${token ? "Yes" : "No"}`);
      console.log(`Supabase URL: ${SUPABASE_URL}`);

      setUploadProgress(50);

      // Log the URL we're trying to fetch for debugging
      console.log(
        `Attempting to fetch: ${SUPABASE_URL}/functions/v1/upload-document`
      );

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/upload-document`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      setUploadProgress(80);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload document");
      }

      const result = await response.json();
      setUploadProgress(100);

      setTimeout(() => {
        setIsUploading(false);
        onUploadComplete(selectedFile);
        setSelectedFile(null);
        setUploadProgress(0);
      }, 500);
    } catch (error) {
      console.error("Upload error:", error);

      // More detailed error logging
      if (error instanceof Error) {
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }

      // Instead of simulating success, we'll directly upload to Supabase
      if (error.message === "Failed to fetch") {
        console.log("Edge function failed, using direct Supabase upload");
        try {
          // Get the current user session again to ensure we have it
          const { data: userData } = await supabase.auth.getSession();
          const userId = userData.session?.user.id;

          if (!userId) {
            throw new Error("User not authenticated");
          }

          // Generate a unique file path
          const timestamp = Date.now();
          const fileExt = selectedFile.name.split(".").pop();
          const filePath = `${userId}/${timestamp}-${selectedFile.name}`;

          // Upload file to storage
          const { data: uploadData, error: uploadError } =
            await supabase.storage
              .from("documents")
              .upload(filePath, selectedFile, {
                contentType: selectedFile.type,
                upsert: false,
              });

          if (uploadError) throw uploadError;

          // Create a record in the documents table
          const { data: documentData, error: documentError } = await supabase
            .from("documents")
            .insert({
              user_id: userId,
              title: selectedFile.name,
              file_type: fileExt || "unknown",
              file_size: `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`,
              file_path: filePath,
              created_at: new Date().toISOString(),
            });

          if (documentError) throw documentError;

          setUploadProgress(100);
          setTimeout(() => {
            setIsUploading(false);
            onUploadComplete(selectedFile);
            setSelectedFile(null);
            setUploadProgress(0);
          }, 500);
          return;
        } catch (directUploadError) {
          console.error("Direct upload error:", directUploadError);
          throw directUploadError;
        }
      }

      alert(error.message || "Failed to upload document");
      setIsUploading(false);
      setUploadProgress(0);
    }
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
        accept=".pdf,.doc,.docx,.txt,.epub"
      />

      {!selectedFile ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">
            Drag & Drop Your Document
          </h3>
          <p className="text-gray-500 mb-4">
            Support for PDF, DOC, DOCX, TXT, and EPUB files
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
