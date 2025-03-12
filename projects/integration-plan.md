# EPUB Preprocessor Integration Plan

## Current Status

We've successfully implemented all the core components for EPUB preprocessing:

1. **FileUploader.tsx**: Handles EPUB file detection and processing
2. **BookPreProcessingService.ts**: Manages processing status and operations
3. **HtmlBookReader.tsx**: Displays preprocessed HTML content
4. **BookViewer.tsx**: Conditionally uses HtmlBookReader for processed books
5. **LibraryView.tsx**: Shows processing status and provides user controls

However, these components are not integrated with the existing application, which still uses:

- DocumentUpload.tsx for file uploads
- EpubHandler.tsx for rendering EPUBs
- DocumentLibrary.tsx for displaying the book library
- DocumentReader.tsx for reading content

As a result, the user experience remains unchanged despite our implementation work.

## Integration Plan

### 1. Document Upload Integration

Modify `src/components/documents/DocumentUpload.tsx` to:

```typescript
// In the handleFileSelection function
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

  if (validTypes.includes(file.type)) {
    setSelectedFile(file);

    // NEW CODE: Add EPUB preprocessing for EPUB files
    if (
      file.type === "application/epub+zip" ||
      file.type === "application/epub"
    ) {
      // Process EPUB in the background after the normal upload
      handleUpload().then(() => {
        // After regular upload, start preprocessing
        import("../services/bookPreProcessingService").then(
          ({ BookPreProcessingService }) => {
            BookPreProcessingService.processBook(
              crypto.randomUUID(), // Generate an ID for this book
              file
            ).catch((error) => {
              console.error("Error preprocessing EPUB:", error);
              // Processing failure doesn't block regular upload
            });
          }
        );
      });
    } else {
      handleUpload();
    }
  } else {
    alert(
      "File type not supported. Please upload a PDF, Word document, text file, or EPUB."
    );
  }
};
```

### 2. Document Reader Integration

Modify `src/components/documents/DocumentReader.tsx` to:

```typescript
// Add imports
import { BookViewer } from "../BookViewer";
import { BookPreProcessingService } from "../services/bookPreProcessingService";

// Inside the component
const [isEpubPreprocessed, setIsEpubPreprocessed] = useState(false);
const [preprocessedBookId, setPreprocessedBookId] = useState<string | null>(
  null
);

// Check if this EPUB has been preprocessed
useEffect(() => {
  if (documentId && documentContent && documentContent.endsWith(".epub")) {
    const status = BookPreProcessingService.getProcessingStatus(documentId);
    setIsEpubPreprocessed(status.isProcessed);

    if (status.isProcessed) {
      // Get the preprocessed book ID
      // This might need adjustment based on how your IDs are stored
      setPreprocessedBookId(documentId);
    }
  }
}, [documentId, documentContent]);

// In the render section, replace the EpubHandler with
{
  isEpub && isEpubPreprocessed && preprocessedBookId ? (
    <BookViewer
      book={{
        id: documentId || "",
        title: documentTitle || "",
        author: "Unknown", // You might want to get this from metadata
        filePath: documentContent,
        processedBookId: preprocessedBookId,
        dateAdded: new Date().toISOString(),
        fileSize: 0, // You might want to get this from the file
      }}
      onReadingProgress={updateProgress}
    />
  ) : (
    <EpubHandler
      ref={epubReaderRef}
      url={documentContent}
      fontFamily={fontFamily}
      fontSize={fontSize}
      lineSpacing={lineSpacing}
      isDarkMode={theme === "dark"}
      onProgressChange={updateProgress}
      onChapterChange={setCurrentChapter}
    />
  );
}
```

### 3. Document Library Integration

Modify `src/components/documents/DocumentLibrary.tsx` to:

```typescript
// Add imports
import {
  BookPreProcessingService,
  ProcessingStatus,
} from "../services/bookPreProcessingService";

// Inside the component
const [processingStatuses, setProcessingStatuses] = useState<
  Record<string, ProcessingStatus>
>({});

// Add an effect to check processing status
useEffect(() => {
  // Initialize statuses
  const initialStatuses: Record<string, ProcessingStatus> = {};

  documents.forEach((doc) => {
    // Only check for EPUB files
    if (
      doc.fileExtension === "epub" ||
      doc.fileType === "application/epub+zip"
    ) {
      initialStatuses[doc.id] = BookPreProcessingService.getProcessingStatus(
        doc.id
      );
    }
  });

  setProcessingStatuses(initialStatuses);

  // Poll for updates
  const interval = setInterval(() => {
    const updatedStatuses: Record<string, ProcessingStatus> = {};

    documents.forEach((doc) => {
      // Only check for EPUB files
      if (
        doc.fileExtension === "epub" ||
        doc.fileType === "application/epub+zip"
      ) {
        updatedStatuses[doc.id] = BookPreProcessingService.getProcessingStatus(
          doc.id
        );
      }
    });

    setProcessingStatuses(updatedStatuses);
  }, 1000);

  return () => clearInterval(interval);
}, [documents]);

// Modify the DocumentCard rendering to show processing status
{
  documents.map((doc) => (
    <DocumentCard
      key={doc.id}
      document={doc}
      viewMode={viewMode}
      onOpen={() => handleOpenDocument(doc)}
      onToggleFavorite={() => handleToggleFavorite(doc)}
      onDownload={() => handleDownloadDocument(doc)}
      onDelete={() => handleDeleteDocument(doc)}
      isProcessing={processingStatuses[doc.id]?.isProcessing || false}
      processingProgress={processingStatuses[doc.id]?.progress || 0}
      isProcessed={processingStatuses[doc.id]?.isProcessed || false}
    />
  ));
}
```

### 4. Document Card Updates

Modify `src/components/documents/DocumentCard.tsx` to:

```typescript
// Update the DocumentItem interface
interface DocumentItem {
  // Existing properties...

  // Add these properties
  isProcessing?: boolean;
  processingProgress?: number;
  isProcessed?: boolean;
}

// Inside the component, add processing indicators
{
  isProcessing && (
    <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-md">
      <div className="bg-white p-2 rounded shadow w-4/5">
        <div className="h-2 bg-gray-200 rounded">
          <div
            className="h-full bg-primary rounded"
            style={{ width: `${processingProgress}%` }}
          />
        </div>
        <p className="text-xs mt-1 text-center">{processingProgress}%</p>
      </div>
    </div>
  );
}

{
  isProcessed && (
    <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
      <svg
        className="w-4 h-4 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    </div>
  );
}
```

## Implementation Strategy

1. **Phase 1: Background Processing**

   - Implement DocumentUpload integration first
   - This allows EPUBs to be preprocessed in the background
   - No visible change to the user interface yet

2. **Phase 2: Reader Integration**

   - Implement DocumentReader integration
   - This allows processed EPUBs to be viewed with the HTML reader
   - First visible improvement in user experience

3. **Phase 3: Library Integration**

   - Implement DocumentLibrary integration
   - This shows processing status in the library view
   - Complete user-visible integration

4. **Phase 4: Testing & Refinement**
   - Test the entire integration flow
   - Fix any bugs or issues
   - Ensure good performance and user experience

## Integration Checklist

### Phase 1: Background Processing

- [ ] **DocumentUpload Integration**
  - [ ] Add imports for BookPreProcessingService in DocumentUpload.tsx
  - [ ] Modify handleFileSelection function to detect EPUB files
  - [ ] Implement background processing after regular upload
  - [ ] Add proper error handling for preprocessing failures
  - [ ] Test that EPUBs are uploaded normally
  - [ ] Test that preprocessing is triggered in the background
  - [ ] Verify preprocessing completes without errors

### Phase 2: Reader Integration

- [ ] **DocumentReader Integration**
  - [ ] Add imports for BookViewer and BookPreProcessingService
  - [ ] Add state variables for tracking preprocessing status
  - [ ] Implement useEffect hook to check if EPUB is preprocessed
  - [ ] Add conditional rendering for BookViewer vs. EpubHandler
  - [ ] Create wrapper to map document props to BookViewer props
  - [ ] Test that regular EPUBs still open with EpubHandler
  - [ ] Test that preprocessed EPUBs open with BookViewer
  - [ ] Verify both viewers report reading progress correctly

### Phase 3: Library Integration

- [ ] **DocumentLibrary Integration**

  - [ ] Add imports for BookPreProcessingService
  - [ ] Add state for storing processing statuses
  - [ ] Implement useEffect for initializing and polling statuses
  - [ ] Add cleanup for the polling interval
  - [ ] Pass processing status to DocumentCard components
  - [ ] Test that processing status updates properly in the UI

- [ ] **DocumentCard Updates**
  - [ ] Update DocumentItem interface with processing properties
  - [ ] Add isProcessing visual indicator with progress bar
  - [ ] Add isProcessed visual indicator with checkmark
  - [ ] Style the indicators to match the application design
  - [ ] Test that processing indicators display correctly
  - [ ] Verify indicators update in real-time during processing

### Phase 4: Testing & Refinement

- [ ] **End-to-End Testing**

  - [ ] Test file upload flow with different EPUB files
  - [ ] Test opening preprocessed books in the reader
  - [ ] Test navigation within preprocessed books
  - [ ] Test customization features (fonts, themes, etc.)
  - [ ] Test performance with large EPUB files

- [ ] **User Experience Improvements**

  - [ ] Add tooltips to explain processing indicators
  - [ ] Improve error messages for failed processing
  - [ ] Add ability to retry failed processing
  - [ ] Ensure accessibility of all added UI elements

- [ ] **Final Checks**
  - [ ] Verify no regression in existing functionality
  - [ ] Check browser compatibility
  - [ ] Test on different screen sizes
  - [ ] Review code for any memory leaks or performance issues

## Conclusion

By implementing this integration plan, we'll connect our EPUB preprocessing components with the existing application, providing users with the improved reading experience we've developed without disrupting their familiar workflow.

The changes are designed to be minimally invasive to the existing code, adding our preprocessing capabilities alongside the current functionality rather than replacing it completely. This approach reduces risk and allows for a gradual transition to the new system.
