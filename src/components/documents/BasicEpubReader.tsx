import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Menu,
  AlertCircle,
} from "lucide-react";
import ePub from "epubjs";
import EpubToc from "./EpubToc";

interface BasicEpubReaderProps {
  url: string | Blob;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  isDarkMode?: boolean;
  onProgressChange?: (progress: number) => void;
  onChapterChange?: (chapter: string) => void;
}

/**
 * A minimal, stable EPUB reader using epub.js directly
 */
const BasicEpubReader = forwardRef<any, BasicEpubReaderProps>(
  (
    {
      url,
      fontFamily = "inter",
      fontSize = 16,
      lineSpacing = 1.5,
      isDarkMode = false,
      onProgressChange,
      onChapterChange,
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState("Loading EPUB...");
    const [error, setError] = useState<string | null>(null);
    const [debug, setDebug] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [currentChapter, setCurrentChapter] = useState("");
    const [isTocVisible, setIsTocVisible] = useState(false);
    const [isDebugVisible, setIsDebugVisible] = useState(false);
    const [toc, setToc] = useState<any[]>([]);
    const [totalDocumentPages, setTotalDocumentPages] = useState(0);
    const [currentGlobalPage, setCurrentGlobalPage] = useState(1);

    const viewerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<any>(null);
    const renditionRef = useRef<any>(null);
    const objectUrlRef = useRef<string | null>(null);
    const isInitialLoadRef = useRef(true);
    const loadTimeoutRef = useRef<number | null>(null);

    // Add to debug log
    const addDebugMessage = (message: string) => {
      console.log(`[EPUB Debug] ${message}`);
      setDebug((prev) => [message, ...prev].slice(0, 50)); // Keep last 50 messages
    };

    // Expose methods to parent component via ref
    useImperativeHandle(ref, () => ({
      toggleToc: () => {
        setIsTocVisible(!isTocVisible);
      },
      toggleDebug: () => {
        setIsDebugVisible(!isDebugVisible);
      },
      getCurrentChapter: () => currentChapter,
      goToPage: (pageNumber: number) => {
        if (!renditionRef.current || !bookRef.current) return;
        try {
          if (bookRef.current.locations.length()) {
            // Convert page number to percentage
            const percentage = (pageNumber - 1) / (totalDocumentPages - 1);
            const cfi = bookRef.current.locations.cfiFromPercentage(percentage);
            renditionRef.current.display(cfi);
          }
        } catch (err) {
          console.error("Error navigating to page:", err);
          addDebugMessage(
            `Navigation error: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      },
      refresh: () => {
        loadEpub();
      },
      getTotalPages: () => totalDocumentPages,
      getCurrentPage: () => currentGlobalPage,
    }));

    // Load and initialize EPUB
    const loadEpub = async () => {
      if (!viewerRef.current) return;

      // Clean up previous instances
      if (renditionRef.current) {
        renditionRef.current.destroy();
      }

      if (bookRef.current) {
        bookRef.current.destroy();
      }

      // Clean up previous object URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      // Clear previous timeout if exists
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }

      // Set a safety timeout to prevent infinite loading
      loadTimeoutRef.current = window.setTimeout(() => {
        if (isLoading) {
          addDebugMessage(
            "Loading timeout reached - book may be too large or corrupted"
          );
          setError(
            "Loading timeout. The EPUB might be too large or corrupted."
          );
          setIsLoading(false);
        }
      }, 45000); // 45 second timeout

      try {
        setIsLoading(true);
        setLoadingMessage("Loading EPUB...");
        setError(null);
        setDebug([]);

        addDebugMessage(`Starting to load EPUB. URL type: ${typeof url}`);
        if (url instanceof Blob) {
          addDebugMessage(`Blob size: ${url.size} bytes, type: ${url.type}`);
        }

        let book;

        // Create book instance based on URL type
        if (typeof url === "string") {
          addDebugMessage(`Loading from URL: ${url.substring(0, 100)}...`);
          book = ePub(url);
          addDebugMessage("Created EPUB from URL string");
        } else {
          addDebugMessage(
            `Processing Blob: size=${url.size} bytes, type=${url.type}`
          );

          try {
            // More robust blob handling - try direct ArrayBuffer approach first
            const blobWithCorrectType =
              url.type === "application/epub+zip"
                ? url
                : new Blob([await url.arrayBuffer()], {
                    type: "application/epub+zip",
                  });

            // Use the ArrayBuffer directly for more reliable loading
            const arrayBuffer = await blobWithCorrectType.arrayBuffer();
            addDebugMessage(
              `Got ArrayBuffer of size: ${arrayBuffer.byteLength} bytes`
            );

            // Create book from ArrayBuffer - more direct and reliable than Object URL
            book = ePub(arrayBuffer);
            addDebugMessage("Created EPUB directly from ArrayBuffer");
          } catch (err) {
            // Fallback to object URL approach if ArrayBuffer fails
            addDebugMessage(
              `ArrayBuffer approach failed: ${err}. Falling back to Object URL.`
            );

            const objectUrl = URL.createObjectURL(url);
            addDebugMessage(`Created object URL: ${objectUrl}`);
            objectUrlRef.current = objectUrl;
            book = ePub(objectUrl);
            addDebugMessage("Created EPUB from Blob via Object URL (fallback)");
          }
        }

        bookRef.current = book;

        // Get container dimensions
        const width = viewerRef.current.clientWidth;
        const height = viewerRef.current.clientHeight;
        addDebugMessage(`Container dimensions: ${width}x${height}`);

        // Add event listeners for book errors
        book.on("openFailed", (error: any) => {
          addDebugMessage(`Book open failed: ${error}`);
          setError(`Failed to open EPUB: ${error}`);
        });

        // Create rendition
        addDebugMessage("Creating rendition");
        let rendition;
        try {
          rendition = book.renderTo(viewerRef.current, {
            width,
            height,
            spread: "none",
            flow: "paginated",
          });
          addDebugMessage("Rendition created successfully");
        } catch (err) {
          addDebugMessage(
            `Error creating rendition: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          throw new Error(
            `Failed to create rendition: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }

        renditionRef.current = rendition;

        // Set theme based on user preferences
        addDebugMessage("Setting theme");
        rendition.themes.register("default", {
          body: {
            color: isDarkMode ? "#e1e1e1" : "#222",
            background: isDarkMode ? "#222" : "#fff",
            "font-family": getFontFamily(fontFamily),
            "font-size": `${fontSize}px`,
            "line-height": `${lineSpacing}`,
          },
        });

        rendition.themes.select("default");

        // Handle rendition errors
        rendition.on("rendered", (section: any) => {
          addDebugMessage(`Rendered section: ${section.href}`);
        });

        rendition.on("layout", (layout: any) => {
          addDebugMessage(`Layout: ${layout.name}, ${layout.spread}`);
        });

        rendition.on("resized", (size: any) => {
          addDebugMessage(`Resized: ${size.width}x${size.height}`);
        });

        rendition.on("displayError", (error: any) => {
          addDebugMessage(`Display error: ${error}`);
          setError(`Display error: ${error}`);
        });

        // Handle relocated event
        rendition.on("relocated", (location: any) => {
          try {
            addDebugMessage(`Relocated to: ${location.start.cfi}`);

            // Get the current page number directly from the book's locations
            if (book.locations.length()) {
              // Get the percentage of the current location
              const progress = book.locations.percentageFromCfi(
                location.start.cfi
              );

              // Calculate current page based on total pages and progress
              const page = Math.max(
                1,
                Math.round(progress * totalDocumentPages)
              );
              setCurrentGlobalPage(page);
              addDebugMessage(
                `Current page: ${page} of ${totalDocumentPages} (${(
                  progress * 100
                ).toFixed(1)}%)`
              );

              // Update progress percentage (0-100)
              const progressPercentage = Math.round(progress * 100);
              setProgress(progressPercentage);

              if (onProgressChange) {
                onProgressChange(progressPercentage);
              }
            } else {
              addDebugMessage(
                "Locations not yet generated, can't calculate page"
              );
            }

            // Get current chapter
            if (location.start) {
              book.spine
                .get(location.start.index)
                .then((section: any) => {
                  if (section && section.href) {
                    addDebugMessage(`Current section href: ${section.href}`);
                    book.navigation
                      .get(section.href)
                      .then((tocItem: any) => {
                        if (tocItem && tocItem.label) {
                          addDebugMessage(
                            `Chapter title from TOC: ${tocItem.label}`
                          );
                          setCurrentChapter(tocItem.label);
                          if (onChapterChange) {
                            onChapterChange(tocItem.label);
                          }
                        }
                      })
                      .catch((err: any) => {
                        addDebugMessage(`Error getting chapter title: ${err}`);
                        // Fallback chapter name
                        const sectionTitle =
                          section.href.split("/").pop() ||
                          `Chapter ${location.start.index + 1}`;
                        addDebugMessage(
                          `Using fallback chapter title: ${sectionTitle}`
                        );
                        setCurrentChapter(sectionTitle);
                        if (onChapterChange) {
                          onChapterChange(sectionTitle);
                        }
                      });
                  }
                })
                .catch((err: any) => {
                  addDebugMessage(`Error getting spine item: ${err}`);
                  console.error("Error getting spine item:", err);
                });
            }

            // Save position
            if (location.start && location.start.cfi) {
              localStorage.setItem(
                `epub-position-${book.key()}`,
                location.start.cfi
              );
              addDebugMessage(`Saved position: ${location.start.cfi}`);
            }
          } catch (err) {
            addDebugMessage(
              `Error handling relocated event: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
            console.error("Error handling relocated event:", err);
          }
        });

        // Wait for book to be ready
        addDebugMessage("Waiting for book to be ready...");
        try {
          await book.ready;
          addDebugMessage("EPUB is ready");

          // Log EPUB metadata
          if (book.packaging && book.packaging.metadata) {
            const meta = book.packaging.metadata;
            addDebugMessage(`Title: ${meta.title}`);
            if (meta.creator) addDebugMessage(`Author: ${meta.creator}`);
            if (meta.description)
              addDebugMessage(
                `Description: ${meta.description.substring(0, 100)}...`
              );
          }

          // Log spine information
          if (book.spine) {
            addDebugMessage(`Spine items: ${book.spine.length}`);
            addDebugMessage(
              `First few items: ${book.spine.items
                .slice(0, 3)
                .map((item: any) => item.href)
                .join(", ")}...`
            );
          }
        } catch (err) {
          addDebugMessage(
            `Error in book.ready: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          throw new Error(
            `Book initialization failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }

        // Load TOC
        addDebugMessage("Loading table of contents...");
        try {
          const nav = await book.loaded.navigation;
          if (nav.toc) {
            addDebugMessage(`EPUB TOC loaded with ${nav.toc.length} items`);
            if (nav.toc.length > 0) {
              addDebugMessage(
                `First TOC item: ${nav.toc[0].label} (${nav.toc[0].href})`
              );
            }
            setToc(nav.toc);
          } else {
            addDebugMessage("TOC is empty or undefined");
          }
        } catch (err) {
          addDebugMessage(
            `Error loading navigation: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          console.error("Error loading navigation:", err);
        }

        // Generate locations for better navigation
        addDebugMessage("Starting locations generation...");
        try {
          // Check if locations already exist
          if (!book.locations.length()) {
            addDebugMessage("Generating EPUB locations for pagination...");
            setLoadingMessage(
              "Generating page information... (this may take a moment)"
            );

            // Set a lower value for location generation to improve performance
            // This still provides adequate pagination without overwhelming the browser
            const epubSize = book.archive ? book.archive.size : 0;

            // Scale the number of locations based on book size
            let locationsCount = 600; // Default for small books

            if (epubSize > 1000000) {
              // For books > 1MB
              // Use a more conservative approach for larger books
              locationsCount = 400;
              addDebugMessage(
                `Large EPUB detected (${Math.round(
                  epubSize / 1024 / 1024
                )}MB), using optimized location count`
              );
            }

            addDebugMessage(`Generating ${locationsCount} locations...`);

            // Use a promise with timeout to prevent browser hanging
            const generateWithTimeout = async () => {
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                  () => reject(new Error("Locations generation timeout")),
                  30000
                );
              });

              try {
                await Promise.race([
                  book.locations.generate(locationsCount),
                  timeoutPromise,
                ]);
                return true;
              } catch (error) {
                if (error.message === "Locations generation timeout") {
                  addDebugMessage(
                    "Locations generation timed out, using estimate instead"
                  );
                  // Estimate total pages based on spine items
                  const estimate = Math.max(
                    50,
                    book.spine ? book.spine.length * 15 : 100
                  );
                  setTotalDocumentPages(estimate);
                  addDebugMessage(`Estimated total pages: ${estimate}`);
                  return false;
                }
                throw error;
              }
            };

            const success = await generateWithTimeout();

            if (success) {
              addDebugMessage("EPUB locations generated successfully");
              // Get the total number of pages/locations
              const totalLocations = book.locations.total;
              setTotalDocumentPages(totalLocations);
              addDebugMessage(`Total document pages: ${totalLocations}`);
            }
          } else {
            // If locations are already generated
            const totalLocations = book.locations.total;
            setTotalDocumentPages(totalLocations);
            addDebugMessage(
              `Using pre-generated locations, total pages: ${totalLocations}`
            );
          }
        } catch (err) {
          addDebugMessage(
            `Error generating locations: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          // Use an estimate for the total pages rather than failing completely
          const estimatedPages = Math.max(
            50,
            book.spine ? book.spine.length * 10 : 100
          );
          setTotalDocumentPages(estimatedPages);
          addDebugMessage(
            `Falling back to estimated page count: ${estimatedPages}`
          );
          console.error("Error generating locations:", err);
        }

        // Restore previous position or display first page
        const storedPosition = localStorage.getItem(
          `epub-position-${book.key()}`
        );

        if (storedPosition) {
          addDebugMessage(`Restoring position: ${storedPosition}`);
          try {
            await rendition.display(storedPosition);
            addDebugMessage("Position restored successfully");
            // Calculate and set the current page based on the stored position
            if (book.locations.length()) {
              const progress = book.locations.percentageFromCfi(storedPosition);
              const page = Math.max(
                1,
                Math.round(progress * totalDocumentPages)
              );
              setCurrentGlobalPage(page);
              addDebugMessage(
                `Restored to page ${page} (${(progress * 100).toFixed(1)}%)`
              );
            }
          } catch (err) {
            addDebugMessage(
              `Error restoring position: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
            console.error("Error restoring position:", err);
            addDebugMessage("Falling back to first page");
            await rendition.display();
          }
        } else {
          addDebugMessage("No saved position, starting from beginning");
          await rendition.display();
          setCurrentGlobalPage(1);
        }

        // Setup keyboard navigation
        const keyListener = (e: KeyboardEvent) => {
          if (!renditionRef.current) return;

          if (e.key === "ArrowLeft" || e.key === "Left") {
            renditionRef.current.prev();
          }

          if (e.key === "ArrowRight" || e.key === "Right") {
            renditionRef.current.next();
          }

          // Press 'D' to toggle debug info
          if (e.key === "d" || e.key === "D") {
            setIsDebugVisible(!isDebugVisible);
          }
        };

        document.addEventListener("keyup", keyListener);

        // Clear the safety timeout as loading completed successfully
        if (loadTimeoutRef.current) {
          window.clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }

        setIsLoading(false);
        isInitialLoadRef.current = false;
        addDebugMessage("EPUB loading completed successfully");

        return () => {
          document.removeEventListener("keyup", keyListener);
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addDebugMessage(`Fatal error loading EPUB: ${errorMessage}`);
        console.error("Error loading EPUB:", err);
        setError(`Failed to load EPUB: ${errorMessage}`);
        setIsLoading(false);
        isInitialLoadRef.current = false;

        // Clear the safety timeout
        if (loadTimeoutRef.current) {
          window.clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
      }
    };

    // Initialize book when component mounts or url/settings change
    useEffect(() => {
      addDebugMessage("Component initialized or props changed - loading EPUB");
      loadEpub();

      // Cleanup on unmount
      return () => {
        addDebugMessage("Component unmounting - cleaning up resources");
        if (renditionRef.current) {
          renditionRef.current.destroy();
        }

        if (bookRef.current) {
          bookRef.current.destroy();
        }

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }

        if (loadTimeoutRef.current) {
          window.clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
      };
    }, [url, fontFamily, fontSize, lineSpacing, isDarkMode]);

    // Helper to get font family CSS
    const getFontFamily = (family: string) => {
      switch (family) {
        case "inter":
          return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        case "georgia":
          return "Georgia, serif";
        case "times":
          return '"Times New Roman", Times, serif';
        case "courier":
          return '"Courier New", Courier, monospace';
        default:
          return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      }
    };

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        if (!viewerRef.current || !renditionRef.current) return;

        const width = viewerRef.current.clientWidth;
        const height = viewerRef.current.clientHeight;

        if (width === 0 || height === 0) return;

        renditionRef.current.resize(width, height);
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, []);

    // Navigation methods
    const goToNext = () => {
      if (renditionRef.current) {
        renditionRef.current.next();
      }
    };

    const goToPrevious = () => {
      if (renditionRef.current) {
        renditionRef.current.prev();
      }
    };

    const navigateToChapter = (href: string) => {
      if (renditionRef.current) {
        renditionRef.current.display(href);
        setIsTocVisible(false);
      }
    };

    // Function to navigate to a specific page
    const goToPage = (pageNumber: number) => {
      if (
        !renditionRef.current ||
        !bookRef.current ||
        !bookRef.current.locations.length()
      )
        return;

      try {
        // Convert page number to percentage (0-1)
        const percentage = (pageNumber - 1) / (totalDocumentPages - 1);
        const cfi = bookRef.current.locations.cfiFromPercentage(percentage);
        renditionRef.current.display(cfi);
      } catch (err) {
        console.error("Error navigating to page:", err);
      }
    };

    // Function to handle direct page input
    const handlePageInputKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (e.key === "Enter") {
        const target = e.target as HTMLInputElement;
        const page = parseInt(target.value);
        if (!isNaN(page) && page >= 1 && page <= totalDocumentPages) {
          goToPage(page);
        }
      }
    };

    return (
      <div className="h-full flex flex-col">
        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700">
          <div className="h-1 bg-blue-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Main content area */}
        <div className="flex-grow relative">
          {/* EPUB Viewer */}
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{
              backgroundColor: isDarkMode ? "#222" : "#fff",
            }}
          />

          {/* Table of Contents */}
          <EpubToc
            isVisible={isTocVisible}
            toc={toc}
            onClose={() => setIsTocVisible(false)}
            onNavigate={navigateToChapter}
          />

          {/* Debug panel */}
          {isDebugVisible && (
            <div className="absolute left-0 bottom-0 w-full md:w-2/3 max-h-48 overflow-auto bg-white/90 dark:bg-gray-900/90 p-2 z-30 text-xs font-mono border-t border-gray-300 dark:border-gray-700">
              <div className="flex justify-between items-center mb-1">
                <h4 className="font-bold">EPUB Debug Info</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDebugVisible(false)}
                  className="h-6 w-6 p-0"
                >
                  ✕
                </Button>
              </div>
              <div className="space-y-0.5">
                {debug.map((msg, i) => (
                  <div key={i} className="text-xs">
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-20">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {loadingMessage}
                </p>
                {/* Debug toggle button */}
                <button
                  onClick={() => setIsDebugVisible(!isDebugVisible)}
                  className="mt-4 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Show Debug Info
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-20 p-4">
              <div className="max-w-md p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
                <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
                <h3 className="text-red-800 dark:text-red-200 font-medium mb-2">
                  Error Loading EPUB
                </h3>
                <p className="text-red-700 dark:text-red-300 text-sm mb-4">
                  {error}
                </p>
                <div className="flex justify-center space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Refresh Page
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setIsDebugVisible(true)}
                  >
                    Show Debug Info
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TOC toggle button */}
          <button
            className="absolute left-2 top-2 bg-white/70 dark:bg-gray-800/70 p-2 rounded-full shadow-lg z-10 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsTocVisible(!isTocVisible)}
            aria-label="Toggle table of contents"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Debug toggle (D key) */}
          <div className="absolute right-2 top-2 z-10">
            <button
              className="bg-white/70 dark:bg-gray-800/70 px-2 py-1 rounded text-xs text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors"
              onClick={() => setIsDebugVisible(!isDebugVisible)}
            >
              Debug
            </button>
          </div>

          {/* Navigation buttons */}
          <button
            className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/70 dark:bg-gray-800/70 p-2 rounded-full shadow-lg z-10 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            onClick={goToPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white/70 dark:bg-gray-800/70 p-2 rounded-full shadow-lg z-10 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            onClick={goToNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Bottom bar with pagination controls */}
        <div className="flex items-center justify-between p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <Button variant="outline" size="sm" onClick={goToPrevious}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Page
            </span>
            <input
              type="text"
              value={currentGlobalPage}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  setCurrentGlobalPage(value);
                }
              }}
              onKeyDown={handlePageInputKeyDown}
              onBlur={() => setCurrentGlobalPage(currentGlobalPage)}
              className="w-12 h-6 text-center text-xs border dark:border-gray-700 rounded bg-white dark:bg-gray-800"
              aria-label="Current page"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              of {totalDocumentPages}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={goToNext}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }
);

BasicEpubReader.displayName = "BasicEpubReader";

export default BasicEpubReader;
