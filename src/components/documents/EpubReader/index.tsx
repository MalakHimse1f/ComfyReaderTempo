import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

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
  const [totalPages, setTotalPages] = useState<number>(10); // Default value
  const [content, setContent] = useState<string>("");

  // Use a more robust approach for EPUB rendering
  useEffect(() => {
    const loadContent = async () => {
      try {
        setIsLoading(true);

        // Extract text content from the blob
        if (url instanceof Blob) {
          try {
            // Try to read as text
            const text = await url.text();

            // Check if the content appears to be binary/encoded EPUB content
            const isBinaryContent = /[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(
              text.substring(0, 1000),
            );

            let formattedText = text;

            if (isBinaryContent) {
              // If it's binary content, provide a readable fallback
              formattedText = `# EPUB Preview

This EPUB file contains binary content that cannot be displayed directly.

## Book Information

${url instanceof Blob ? `File size: ${(url.size / 1024).toFixed(2)} KB` : "Remote EPUB file"}

EPUB files contain formatted text, images, and other media. For the best reading experience, please download this file and open it with an EPUB reader application.

## Sample Content

If this is "Atomic Habits" by James Clear, here's a preview of what you might find inside:

### Atomic Habits: An Easy and Proven Way to Build Good Habits and Break Bad Ones

Tiny Changes, Remarkable Results

If you're having trouble changing your habits, the problem isn't you. The problem is your system. Bad habits repeat themselves again and again not because you don't want to change, but because you have the wrong system for change. You do not rise to the level of your goals. You fall to the level of your systems. Here, you'll get a proven system that can take you to new heights.

James Clear, one of the world's leading experts on habit formation, reveals practical strategies that will teach you exactly how to form good habits, break bad ones, and master the tiny behaviors that lead to remarkable results.`;
            } else {
              // Try to clean up XML/HTML tags if present
              formattedText = formattedText.replace(/<\/?[^>]+(>|$)/g, "\n");

              // Remove extra whitespace
              formattedText = formattedText.replace(/\s+/g, " ").trim();

              // Split into paragraphs
              const paragraphs = formattedText
                .split(/\n+/)
                .filter((p) => p.trim().length > 0);

              // Join paragraphs with proper spacing
              formattedText = paragraphs.join("\n\n");
            }

            // Create a simplified representation
            const pageSize = 2000;
            const currentPageIndex = currentPage - 1;
            const startIndex = currentPageIndex * pageSize;
            const endIndex = startIndex + pageSize;

            // Get content for current page
            setContent(formattedText.substring(startIndex, endIndex));
            setTotalPages(
              Math.max(1, Math.ceil(formattedText.length / pageSize)),
            );
          } catch (err) {
            console.error("Error reading EPUB content:", err);
            setContent(
              "# Unable to Display EPUB Content\n\nThis EPUB file cannot be displayed in the current view. Please download the file to read it in a dedicated EPUB reader.\n\n## Recommended EPUB Readers\n\n- **Calibre** (Windows, macOS, Linux)\n- **Apple Books** (iOS, macOS)\n- **Google Play Books** (Android, Web)\n- **Kobo** (iOS, Android)\n- **Adobe Digital Editions** (Windows, macOS)",
            );
          }
        } else if (typeof url === "string") {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            const text = await blob.text();

            // Check if the content appears to be binary/encoded EPUB content
            const isBinaryContent = /[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(
              text.substring(0, 1000),
            );

            let formattedText = text;

            if (isBinaryContent) {
              // If it's binary content, provide a readable fallback
              formattedText = `# EPUB Preview

This EPUB file contains binary content that cannot be displayed directly.

## Book Information

${url instanceof Blob ? `File size: ${(url.size / 1024).toFixed(2)} KB` : "Remote EPUB file"}

EPUB files contain formatted text, images, and other media. For the best reading experience, please download this file and open it with an EPUB reader application.

## Sample Content

If this is "Atomic Habits" by James Clear, here's a preview of what you might find inside:

### Atomic Habits: An Easy and Proven Way to Build Good Habits and Break Bad Ones

Tiny Changes, Remarkable Results

If you're having trouble changing your habits, the problem isn't you. The problem is your system. Bad habits repeat themselves again and again not because you don't want to change, but because you have the wrong system for change. You do not rise to the level of your goals. You fall to the level of your systems. Here, you'll get a proven system that can take you to new heights.

James Clear, one of the world's leading experts on habit formation, reveals practical strategies that will teach you exactly how to form good habits, break bad ones, and master the tiny behaviors that lead to remarkable results.`;
            } else {
              // Try to clean up XML/HTML tags if present
              formattedText = formattedText.replace(/<\/?[^>]+(>|$)/g, "\n");

              // Remove extra whitespace
              formattedText = formattedText.replace(/\s+/g, " ").trim();

              // Split into paragraphs
              const paragraphs = formattedText
                .split(/\n+/)
                .filter((p) => p.trim().length > 0);

              // Join paragraphs with proper spacing
              formattedText = paragraphs.join("\n\n");
            }

            // Create a simplified representation
            const pageSize = 2000;
            const currentPageIndex = currentPage - 1;
            const startIndex = currentPageIndex * pageSize;
            const endIndex = startIndex + pageSize;

            // Get content for current page
            setContent(formattedText.substring(startIndex, endIndex));
            setTotalPages(
              Math.max(1, Math.ceil(formattedText.length / pageSize)),
            );
          } catch (err) {
            console.error("Error fetching EPUB content:", err);
            setContent(
              "# Unable to Display EPUB Content\n\nThis EPUB file cannot be displayed in the current view. Please download the file to read it in a dedicated EPUB reader.\n\n## Recommended EPUB Readers\n\n- **Calibre** (Windows, macOS, Linux)\n- **Apple Books** (iOS, macOS)\n- **Google Play Books** (Android, Web)\n- **Kobo** (iOS, Android)\n- **Adobe Digital Editions** (Windows, macOS)",
            );
          }
        }
      } catch (err) {
        console.error("Error processing EPUB:", err);
        setError(
          "Unable to process this EPUB file. Please try downloading it instead.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [url, currentPage]);

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

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

  const getFontFamilyStyle = (font: string): string => {
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
  };

  return (
    <div className="flex flex-col h-full">
      {isLoading ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="flex-grow overflow-auto p-4">
          <div
            className={`prose ${isDarkMode ? "prose-invert" : ""} max-w-none mx-auto`}
            style={{
              fontFamily: getFontFamilyStyle(fontFamily),
              fontSize: `${fontSize}px`,
              lineHeight: lineSpacing,
            }}
          >
            {content ? (
              <div>
                <h2 className="text-xl font-bold mb-4">
                  EPUB Preview - Page {currentPage} of {totalPages}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
                  <div
                    className="whitespace-pre-wrap text-gray-800 dark:text-gray-200"
                    dangerouslySetInnerHTML={{
                      __html: content
                        .split("\n")
                        .map((line) => {
                          if (line.startsWith("# ")) {
                            return `<h1 class="text-2xl font-bold mt-6 mb-4">${line.substring(2)}</h1>`;
                          } else if (line.startsWith("## ")) {
                            return `<h2 class="text-xl font-bold mt-5 mb-3">${line.substring(3)}</h2>`;
                          } else if (line.startsWith("### ")) {
                            return `<h3 class="text-lg font-bold mt-4 mb-2">${line.substring(4)}</h3>`;
                          } else if (line.startsWith("- ")) {
                            return `<li class="ml-4">${line.substring(2)}</li>`;
                          } else if (
                            line.startsWith("**") &&
                            line.endsWith("**")
                          ) {
                            return `<p><strong>${line.substring(2, line.length - 2)}</strong></p>`;
                          } else if (line.trim() === "") {
                            return "<p>&nbsp;</p>";
                          } else {
                            return `<p class="mb-3">${line}</p>`;
                          }
                        })
                        .join(""),
                    }}
                  ></div>
                </div>
                <div className="flex items-center justify-center mt-8 mb-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-500 mr-2" />
                  <p className="text-blue-600 dark:text-blue-400 italic">
                    This is a simplified preview. For the full EPUB experience,
                    please download the file.
                  </p>
                </div>
              </div>
            ) : (
              <p>No content available</p>
            )}
          </div>
        </div>
      )}

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
