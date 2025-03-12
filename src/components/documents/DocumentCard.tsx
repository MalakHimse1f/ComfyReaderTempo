import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  Trash2,
  ExternalLink,
  WifiOff,
  Check,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { isDocumentAvailableOffline } from "@/lib/offlineStorage";

export interface DocumentItem {
  id: string;
  title: string;
  fileType: string;
  fileSize: string;
  lastOpened?: Date;
  uploadDate: Date;
  thumbnailUrl?: string;
  isOffline?: boolean;
  readingProgress?: number;
  isEpubProcessed?: boolean;
  isEpubProcessing?: boolean;
  epubProcessingProgress?: number;
}

interface DocumentCardProps {
  document: DocumentItem;
  onOpen: (doc: DocumentItem) => void;
  onDownload: (doc: DocumentItem) => void;
  onDelete: (doc: DocumentItem) => void;
  view?: "grid" | "list";
  downloadProgress?: number;
  isDownloading?: boolean;
  isProcessing?: boolean;
  processingProgress?: number;
  isProcessed?: boolean;
}

export default function DocumentCard({
  document,
  onOpen,
  onDownload,
  onDelete,
  view = "grid",
  downloadProgress = 0,
  isDownloading = false,
  isProcessing = false,
  processingProgress = 0,
  isProcessed = false,
}: DocumentCardProps) {
  const [isOffline, setIsOffline] = useState<boolean>(
    document.isOffline || false
  );

  // Check if document is available offline
  useEffect(() => {
    const checkOfflineStatus = async () => {
      const offlineStatus = await isDocumentAvailableOffline(document.id);
      setIsOffline(offlineStatus);
    };

    checkOfflineStatus();

    // Log reading progress for debugging
    if (document.readingProgress) {
      console.log(
        `Document ${document.id} has reading progress: ${document.readingProgress}%`
      );
    }
  }, [document.id, document.isOffline, document.readingProgress]);

  // Update local state when document prop changes
  useEffect(() => {
    setIsOffline(document.isOffline || false);
  }, [document.isOffline]);
  const getFileIcon = () => {
    switch (document.fileType.toLowerCase()) {
      case "pdf":
        return <FileText className="h-12 w-12 text-red-500" />;
      case "doc":
      case "docx":
        return <FileText className="h-12 w-12 text-blue-500" />;
      case "txt":
        return <FileText className="h-12 w-12 text-gray-500" />;
      case "epub":
        return <FileText className="h-12 w-12 text-green-500" />;
      default:
        return <FileText className="h-12 w-12 text-gray-500" />;
    }
  };

  if (view === "list") {
    return (
      <Card className="flex flex-row items-center p-4 hover:shadow-md transition-shadow relative">
        <div className="mr-4 relative">
          {getFileIcon()}

          {isProcessed && document.fileType.toLowerCase() === "epub" && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex-grow">
          <h3 className="font-medium text-lg">{document.title}</h3>
          <div className="flex text-sm text-gray-500 space-x-4">
            <span>{document.fileType.toUpperCase()}</span>
            <span>{document.fileSize}</span>
            <span>
              Uploaded{" "}
              {formatDistanceToNow(document.uploadDate, { addSuffix: true })}
            </span>
          </div>

          {/* Reading Progress Bar - Always visible for debugging */}
          <div className="mt-2 max-w-xs">
            <div className="w-full h-1.5 bg-gray-200 rounded-full">
              <div
                className="h-1.5 bg-blue-500 rounded-full"
                style={{ width: `${document.readingProgress || 0}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-0.5 text-right">
              {isNaN(document.readingProgress)
                ? 0
                : document.readingProgress || 0}
              % read
            </div>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpen(document)}
            title="Open"
          >
            <ExternalLink className="h-5 w-5" />
          </Button>
          {isDownloading ? (
            <div className="relative h-9 w-9 flex items-center justify-center">
              <svg className="h-9 w-9 absolute" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  className="stroke-gray-200"
                  strokeWidth="2"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  className="stroke-blue-500"
                  strokeWidth="2"
                  strokeDasharray="100"
                  strokeDashoffset={100 - downloadProgress}
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span className="text-xs font-medium">{downloadProgress}%</span>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDownload(document)}
              title={isOffline ? "Remove from Offline" : "Save for Offline"}
            >
              {isOffline ? (
                <WifiOff className="h-5 w-5 text-blue-500" />
              ) : (
                <Download className="h-5 w-5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(document)}
            title="Delete"
          >
            <Trash2 className="h-5 w-5 text-red-500" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
      <div className="p-4 bg-gray-50 flex items-center justify-center h-40 relative">
        {document.thumbnailUrl ? (
          <img
            src={document.thumbnailUrl}
            alt={document.title}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            {getFileIcon()}
            <span className="mt-2 text-sm font-medium">
              {document.fileType.toUpperCase()}
            </span>
          </div>
        )}

        {isProcessed && document.fileType.toLowerCase() === "epub" && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <Check className="h-4 w-4 text-white" />
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="bg-white p-2 rounded shadow w-4/5">
              <div className="h-2 bg-gray-200 rounded">
                <div
                  className="h-full bg-blue-500 rounded"
                  style={{ width: `${processingProgress || 0}%` }}
                />
              </div>
              <p className="text-xs mt-1 text-center">
                Processing... {processingProgress || 0}%
              </p>
            </div>
          </div>
        )}
      </div>
      <CardContent className="flex-grow p-4">
        <h3 className="font-medium text-lg truncate" title={document.title}>
          {document.title}
        </h3>
        <div className="text-sm text-gray-500 mt-1">
          <div>{document.fileSize}</div>
          <div>
            Uploaded{" "}
            {formatDistanceToNow(document.uploadDate, { addSuffix: true })}
          </div>
        </div>

        {/* Reading Progress Bar - Always visible for debugging */}
        <div className="mt-2">
          <div className="w-full h-1.5 bg-gray-200 rounded-full">
            <div
              className="h-1.5 bg-blue-500 rounded-full"
              style={{ width: `${document.readingProgress || 0}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-0.5 text-right">
            {isNaN(document.readingProgress)
              ? 0
              : document.readingProgress || 0}
            % read
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Button variant="outline" size="sm" onClick={() => onOpen(document)}>
          Open
        </Button>
        <div className="flex space-x-1">
          {isDownloading ? (
            <div className="relative h-8 w-8 flex items-center justify-center">
              <svg className="h-8 w-8 absolute" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  fill="none"
                  className="stroke-gray-200"
                  strokeWidth="2"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  fill="none"
                  className="stroke-blue-500"
                  strokeWidth="2"
                  strokeDasharray="100"
                  strokeDashoffset={100 - downloadProgress}
                  transform="rotate(-90 16 16)"
                />
              </svg>
              <span className="text-xs font-medium">{downloadProgress}%</span>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDownload(document)}
              title={isOffline ? "Remove from Offline" : "Save for Offline"}
            >
              {isOffline ? (
                <WifiOff className="h-4 w-4 text-blue-500" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(document)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
