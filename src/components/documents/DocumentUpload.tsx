import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "../../../supabase/supabase";
// Import BookPreProcessingService for EPUB preprocessing
import { BookPreProcessingService } from "../../services/bookPreProcessingService";

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
  const [preprocessingStatus, setPreprocessingStatus] = useState<string | null>(
    null
  );
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
    setPreprocessingStatus(null);

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

    // Check if the file is an EPUB for later processing
    const isEpub =
      selectedFile.type === "application/epub+zip" ||
      selectedFile.type === "application/epub";

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Get the current user session
      const { data: userData } = await supabase.auth.getSession();
      const userId = userData.session?.user.id;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      setUploadProgress(30);

      // Generate a unique file path
      const timestamp = Date.now();
      const fileExt = selectedFile.name.split(".").pop();
      const filePath = `${userId}/${timestamp}-${selectedFile.name}`;

      setUploadProgress(50);

      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(70);

      // Create a record in the documents table (without document_id field)
      const { data: documentData, error: documentError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          title: selectedFile.name,
          file_type: fileExt || "unknown",
          file_size: `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`,
          file_path: filePath,
          created_at: new Date().toISOString(),
        })
        .select();

      if (documentError) throw documentError;

      setUploadProgress(100);

      // Get the ID of the inserted document
      const insertedDocumentId = documentData && documentData[0]?.id;
      console.log("Inserted document ID:", insertedDocumentId);

      // Complete the upload process
      setTimeout(() => {
        setIsUploading(false);
        onUploadComplete(selectedFile);

        // Start EPUB preprocessing in the background if this is an EPUB file
        if (isEpub && insertedDocumentId) {
          console.log("Starting EPUB preprocessing for:", selectedFile.name);
          setPreprocessingStatus(
            `Preprocessing EPUB: ${selectedFile.name} (0%)`
          );

          // Use the actual document ID from the database
          BookPreProcessingService.processBook(insertedDocumentId, selectedFile)
            .then((processedBookId) => {
              console.log(
                "EPUB preprocessing completed. Processed book ID:",
                processedBookId
              );
              setPreprocessingStatus(
                `EPUB preprocessing complete: ${selectedFile.name}`
              );

              // Update the document record with the processed book ID if your schema supports it
              // This is optional based on your database schema
              try {
                supabase
                  .from("documents")
                  .update({ processed_epub_id: processedBookId })
                  .eq("id", insertedDocumentId)
                  .then(({ error }) => {
                    if (error) {
                      console.error(
                        "Note: Could not update document with processed book ID. This is optional:",
                        error
                      );
                    } else {
                      console.log(
                        "Updated document record with processed book ID"
                      );
                    }
                  });
              } catch (updateError) {
                console.error(
                  "Note: Error trying to update document with processed book ID. This is optional:",
                  updateError
                );
              }

              // Clear status message after 5 seconds
              setTimeout(() => {
                setPreprocessingStatus(null);
              }, 5000);
            })
            .catch((error) => {
              console.error("Error preprocessing EPUB:", error);
              setPreprocessingStatus(
                `Error preprocessing EPUB: ${error.message}`
              );

              // Clear error message after 5 seconds
              setTimeout(() => {
                setPreprocessingStatus(null);
              }, 5000);
            });

          // Set up polling to update the preprocessing status
          const statusInterval = setInterval(() => {
            const status =
              BookPreProcessingService.getProcessingStatus(insertedDocumentId);
            if (status.isProcessing) {
              setPreprocessingStatus(
                `Preprocessing EPUB: ${selectedFile.name} (${status.progress}%)`
              );
            } else if (status.error) {
              clearInterval(statusInterval);
            } else if (status.isProcessed) {
              clearInterval(statusInterval);
            }
          }, 500);

          // Clear interval after 5 minutes maximum to prevent memory leaks
          setTimeout(() => {
            clearInterval(statusInterval);
          }, 5 * 60 * 1000);
        }

        setSelectedFile(null);
        setUploadProgress(0);
      }, 500);
    } catch (error) {
      console.error("Upload error:", error);
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

      {preprocessingStatus && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-600">{preprocessingStatus}</p>
        </div>
      )}
    </div>
  );
}
