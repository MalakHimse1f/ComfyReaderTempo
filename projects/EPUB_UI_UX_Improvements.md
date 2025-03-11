# EPUB Reader UI/UX Improvement Plan

## Checklist

- [ ] **Pagination System Overhaul**

  - [ ] Modify pagination to display total pages across the entire document
  - [ ] Update page numbering logic to consider all chapters
  - [ ] Add a page slider or input field for quick navigation

- [ ] **Chapter Navigation Implementation**

  - [ ] Create a table of contents (TOC) panel
  - [ ] Add chapter navigation buttons or dropdown
  - [ ] Display current chapter name in the reader header

- [ ] **View Mode Toggle**

  - [ ] Add a switch/toggle between paginated and scroll modes
  - [ ] Implement scroll view functionality
  - [ ] Save user preference for view mode

- [ ] **UI Improvements**

  - [ ] Redesign the reader control bar for better usability
  - [ ] Add visual indicators for current reading progress
  - [ ] Ensure consistent styling with the rest of the application

- [ ] **Offline EPUB Consistency**
  - [ ] Fix rendering differences between online and downloaded EPUBs
  - [ ] Ensure offline EPUBs maintain the same layout and functionality
  - [ ] Fix file handling for downloaded EPUBs
  - [ ] Add proper error handling for offline EPUBs

## Implementation Details

### Pagination System Overhaul

Currently, the EPUB reader only shows pagination for the current chapter. EPUBjs handles pagination on a per-chapter basis by default, as evidenced by this code in the EpubReader component:

```javascript
// Current code in EpubReader.tsx
rendition.on("relocated", (location: any) => {
  // Update current page information
  const currentPage = location.start.displayed.page;
  const totalPages = location.start.displayed.total;

  setCurrentPage(currentPage);
  setTotalPages(totalPages);
  setCurrentCfi(location.start.cfi);

  // Store reading position for resuming later
  if (location.start.cfi) {
    localStorage.setItem(`epub-position-${book.key()}`, location.start.cfi);
  }
});
```

To implement whole-document pagination:

1. **Calculate Total Pages Across the Book**:

   - We need to track global page numbers by leveraging EPUB.js's spine and CFI capabilities.
   - We'll need to precompute page counts across all chapters or track the percentage through the book.

2. **Code Implementation**:

   ```javascript
   // Add to EpubReader.tsx state
   const [globalCurrentPage, setGlobalCurrentPage] = useState(1);
   const [globalTotalPages, setGlobalTotalPages] = useState(0);
   const [currentChapter, setCurrentChapter] = useState("");
   const [readingProgress, setReadingProgress] = useState(0); // 0-100%

   // In the useEffect where the book is initialized:
   useEffect(() => {
     // ... existing code ...

     // After book is ready
     book.ready.then(() => {
       // Get all spine items (chapters/sections)
       const spineItems = book.spine.items;
       setGlobalTotalPages(spineItems.length * 100); // Approximate for now

       // We can also access TOC
       book.loaded.navigation.then((nav) => {
         if (nav.toc && nav.toc.length > 0) {
           console.log("Book TOC:", nav.toc);
         }
       });
     });

     // Update relocated event handler
     rendition.on("relocated", (location) => {
       // Current chapter/spine position (0-based index)
       const spinePos = location.start.index;

       // Current chapter info
       if (book.spine && book.spine.items[spinePos]) {
         const spineItem = book.spine.items[spinePos];
         setCurrentChapter(spineItem.href);

         // If we have chapter title from TOC, use that instead
         book.navigation &&
           book.navigation.get(spineItem.href).then((tocItem) => {
             if (tocItem && tocItem.label) {
               setCurrentChapter(tocItem.label);
             }
           });
       }

       // Calculate global progress percentage
       // This is more reliable than trying to count exact pages
       const progress = book.locations.percentageFromCfi(location.start.cfi);
       setReadingProgress(progress * 100);

       // Estimate global page (rough approximation)
       const globalPage = Math.ceil(globalTotalPages * progress);
       setGlobalCurrentPage(globalPage);

       // Original page tracking for current section
       setCurrentPage(location.start.displayed.page);
       setTotalPages(location.start.displayed.total);
       setCurrentCfi(location.start.cfi);
     });
   }, [url, fontFamily, fontSize, lineSpacing, isDarkMode]);
   ```

3. **UI Implementation**:

   ```jsx
   {
     /* Replace the existing pagination display in the return JSX */
   }
   <div className="flex items-center justify-between p-4 border-t">
     <Button
       variant="outline"
       size="sm"
       onClick={goToPrevious}
       disabled={isLoading || globalCurrentPage <= 1}
     >
       <ChevronLeft className="h-4 w-4 mr-2" /> Previous
     </Button>

     <div className="flex flex-col items-center">
       <div className="text-sm text-gray-500">
         {!isLoading
           ? `Page ${globalCurrentPage} of ~${globalTotalPages}`
           : "Loading..."}
       </div>

       {/* Progress bar */}
       <div className="w-32 h-1 bg-gray-200 rounded-full mt-1">
         <div
           className="h-1 bg-blue-500 rounded-full"
           style={{ width: `${readingProgress}%` }}
         />
       </div>
     </div>

     <Button
       variant="outline"
       size="sm"
       onClick={goToNext}
       disabled={isLoading || globalCurrentPage >= globalTotalPages}
     >
       Next <ChevronRight className="h-4 w-4 ml-2" />
     </Button>
   </div>;
   ```

### Chapter Navigation Implementation

1. **Extract TOC Data**:
   EPUBjs provides access to the book's table of contents through `book.navigation`. We need to extract and display this in a user-friendly way:

   ```javascript
   // Add to EpubReader.tsx state
   const [tableOfContents, setTableOfContents] = useState([]);
   const [isTocVisible, setIsTocVisible] = useState(false);

   // In the useEffect after book initialization:
   book.loaded.navigation.then((nav) => {
     if (nav.toc) {
       setTableOfContents(nav.toc);
       console.log("Book TOC:", nav.toc);
     }
   });

   // Function to navigate to a chapter
   const navigateToChapter = (href) => {
     if (renditionRef.current) {
       renditionRef.current.display(href);
       setIsTocVisible(false);
     }
   };
   ```

2. **Add the List Icon Import**:
   First, update the import statement in DocumentReader.tsx to include the List icon:

   ```javascript
   // In DocumentReader.tsx, update the import statement
   import {
     ChevronLeft,
     Settings,
     Sun,
     Moon,
     Bookmark,
     Download,
     Share2,
     Loader2,
     WifiOff,
     List, // Add this
   } from "lucide-react";
   ```

3. **TOC Panel UI Component**:

   ```jsx
   // Add this in the component return statement
   <div className="flex-grow relative">
     {/* Existing EPUB viewer */}
     {/* ... */}

     {/* TOC Panel */}
     {isTocVisible && (
       <div className="absolute inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 shadow-lg z-20 overflow-auto">
         <div className="p-4">
           <div className="flex justify-between items-center mb-4">
             <h3 className="font-medium">Contents</h3>
             <Button
               variant="ghost"
               size="sm"
               onClick={() => setIsTocVisible(false)}
             >
               ✕
             </Button>
           </div>

           <nav>
             <ul className="space-y-1">
               {tableOfContents.map((item, index) => (
                 <li key={index}>
                   <Button
                     variant="ghost"
                     className="w-full justify-start text-left"
                     onClick={() => navigateToChapter(item.href)}
                   >
                     {item.label}
                   </Button>

                   {/* Handle nested TOC items if needed */}
                   {item.subitems && item.subitems.length > 0 && (
                     <ul className="pl-4 space-y-1 mt-1">
                       {item.subitems.map((subitem, subIndex) => (
                         <li key={`${index}-${subIndex}`}>
                           <Button
                             variant="ghost"
                             className="w-full justify-start text-left text-sm"
                             onClick={() => navigateToChapter(subitem.href)}
                           >
                             {subitem.label}
                           </Button>
                         </li>
                       ))}
                     </ul>
                   )}
                 </li>
               ))}
             </ul>
           </nav>
         </div>
       </div>
     )}
   </div>;

   {
     /* Add TOC button to the header in the DocumentReader.tsx */
   }
   <Button
     variant="ghost"
     size="icon"
     title="Table of Contents"
     onClick={() => setIsTocVisible(!isTocVisible)}
   >
     <List className="h-5 w-5" />
   </Button>;
   ```

### View Mode Toggle

1. **Add View Mode State and Options**:

   ```javascript
   // Add to EpubReader.tsx state
   const [viewMode, setViewMode] = useState("paginated"); // 'paginated' or 'scrolled'

   // Update the rendition options in the useEffect
   const rendition = book.renderTo(innerContainer, {
     width: containerWidth,
     height: containerHeight,
     spread: "none",
     flow: viewMode === "paginated" ? "paginated" : "scrolled-doc",
     minSpreadWidth: 800,
     allowScriptedContent: false,
     allowPopups: false,
     resizeOnOrientationChange: false,
   });
   ```

2. **Add Toggle to Settings**:
   We need to add this setting to the existing settings popover in `DocumentReader.tsx`:

   ```jsx
   {
     /* Add this to the settings popover in DocumentReader.tsx */
   }
   <div className="space-y-2">
     <div className="flex items-center justify-between">
       <Label htmlFor="view-mode-toggle">View Mode</Label>
       <Select value={viewMode} onValueChange={(value) => setViewMode(value)}>
         <SelectTrigger className="w-32">
           <SelectValue placeholder="View Mode" />
         </SelectTrigger>
         <SelectContent>
           <SelectItem value="paginated">Paginated</SelectItem>
           <SelectItem value="scrolled">Continuous Scroll</SelectItem>
         </SelectContent>
       </Select>
     </div>
   </div>;
   ```

3. **Update EpubReader Props**:

   ```javascript
   // Update EpubReaderProps interface
   interface EpubReaderProps {
     url: string | Blob;
     fontFamily?: string;
     fontSize?: number;
     lineSpacing?: number;
     isDarkMode?: boolean;
     viewMode?: "paginated" | "scrolled"; // Add this
   }

   // Update prop pass-through in DocumentReader.tsx
   <EpubReader
     url={fileData}
     fontFamily={fontFamily}
     fontSize={fontSize}
     lineSpacing={lineSpacing}
     isDarkMode={isDarkMode}
     viewMode={viewMode} // Add this
   />;
   ```

4. **Conditionally Render Navigation Controls**:

   ```jsx
   {
     /* Modify the bottom navigation in EpubReader.tsx */
   }
   <div className="flex items-center justify-between p-4 border-t">
     {viewMode === "paginated" ? (
       <>
         <Button
           variant="outline"
           size="sm"
           onClick={goToPrevious}
           disabled={isLoading}
         >
           <ChevronLeft className="h-4 w-4 mr-2" /> Previous
         </Button>

         <div className="text-sm text-gray-500">
           {!isLoading
             ? `${readingProgress.toFixed(1)}% completed`
             : "Loading..."}
         </div>

         <Button
           variant="outline"
           size="sm"
           onClick={goToNext}
           disabled={isLoading}
         >
           Next <ChevronRight className="h-4 w-4 ml-2" />
         </Button>
       </>
     ) : (
       <div className="w-full flex justify-center">
         <div className="text-sm text-gray-500">
           {!isLoading
             ? `${readingProgress.toFixed(1)}% completed`
             : "Loading..."}
         </div>
       </div>
     )}
   </div>;
   ```

### UI Improvements

1. **Add Touch Support for Mobile**:

   ```javascript
   useEffect(() => {
     // Add this after rendition is created
     rendition.on("touchstart", (e) => {
       const windowWidth = window.innerWidth;
       const touchX = e.changedTouches[0].screenX;
       const third = windowWidth / 3;

       if (touchX < third) {
         rendition.prev();
       } else if (touchX > windowWidth - third) {
         rendition.next();
       }
     });

     // Add touch swipe detection
     let touchStartX = 0;

     rendition.on("touchstart", (e) => {
       touchStartX = e.changedTouches[0].screenX;
     });

     rendition.on("touchend", (e) => {
       const touchEndX = e.changedTouches[0].screenX;
       const diff = touchEndX - touchStartX;

       // Swipe threshold
       if (Math.abs(diff) > 50) {
         if (diff > 0) {
           rendition.prev();
         } else {
           rendition.next();
         }
       }
     });
   }, [url, viewMode]);
   ```

2. **Enhanced Reading Progress**:

   ```jsx
   {
     /* Add a thin progress bar at the top of the reader */
   }
   <div className="h-1 bg-gray-200 dark:bg-gray-700 w-full">
     <div
       className="h-1 bg-blue-500 transition-all duration-300 ease-in-out"
       style={{ width: `${readingProgress}%` }}
     />
   </div>;
   ```

3. **Keyboard Shortcuts and Help Panel**:
   Add a help panel that shows keyboard shortcuts:

   ```jsx
   // Add state
   const [isHelpVisible, setIsHelpVisible] = useState(false);

   // Add key binding effect
   useEffect(() => {
     const handleKeyDown = (e) => {
       if (e.key === "?") {
         setIsHelpVisible(!isHelpVisible);
       }
     };

     window.addEventListener("keydown", handleKeyDown);
     return () => window.removeEventListener("keydown", handleKeyDown);
   }, [isHelpVisible]);

   // Add help panel to JSX
   {
     isHelpVisible && (
       <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
         <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md">
           <h3 className="font-medium mb-4">Keyboard Shortcuts</h3>
           <dl className="grid grid-cols-2 gap-2">
             <dt className="font-mono text-sm">→</dt>
             <dd>Next page</dd>
             <dt className="font-mono text-sm">←</dt>
             <dd>Previous page</dd>
             <dt className="font-mono text-sm">?</dt>
             <dd>Show/hide help</dd>
           </dl>
           <Button
             className="mt-4 w-full"
             onClick={() => setIsHelpVisible(false)}
           >
             Close
           </Button>
         </div>
       </div>
     );
   }
   ```

### Offline EPUB Consistency

A critical issue in the current implementation is that downloaded EPUBs don't render the same way as online EPUBs. This inconsistency creates a poor user experience and defeats the purpose of the offline capability. Here's how to fix it:

1. **Identify the Root Cause**:
   The main difference likely comes from how the files are processed in the DocumentReader component. Looking at the current code, we need to ensure that both online and offline files are processed identically before being passed to the EpubReader component.

2. **Unified File Handling**:

   ```javascript
   // In DocumentReader.tsx, update the fetchDocumentContent function
   const fetchDocumentContent = async () => {
     if (!documentId) {
       setDocumentContent("No document selected");
       setIsLoading(false);
       return;
     }

     try {
       // Check if document is available offline
       const isOffline = await isDocumentAvailableOffline(documentId);
       setIsOffline(isOffline);

       let fileData;
       let fileType;

       // *** CONSISTENT FILE HANDLING - CRITICAL FIX ***
       // Whether online or offline, we want to get a Blob with the correct MIME type
       if (isOffline) {
         // Get document from offline storage
         const offlineData = await getOfflineDocumentContent(documentId);
         console.log(
           "Retrieved offline content:",
           offlineData ? "Content found" : "No content found"
         );

         if (!offlineData) {
           throw new Error("Failed to retrieve offline content");
         }

         // Make sure we have the correct MIME type for EPUBs
         const metadata = await getOfflineDocumentMetadata(documentId);
         if (
           metadata &&
           metadata.fileType === "epub" &&
           offlineData.type !== "application/epub+zip"
         ) {
           // Create a new blob with the correct MIME type
           fileData = new Blob([await offlineData.arrayBuffer()], {
             type: "application/epub+zip",
           });
         } else {
           fileData = offlineData;
         }

         fileType =
           metadata?.fileType ||
           documentTitle.split(".").pop()?.toLowerCase() ||
           "txt";
       } else {
         // Online file handling - keep existing code
         // ...
       }

       setFileData(fileData);

       // For EPUB files, ensure they're handled the same way regardless of source
       if (fileType.toLowerCase() === "epub") {
         // For EPUB files, we'll handle them with the EpubReader component
         content = "EPUB_CONTENT_PLACEHOLDER";
         console.log(
           "EPUB file detected, size:",
           fileData.size,
           "bytes",
           "type:",
           fileData.type
         );
       }
       // ... rest of the content handling
     } catch (error) {
       console.error("Error fetching document:", error);
       // More detailed error handling...
     }
   };
   ```

3. **Metadata Consistency**:
   Ensure we're storing and retrieving the correct metadata when saving files offline:

   ```javascript
   // Update the saveDocumentOffline function in offlineStorage.js
   export const saveDocumentOffline = async (
     documentId,
     fileData,
     metadata
   ) => {
     try {
       // For EPUB files, ensure the MIME type is correct
       let dataToStore = fileData;
       if (
         metadata.fileType === "epub" &&
         fileData.type !== "application/epub+zip"
       ) {
         dataToStore = new Blob([await fileData.arrayBuffer()], {
           type: "application/epub+zip",
         });
       }

       // Store the document in IndexedDB
       await db.documents.put({
         id: documentId,
         data: dataToStore,
         metadata: {
           ...metadata,
           lastAccessed: new Date().toISOString(),
         },
       });

       return true;
     } catch (error) {
       console.error("Error saving document offline:", error);
       return false;
     }
   };
   ```

4. **EPUB.js Initialization Consistency**:
   Ensure EPUBReader component initializes EPUB.js consistently regardless of source:

   ```javascript
   // In EpubReader.tsx, update the initialization process
   const initializeBook = async () => {
     try {
       setIsLoading(true);
       cleanup();

       if (!viewerRef.current) return;

       // Create a new book instance with consistent approach for all sources
       let book;

       // Consistent handling for both online and offline files
       if (url instanceof Blob) {
         try {
           // Ensure the blob has the correct MIME type
           let processedBlob = url;
           if (url.type !== "application/epub+zip") {
             processedBlob = new Blob([await url.arrayBuffer()], {
               type: "application/epub+zip",
             });
           }

           // Always use ArrayBuffer approach for consistency
           const arrayBuffer = await processedBlob.arrayBuffer();
           book = ePub(arrayBuffer);
           console.log("EPUB loaded from ArrayBuffer", {
             size: processedBlob.size,
             type: processedBlob.type,
           });
         } catch (err) {
           console.error("Error loading from ArrayBuffer:", err);
           throw new Error(`Failed to load EPUB: ${err.message}`);
         }
       } else {
         // String URL case
         book = ePub(url);
         console.log("EPUB loaded from URL string");
       }

       bookRef.current = book;

       // Rest of the initialization code...
     } catch (err) {
       // Error handling...
     }
   };
   ```

5. **Testing for Consistency**:
   It's crucial to test both online and offline scenarios to ensure they render identically:

   ```javascript
   // Add debugging helper in EpubReader.tsx
   useEffect(() => {
     // Log debugging info to help diagnose differences
     if (bookRef.current) {
       console.log("EPUB Book information:", {
         spine: bookRef.current.spine
           ? bookRef.current.spine.length
           : "undefined",
         metadata: bookRef.current.packaging
           ? bookRef.current.packaging.metadata
           : "undefined",
         navigation: bookRef.current.navigation ? "available" : "undefined",
         source: typeof url === "string" ? "string URL" : "Blob",
         blobType: url instanceof Blob ? url.type : "N/A",
         blobSize: url instanceof Blob ? url.size : "N/A",
       });
     }
   }, [bookRef.current]);
   ```

By implementing these changes, we'll ensure that downloaded EPUBs render exactly the same way as online ones, providing a consistent reading experience regardless of whether the user is online or offline.

### Component Communication with Refs

To properly integrate the TOC button in the DocumentReader with the TOC panel in the EpubReader, we need to establish communication between the two components. The best way to do this is using a ref:

1. **Expose EpubReader Methods with Ref**:

   ```javascript
   // In EpubReader.tsx, modify the component to use forwardRef
   import {
     useEffect,
     useState,
     useRef,
     forwardRef,
     useImperativeHandle,
   } from "react";

   // Change the component definition to use forwardRef
   const EpubReader = forwardRef(
     (
       {
         url,
         fontFamily = "inter",
         fontSize = 16,
         lineSpacing = 1.5,
         isDarkMode = false,
         viewMode = "paginated", // Default to paginated view
       }: EpubReaderProps,
       ref
     ) => {
       // Existing state declarations...

       // Expose methods to parent component via ref
       useImperativeHandle(ref, () => ({
         toggleToc: () => {
           setIsTocVisible(!isTocVisible);
         },
         goToPage: (page: number) => {
           // Implement navigation to a specific page
           if (renditionRef.current && bookRef.current) {
             const percentage = page / globalTotalPages;
             const cfi =
               bookRef.current.locations.cfiFromPercentage(percentage);
             renditionRef.current.display(cfi);
           }
         },
         getCurrentChapter: () => {
           return currentChapter;
         },
       }));

       // Rest of the component remains the same
       // ...
     }
   );

   // Don't forget to export with forwardRef
   export default EpubReader;
   ```

2. **Add Ref in DocumentReader**:

   ```javascript
   // In DocumentReader.tsx, add a ref to the EpubReader
   import { useRef } from "react";

   export default function DocumentReader({
     documentTitle = "Sample Document.pdf",
     documentId = null,
     onBack = () => {},
   }: DocumentReaderProps) {
     // Existing state...

     // Add a ref for the EpubReader
     const epubReaderRef = useRef(null);

     // Then in the JSX where EpubReader is rendered:
     <EpubReader
       ref={epubReaderRef}
       url={fileData}
       fontFamily={fontFamily}
       fontSize={fontSize}
       lineSpacing={lineSpacing}
       isDarkMode={isDarkMode}
       viewMode={viewMode}
     />
   ```

3. **Add TOC Button in DocumentReader Header**:

   ```jsx
   // In DocumentReader.tsx, add the TOC button to the header
   <div className="flex items-center space-x-2">
     <Button variant="ghost" size="icon" title="Bookmark">
       <Bookmark className="h-5 w-5" />
     </Button>

     {/* Add TOC button only for EPUB files */}
     {documentContent === "EPUB_CONTENT_PLACEHOLDER" && fileData && (
       <Button
         variant="ghost"
         size="icon"
         title="Table of Contents"
         onClick={() => {
           if (epubReaderRef.current) {
             epubReaderRef.current.toggleToc();
           }
         }}
       >
         <List className="h-5 w-5" />
       </Button>
     )}

     {/* Existing buttons */}
     {isOffline ? (
       // ...
     ) : (
       // ...
     )}
     // ...
   </div>
   ```

4. **Display Current Chapter in Header**:

   ```jsx
   // In DocumentReader.tsx, update the header to show the current chapter
   <header
     className={`sticky top-0 z-10 ${
       isDarkMode ? "bg-gray-800" : "bg-white"
     } border-b ${
       isDarkMode ? "border-gray-700" : "border-gray-200"
     } px-4 py-2`}
   >
     <div className="container mx-auto flex justify-between items-center">
       <div className="flex items-center">
         <Button variant="ghost" size="icon" onClick={onBack}>
           <ChevronLeft className="h-5 w-5" />
         </Button>
         <h1 className="ml-2 font-medium truncate">{documentTitle}</h1>
       </div>

       {/* Add current chapter display for EPUBs */}
       {documentContent === "EPUB_CONTENT_PLACEHOLDER" && (
         <div className="text-sm text-gray-500 hidden md:block max-w-xs truncate">
           {epubReaderRef.current?.getCurrentChapter() || ""}
         </div>
       )}

       <div className="flex items-center space-x-2">{/* Buttons... */}</div>
     </div>
   </header>
   ```

By using refs, we can cleanly separate the responsibilities of the two components while still allowing communication between them. The EpubReader component manages the EPUB rendering and state, while the DocumentReader component provides the overall UI structure and controls.

Note: When implementing this pattern, make sure to handle the case when the ref is not yet initialized (especially during the first render), as shown in the code samples with the optional chaining (`?.`).

## Conclusion

This implementation plan addresses all the desired behaviors for improving the EPUB reader experience:

1. **Global Pagination**: We've implemented a solution to show pagination for the entire document instead of just the current chapter. While exact page counting across an entire EPUB can be challenging due to EPUBjs limitations, our approach using progress percentages and estimated page counts provides a good user experience while being technically feasible.

2. **Chapter Navigation**: We've added a comprehensive table of contents panel that allows users to easily navigate between chapters. The TOC data is extracted directly from the EPUB's navigation structure, ensuring an accurate representation of the book's organization.

3. **View Mode Toggle**: We've implemented a way for users to switch between paginated and continuous scroll viewing modes, giving them flexibility in how they prefer to read. The UI adapts appropriately to each mode, showing pagination controls only when in paginated mode.

4. **Enhanced UI Experience**: We've added several UX improvements, including:

   - Visual progress indicators
   - Touch and swipe support for mobile devices
   - Keyboard shortcuts with a help panel
   - Current chapter display in the header
   - Better error handling for EPUB loading issues

5. **Offline EPUB Consistency**: We've addressed the critical issue of downloaded EPUBs not rendering correctly by:
   - Ensuring consistent file handling for both online and offline EPUBs
   - Properly setting MIME types for EPUB files
   - Using a unified approach to initialize the EPUB.js reader
   - Adding better error handling and debugging for offline usage

The implementation leverages React's component architecture and refs to maintain a clean separation of concerns while enabling necessary communication between components. By making these improvements, we'll significantly enhance the reading experience in the application, making it comparable to dedicated e-reader applications.

### Next Steps

After implementing these improvements, we should consider:

1. **User Testing**: Gather feedback on the new EPUB reader experience to identify any usability issues.
2. **Performance Optimization**: Monitor and optimize the rendering performance, especially for very large EPUB files.
3. **Persistent Settings**: Save user preferences (like view mode, font size) across sessions.
4. **Annotations and Highlights**: Consider adding support for note-taking and text highlighting in a future update.
5. **Improved Offline Sync**: Enhance the offline experience with automatic background syncing of reading progress between devices.

By following this plan, we will create a robust, user-friendly EPUB reading experience that meets all the desired criteria while maintaining good performance and code organization.
