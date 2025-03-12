import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileWarning, Loader2 } from "lucide-react";
import ImprovedEpubReader from "./ImprovedEpubReader";

// Fallback reader if needed
import ReactEpubReader from "./ReactEpubReader";

interface EpubHandlerProps {
  url: string | Blob;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  isDarkMode?: boolean;
  onProgressChange?: (progress: number) => void;
  onChapterChange?: (chapter: string) => void;
}

/**
 * A smart component that handles EPUB loading with fallbacks to ensure a book always loads
 */
const EpubHandler = React.forwardRef<any, EpubHandlerProps>(
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
    const [useFallback, setUseFallback] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(true);
    const [fileData, setFileData] = useState<string | Blob | null>(null);

    const primaryReaderRef = useRef<any>(null);
    const fallbackReaderRef = useRef<any>(null);

    // Combine refs to forward to the current active reader
    React.useImperativeHandle(ref, () => ({
      toggleToc: () => {
        if (useFallback && fallbackReaderRef.current) {
          fallbackReaderRef.current.toggleToc();
        } else if (primaryReaderRef.current) {
          primaryReaderRef.current.toggleToc();
        }
      },
      goToPage: (page: number) => {
        if (useFallback && fallbackReaderRef.current) {
          fallbackReaderRef.current.goToPage(page);
        } else if (primaryReaderRef.current) {
          primaryReaderRef.current.goToPage(page);
        }
      },
      getCurrentChapter: () => {
        if (useFallback && fallbackReaderRef.current) {
          return fallbackReaderRef.current.getCurrentChapter();
        } else if (primaryReaderRef.current) {
          return primaryReaderRef.current.getCurrentChapter();
        }
        return "";
      },
      refresh: () => {
        if (useFallback && fallbackReaderRef.current) {
          fallbackReaderRef.current.refresh?.();
        } else if (primaryReaderRef.current) {
          primaryReaderRef.current.refresh?.();
        }
      },
    }));

    // Process the EPUB file on component mount or URL change
    useEffect(() => {
      const prepareEpub = async () => {
        setIsProcessing(true);
        setLoadError(null);
        setUseFallback(false); // Start with primary reader

        try {
          if (!url) {
            throw new Error("No EPUB file provided");
          }

          // Process the URL or Blob
          if (typeof url === "string") {
            // String URL - just pass it through
            setFileData(url);
          } else {
            // Process the Blob to ensure it's a valid EPUB
            try {
              // Ensure correct MIME type
              const processedBlob =
                url.type === "application/epub+zip"
                  ? url
                  : new Blob([await url.arrayBuffer()], {
                      type: "application/epub+zip",
                    });

              setFileData(processedBlob);
            } catch (err) {
              console.error("Error processing EPUB blob:", err);
              throw new Error("Invalid EPUB file format");
            }
          }
        } catch (err) {
          console.error("EPUB loading error:", err);
          setLoadError(
            err instanceof Error ? err.message : "Failed to load EPUB file"
          );
        } finally {
          setIsProcessing(false);
        }
      };

      prepareEpub();
    }, [url]);

    // Handle fallback to alternative reader
    const handlePrimaryReaderFailure = () => {
      console.log("Primary EPUB reader failed, switching to fallback...");
      setUseFallback(true);
    };

    // Loading state
    if (isProcessing) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
          <h3 className="font-medium text-lg mb-2">Preparing EPUB Reader</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Setting up the optimal reading experience...
          </p>
        </div>
      );
    }

    // Error state
    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading EPUB</AlertTitle>
            <AlertDescription>
              {loadError}
              <div className="mt-4">
                <Button
                  variant="default"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    // File is ready, render appropriate reader
    if (!fileData) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <FileWarning className="h-12 w-12 text-yellow-500 mb-4" />
          <h3 className="font-medium text-lg mb-2">No EPUB File</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No valid EPUB file was provided to the reader.
          </p>
        </div>
      );
    }

    return (
      <div className="h-full">
        {!useFallback ? (
          // Primary Reader: ImprovedEpubReader
          <ImprovedEpubReader
            ref={primaryReaderRef}
            url={fileData}
            fontFamily={fontFamily}
            fontSize={fontSize}
            lineSpacing={lineSpacing}
            isDarkMode={isDarkMode}
            onProgressChange={onProgressChange}
            onChapterChange={onChapterChange}
            onError={handlePrimaryReaderFailure}
          />
        ) : (
          // Fallback Reader: ReactEpubReader
          <div className="relative h-full">
            {/* Show a small notice that we're using fallback */}
            <div className="absolute top-2 right-2 z-10 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs px-2 py-1 rounded">
              Using alternative reader
            </div>

            <ReactEpubReader
              ref={fallbackReaderRef}
              url={fileData}
              fontFamily={fontFamily}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              isDarkMode={isDarkMode}
              onProgressChange={onProgressChange}
            />
          </div>
        )}
      </div>
    );
  }
);

EpubHandler.displayName = "EpubHandler";

export default EpubHandler;
