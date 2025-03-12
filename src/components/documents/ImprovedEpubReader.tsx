import React, {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Loader2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Menu,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ePub from "epubjs";

export interface ImprovedEpubReaderProps {
  url: string | Blob;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  isDarkMode?: boolean;
  onProgressChange?: (progress: number) => void;
  onChapterChange?: (chapter: string) => void;
  onError?: () => void;
}

/**
 * An improved EPUB reader component using epub.js
 */
const ImprovedEpubReader = forwardRef<any, ImprovedEpubReaderProps>(
  (
    {
      url,
      fontFamily = "inter",
      fontSize = 16,
      lineSpacing = 1.5,
      isDarkMode = false,
      onProgressChange,
      onChapterChange,
      onError,
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [currentLocation, setCurrentLocation] = useState<any>(null);
    const [currentChapter, setCurrentChapter] = useState("");
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [isTocVisible, setIsTocVisible] = useState(false);
    const [toc, setToc] = useState<any[]>([]);

    const viewerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<any>(null);
    const renditionRef = useRef<any>(null);
    const locationChangedRef = useRef(false);
    const objectUrlRef = useRef<string | null>(null);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      toggleToc: () => {
        setIsTocVisible(!isTocVisible);
      },
      goToPage: (page: number) => {
        if (renditionRef.current && bookRef.current) {
          try {
            // Calculate position from page
            const percentage = Math.min(Math.max(page / totalPages, 0), 1);
            if (bookRef.current.locations.length()) {
              const cfi =
                bookRef.current.locations.cfiFromPercentage(percentage);
              renditionRef.current.display(cfi);
            }
          } catch (e) {
            console.error("Error navigating to page:", e);
          }
        }
      },
      getCurrentChapter: () => currentChapter,
      refresh: () => {
        initializeBook();
      },
    }));

    const initializeBook = async () => {
      try {
        setIsLoading(true);
        setError(null);
        locationChangedRef.current = false;

        // Clean up previous instance
        if (renditionRef.current) {
          renditionRef.current.destroy();
          renditionRef.current = null;
        }

        if (bookRef.current) {
          bookRef.current.destroy();
          bookRef.current = null;
        }

        if (!viewerRef.current) {
          setError("EPUB reader container not found");
          return;
        }

        // Calculate container dimensions
        const containerWidth = viewerRef.current.clientWidth;
        const containerHeight = viewerRef.current.clientHeight;

        if (containerWidth === 0 || containerHeight === 0) {
          console.warn("Container has zero dimensions, retrying...");
          setTimeout(initializeBook, 500);
          return;
        }

        console.log(
          "Creating new EPUB instance with container dimensions:",
          containerWidth,
          containerHeight
        );

        // Create a new book instance
        let book;

        // Handle different URL types
        if (typeof url === "string") {
          // Direct URL to EPUB file
          book = ePub(url);
          console.log("Created EPUB from URL string");
        } else {
          // Blob object
          try {
            // Ensure it's the right type
            const fileBlob =
              url.type !== "application/epub+zip"
                ? new Blob([await url.arrayBuffer()], {
                    type: "application/epub+zip",
                  })
                : url;

            // Create object URL
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current);
            }
            const objectUrl = URL.createObjectURL(fileBlob);
            objectUrlRef.current = objectUrl;

            book = ePub(objectUrl);
            console.log("Created EPUB from Blob via Object URL");
          } catch (error) {
            console.error("Error creating EPUB from Blob:", error);
            setError("Failed to load EPUB from file data");
            setIsLoading(false);
            if (onError) onError();
            return;
          }
        }

        bookRef.current = book;

        // Set up rendition
        const rendition = book.renderTo(viewerRef.current, {
          width: containerWidth,
          height: containerHeight,
          spread: "none",
          flow: "paginated",
          minSpreadWidth: 800,
        });

        renditionRef.current = rendition;

        // Apply themes based on user preferences
        rendition.themes.register("default", {
          body: {
            color: isDarkMode ? "#e1e1e1" : "#222",
            background: isDarkMode ? "#222" : "#fff",
            "font-family": getFontFamily(fontFamily),
            "font-size": `${fontSize}px`,
            "line-height": `${lineSpacing}`,
          },
          a: {
            color: isDarkMode ? "#7eb6ff" : "#0066cc",
            "text-decoration": "none",
          },
          img: {
            "max-width": "100%",
          },
          ".epub-view": {
            background: isDarkMode ? "#222" : "#fff",
          },
        });

        rendition.themes.select("default");

        // Set up event listeners
        rendition.on("relocated", (location: any) => {
          // Don't trigger on the first load
          if (!locationChangedRef.current) {
            locationChangedRef.current = true;
            return;
          }

          try {
            setCurrentLocation(location);

            // Update current page and total pages
            if (location.start && location.start.displayed) {
              setCurrentPage(location.start.displayed.page);
              setTotalPages(location.start.displayed.total);
            }

            // Update progress percentage
            if (book.locations.length()) {
              const progress = book.locations.percentageFromCfi(
                location.start.cfi
              );
              const progressPercentage = Math.round(progress * 100);
              setProgress(progressPercentage);
              if (onProgressChange) {
                onProgressChange(progressPercentage);
              }
            }

            // Get current chapter information
            if (location.start) {
              book.spine
                .get(location.start.index)
                .then((section: any) => {
                  if (section && section.href) {
                    book.navigation
                      .get(section.href)
                      .then((tocItem: any) => {
                        if (tocItem && tocItem.label) {
                          setCurrentChapter(tocItem.label);
                          if (onChapterChange) {
                            onChapterChange(tocItem.label);
                          }
                        } else {
                          // If no TOC label, use section title or href
                          const sectionTitle =
                            section.title ||
                            section.href.split("/").pop() ||
                            "Unknown Chapter";
                          setCurrentChapter(sectionTitle);
                          if (onChapterChange) {
                            onChapterChange(sectionTitle);
                          }
                        }
                      })
                      .catch(() => {
                        // Fallback if navigation info can't be retrieved
                        const fallbackTitle = `Chapter ${
                          location.start.index + 1
                        }`;
                        setCurrentChapter(fallbackTitle);
                        if (onChapterChange) {
                          onChapterChange(fallbackTitle);
                        }
                      });
                  }
                })
                .catch((err: any) => {
                  console.error("Error getting spine item:", err);
                });
            }

            // Store reading position
            if (location.start && location.start.cfi) {
              localStorage.setItem(
                `epub-position-${book.key()}`,
                location.start.cfi
              );
            }
          } catch (err) {
            console.error("Error handling relocation:", err);
          }
        });

        // Handle display errors
        rendition.on("displayError", (error: any) => {
          console.error("EPUB display error:", error);
          setError(
            `Error displaying content: ${error.message || "Unknown error"}`
          );
        });

        // Load the book
        await book.ready;

        // Generate locations for better navigation (this can take time for large books)
        if (!book.locations.length()) {
          book.locations
            .generate(1024)
            .then(() => {
              console.log(
                "EPUB locations generated, total:",
                book.locations.length()
              );
              localStorage.setItem(
                `epub-locations-${book.key()}`,
                book.locations.save()
              );
            })
            .catch((err: any) => {
              console.error("Error generating locations:", err);
            });
        }

        // Load table of contents
        book.loaded.navigation
          .then((navigation: any) => {
            if (navigation.toc) {
              console.log("EPUB TOC loaded:", navigation.toc.length, "items");
              setToc(navigation.toc);
            }
          })
          .catch((err: any) => {
            console.error("Error loading navigation:", err);
          });

        // Try to restore previous reading position
        const storedPosition = localStorage.getItem(
          `epub-position-${book.key()}`
        );
        if (storedPosition) {
          rendition.display(storedPosition).catch(() => {
            console.log("Could not restore position, displaying first page");
            rendition.display();
          });
        } else {
          rendition.display();
        }

        // Add keyboard event listeners
        const keyListener = (e: KeyboardEvent) => {
          if (!renditionRef.current) return;

          // Left Key
          if ((e.key === "ArrowLeft" || e.key === "Left") && !e.ctrlKey) {
            renditionRef.current.prev();
          }

          // Right Key
          if ((e.key === "ArrowRight" || e.key === "Right") && !e.ctrlKey) {
            renditionRef.current.next();
          }
        };

        document.addEventListener("keyup", keyListener);

        // Add touch event listeners for mobile
        let touchStartX = 0;
        const touchListener = {
          start: (e: TouchEvent) => {
            touchStartX = e.changedTouches[0].screenX;
          },
          end: (e: TouchEvent) => {
            if (!renditionRef.current) return;

            const touchEndX = e.changedTouches[0].screenX;
            const diff = touchEndX - touchStartX;

            // Detect swipe direction
            if (Math.abs(diff) > 50) {
              if (diff > 0) {
                renditionRef.current.prev();
              } else {
                renditionRef.current.next();
              }
            }
          },
        };

        document.addEventListener("touchstart", touchListener.start);
        document.addEventListener("touchend", touchListener.end);

        setIsLoading(false);

        // Cleanup function for event listeners
        return () => {
          document.removeEventListener("keyup", keyListener);
          document.removeEventListener("touchstart", touchListener.start);
          document.removeEventListener("touchend", touchListener.end);
        };
      } catch (err: any) {
        console.error("Error initializing EPUB:", err);
        setError(`Failed to load EPUB: ${err.message || "Unknown error"}`);
        setIsLoading(false);
        if (onError) onError();
      }
    };

    // Helper to convert font family to CSS format
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

    // Initialize book when component mounts or url/settings change
    useEffect(() => {
      initializeBook();

      // Cleanup function
      return () => {
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
      };
    }, [url, fontFamily, fontSize, lineSpacing, isDarkMode]);

    // Add window resize handler
    useEffect(() => {
      const handleResize = () => {
        if (!viewerRef.current || !renditionRef.current) return;

        // Resize the rendition to fit the container
        const containerWidth = viewerRef.current.clientWidth;
        const containerHeight = viewerRef.current.clientHeight;

        if (containerWidth === 0 || containerHeight === 0) return;

        renditionRef.current.resize(containerWidth, containerHeight);
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, []);

    // Functions to navigate
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

    // Error state
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Reader Error</AlertTitle>
            <AlertDescription>
              {error}
              <div className="mt-4">
                <Button
                  variant="outline"
                  className="mr-2"
                  onClick={initializeBook}
                >
                  Retry
                </Button>
                {onError && (
                  <Button variant="default" onClick={onError}>
                    Use Alternative Reader
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full flex flex-col">
        {/* Reading progress bar */}
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700">
          <div
            className="h-1 bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Main content area */}
        <div className="flex-grow relative">
          {/* Table of Contents sidebar */}
          {isTocVisible && (
            <div className="absolute top-0 left-0 h-full z-40 bg-white dark:bg-gray-800 shadow-lg border-r dark:border-gray-700 w-64 overflow-auto">
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

                <ul className="space-y-1">
                  {toc.map((item, index) => (
                    <li key={index}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-left truncate"
                        onClick={() => navigateToChapter(item.href)}
                      >
                        {item.label}
                      </Button>

                      {/* Handle nested TOC items */}
                      {item.subitems && item.subitems.length > 0 && (
                        <ul className="pl-4 space-y-1 mt-1">
                          {item.subitems.map(
                            (subitem: any, subIndex: number) => (
                              <li key={`${index}-${subIndex}`}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-left truncate text-sm"
                                  onClick={() =>
                                    navigateToChapter(subitem.href)
                                  }
                                >
                                  {subitem.label}
                                </Button>
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Loader overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-gray-900/90 z-30">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">
                  Loading EPUB...
                </p>
              </div>
            </div>
          )}

          {/* EPUB Viewer */}
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{
              backgroundColor: isDarkMode ? "#222" : "#fff",
              color: isDarkMode ? "#e1e1e1" : "#222",
              transition: "background-color 0.3s, color 0.3s",
            }}
          />

          {/* Navigation buttons (visible on larger screens) */}
          <button
            className="hidden md:flex absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/70 dark:bg-gray-800/70 p-2 rounded-full shadow-lg z-20 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            onClick={goToPrevious}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button
            className="hidden md:flex absolute right-2 top-1/2 transform -translate-y-1/2 bg-white/70 dark:bg-gray-800/70 p-2 rounded-full shadow-lg z-20 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            onClick={goToNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        {/* Bottom navigation bar */}
        <div className="flex items-center justify-between p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          <Button variant="outline" size="sm" onClick={goToPrevious}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>

          <div className="flex flex-col items-center text-xs text-gray-600 dark:text-gray-400">
            <div>
              {!isLoading &&
                (totalPages > 0
                  ? `Page ${currentPage} of ${totalPages}`
                  : `${progress}% read`)}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={goToNext}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }
);

ImprovedEpubReader.displayName = "ImprovedEpubReader";

export default ImprovedEpubReader;
