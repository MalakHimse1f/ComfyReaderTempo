import React, { useEffect, useState, useRef } from "react";
import { ProcessedBookStorage } from "../services/epub-processor/storageService";
import "./HtmlBookReader.css";

interface HtmlBookReaderProps {
  bookId: string;
  onProgressUpdate?: (progress: number) => void;
  initialLocation?: string;
  onError?: (error: Error) => void;
}

interface Chapter {
  id: string;
  title: string;
  href: string;
  content?: string;
}

interface TocItem {
  id: string;
  title: string;
  href: string;
  level: number;
}

interface BookData {
  book: {
    metadata: {
      title: string;
      creator: string[];
      language: string;
      [key: string]: any;
    };
    chapters: Chapter[];
    toc: TocItem[];
  };
  css: string;
  indexFile: string;
}

export const HtmlBookReader: React.FC<HtmlBookReaderProps> = ({
  bookId,
  onProgressUpdate,
  initialLocation,
  onError,
}) => {
  // Component state
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [currentChapter, setCurrentChapter] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tocVisible, setTocVisible] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(16);
  const [theme, setTheme] = useState<"light" | "dark" | "sepia">("light");

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const storage = useRef(new ProcessedBookStorage()).current;

  // Load the book metadata when the component mounts
  useEffect(() => {
    async function loadBook() {
      if (!bookId) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await storage.getProcessedBook(bookId);

        // Ensure we have chapters and toc with the right shape
        const safeChapters: Chapter[] = [];
        if (Array.isArray(data.book.chapters)) {
          data.book.chapters.forEach((ch: any) => {
            if (ch && typeof ch === "object") {
              safeChapters.push({
                id:
                  ch.id ||
                  `chapter-${Math.random().toString(36).substring(2, 11)}`,
                title: ch.title || "Untitled Chapter",
                href: ch.href || "#",
              });
            }
          });
        }

        const safeToc: TocItem[] = [];
        if (Array.isArray(data.book.toc)) {
          data.book.toc.forEach((item: any) => {
            if (item && typeof item === "object") {
              safeToc.push({
                id:
                  item.id ||
                  `toc-${Math.random().toString(36).substring(2, 11)}`,
                title: item.title || "Untitled Section",
                href: item.href || "#",
                level: typeof item.level === "number" ? item.level : 1,
              });
            }
          });
        }

        // Create a properly typed BookData object
        const validatedData: BookData = {
          book: {
            metadata: {
              title: data.book.metadata?.title || "Untitled Book",
              creator: data.book.metadata?.creator || ["Unknown Author"],
              language: data.book.metadata?.language || "en",
              ...(data.book.metadata || {}),
            },
            chapters: safeChapters,
            toc: safeToc,
          },
          css: data.css || "",
          indexFile: data.indexFile || "",
        };

        setBookData(validatedData);

        // If initial location is provided, try to set the current chapter based on it
        if (initialLocation && validatedData.book.chapters.length > 0) {
          // Try to find a chapter that matches the initialLocation
          const chapter = validatedData.book.chapters.find(
            (ch) => ch.href === initialLocation || ch.id === initialLocation
          );

          if (chapter) {
            setCurrentChapter(chapter.id);
          } else {
            // If no matching chapter, use the first one
            setCurrentChapter(validatedData.book.chapters[0].id);
          }
        }
        // If no initial location or no match found, use the first chapter
        else if (validatedData.book.chapters.length > 0) {
          setCurrentChapter(validatedData.book.chapters[0].id);
        }

        setIsLoading(false);
      } catch (error) {
        const errorMessage = `Failed to load book: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;

        setError(errorMessage);
        setIsLoading(false);
        console.error("Error loading book:", error);

        // Call onError callback if provided
        if (onError && error instanceof Error) {
          onError(error);
        } else if (onError) {
          onError(new Error(errorMessage));
        }
      }
    }

    loadBook();
  }, [bookId, initialLocation, onError, storage]);

  // Load chapter content when the current chapter changes
  useEffect(() => {
    if (!bookData || !currentChapter) return;

    async function loadChapter() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await storage.getChapter(bookId, currentChapter);
        setChapterContent(content || "");
        setIsLoading(false);

        // Scroll to top when changing chapters
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      } catch (error) {
        const errorMessage = `Failed to load chapter: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;

        setError(errorMessage);
        setIsLoading(false);
        console.error("Error loading chapter:", error);

        // Call onError callback if provided
        if (onError && error instanceof Error) {
          onError(error);
        } else if (onError) {
          onError(new Error(errorMessage));
        }
      }
    }

    loadChapter();
  }, [bookId, currentChapter, bookData, onError, storage]);

  // Calculate and update reading progress
  useEffect(() => {
    if (!bookData || !currentChapter) return;

    const chapterIndex = bookData.book.chapters.findIndex(
      (ch) => ch.id === currentChapter
    );

    if (chapterIndex >= 0 && onProgressUpdate) {
      const progress = chapterIndex / bookData.book.chapters.length;
      onProgressUpdate(progress);
    }
  }, [currentChapter, bookData, onProgressUpdate]);

  // Navigate to the next chapter
  const goToNextChapter = () => {
    if (!bookData || !currentChapter) return;

    const chapterIndex = bookData.book.chapters.findIndex(
      (ch) => ch.id === currentChapter
    );

    if (chapterIndex < bookData.book.chapters.length - 1) {
      setCurrentChapter(bookData.book.chapters[chapterIndex + 1].id);
    }
  };

  // Navigate to the previous chapter
  const goToPreviousChapter = () => {
    if (!bookData || !currentChapter) return;

    const chapterIndex = bookData.book.chapters.findIndex(
      (ch) => ch.id === currentChapter
    );

    if (chapterIndex > 0) {
      setCurrentChapter(bookData.book.chapters[chapterIndex - 1].id);
    }
  };

  // Handle font size changes
  const changeFontSize = (delta: number) => {
    setFontSize((prev) => {
      const newSize = prev + delta;
      // Limit font size between 12px and 24px
      return Math.min(Math.max(newSize, 12), 24);
    });
  };

  // Toggle between themes
  const toggleTheme = () => {
    setTheme((current) => {
      switch (current) {
        case "light":
          return "dark";
        case "dark":
          return "sepia";
        case "sepia":
          return "light";
        default:
          return "light";
      }
    });
  };

  // Toggle table of contents visibility
  const toggleToc = () => {
    setTocVisible((prev) => !prev);
  };

  // Handle loading or error states
  if (isLoading && !bookData) {
    return (
      <div className="html-book-reader-loading">
        <div className="spinner"></div>
        <p>Loading book...</p>
      </div>
    );
  }

  if (error && !bookData) {
    return (
      <div className="html-book-reader-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!bookData) {
    return (
      <div className="html-book-reader-error">
        <h3>Error</h3>
        <p>No book data available.</p>
      </div>
    );
  }

  // Get current chapter title
  const currentChapterTitle = currentChapter
    ? bookData.book.chapters.find((ch) => ch.id === currentChapter)?.title ||
      "Unknown Chapter"
    : "";

  return (
    <div className={`html-book-reader theme-${theme}`}>
      {/* Reader Header */}
      <div className="reader-header">
        <div className="reader-title">
          <h1>{bookData.book.metadata.title}</h1>
          <h2>{currentChapterTitle}</h2>
        </div>

        <div className="reader-controls">
          <button
            onClick={toggleToc}
            className="control-button"
            title="Table of Contents"
          >
            <span className="control-icon">≡</span>
          </button>

          <button
            onClick={() => changeFontSize(-1)}
            className="control-button"
            title="Decrease Font Size"
            disabled={fontSize <= 12}
          >
            <span className="control-icon">A-</span>
          </button>

          <button
            onClick={() => changeFontSize(1)}
            className="control-button"
            title="Increase Font Size"
            disabled={fontSize >= 24}
          >
            <span className="control-icon">A+</span>
          </button>

          <button
            onClick={toggleTheme}
            className="control-button"
            title="Change Theme"
          >
            <span className="control-icon">
              {theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "🍂"}
            </span>
          </button>
        </div>
      </div>

      {/* Book Content */}
      <div className="reader-layout">
        {/* Table of Contents (conditionally visible) */}
        {tocVisible && (
          <div className="table-of-contents">
            <h3>Table of Contents</h3>
            <ul>
              {bookData.book.toc.map((item) => (
                <li
                  key={item.id}
                  className={`toc-level-${item.level} ${
                    currentChapter === item.id ? "active" : ""
                  }`}
                >
                  <button onClick={() => setCurrentChapter(item.id)}>
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Book Content Area */}
        <div
          ref={contentRef}
          className="reader-content"
          style={{ fontSize: `${fontSize}px` }}
        >
          {/* Apply the book's CSS */}
          <style dangerouslySetInnerHTML={{ __html: bookData.css }} />

          {/* Chapter loading indicator */}
          {isLoading && (
            <div className="chapter-loading">
              <div className="spinner"></div>
            </div>
          )}

          {/* Chapter error message */}
          {error && (
            <div className="chapter-error">
              <p>{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  // Retry loading current chapter
                  const tempChapter = currentChapter;
                  setCurrentChapter(null);
                  setTimeout(() => setCurrentChapter(tempChapter), 10);
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Render the chapter content */}
          <div
            className="chapter-content"
            dangerouslySetInnerHTML={{ __html: chapterContent }}
          />
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="reader-navigation">
        <button
          onClick={goToPreviousChapter}
          disabled={
            !currentChapter ||
            bookData.book.chapters.findIndex(
              (ch) => ch.id === currentChapter
            ) === 0
          }
          className="nav-button prev-button"
        >
          <span className="nav-icon">←</span> Previous Chapter
        </button>

        <div className="chapter-info">
          Chapter{" "}
          {bookData.book.chapters.findIndex((ch) => ch.id === currentChapter) +
            1}{" "}
          of {bookData.book.chapters.length}
        </div>

        <button
          onClick={goToNextChapter}
          disabled={
            !currentChapter ||
            bookData.book.chapters.findIndex(
              (ch) => ch.id === currentChapter
            ) ===
              bookData.book.chapters.length - 1
          }
          className="nav-button next-button"
        >
          Next Chapter <span className="nav-icon">→</span>
        </button>
      </div>
    </div>
  );
};

export default HtmlBookReader;
