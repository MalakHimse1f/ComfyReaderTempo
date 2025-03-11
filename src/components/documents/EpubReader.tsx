import {
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
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
  onProgressChange?: (progress: number) => void;
}

const EpubReader = forwardRef(
  (
    {
      url,
      fontFamily = "inter",
      fontSize = 16,
      lineSpacing = 1.5,
      isDarkMode = false,
      onProgressChange,
    }: EpubReaderProps,
    ref,
  ) => {
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [currentCfi, setCurrentCfi] = useState<string>("");
    const [readingProgress, setReadingProgress] = useState<number>(0);
    const [furthestCfi, setFurthestCfi] = useState<string>("");
    const [currentChapter, setCurrentChapter] = useState<string>("");

    const viewerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<any>(null);
    const renditionRef = useRef<any>(null);

    // Use custom hook to handle ResizeObserver errors
    useResizeObserverErrorHandler();

    // Expose methods to parent component via ref
    useImperativeHandle(ref, () => ({
      toggleToc: () => {
        // This would be implemented if we had a TOC panel
        console.log("TOC toggle requested");
      },
      goToPage: (page: number) => {
        // Implement navigation to a specific page
        if (renditionRef.current && bookRef.current) {
          const percentage = page / totalPages;
          const cfi = bookRef.current.locations.cfiFromPercentage(percentage);
          renditionRef.current.display(cfi);
        }
      },
      getCurrentChapter: () => {
        return currentChapter;
      },
    }));

    // Initialize and render the EPUB book
    useEffect(() => {
      // Ensure the component is fully mounted before initializing
      let isMounted = true;

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

      // Force loading to false after a maximum time
      const forceLoadingTimeout = setTimeout(() => {
        if (isLoading && isMounted) {
          console.warn("Forcing loading state to false after timeout");
          setIsLoading(false);
        }
      }, 15000);

      // Small delay to ensure DOM is ready
      const initTimeout = setTimeout(() => {
        if (!isMounted) return;
        initializeBook();
      }, 100);

      const initializeBook = async () => {
        try {
          setIsLoading(true);
          cleanup(); // Clean up any existing book

          if (!viewerRef.current) {
            throw new Error("EPUB viewer container is not available");
          }

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

          // Wait for the book to be opened with a timeout
          const bookReadyPromise = book.ready;
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
              () =>
                reject(new Error("Book loading timed out after 10 seconds")),
              10000,
            );
          });

          try {
            await Promise.race([bookReadyPromise, timeoutPromise]);
          } catch (timeoutErr) {
            console.warn(
              "Book loading timed out, continuing anyway:",
              timeoutErr,
            );
            // Continue anyway, as the book might still be usable
          }

          // Check if viewerRef is still valid before accessing properties
          if (!viewerRef.current) {
            throw new Error("EPUB viewer container is no longer available");
          }

          // Get dimensions once and use fixed values to avoid ResizeObserver issues
          // Use default values if measurements are zero
          const containerWidth =
            viewerRef.current.clientWidth > 0
              ? viewerRef.current.clientWidth
              : 600;
          const containerHeight =
            viewerRef.current.clientHeight > 0
              ? viewerRef.current.clientHeight
              : 800;

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

          // Display the book with timeout protection
          try {
            const displayPromise = rendition.display();
            const displayTimeoutPromise = new Promise((_, reject) => {
              setTimeout(
                () =>
                  reject(
                    new Error("Rendition display timed out after 5 seconds"),
                  ),
                5000,
              );
            });

            await Promise.race([displayPromise, displayTimeoutPromise]);
          } catch (displayErr) {
            console.warn(
              "Rendition display timed out, continuing anyway:",
              displayErr,
            );
            // Set loading to false even if display times out
            if (isMounted) setIsLoading(false);
          }

          // Set up event listeners for pagination
          rendition.on("relocated", (location: any) => {
            // Clear the force loading timeout since we've successfully relocated
            clearTimeout(forceLoadingTimeout);

            // Update current page information
            const currentPage = location.start.displayed.page;
            const totalPages = location.start.displayed.total;

            // Calculate reading progress percentage
            const progress =
              book.locations.percentageFromCfi(location.start.cfi) || 0;
            const progressPercentage = Math.round(progress * 100);

            if (isMounted) {
              setCurrentPage(currentPage);
              setTotalPages(totalPages);
              setCurrentCfi(location.start.cfi);
              setReadingProgress(progressPercentage);

              // Call the onProgressChange callback if provided
              if (onProgressChange) {
                console.log(`EPUB progress update: ${progressPercentage}%`);
                onProgressChange(progressPercentage);
              }

              // Update furthest position if current position is further
              const savedFurthestCfi = localStorage.getItem(
                `epub-furthest-${book.key()}`,
              );
              const savedFurthestProgress = savedFurthestCfi
                ? (book.locations.percentageFromCfi(savedFurthestCfi) || 0) *
                  100
                : 0;

              if (progressPercentage > savedFurthestProgress) {
                setFurthestCfi(location.start.cfi);
                localStorage.setItem(
                  `epub-furthest-${book.key()}`,
                  location.start.cfi,
                );
              } else if (savedFurthestCfi && !furthestCfi) {
                setFurthestCfi(savedFurthestCfi);
              }
            }

            // Store reading position for resuming later
            if (location.start.cfi) {
              localStorage.setItem(
                `epub-position-${book.key()}`,
                location.start.cfi,
              );
            }

            // Update current chapter information
            if (book.spine && book.spine.items[location.start.index]) {
              const spineItem = book.spine.items[location.start.index];
              let chapterLabel = spineItem.href.split("/").pop() || "";

              // Try to get a better chapter title from the navigation
              if (book.navigation) {
                book.navigation
                  .get(spineItem.href)
                  .then((tocItem: any) => {
                    if (tocItem && tocItem.label && isMounted) {
                      setCurrentChapter(tocItem.label);
                    }
                  })
                  .catch(() => {
                    // If navigation lookup fails, use the spine item href
                    if (isMounted) setCurrentChapter(chapterLabel);
                  });
              } else {
                setCurrentChapter(chapterLabel);
              }
            }
          });

          // Check if we have a saved position
          const savedCfi = localStorage.getItem(`epub-position-${book.key()}`);
          const savedFurthestCfi = localStorage.getItem(
            `epub-furthest-${book.key()}`,
          );

          if (savedFurthestCfi) {
            setFurthestCfi(savedFurthestCfi);
          }

          if (savedCfi) {
            rendition.display(savedCfi);
          }

          // Set up keyboard navigation
          rendition.on("keyup", (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") rendition.prev();
            if (e.key === "ArrowRight") rendition.next();
          });

          // Clear any force loading timeout
          clearTimeout(forceLoadingTimeout);
          if (isMounted) setIsLoading(false);
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

          if (isMounted) {
            setError(errorMessage);
            // Clear any force loading timeout
            clearTimeout(forceLoadingTimeout);
            setIsLoading(false);
          }
        }
      };

      // Cleanup when component unmounts or URL changes
      return () => {
        isMounted = false;
        clearTimeout(initTimeout);
        if (bookRef.current && bookRef.current._objectUrl) {
          URL.revokeObjectURL(bookRef.current._objectUrl);
        }
        cleanup();
        clearTimeout(forceLoadingTimeout);
      };
    }, [url, fontFamily, fontSize, lineSpacing, isDarkMode, onProgressChange]);

    // Force loading to false after a maximum time (component-level fallback)
    useEffect(() => {
      if (isLoading) {
        const timeout = setTimeout(() => {
          console.warn(
            "Component-level force loading state to false after timeout",
          );
          setIsLoading(false);
        }, 20000);

        return () => clearTimeout(timeout);
      }
    }, [isLoading]);

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
              minWidth: "300px", // Ensure minimum width
              height: "100%", // Ensure full height
              width: "100%", // Ensure full width
            }}
          />
        </div>

        <div className="flex flex-col p-4 border-t">
          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-200 rounded-full mb-3 relative">
            {/* Current progress */}
            <div
              className="h-2 bg-blue-500 rounded-full absolute top-0 left-0"
              style={{ width: `${readingProgress}%` }}
            />
            {/* Furthest read indicator */}
            {furthestCfi && furthestCfi !== currentCfi && (
              <div
                className="h-4 w-1 bg-green-500 absolute top-0 -mt-1 transform -translate-x-1/2"
                style={{
                  left: `${
                    bookRef.current
                      ? (bookRef.current.locations.percentageFromCfi(
                          furthestCfi,
                        ) || 0) * 100
                      : 0
                  }%`,
                  borderRadius: "1px",
                }}
                title="Furthest read position"
              />
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevious}
              disabled={isLoading || currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-2" /> Previous
            </Button>

            <div className="text-sm text-gray-500 flex flex-col items-center">
              <div>
                {!isLoading
                  ? `Page ${currentPage} of ${totalPages}`
                  : "Loading..."}
              </div>
              <div className="text-xs text-gray-400">
                {isNaN(readingProgress) ? 0 : readingProgress}% completed
              </div>
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
      </div>
    );
  },
);

export default EpubReader;
