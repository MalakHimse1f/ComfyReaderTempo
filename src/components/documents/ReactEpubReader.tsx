import React, { useState, useRef, useEffect } from "react";
import { ReactReader, ReactReaderStyle } from "react-reader";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useResizeObserverErrorHandler } from "@/lib/useResizeObserverErrorHandler";

interface ReactEpubReaderProps {
  url: string | Blob;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  isDarkMode?: boolean;
  onProgressChange?: (progress: number) => void;
}

const ReactEpubReader = React.forwardRef<any, ReactEpubReaderProps>(
  (
    {
      url,
      fontFamily = "inter",
      fontSize = 16,
      lineSpacing = 1.5,
      isDarkMode = false,
      onProgressChange,
    },
    ref
  ) => {
    const [location, setLocation] = useState<string | number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [progress, setProgress] = useState<number>(0);
    const [pageInputValue, setPageInputValue] = useState<string>("1");
    const [showPageInput, setShowPageInput] = useState<boolean>(false);
    const [currentChapter, setCurrentChapter] = useState<string>("");
    const [totalPages, setTotalPages] = useState<number>(100); // Estimated total
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [toc, setToc] = useState<any[]>([]);
    const [loadingStatus, setLoadingStatus] =
      useState<string>("Opening book...");
    const [createdObjectUrl, setCreatedObjectUrl] = useState<string | null>(
      null
    );

    const renditionRef = useRef<any>(null);
    const locationRef = useRef<string | number>(location);

    // Use custom hook to handle ResizeObserver errors
    useResizeObserverErrorHandler();

    // Update locationRef when location changes
    useEffect(() => {
      locationRef.current = location;
    }, [location]);

    // Calculate current page and total pages based on location and TOC
    useEffect(() => {
      if (progress > 0) {
        // Approximate current page based on progress percentage
        const calculatedPage = Math.max(
          1,
          Math.ceil((totalPages * progress) / 100)
        );
        setCurrentPage(calculatedPage);
        setPageInputValue(calculatedPage.toString());

        if (onProgressChange) {
          onProgressChange(progress);
        }
      }
    }, [progress, totalPages, onProgressChange]);

    // Expose methods to parent component via ref
    React.useImperativeHandle(ref, () => ({
      toggleToc: () => {
        // React-reader has built-in TOC that we can toggle
        // However, we need to access the internal state to do this
        // For now, log a message
        console.log(
          "TOC toggle requested - not implemented in react-reader wrapper"
        );
      },
      goToPage: (page: number) => {
        // Navigate to specific page
        const percentage = page / totalPages;
        if (renditionRef.current) {
          const cfi =
            renditionRef.current.book.locations.cfiFromPercentage(percentage);
          if (cfi) {
            setLocation(cfi);
          }
        }
      },
      getCurrentChapter: () => {
        return currentChapter;
      },
    }));

    // Custom styles for the ReactReader component
    const ownStyles = {
      container: {
        overflow: "hidden",
        height: "100%",
      },
      readerArea: {
        position: "relative",
        zIndex: 1,
        height: "100%",
        width: "100%",
        backgroundColor: isDarkMode ? "#1a1a1a" : "#ffffff",
      },
      containerExpanded: {
        fontSize: `${fontSize}px`,
        lineHeight: `${lineSpacing}`,
      },
    };

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

    // Handle navigation to a specific page
    const goToSpecificPage = () => {
      const pageNum = parseInt(pageInputValue);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        // Update current page immediately for better feedback
        setCurrentPage(pageNum);

        // Navigate to the corresponding percentage
        const percentage = pageNum / totalPages;
        if (renditionRef.current && renditionRef.current.book) {
          const cfi =
            renditionRef.current.book.locations.cfiFromPercentage(percentage);
          if (cfi) {
            setLocation(cfi);
          }
        }
        setShowPageInput(false);
      }
    };

    // Handle page input change
    const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setPageInputValue(e.target.value);
    };

    // Handle page input key press
    const handlePageInputKeyPress = (
      e: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (e.key === "Enter") {
        goToSpecificPage();
      }
    };

    // Handle slider change
    const handleSliderChange = (value: number[]) => {
      const pageNum = value[0];
      setPageInputValue(pageNum.toString());
      setCurrentPage(pageNum);

      if (renditionRef.current && renditionRef.current.book) {
        const percentage = pageNum / totalPages;
        const cfi =
          renditionRef.current.book.locations.cfiFromPercentage(percentage);
        if (cfi) {
          setLocation(cfi);
        }
      }
    };

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

    // Function to determine chapter name from location
    const determineChapterFromLocation = (rendition: any, location: any) => {
      if (
        rendition?.book?.spine &&
        location?.start?.index !== undefined &&
        rendition.book.spine.items[location.start.index]
      ) {
        const spineItem = rendition.book.spine.items[location.start.index];
        const href = spineItem.href || "";
        const fileName = href.split("/").pop() || "";

        // Try to find the chapter title from the TOC
        const matchingTocItem = toc.find((item) =>
          item.href.includes(fileName)
        );
        if (matchingTocItem) {
          setCurrentChapter(matchingTocItem.label || fileName);
        } else {
          setCurrentChapter(
            fileName.replace(".xhtml", "").replace(".html", "")
          );
        }
      }
    };

    // Update getUrlForReader to track created URLs
    const getUrlForReader = () => {
      try {
        if (typeof url === "string") {
          console.log(
            "Loading EPUB from string URL:",
            url.substring(0, 50) + "..."
          );
          return url;
        }

        // For Blob, ensure proper MIME type
        let blobToUse = url;
        if (url.type !== "application/epub+zip") {
          console.log(
            "Correcting EPUB MIME type from",
            url.type,
            "to application/epub+zip"
          );
          blobToUse = new Blob([url], { type: "application/epub+zip" });
        }

        // Create the object URL
        console.log(
          "Loading EPUB from Blob, size:",
          (blobToUse.size / 1024).toFixed(2) + "KB, type:",
          blobToUse.type
        );
        const objectUrl = URL.createObjectURL(blobToUse);
        setCreatedObjectUrl(objectUrl);
        return objectUrl;
      } catch (error) {
        console.error("Error in getUrlForReader:", error);
        throw error;
      }
    };

    // Update cleanup useEffect
    useEffect(() => {
      return () => {
        if (createdObjectUrl) {
          console.log("Cleaning up object URL:", createdObjectUrl);
          URL.revokeObjectURL(createdObjectUrl);
        }
      };
    }, [createdObjectUrl]);

    // Add a safety timeout to prevent getting stuck in loading state
    useEffect(() => {
      if (isLoading) {
        const timeout = setTimeout(() => {
          console.warn("Forcing EPUB loading to complete after timeout");
          setIsLoading(false);
        }, 5000); // 5 seconds max loading time

        return () => clearTimeout(timeout);
      }
    }, [isLoading]);

    return (
      <div className="flex flex-col h-full">
        <div className="flex-grow relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800 bg-opacity-80 dark:bg-opacity-80 z-10">
              <div className="flex flex-col items-center max-w-xs text-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-2" />
                <p className="text-gray-700 dark:text-gray-300">
                  {loadingStatus}
                </p>
                <div className="mt-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full animate-pulse"
                    style={{ width: "70%" }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* EPUB Viewer */}
          <ReactReader
            url={getUrlForReader()}
            location={location}
            locationChanged={(epubcfi: string) => {
              console.log(
                "EPUB location changed:",
                epubcfi ? epubcfi.substring(0, 50) + "..." : "null"
              );
              setLocation(epubcfi);

              // Try to update current chapter if rendition is available
              if (renditionRef.current) {
                const currentLocation = renditionRef.current.currentLocation();
                if (currentLocation) {
                  determineChapterFromLocation(
                    renditionRef.current,
                    currentLocation
                  );
                }
              }
            }}
            getRendition={(rendition: any) => {
              renditionRef.current = rendition;
              setLoadingStatus("Processing content...");

              // Set custom styles
              rendition.themes.default({
                body: {
                  "font-family": getFontFamilyStyle(fontFamily),
                  "font-size": `${fontSize}px`,
                  "line-height": lineSpacing.toString(),
                  "background-color": isDarkMode ? "#1a1a1a" : "#ffffff",
                  color: isDarkMode ? "#e0e0e0" : "#333333",
                },
              });

              // Setup locations for pagination but don't wait for it to complete
              rendition.book.ready.then(() => {
                // Immediately set loading to false once book is ready
                setIsLoading(false);

                // We don't need to wait for locations to be generated to start showing content
                const spineItems = rendition.book.spine.items.length;
                const estimatedTotalPages = Math.max(
                  50,
                  Math.round(spineItems * 20) // Approximate 20 pages per chapter
                );
                setTotalPages(estimatedTotalPages);

                // Update chapter information
                const currentLoc = rendition.currentLocation();
                if (currentLoc) {
                  determineChapterFromLocation(rendition, currentLoc);

                  // Calculate approximate progress based on current location
                  // Even without full location generation, we can still estimate
                  const index = currentLoc.start.index || 0;
                  const approxProgress = Math.round((index / spineItems) * 100);
                  setProgress(approxProgress);
                }

                // Generate locations in the background
                // This can take time for large books but won't block rendering
                if (
                  rendition.book.spine &&
                  rendition.book.spine.items.length < 50
                ) {
                  // Only generate locations for smaller books (<50 chapters)
                  // For larger books, we'll rely on spine-based estimation
                  console.log("Generating locations in the background...");
                  rendition.book.locations.generate(1024).then(() => {
                    console.log("Locations generation complete");

                    // Update progress now that we have more accurate location data
                    if (rendition.currentLocation()) {
                      const progress =
                        rendition.book.locations.percentageFromCfi(
                          rendition.currentLocation().start.cfi
                        );
                      const progressPercent = Math.round(progress * 100);
                      setProgress(progressPercent);
                    }
                  });
                }
              });

              // Set up relocated event to update progress
              rendition.on("relocated", (location: any) => {
                if (!location) return;

                // If locations have been generated, use them for accurate progress
                if (rendition.book.locations._locations) {
                  const progress = rendition.book.locations.percentageFromCfi(
                    location.start.cfi
                  );
                  const progressPercent = Math.round(progress * 100);
                  setProgress(progressPercent);
                } else {
                  // Otherwise calculate approximate progress based on spine position
                  const index = location.start.index || 0;
                  const spineItems = rendition.book.spine.items.length;
                  const approxProgress = Math.round((index / spineItems) * 100);
                  setProgress(approxProgress);
                }

                // Update chapter information
                determineChapterFromLocation(rendition, location);
              });
            }}
            tocChanged={(tocData: any[]) => {
              setToc(tocData);
              console.log("TOC loaded:", tocData);
            }}
            epubOptions={{
              allowPopups: true,
              allowScriptedContent: true,
              flow: "paginated",
              manager: "default",
            }}
            readerStyles={ownStyles as any}
            swipeable={true}
          />
        </div>

        <div className="flex flex-col p-4 border-t">
          {/* Progress slider */}
          <div className="w-full mb-3 relative">
            <Slider
              value={[currentPage]}
              min={1}
              max={totalPages}
              step={1}
              onValueChange={handleSliderChange}
              className="h-2"
            />
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
              {showPageInput ? (
                <div className="flex items-center space-x-2">
                  <Input
                    value={pageInputValue}
                    onChange={handlePageInputChange}
                    onKeyPress={handlePageInputKeyPress}
                    className="w-16 text-center"
                    autoFocus
                    onBlur={goToSpecificPage}
                  />
                  <span>of {totalPages}</span>
                </div>
              ) : (
                <div
                  className="cursor-pointer hover:underline"
                  onClick={() => setShowPageInput(true)}
                >
                  {!isLoading
                    ? `Page ${currentPage} of ${totalPages}`
                    : "Loading..."}
                </div>
              )}
              <div className="text-xs text-gray-400">{progress}% completed</div>
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
  }
);

ReactEpubReader.displayName = "ReactEpubReader";

export default ReactEpubReader;
