import React, { useEffect, useState } from "react";
import { BasicEpubReader } from "./BasicEpubReader"; // The current reader
import { HtmlBookReader } from "./HtmlBookReader"; // Our new HTML-based reader
import {
  BookPreProcessingService,
  ProcessingStatus,
} from "../services/bookPreProcessingService";
import "./BookViewer.css";

export interface Book {
  id: string;
  title: string;
  author: string;
  filePath: string;
  processedBookId?: string;
  dateAdded: string;
  coverUrl?: string;
  fileSize: number;
}

interface BookViewerProps {
  book: Book;
  onUpdateBook?: (updatedBook: Book) => void;
  onReadingProgress?: (progress: number) => void;
}

export const BookViewer: React.FC<BookViewerProps> = ({
  book,
  onUpdateBook,
  onReadingProgress,
}) => {
  // State for tracking processing status
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(
    BookPreProcessingService.getProcessingStatus(book.id)
  );

  // State for any errors that might occur
  const [error, setError] = useState<string | null>(null);

  // Effect to check if the book needs processing and handle status updates
  useEffect(() => {
    // Check if the book needs processing (not yet processed and not currently processing)
    if (
      processingStatus.status !== "processed" &&
      processingStatus.status !== "processing" &&
      !book.processedBookId
    ) {
      // Start processing if it's an EPUB
      if (book.filePath.endsWith(".epub") || book.filePath.includes("epub")) {
        setError(null);

        // Fetch the file and process it
        fetch(book.filePath)
          .then((response) => {
            if (!response.ok) {
              throw new Error(
                `Failed to fetch book file: ${response.status} ${response.statusText}`
              );
            }
            return response.blob();
          })
          .then(
            (blob) =>
              new File([blob], book.title, { type: "application/epub+zip" })
          )
          .then((file) => {
            // Process the book
            return BookPreProcessingService.processBook(book.id, file);
          })
          .then((processedBookId) => {
            // Update the book in the library with the processed ID
            if (onUpdateBook) {
              onUpdateBook({
                ...book,
                processedBookId,
              });
            }
          })
          .catch((error) => {
            console.error("Error processing book:", error);
            setError(
              `Failed to process book: ${error.message || "Unknown error"}`
            );
          });
      }
    }

    // Set up a polling mechanism to check processing status
    const interval = setInterval(() => {
      const status = BookPreProcessingService.getProcessingStatus(book.id);
      setProcessingStatus(status);
    }, 500);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [
    book.id,
    book.filePath,
    book.processedBookId,
    book.title,
    onUpdateBook,
    processingStatus.status,
  ]);

  // Handle retry button click
  const handleRetry = () => {
    setError(null);
    BookPreProcessingService.resetFailedProcessing(book.id);

    // The useEffect will pick up the reset status and try again
  };

  // Show error message if there's an error
  if (error) {
    return (
      <div className="book-error-container">
        <h3>Error Loading Book</h3>
        <p>{error}</p>
        <button onClick={handleRetry} className="retry-button">
          Retry
        </button>
        {/* Only show fallback for non-EPUB files */}
        {!book.filePath.endsWith(".epub") &&
          !book.filePath.includes("epub") && (
            <button
              onClick={() => {
                // Fall back to basic reader for non-EPUB files only
                setError(null);
              }}
              className="fallback-button"
            >
              Open with Basic Reader
            </button>
          )}
      </div>
    );
  }

  // Show processing indicator if the book is being processed
  if (processingStatus.status === "processing") {
    return (
      <div className="processing-indicator">
        <h3>Optimizing "{book.title}" for Reading</h3>
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${processingStatus.progress || 0}%` }}
            ></div>
          </div>
          <div className="progress-text">
            {Math.round(processingStatus.progress || 0)}% complete
          </div>
        </div>
        <p className="processing-info">
          We're preparing this book for an optimal reading experience. This
          happens only once and will make future reading sessions faster.
        </p>
        <p className="processing-warning">
          Please do not navigate away from this page until processing is
          complete.
        </p>
      </div>
    );
  }

  // Use the HTML reader if the book has been processed
  if (
    (processingStatus.status === "processed" || book.processedBookId) &&
    book.processedBookId
  ) {
    return (
      <HtmlBookReader
        bookId={book.processedBookId}
        onProgressUpdate={onReadingProgress}
      />
    );
  }

  // If it's an EPUB that should be processed but hasn't been yet, show a message
  if (book.filePath.endsWith(".epub") || book.filePath.includes("epub")) {
    return (
      <div className="processing-required">
        <h3>This book needs to be optimized first</h3>
        <p>
          This EPUB needs to be processed before reading for the best
          experience.
        </p>
        <button
          onClick={() => {
            // Start processing manually
            fetch(book.filePath)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(`Failed to fetch book: ${response.status}`);
                }
                return response.blob();
              })
              .then(
                (blob) =>
                  new File([blob], book.title, { type: "application/epub+zip" })
              )
              .then((file) =>
                BookPreProcessingService.processBook(book.id, file)
              )
              .then((processedBookId) => {
                if (onUpdateBook) {
                  onUpdateBook({
                    ...book,
                    processedBookId,
                  });
                }
              })
              .catch((err) => {
                console.error("Error processing book:", err);
                setError(`Failed to process book: ${err.message}`);
              });
          }}
          className="process-button"
        >
          Optimize Now
        </button>
        <p className="processing-note">
          Processing may take a few moments depending on the size of the book.
        </p>
      </div>
    );
  }

  // Fall back to the basic reader only for non-EPUB files
  return (
    <div className="basic-reader-container">
      <div className="basic-reader-notice">
        <p>Using basic reader for this non-EPUB document</p>
      </div>
      <BasicEpubReader
        bookPath={book.filePath}
        onProgressUpdate={onReadingProgress}
      />
    </div>
  );
};

export default BookViewer;
