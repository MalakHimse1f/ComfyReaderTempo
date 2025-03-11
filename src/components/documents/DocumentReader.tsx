import { useState, useEffect, useRef } from "react";
import { useResizeObserverErrorHandler } from "@/lib/useResizeObserverErrorHandler";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import EpubReader from "./EpubReader";
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
  List,
} from "lucide-react";
import { supabase } from "../../../supabase/supabase";
import {
  getOfflineDocumentContent,
  isDocumentAvailableOffline,
  saveDocumentOffline,
} from "@/lib/offlineStorage";
import { Separator } from "@/components/ui/separator";

interface DocumentReaderProps {
  documentTitle?: string;
  documentId?: string | null;
  onBack?: () => void;
}

export default function DocumentReader({
  documentTitle = "Sample Document.pdf",
  documentId = null,
  onBack = () => {},
}: DocumentReaderProps) {
  // Apply the ResizeObserver error handler
  useResizeObserverErrorHandler();
  const [isOffline, setIsOffline] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("inter");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [margins, setMargins] = useState(16);
  const [readingProgress, setReadingProgress] = useState(0);
  const [isTocVisible, setIsTocVisible] = useState(false);
  const [tableOfContents, setTableOfContents] = useState([]);

  // State for document content
  const [documentContent, setDocumentContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fileData, setFileData] = useState<Blob | null>(null);
  const [textDocumentPosition, setTextDocumentPosition] = useState<number>(0);
  const [textDocumentLength, setTextDocumentLength] = useState<number>(0);

  // Ref for the EPUB reader component
  const epubReaderRef = useRef(null);

  // Check if document is available offline
  useEffect(() => {
    const checkOfflineStatus = async () => {
      if (!documentId) return;
      const offlineStatus = await isDocumentAvailableOffline(documentId);
      setIsOffline(offlineStatus);
    };

    checkOfflineStatus();
  }, [documentId]);

  // Update reading progress in Supabase when it changes
  useEffect(() => {
    const updateReadingProgress = async () => {
      if (!documentId) return;

      try {
        // Always update progress even if it's 0
        console.log(`Saving reading progress to database: ${readingProgress}%`);

        // Convert to string to ensure it's stored properly
        const progressValue = readingProgress.toString();

        // Update the reading progress in Supabase
        const { data, error } = await supabase
          .from("documents")
          .update({
            reading_progress: {
              progress: progressValue,
              updated_at: new Date().toISOString(),
            },
            last_opened: new Date().toISOString(),
          })
          .eq("id", documentId)
          .select();

        if (error) {
          throw error;
        }

        console.log(
          `Successfully updated reading progress: ${readingProgress}% for document ${documentId}`,
          data,
        );
      } catch (error) {
        console.error("Error updating reading progress:", error);
      }
    };

    // Only update if reading progress has a valid value
    if (readingProgress !== undefined && !isNaN(readingProgress)) {
      // Debounce the update to avoid too many database calls
      const timeoutId = setTimeout(() => {
        updateReadingProgress();
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [documentId, readingProgress]);

  useEffect(() => {
    const fetchDocumentContent = async () => {
      if (!documentId) {
        setDocumentContent("No document selected");
        setIsLoading(false);
        return;
      }

      try {
        // Check if document is available offline
        const isOffline = await isDocumentAvailableOffline(documentId);
        setIsOffline(isOffline); // Update offline status state
        let fileData;
        let fileType;

        if (isOffline) {
          // Get document from offline storage
          const offlineData = await getOfflineDocumentContent(documentId);
          console.log(
            "Retrieved offline content:",
            offlineData ? "Content found" : "No content found",
          );
          fileData = offlineData;
          setFileData(offlineData);

          if (!fileData) {
            // Try to get file type from document title
            const extension = documentTitle.split(".").pop()?.toLowerCase();
            fileType = extension || "txt";

            // Create a fallback message
            const errorBlob = new Blob(
              [
                `Unable to retrieve content for ${documentTitle}. Please try downloading the document again.`,
              ],
              { type: "text/plain" },
            );
            fileData = errorBlob;
            setFileData(errorBlob);
          } else {
            // Get file type from document title
            const extension = documentTitle.split(".").pop()?.toLowerCase();
            fileType = extension || "txt";
          }
        } else {
          try {
            // Get the document record to find the file path
            const { data, error } = await supabase
              .from("documents")
              .select("file_path, file_type")
              .eq("id", documentId)
              .single();

            if (error) throw error;

            // Get download URL from storage
            const { data: onlineFileData, error: downloadError } =
              await supabase.storage.from("documents").download(data.file_path);

            if (downloadError) throw downloadError;

            fileData = onlineFileData;
            setFileData(onlineFileData);
            fileType = data.file_type;
          } catch (supabaseError) {
            console.error("Error fetching from Supabase:", supabaseError);
            // Create a fallback for when Supabase fails
            const errorBlob = new Blob(
              [
                `Unable to fetch document from server. Please check your internet connection and try again.`,
              ],
              { type: "text/plain" },
            );
            fileData = errorBlob;
            setFileData(errorBlob);
            const extension = documentTitle.split(".").pop()?.toLowerCase();
            fileType = extension || "txt";
          }
        }

        // Read the file content based on file type
        let content = "";
        try {
          console.log(`Processing file of type: ${fileType}`);
          if (fileType.toLowerCase() === "txt" || !fileType) {
            content = await fileData.text();
            console.log(`Text content length: ${content.length} characters`);

            // Set text document length for progress calculation
            setTextDocumentLength(content.length);

            // Check if we have a saved position for this document
            const savedPosition = localStorage.getItem(
              `txt-position-${documentId}`,
            );
            if (savedPosition) {
              setTextDocumentPosition(parseInt(savedPosition));

              // Calculate and set initial reading progress
              const progress = Math.min(
                Math.round((parseInt(savedPosition) / content.length) * 100),
                100,
              );
              setReadingProgress(progress);
              console.log(`Restored reading progress: ${progress}%`);
            } else {
              // Force an initial progress calculation after content loads
              setTimeout(() => {
                // Get the main content element
                const contentElements = document.querySelectorAll(".prose");
                if (contentElements.length > 0) {
                  const el = contentElements[0];
                  const scrollPosition = el.scrollTop;
                  const scrollHeight = el.scrollHeight;
                  const clientHeight = el.clientHeight;

                  // Calculate initial progress
                  let scrollPercentage = 0;
                  if (scrollHeight > clientHeight) {
                    scrollPercentage = Math.min(
                      Math.round(
                        (scrollPosition / (scrollHeight - clientHeight)) * 100,
                      ),
                      100,
                    );
                  }

                  // Force a minimum progress of 1 if document is loaded
                  if (scrollPercentage === 0) {
                    scrollPercentage = 1;
                  }

                  console.log(
                    `Initial scroll calculation: ${scrollPercentage}%`,
                  );
                  setReadingProgress(scrollPercentage);
                }
              }, 1000);
            }
          } else if (fileType.toLowerCase() === "pdf") {
            content =
              "PDF content is being processed. This feature is coming soon.";
          } else if (fileType.toLowerCase() === "epub") {
            // For EPUB files, we'll handle them differently with the EpubReader component
            // Just set a placeholder here, the actual rendering is done in the JSX
            content = "EPUB_CONTENT_PLACEHOLDER";
            console.log("EPUB file detected, size:", fileData.size, "bytes");
          } else {
            content = `This document type (${fileType}) is currently being viewed in preview mode.`;
          }

          setDocumentContent(content);
        } catch (readError) {
          console.error("Error reading file content:", readError);
          setDocumentContent(
            `Unable to read document content. Error: ${readError.message}`,
          );
        }
      } catch (error) {
        console.error("Error fetching document:", error);
        // Provide a more specific error message
        if (error instanceof Error) {
          setDocumentContent(`Error loading document: ${error.message}`);
        } else {
          setDocumentContent("Error loading document. Please try again later.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocumentContent();
  }, [documentId, documentTitle]);

  // Fallback content for when no document is loaded
  const fallbackContent = `
    # Document Reader

    No document content to display. Please select a document from your library.
  `;

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-800"}`}
    >
      {/* Top Navigation */}
      <header
        className={`sticky top-0 z-10 ${isDarkMode ? "bg-gray-800" : "bg-white"} border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"} px-4 py-2`}
      >
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="ml-2 font-medium truncate">{documentTitle}</h1>
          </div>

          {/* Display current chapter for EPUBs */}
          {documentContent === "EPUB_CONTENT_PLACEHOLDER" &&
            epubReaderRef.current && (
              <div className="text-sm text-gray-500 hidden md:block max-w-xs truncate">
                {epubReaderRef.current?.getCurrentChapter() || ""}
              </div>
            )}

          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" title="Bookmark">
              <Bookmark className="h-5 w-5" />
            </Button>

            {/* TOC button for EPUB files */}
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

            {isOffline ? (
              <Button variant="ghost" size="icon" title="Available Offline">
                <WifiOff className="h-5 w-5 text-blue-500" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                title="Save for Offline"
                onClick={async () => {
                  try {
                    if (!documentId) return;

                    // Get the document record to find the file path
                    const { data, error } = await supabase
                      .from("documents")
                      .select("file_path, file_type, file_size")
                      .eq("id", documentId)
                      .single();

                    if (error) throw error;

                    // Get download URL from storage
                    const { data: fileData, error: downloadError } =
                      await supabase.storage
                        .from("documents")
                        .download(data.file_path);

                    if (downloadError) throw downloadError;

                    // Save document for offline use
                    await saveDocumentOffline(documentId, fileData, {
                      id: documentId,
                      title: documentTitle,
                      fileType: data.file_type,
                      fileSize: data.file_size,
                      uploadDate: new Date().toISOString(),
                      lastOpened: new Date().toISOString(),
                      isOffline: true,
                      readingProgress: readingProgress,
                    });

                    // Show success message
                    // Update offline status
                    setIsOffline(true);
                    alert("Document saved for offline use");
                  } catch (error) {
                    console.error("Error saving document for offline:", error);
                    alert("Failed to save document for offline use");
                  }
                }}
              >
                <Download className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" title="Share">
              <Share2 className="h-5 w-5" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" title="Settings">
                  <Settings className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <h3 className="font-medium">Reading Settings</h3>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="theme-toggle">Dark Mode</Label>
                      <div className="flex items-center space-x-2">
                        <Sun className="h-4 w-4 text-gray-500" />
                        <Switch
                          id="theme-toggle"
                          checked={isDarkMode}
                          onCheckedChange={setIsDarkMode}
                        />
                        <Moon className="h-4 w-4 text-gray-500" />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Font Size: {fontSize}px</Label>
                    <Slider
                      value={[fontSize]}
                      min={12}
                      max={24}
                      step={1}
                      onValueChange={(value) => setFontSize(value[0])}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Font Family</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inter">Inter</SelectItem>
                        <SelectItem value="georgia">Georgia</SelectItem>
                        <SelectItem value="times">Times New Roman</SelectItem>
                        <SelectItem value="courier">Courier New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Line Spacing: {lineSpacing}x</Label>
                    <Slider
                      value={[lineSpacing * 10]}
                      min={10}
                      max={30}
                      step={1}
                      onValueChange={(value) => setLineSpacing(value[0] / 10)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Margins: {margins}px</Label>
                    <Slider
                      value={[margins]}
                      min={0}
                      max={64}
                      step={4}
                      onValueChange={(value) => setMargins(value[0])}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Document Content */}
      <main className="container mx-auto py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-500">Loading document...</p>
          </div>
        ) : documentContent === "EPUB_CONTENT_PLACEHOLDER" && fileData ? (
          <div
            className="mx-auto"
            style={{
              padding: `0 ${margins}px`,
              maxWidth: `calc(100% - ${margins * 2}px)`,
              height: "calc(100vh - 200px)",
              backgroundColor: isDarkMode ? "#1a1a1a" : "#ffffff",
              contain: "layout size", // Improve performance and prevent layout thrashing
            }}
          >
            <EpubReader
              ref={epubReaderRef}
              url={fileData}
              fontFamily={fontFamily}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              isDarkMode={isDarkMode}
              onProgressChange={(progress) => {
                console.log(`Progress from EPUB reader: ${progress}%`);
                setReadingProgress(progress);
              }}
            />
          </div>
        ) : (
          <div
            className={`mx-auto prose ${isDarkMode ? "prose-invert" : ""} max-w-none`}
            style={{
              fontFamily:
                fontFamily === "inter"
                  ? "Inter, sans-serif"
                  : fontFamily === "georgia"
                    ? "Georgia, serif"
                    : fontFamily === "times"
                      ? '"Times New Roman", Times, serif'
                      : '"Courier New", Courier, monospace',
              fontSize: `${fontSize}px`,
              lineHeight: lineSpacing,
              padding: `0 ${margins}px`,
              maxWidth: `calc(100% - ${margins * 2}px)`,
            }}
            ref={(el) => {
              // Set up scroll event listener when element is mounted
              if (
                el &&
                documentContent &&
                documentContent !== fallbackContent &&
                documentContent !== "EPUB_CONTENT_PLACEHOLDER"
              ) {
                // Add scroll event listener
                const handleScroll = () => {
                  const scrollPosition = el.scrollTop;
                  const scrollHeight = el.scrollHeight;
                  const clientHeight = el.clientHeight;

                  // Calculate how far through the document we've scrolled
                  let scrollPercentage = 0;
                  if (scrollHeight > clientHeight) {
                    scrollPercentage = Math.min(
                      Math.round(
                        (scrollPosition / (scrollHeight - clientHeight)) * 100,
                      ),
                      100,
                    );
                  }

                  // Force a minimum progress of 1 if any scrolling has happened
                  if (scrollPosition > 0 && scrollPercentage === 0) {
                    scrollPercentage = 1;
                  }

                  console.log(
                    `Scroll position: ${scrollPosition}/${scrollHeight}, Progress: ${scrollPercentage}%`,
                  );

                  // Update reading progress
                  setReadingProgress(scrollPercentage);

                  // Store the current position
                  if (documentId) {
                    // Calculate approximate character position based on scroll percentage
                    const approxPosition = Math.round(
                      (scrollPercentage / 100) * textDocumentLength,
                    );
                    setTextDocumentPosition(approxPosition);
                    localStorage.setItem(
                      `txt-position-${documentId}`,
                      approxPosition.toString(),
                    );
                  }
                };

                // Initial calculation when content loads
                setTimeout(handleScroll, 500);

                // Add event listener
                el.addEventListener("scroll", handleScroll);

                // Clean up function will be called when component unmounts
                return () => {
                  el.removeEventListener("scroll", handleScroll);
                };
              }
            }}
          >
            {/* Actual document content */}
            <div
              dangerouslySetInnerHTML={{
                __html: (documentContent || fallbackContent)
                  .split("\n")
                  .map((line) => {
                    if (line.startsWith("# ")) {
                      return `<h1>${line.substring(2)}</h1>`;
                    } else if (line.startsWith("## ")) {
                      return `<h2>${line.substring(3)}</h2>`;
                    } else if (line.trim() === "") {
                      return "<p>&nbsp;</p>";
                    } else {
                      return `<p>${line}</p>`;
                    }
                  })
                  .join(""),
              }}
            />

            {/* Reading progress indicator for text documents */}
            {documentContent &&
              documentContent !== fallbackContent &&
              documentContent !== "EPUB_CONTENT_PLACEHOLDER" && (
                <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 shadow-md rounded-lg p-2 text-sm">
                  <div className="w-32 h-1.5 bg-gray-200 rounded-full mb-1">
                    <div
                      className="h-1.5 bg-blue-500 rounded-full"
                      style={{ width: `${readingProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    {isNaN(readingProgress) ? 0 : readingProgress}% read
                  </div>
                </div>
              )}
          </div>
        )}
      </main>
    </div>
  );
}
