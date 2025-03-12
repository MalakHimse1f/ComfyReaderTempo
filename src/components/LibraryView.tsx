import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookPreProcessingService,
  ProcessingStatus,
} from "../services/bookPreProcessingService";
import { Book } from "./BookViewer";
import "./LibraryView.css";

interface LibraryViewProps {
  books: Book[];
  onUpdateBook?: (updatedBook: Book) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  onUpdateBook,
}) => {
  const navigate = useNavigate();
  const [processingStatuses, setProcessingStatuses] = useState<
    Record<string, ProcessingStatus>
  >({});
  const [processingStats, setProcessingStats] =
    useState<ReturnType<typeof BookPreProcessingService.getProcessingStats>>();

  // Load books from storage and check processing status
  useEffect(() => {
    // Initialize statuses
    const initialStatuses: Record<string, ProcessingStatus> = {};

    books.forEach((book) => {
      initialStatuses[book.id] = BookPreProcessingService.getProcessingStatus(
        book.id
      );
    });

    setProcessingStatuses(initialStatuses);

    // Set processing stats
    setProcessingStats(BookPreProcessingService.getProcessingStats());

    // Poll for updates
    const interval = setInterval(() => {
      const updatedStatuses: Record<string, ProcessingStatus> = {};

      books.forEach((book) => {
        updatedStatuses[book.id] = BookPreProcessingService.getProcessingStatus(
          book.id
        );
      });

      setProcessingStatuses(updatedStatuses);
      setProcessingStats(BookPreProcessingService.getProcessingStats());
    }, 1000);

    return () => clearInterval(interval);
  }, [books]);

  // Open a book
  const openBook = (book: Book) => {
    navigate(`/reader/${book.id}`);
  };

  // Process a book that hasn't been processed yet
  const processBook = async (book: Book) => {
    try {
      // Fetch the book file
      const response = await fetch(book.filePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch book file: ${response.status}`);
      }

      const blob = await response.blob();
      const file = new File([blob], book.title, {
        type: "application/epub+zip",
      });

      // Process the book
      const processedBookId = await BookPreProcessingService.processBook(
        book.id,
        file
      );

      // Update book info with processed ID
      if (onUpdateBook) {
        onUpdateBook({
          ...book,
          processedBookId,
        });
      }
    } catch (error) {
      console.error(`Error processing book ${book.id}:`, error);
      // You could show a toast or notification here
    }
  };

  // Retry processing a book that failed
  const retryProcessing = (book: Book) => {
    const status = processingStatuses[book.id];

    if (status && status.error) {
      BookPreProcessingService.resetFailedProcessing(book.id);
      processBook(book);
    }
  };

  // Format book size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="library-view">
      <div className="library-header">
        <h1>My Library</h1>

        {processingStats && processingStats.inProgress > 0 && (
          <div className="processing-stats">
            <span>{processingStats.inProgress} book(s) processing</span>
          </div>
        )}
      </div>

      {books.length === 0 ? (
        <div className="empty-library">
          <p>Your library is empty. Add some books to get started!</p>
        </div>
      ) : (
        <div className="book-grid">
          {books.map((book) => (
            <div className="book-card" key={book.id}>
              <div
                className="book-cover"
                style={{
                  backgroundImage: book.coverUrl
                    ? `url(${book.coverUrl})`
                    : "none",
                }}
                onClick={() => openBook(book)}
              >
                {!book.coverUrl && (
                  <div className="book-cover-placeholder">
                    {book.title.substring(0, 1)}
                  </div>
                )}

                {/* Show processing indicator */}
                {processingStatuses[book.id]?.isProcessing && (
                  <div className="processing-overlay">
                    <div className="processing-indicator">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${processingStatuses[book.id].progress}%`,
                          }}
                        ></div>
                      </div>
                      <span className="progress-text">
                        {processingStatuses[book.id].progress}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Show processed indicator */}
                {(processingStatuses[book.id]?.isProcessed ||
                  book.processedBookId) && (
                  <div
                    className="processed-badge"
                    title="Optimized for reading"
                  >
                    ✓
                  </div>
                )}

                {/* Show error indicator */}
                {processingStatuses[book.id]?.error && (
                  <div className="error-badge" title="Processing failed">
                    !
                  </div>
                )}
              </div>

              <div className="book-info">
                <h3 className="book-title" onClick={() => openBook(book)}>
                  {book.title}
                </h3>
                <p className="book-author">{book.author}</p>
                <div className="book-meta">
                  <span className="book-size">
                    {formatFileSize(book.fileSize)}
                  </span>
                  <span className="book-date">
                    {formatDate(book.dateAdded)}
                  </span>
                </div>
              </div>

              <div className="book-actions">
                <button
                  className="action-button read-button"
                  onClick={() => openBook(book)}
                >
                  Read
                </button>

                {!book.processedBookId &&
                  !processingStatuses[book.id]?.isProcessing && (
                    <button
                      className="action-button process-button"
                      onClick={() => processBook(book)}
                    >
                      Optimize
                    </button>
                  )}

                {processingStatuses[book.id]?.error && (
                  <button
                    className="action-button retry-button"
                    onClick={() => retryProcessing(book)}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LibraryView;
