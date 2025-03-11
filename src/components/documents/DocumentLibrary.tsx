import { useState } from "react";
import { Button } from "@/components/ui/button";
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

// Sample document data
const sampleDocuments: DocumentItem[] = [
  {
    id: "1",
    title: "Project Proposal.pdf",
    fileType: "pdf",
    fileSize: "2.4 MB",
    uploadDate: new Date(2023, 5, 15),
    lastOpened: new Date(2023, 6, 2),
  },
  {
    id: "2",
    title: "Meeting Notes.docx",
    fileType: "docx",
    fileSize: "1.2 MB",
    uploadDate: new Date(2023, 6, 10),
  },
  {
    id: "3",
    title: "Research Paper.pdf",
    fileType: "pdf",
    fileSize: "3.8 MB",
    uploadDate: new Date(2023, 4, 28),
    lastOpened: new Date(2023, 5, 30),
  },
  {
    id: "4",
    title: "Reading List.txt",
    fileType: "txt",
    fileSize: "0.1 MB",
    uploadDate: new Date(2023, 6, 5),
  },
];

export default function DocumentLibrary() {
  const [documents, setDocuments] = useState<DocumentItem[]>(sampleDocuments);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(
    null,
  );

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleOpenDocument = (doc: DocumentItem) => {
    console.log("Opening document:", doc);
    // This would navigate to the document reader view
  };

  const handleDownloadDocument = (doc: DocumentItem) => {
    console.log("Downloading document:", doc);
    // This would trigger the document download
  };

  const handleDeleteDocument = (doc: DocumentItem) => {
    setDocumentToDelete(doc);
  };

  const confirmDelete = () => {
    if (documentToDelete) {
      setDocuments(documents.filter((doc) => doc.id !== documentToDelete.id));
      setDocumentToDelete(null);
    }
  };

  const handleUploadComplete = (file: File) => {
    // Create a new document item
    const newDocument: DocumentItem = {
      id: Date.now().toString(),
      title: file.name,
      fileType: file.name.split(".").pop() || "unknown",
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      uploadDate: new Date(),
    };

    setDocuments([newDocument, ...documents]);
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

      {filteredDocuments.length === 0 ? (
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
