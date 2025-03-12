import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, CheckCircle, CloudUpload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "../../../supabase/supabase";
// Import BookPreProcessingService for EPUB preprocessing
import { BookPreProcessingService } from "../../services/bookPreProcessingService";
import { syncBookToCloud } from "../../services/epub-processor";

// Import SUPABASE_URL from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

interface DocumentUploadProps {
  onUploadComplete: (file: File) => void;
}

// Enum for the different stages of the upload process
enum UploadStage {
  FileSelection,
  Uploading,
  Processing,
  Syncing,
  Complete,
  Error,
}

export default function DocumentUpload({
  onUploadComplete,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [syncProgress, setSyncProgress] = useState(0);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [processedBookId, setProcessedBookId] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>(
    UploadStage.FileSelection
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExitButton, setShowExitButton] = useState(false);

  // Status polling interval reference
  const statusIntervalRef = useRef<number | undefined>(undefined);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusIntervalRef.current !== undefined) {
        window.clearInterval(statusIntervalRef.current);
      }
    };
  }, []);

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
    setErrorMessage(null);
    setUploadStage(UploadStage.FileSelection);

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

    // Check if the file is an EPUB
    const isEpub =
      selectedFile.type === "application/epub+zip" ||
      selectedFile.type === "application/epub";

    setUploadStage(UploadStage.Uploading);
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
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(70);

      // For EPUBs, we'll use a different approach since is_temporary column doesn't exist
      // Insert the document record without the is_temporary field
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
      setDocumentId(insertedDocumentId);
      console.log("Inserted document ID:", insertedDocumentId);

      // For non-EPUB files, complete the upload process immediately
      if (!isEpub) {
        setTimeout(() => {
          setUploadStage(UploadStage.Complete);
          setShowExitButton(true);
          onUploadComplete(selectedFile);

          // Reset after 2 seconds
          setTimeout(() => {
            resetForm();
          }, 2000);
        }, 500);
        return;
      }

      // For EPUBs, start the processing stage
      setUploadStage(UploadStage.Processing);
      setProcessingProgress(0);

      // Process the EPUB file
      const processedId = await BookPreProcessingService.processBook(
        insertedDocumentId,
        selectedFile
      );
      setProcessedBookId(processedId);

      // Start syncing to cloud
      setUploadStage(UploadStage.Syncing);
      setSyncProgress(0);

      // Sync to cloud
      await syncBookToCloud(processedId);

      // Try to update the document entry to show it's processed
      try {
        const { error: updateError } = await supabase
          .from("documents")
          .update({
            is_processed: true,
            processed_epub_id: processedId,
          })
          .eq("id", insertedDocumentId);

        if (updateError) {
          // Check if it's a column doesn't exist error
          if (updateError.message && updateError.message.includes("column")) {
            console.log(
              "Note: Could not update document with processed book ID. This is optional:",
              updateError
            );
          } else {
            // For other errors, log but don't throw to avoid breaking upload flow
            console.error("Error updating document record:", updateError);
          }
        } else {
          console.log(
            "Successfully updated document with processed ID:",
            processedId
          );
        }
      } catch (updateError) {
        console.error("Exception updating document record:", updateError);
      }

      // All done!
      setUploadStage(UploadStage.Complete);
      setShowExitButton(true);

      // Notify that upload is complete with the processed version
      onUploadComplete(selectedFile);

      // Reset form after a delay
      setTimeout(() => {
        resetForm();
      }, 3000);
    } catch (error) {
      console.error("Upload/processing error:", error);
      setErrorMessage(error.message || "Failed to upload and process document");
      setUploadStage(UploadStage.Error);
      setShowExitButton(true);
    }
  };

  // Reset the form to initial state
  const resetForm = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setProcessingProgress(0);
    setSyncProgress(0);
    setDocumentId(null);
    setProcessedBookId(null);
    setUploadStage(UploadStage.FileSelection);
    setErrorMessage(null);
    setShowExitButton(false);

    // Clear any intervals
    if (statusIntervalRef.current !== undefined) {
      window.clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = undefined;
    }
  };

  // Set up polling to update progress
  useEffect(() => {
    if (uploadStage === UploadStage.Processing && documentId) {
      // Clear any existing interval
      if (statusIntervalRef.current !== undefined) {
        window.clearInterval(statusIntervalRef.current);
      }

      // Set up new interval with window.setInterval
      statusIntervalRef.current = window.setInterval(() => {
        const status = BookPreProcessingService.getProcessingStatus(documentId);

        if (status.status === "processing") {
          setProcessingProgress(status.progress || 0);
        } else if (status.status === "processed") {
          setProcessingProgress(100);
          if (statusIntervalRef.current !== undefined) {
            window.clearInterval(statusIntervalRef.current);
          }
        } else if (status.error) {
          setErrorMessage(`Processing error: ${status.error}`);
          setUploadStage(UploadStage.Error);
          if (statusIntervalRef.current !== undefined) {
            window.clearInterval(statusIntervalRef.current);
          }
        }
      }, 500);

      // Safety cleanup after 5 minutes
      window.setTimeout(() => {
        if (statusIntervalRef.current !== undefined) {
          window.clearInterval(statusIntervalRef.current);
        }
      }, 5 * 60 * 1000);
    }

    // For syncing stage, simulate progress (since we don't have real-time sync progress)
    if (uploadStage === UploadStage.Syncing) {
      let progress = 0;
      // Clear any existing interval
      if (statusIntervalRef.current !== undefined) {
        window.clearInterval(statusIntervalRef.current);
      }

      statusIntervalRef.current = window.setInterval(() => {
        progress += 5;
        setSyncProgress(Math.min(progress, 95)); // Cap at 95% until we know it's done
      }, 500);
    }

    return () => {
      if (statusIntervalRef.current !== undefined) {
        window.clearInterval(statusIntervalRef.current);
      }
    };
  }, [uploadStage, documentId]);

  const handleCancel = () => {
    resetForm();
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Render different UI based on the current upload stage
  const renderUploadStageUI = () => {
    switch (uploadStage) {
      case UploadStage.Uploading:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Uploading File</h3>
              <span className="text-sm text-blue-600">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-sm text-gray-500">
              Please wait while we upload your file...
            </p>
          </div>
        );

      case UploadStage.Processing:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Processing EPUB</h3>
              <span className="text-sm text-purple-600">
                {processingProgress}%
              </span>
            </div>
            <Progress value={processingProgress} className="h-2" />
            <p className="text-sm text-gray-500">
              Converting EPUB to optimized format for better reading
              experience...
            </p>
            <p className="text-xs text-amber-600">
              Please do not close this window during processing.
            </p>
          </div>
        );

      case UploadStage.Syncing:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Syncing to Cloud</h3>
              <span className="text-sm text-green-600">{syncProgress}%</span>
            </div>
            <Progress value={syncProgress} className="h-2" />
            <p className="text-sm text-gray-500">
              Storing your optimized book for access across devices...
            </p>
          </div>
        );

      case UploadStage.Complete:
        return (
          <div className="space-y-4 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
            <h3 className="font-medium text-lg">Upload Complete!</h3>
            <p className="text-sm text-gray-500">
              Your document has been successfully uploaded and processed.
            </p>
            {showExitButton && (
              <Button
                onClick={resetForm}
                className="mt-4 bg-green-600 hover:bg-green-700"
              >
                Done
              </Button>
            )}
          </div>
        );

      case UploadStage.Error:
        return (
          <div className="space-y-4 text-center">
            <X className="h-12 w-12 mx-auto text-red-500" />
            <h3 className="font-medium text-lg">Error</h3>
            <p className="text-sm text-red-500">
              {errorMessage || "There was an error processing your document."}
            </p>
            <Button
              onClick={resetForm}
              className="mt-4 bg-gray-600 hover:bg-gray-700"
            >
              Try Again
            </Button>
          </div>
        );

      default:
        return (
          <>
            {selectedFile ? (
              <div className="border rounded-lg p-6">
                <div className="flex items-center mb-4">
                  <FileText className="h-10 w-10 text-blue-500 mr-4" />
                  <div className="flex-grow">
                    <h3 className="font-medium truncate">
                      {selectedFile.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleCancel}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <Button
                  onClick={handleUpload}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {selectedFile.type.includes("epub")
                    ? "Upload & Process EPUB"
                    : "Upload Document"}
                </Button>
              </div>
            ) : (
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
            )}
          </>
        );
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

      {renderUploadStageUI()}
    </div>
  );
}
