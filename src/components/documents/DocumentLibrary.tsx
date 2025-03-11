import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "../../../supabase/supabase";
import { useAuth } from "../../../supabase/auth";
import {
  saveDocumentOffline,
  removeDocumentOffline,
  getAllOfflineDocumentMetadata,
} from "@/lib/offlineStorage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Grid2X2, List, Upload, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import DocumentCard, { DocumentItem } from "./DocumentCard";
import DocumentUpload from "./DocumentUpload";

interface DocumentLibraryProps {
  activeFilter?: string | null;
}

export default function DocumentLibrary({
  activeFilter,
}: DocumentLibraryProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(
    null,
  );
  const [localFilter, setLocalFilter] = useState<string | null>(
    activeFilter || null,
  );

  // State for tracking download progress
  const [downloadProgress, setDownloadProgress] = useState<{
    [key: string]: number;
  }>({});
  const [isDownloading, setIsDownloading] = useState<{
    [key: string]: boolean;
  }>({});

  // Update local filter when prop changes
  useEffect(() => {
    setLocalFilter(activeFilter || null);
  }, [activeFilter]);

  const filteredDocuments = documents.filter((doc) => {
    // Apply search filter
    const matchesSearch = doc.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    // Apply active filter
    if (localFilter === "Offline") {
      return matchesSearch && doc.isOffline === true;
    } else if (localFilter === "Favorites") {
      // Implement favorites filter when that feature is added
      return matchesSearch;
    } else if (localFilter === "PDF Files") {
      return matchesSearch && doc.fileType.toLowerCase() === "pdf";
    } else if (localFilter === "Text Files") {
      return matchesSearch && doc.fileType.toLowerCase() === "txt";
    }

    return matchesSearch;
  });

  // Fetch documents from Supabase and merge with offline documents
  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  // Update documents when filter changes
  useEffect(() => {
    if (localFilter === "Offline") {
      fetchOfflineDocuments();
    }
  }, [localFilter]);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get offline documents to merge with online documents
      const offlineDocuments = await getAllOfflineDocumentMetadata();
      const offlineDocIds = offlineDocuments.map((doc) => doc.id);

      const formattedDocs: DocumentItem[] = data.map((doc) => ({
        id: doc.id,
        title: doc.title,
        fileType: doc.file_type,
        fileSize: doc.file_size,
        uploadDate: new Date(doc.created_at),
        lastOpened: doc.last_opened ? new Date(doc.last_opened) : undefined,
        thumbnailUrl: doc.thumbnail_url,
        isOffline: offlineDocIds.includes(doc.id),
      }));

      setDocuments(formattedDocs);
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOfflineDocuments = async () => {
    try {
      setIsLoading(true);

      // Get all offline documents
      const offlineDocuments = await getAllOfflineDocumentMetadata();

      // Convert to DocumentItem format
      const formattedOfflineDocs: DocumentItem[] = offlineDocuments.map(
        (doc) => ({
          id: doc.id,
          title: doc.title,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          uploadDate: new Date(doc.uploadDate),
          lastOpened: doc.lastOpened ? new Date(doc.lastOpened) : undefined,
          isOffline: true,
        }),
      );

      // If we're in offline filter mode, only show offline docs
      if (localFilter === "Offline") {
        setDocuments(formattedOfflineDocs);
      } else {
        // Otherwise, merge with existing documents
        const existingDocIds = documents.map((doc) => doc.id);
        const newOfflineDocs = formattedOfflineDocs.filter(
          (doc) => !existingDocIds.includes(doc.id),
        );

        setDocuments((prev) => [...prev, ...newOfflineDocs]);
      }
    } catch (error) {
      console.error("Error fetching offline documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDocument = async (doc: DocumentItem) => {
    try {
      // Check if document is available offline
      if (doc.isOffline) {
        // For offline documents, just navigate without updating the server
        window.location.href = `/dashboard?view=reader&id=${doc.id}`;
        return;
      }

      // For online documents, update last_opened timestamp
      await supabase
        .from("documents")
        .update({ last_opened: new Date().toISOString() })
        .eq("id", doc.id);

      // Navigate to document reader view
      window.location.href = `/dashboard?view=reader&id=${doc.id}`;
    } catch (error) {
      console.error("Error opening document:", error);
      // Navigate anyway even if the update fails
      window.location.href = `/dashboard?view=reader&id=${doc.id}`;
    }
  };

  const handleDownloadDocument = async (doc: DocumentItem) => {
    try {
      // Check if document is already available offline
      if (doc.isOffline) {
        // Set downloading state for this document
        setIsDownloading((prev) => ({ ...prev, [doc.id]: true }));
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 10 }));

        try {
          // Remove from offline storage
          await removeDocumentOffline(doc.id);
          setDownloadProgress((prev) => ({ ...prev, [doc.id]: 100 }));

          // Update document in state immediately
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, isOffline: false } : d)),
          );

          // After a short delay, reset the download indicators
          setTimeout(() => {
            setIsDownloading((prev) => ({ ...prev, [doc.id]: false }));
            setDownloadProgress((prev) => ({ ...prev, [doc.id]: 0 }));
          }, 500);
        } catch (error) {
          console.error("Error removing offline document:", error);
          setIsDownloading((prev) => ({ ...prev, [doc.id]: false }));
          setDownloadProgress((prev) => ({ ...prev, [doc.id]: 0 }));
          throw error;
        }
        return;
      }

      // Set downloading state for this document
      setIsDownloading((prev) => ({ ...prev, [doc.id]: true }));
      setDownloadProgress((prev) => ({ ...prev, [doc.id]: 10 }));

      try {
        // Get the document record to find the file path
        const { data, error } = await supabase
          .from("documents")
          .select("file_path")
          .eq("id", doc.id)
          .single();

        if (error) throw error;
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 30 }));

        // This code path should never be executed
        if (false) {
          // Simulate download delay
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setDownloadProgress((prev) => ({ ...prev, [doc.id]: 70 }));

          // This code path should never be executed
          // Create an empty blob as a fallback
          const mockBlob = new Blob([""], {
            type: "text/plain",
          });

          // This code should never execute
          await saveDocumentOffline(doc.id, mockBlob, {
            id: doc.id,
            title: doc.title,
            fileType: doc.fileType,
            fileSize: doc.fileSize,
            uploadDate: doc.uploadDate.toISOString(),
            lastOpened: doc.lastOpened?.toISOString(),
            isOffline: true,
          });

          setDownloadProgress((prev) => ({ ...prev, [doc.id]: 100 }));

          // Update document in state immediately
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, isOffline: true } : d)),
          );

          // After a short delay, reset the download indicators
          setTimeout(() => {
            setIsDownloading((prev) => ({ ...prev, [doc.id]: false }));
            setDownloadProgress((prev) => ({ ...prev, [doc.id]: 0 }));
          }, 500);

          return;
        }

        // Get download URL from storage using fetch for progress tracking
        const { data: signedURL } = await supabase.storage
          .from("documents")
          .createSignedUrl(data.file_path, 60);

        if (!signedURL?.signedUrl)
          throw new Error("Failed to get download URL");
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 40 }));

        // Use fetch with progress tracking
        const response = await fetch(signedURL.signedUrl);
        if (!response.ok) throw new Error("Failed to download file");

        // Get total size for progress calculation
        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        // Create a reader to track progress
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Failed to get reader");

        // Read the data chunks with progress
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          // Calculate and update progress
          if (total) {
            const progress = Math.min(
              40 + Math.round((receivedLength / total) * 50),
              90,
            );
            setDownloadProgress((prev) => ({ ...prev, [doc.id]: progress }));
          }
        }

        // Combine all chunks into a single Uint8Array
        const chunksAll = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
          chunksAll.set(chunk, position);
          position += chunk.length;
        }

        // Convert to blob
        const blob = new Blob([chunksAll]);
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 95 }));

        // Save document for offline use
        await saveDocumentOffline(doc.id, blob, {
          id: doc.id,
          title: doc.title,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          uploadDate: doc.uploadDate.toISOString(),
          lastOpened: doc.lastOpened?.toISOString(),
          isOffline: true,
        });

        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 100 }));

        // Update document in state immediately
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, isOffline: true } : d)),
        );

        // After a short delay, reset the download indicators
        setTimeout(() => {
          setIsDownloading((prev) => ({ ...prev, [doc.id]: false }));
          setDownloadProgress((prev) => ({ ...prev, [doc.id]: 0 }));
        }, 500);
      } catch (error) {
        console.error("Error downloading document:", error);

        // Reset download state
        setIsDownloading((prev) => ({ ...prev, [doc.id]: false }));
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 0 }));

        // Use a more specific error message
        if (error instanceof Error) {
          alert(`Download failed: ${error.message}`);
        } else {
          alert(
            "Failed to download document for offline use. Please try again later.",
          );
        }
      }
    } catch (error) {
      console.error("Error managing offline document:", error);
      // Reset download state
      setIsDownloading((prev) => ({ ...prev, [doc.id]: false }));
      setDownloadProgress((prev) => ({ ...prev, [doc.id]: 0 }));
      alert(
        "Failed to manage offline document. Please check your connection and try again.",
      );
    }
  };

  const handleDeleteDocument = (doc: DocumentItem) => {
    setDocumentToDelete(doc);
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;

    try {
      // Get the file path from the documents table
      const { data, error } = await supabase
        .from("documents")
        .select("file_path")
        .eq("id", documentToDelete.id)
        .single();

      if (error) throw error;

      // Delete the file from storage
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([data.file_path]);

      if (storageError) throw storageError;

      // Delete the document record
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentToDelete.id);

      if (deleteError) throw deleteError;

      // Update the UI
      setDocuments(documents.filter((doc) => doc.id !== documentToDelete.id));
      setDocumentToDelete(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Failed to delete document");
    }
  };

  const handleUploadComplete = (file: File) => {
    // Refresh the document list after upload
    fetchDocuments();
    setIsUploadDialogOpen(false);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">My Documents</h1>

        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
              title="List View"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="h-4 w-4 mr-2" /> Upload
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Loading documents...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No documents found</p>
          <Button
            onClick={() => setIsUploadDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="h-4 w-4 mr-2" /> Upload Your First Document
          </Button>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              : "space-y-4"
          }
        >
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onOpen={handleOpenDocument}
              onDownload={handleDownloadDocument}
              onDelete={handleDeleteDocument}
              view={viewMode}
              downloadProgress={downloadProgress[doc.id] || 0}
              isDownloading={isDownloading[doc.id] || false}
            />
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <DocumentUpload onUploadComplete={handleUploadComplete} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!documentToDelete}
        onOpenChange={(open) => !open && setDocumentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{documentToDelete?.title}". This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
