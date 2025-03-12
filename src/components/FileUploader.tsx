import React, { useState, useRef } from "react";
import { processEpubToHtml } from "../services/epub-processor/epubProcessor";
import { generateHtml } from "../services/epub-processor/htmlGenerator";
import { ProcessedBookStorage } from "../services/epub-processor/storageService";
import "./FileUploader.css";

// Types for our component
interface FileUploaderProps {
  onFileUploaded: (bookInfo: BookInfo) => void;
  allowedFileTypes?: string[];
}

export interface BookInfo {
  id: string;
  title: string;
  author: string;
  filePath: string;
  processedBookId?: string;
  dateAdded: string;
  coverUrl?: string;
  fileSize: number;
}

// Define the ProcessedBook interface
interface ProcessedBook {
  metadata: {
    title: string;
    creator: string[];
    language: string;
    publisher?: string;
    identifier?: string;
    date?: string;
    description?: string;
    [key: string]: any;
  };
  chapters: Array<{
    id: string;
    href: string;
    title: string;
    content: string;
  }>;
  toc: Array<{
    id: string;
    title: string;
    href: string;
    level: number;
  }>;
  resources: {
    [key: string]: Blob;
  };
  coverImage?: Blob;
  coverUrl?: string;
}

// Processing status types
type ProcessingStatus = {
  isProcessing: boolean;
  status: string;
  progress: number;
  error?: string;
};

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUploaded,
  allowedFileTypes = ["application/epub+zip", "application/pdf", "text/plain"],
}) => {
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [isDragging, setIsDragging] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    status: "",
    progress: 0,
  });

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Handle the actual file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  // Open file dialog when button is clicked
  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Main function to handle files
  const handleFiles = async (files: FileList) => {
    const file = files[0]; // For now, we only handle one file at a time

    // Validate file type
    if (!allowedFileTypes.includes(file.type)) {
      setProcessingStatus({
        isProcessing: false,
        status: "Error: Unsupported file type",
        progress: 0,
        error: `File type ${file.type} is not supported. Please upload an EPUB, PDF, or plain text file.`,
      });
      return;
    }

    try {
      // Check if the file is an EPUB
      if (file.type === "application/epub+zip") {
        await processEpubFile(file);
      } else {
        // For non-EPUB files, just add to library without processing
        addRegularDocumentToLibrary(file);
      }
    } catch (error) {
      console.error("Error handling file:", error);
      setProcessingStatus({
        isProcessing: false,
        status: "Error processing file",
        progress: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Process EPUB file
  const processEpubFile = async (file: File) => {
    try {
      // Start processing - set status
      setProcessingStatus({
        isProcessing: true,
        status: "Analyzing EPUB file...",
        progress: 10,
      });

      // Process the EPUB file
      const processedBook = await processEpubToHtml(file);

      setProcessingStatus({
        isProcessing: true,
        status: "Generating HTML content...",
        progress: 50,
      });

      // Generate HTML from the processed book
      const { html, indexFile, css } = await generateHtml(processedBook);

      setProcessingStatus({
        isProcessing: true,
        status: "Storing processed content...",
        progress: 75,
      });

      // Store the processed content
      const storage = new ProcessedBookStorage();
      const bookId = await storage.storeProcessedBook(
        processedBook,
        html,
        indexFile,
        css
      );

      setProcessingStatus({
        isProcessing: true,
        status: "Finalizing...",
        progress: 90,
      });

      // Create object URL for the original file (for backup access)
      const fileUrl = URL.createObjectURL(file);

      // Create book info object
      const bookInfo: BookInfo = {
        id: bookId,
        title: processedBook.metadata.title || "Untitled Book",
        author: processedBook.metadata.creator
          ? processedBook.metadata.creator.join(", ")
          : "Unknown Author",
        filePath: fileUrl,
        processedBookId: bookId,
        dateAdded: new Date().toISOString(),
        fileSize: file.size,
      };

      // For cover generation, we can check if a cover resource exists in the processed book
      // This assumes that your processedBook.resources might contain a cover image
      // We'll check for common cover file patterns
      const resourceKeys = Object.keys(processedBook.resources);
      const potentialCoverKeys = resourceKeys.filter(
        (key) =>
          key.toLowerCase().includes("cover") ||
          key.toLowerCase().includes("title") ||
          key.match(/^(cover|title)\.(jpg|jpeg|png|gif)$/i)
      );

      if (potentialCoverKeys.length > 0) {
        // Use the first found cover resource
        const coverKey = potentialCoverKeys[0];
        bookInfo.coverUrl = URL.createObjectURL(
          processedBook.resources[coverKey]
        );
      }

      // Call the callback function with the book info
      onFileUploaded(bookInfo);

      setProcessingStatus({
        isProcessing: false,
        status: "EPUB processed successfully!",
        progress: 100,
      });

      // Reset status after a delay
      setTimeout(() => {
        setProcessingStatus({
          isProcessing: false,
          status: "",
          progress: 0,
        });
      }, 3000);
    } catch (error) {
      console.error("Error processing EPUB:", error);

      setProcessingStatus({
        isProcessing: false,
        status: "Error processing EPUB",
        progress: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Fallback to regular document upload
      addRegularDocumentToLibrary(file);
    }
  };

  // Add a regular document (non-EPUB or fallback) to the library
  const addRegularDocumentToLibrary = (file: File) => {
    // Create object URL for the file
    const fileUrl = URL.createObjectURL(file);

    // Extract a simple title from the filename
    const fileName = file.name;
    const title = fileName.substring(0, fileName.lastIndexOf(".")) || fileName;

    // Create book info object without processed content
    const bookInfo: BookInfo = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title,
      author: "Unknown Author",
      filePath: fileUrl,
      dateAdded: new Date().toISOString(),
      fileSize: file.size,
    };

    // Call the callback function with the document info
    onFileUploaded(bookInfo);

    setProcessingStatus({
      isProcessing: false,
      status: "File added to library",
      progress: 100,
    });

    // Reset status after a delay
    setTimeout(() => {
      setProcessingStatus({
        isProcessing: false,
        status: "",
        progress: 0,
      });
    }, 3000);
  };

  return (
    <div className="file-uploader-container">
      <div
        className={`file-uploader-dropzone ${isDragging ? "dragging" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept={allowedFileTypes.join(",")}
          style={{ display: "none" }}
        />

        {!processingStatus.isProcessing ? (
          <>
            <div className="upload-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <h3>Drag & Drop your files here</h3>
            <p>or click to browse files</p>
            <p className="file-types">Supported file types: EPUB, PDF, TXT</p>
          </>
        ) : (
          <div className="processing-container">
            <h3>{processingStatus.status}</h3>
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${processingStatus.progress}%` }}
              ></div>
            </div>
            <p>{processingStatus.progress}% complete</p>
          </div>
        )}

        {processingStatus.error && (
          <div className="error-message">
            <p>{processingStatus.error}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProcessingStatus({ ...processingStatus, error: undefined });
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
