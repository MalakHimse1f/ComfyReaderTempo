import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import ePub from "epubjs";
import { useResizeObserverErrorHandler } from "@/lib/useResizeObserverErrorHandler";

interface EpubReaderProps {
  url: string | Blob;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  isDarkMode?: boolean;
}

const EpubReader = ({
  url,
  fontFamily = "inter",
  fontSize = 16,
  lineSpacing = 1.5,
  isDarkMode = false,
}: EpubReaderProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentCfi, setCurrentCfi] = useState<string>("");

  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);

  // Use custom hook to handle ResizeObserver errors
  useResizeObserverErrorHandler();

  // Initialize and render the EPUB book
  useEffect(() => {
    // Clean up function to destroy previous book instance
    const cleanup = () => {
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
      if (renditionRef.current) {
        renditionRef.current = null;
      }
      // Clean up any inner containers we created
      if (viewerRef.current) {
        while (viewerRef.current.firstChild) {
          viewerRef.current.removeChild(viewerRef.current.firstChild);
        }
      }
    };

    const initializeBook = async () => {
      try {
        setIsLoading(true);
        cleanup(); // Clean up any existing book

        if (!viewerRef.current) return;

        // Create a new book instance
        let book;
        if (url instanceof Blob) {
          try {
            // For Blob URLs, we need to create an ArrayBuffer
            // This is more reliable than object URLs for large files
            const arrayBuffer = await url.arrayBuffer();
            book = ePub(arrayBuffer);
            console.log("EPUB loaded from ArrayBuffer", { size: url.size });
          } catch (err) {
            console.error("Error loading from ArrayBuffer:", err);
            // Fallback to object URL if ArrayBuffer fails
            const objectUrl = URL.createObjectURL(url);
            book = ePub(objectUrl);
            book._objectUrl = objectUrl;
            console.log("EPUB loaded from Object URL", { size: url.size });
          }
        } else {
          // For string URLs
          book = ePub(url);
          console.log("EPUB loaded from URL string");
        }

        bookRef.current = book;

        // Wait for the book to be opened
        await book.ready;

        // Use a more stable approach with fixed dimensions
        // Measure once and use those dimensions
        const containerWidth = viewerRef.current.clientWidth || 600;
        const containerHeight = viewerRef.current.clientHeight || 800;

        // Create a fixed-size inner container to avoid ResizeObserver issues
        const innerContainer = document.createElement("div");
        innerContainer.style.width = `${containerWidth}px`;
        innerContainer.style.height = `${containerHeight}px`;
        innerContainer.style.overflow = "hidden";
        innerContainer.style.position = "relative";
        viewerRef.current.appendChild(innerContainer);

        // Create rendition with fixed dimensions and disable features that might cause ResizeObserver loops
        const rendition = book.renderTo(innerContainer, {
          width: containerWidth,
          height: containerHeight,
          spread: "none",
          flow: "paginated",
          minSpreadWidth: 800,
          allowScriptedContent: false, // Disable scripts for security and performance
          allowPopups: false, // Prevent popups
          resizeOnOrientationChange: false, // Disable auto-resize on orientation change
        });

        // Add debug logging
        console.log("EPUB rendition created", {
          spine: book.spine ? book.spine.length : "undefined",
          metadata: book.packaging ? book.packaging.metadata : "undefined",
        });

        renditionRef.current = rendition;

        // Apply custom styles based on props
        rendition.themes.default({
          body: {
            "font-family": getFontFamilyStyle(fontFamily),
            "font-size": `${fontSize}px`,
            "line-height": lineSpacing.toString(),
            "background-color": isDarkMode ? "#1a1a1a" : "#ffffff",
            color: isDarkMode ? "#e0e0e0" : "#333333",
          },
        });

        // Display the book
        await rendition.display();

        // Set up event listeners for pagination
        rendition.on("relocated", (location: any) => {
          // Update current page information
          const currentPage = location.start.displayed.page;
          const totalPages = location.start.displayed.total;

          setCurrentPage(currentPage);
          setTotalPages(totalPages);
          setCurrentCfi(location.start.cfi);

          // Store reading position for resuming later
          if (location.start.cfi) {
            localStorage.setItem(
              `epub-position-${book.key()}`,
              location.start.cfi,
            );
          }
        });

        // Check if we have a saved position
        const savedCfi = localStorage.getItem(`epub-position-${book.key()}`);
        if (savedCfi) {
          rendition.display(savedCfi);
        }

        // Set up keyboard navigation
        rendition.on("keyup", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") rendition.prev();
          if (e.key === "ArrowRight") rendition.next();
        });

        setIsLoading(false);
      } catch (err) {
        console.error("Error initializing EPUB:", err);

        // More detailed error message with debugging info
        let errorMessage = "Unable to load EPUB file. ";

        if (err instanceof Error) {
          errorMessage += err.message;
          console.error("Error details:", err.stack);
        }

        if (url instanceof Blob) {
          errorMessage += ` File size: ${(url.size / (1024 * 1024)).toFixed(2)}MB, Type: ${url.type}`;
        }

        setError(errorMessage);
        setIsLoading(false);
      }
    };

    initializeBook();

    // Cleanup when component unmounts or URL changes
    return () => {
      if (bookRef.current && bookRef.current._objectUrl) {
        URL.revokeObjectURL(bookRef.current._objectUrl);
      }
      cleanup();
    };
  }, [url, fontFamily, fontSize, lineSpacing, isDarkMode]);

  // Handle page navigation
  const goToPrevious = () => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  };

  const goToNext = () => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  };

  // Handle error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-red-500 mb-4">⚠️</div>
        <h3 className="text-lg font-medium mb-2">Error Loading EPUB</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.history.back()}
        >
          Return to Library
        </Button>
      </div>
    );
  }

  // Get font family style
  function getFontFamilyStyle(font: string): string {
    switch (font) {
      case "inter":
        return "Inter, sans-serif";
      case "georgia":
        return "Georgia, serif";
      case "times":
        return '"Times New Roman", Times, serif';
      case "courier":
        return '"Courier New", Courier, monospace';
      default:
        return "Inter, sans-serif";
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-2" />
              <p className="text-gray-600">Loading EPUB...</p>
            </div>
          </div>
        )}

        {/* EPUB Viewer Container */}
        <div
          ref={viewerRef}
          className="w-full h-full overflow-hidden"
          style={{
            backgroundColor: isDarkMode ? "#1a1a1a" : "#ffffff",
            contain: "content", // Less strict containment to avoid ResizeObserver issues
            position: "relative", // Create a new stacking context
            transform: "translateZ(0)", // Force GPU acceleration and create a new stacking context
            willChange: "transform", // Hint to browser about upcoming changes
            display: "block", // Ensure block display
            minHeight: "400px", // Ensure minimum height
          }}
        />
      </div>

      <div className="flex items-center justify-between p-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrevious}
          disabled={isLoading || currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4 mr-2" /> Previous
        </Button>

        <div className="text-sm text-gray-500">
          {!isLoading ? `Page ${currentPage} of ${totalPages}` : "Loading..."}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNext}
          disabled={isLoading || currentPage >= totalPages}
        >
          Next <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default EpubReader;
