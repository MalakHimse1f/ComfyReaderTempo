import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookPreProcessingService,
  ProcessingStatus,
} from "../services/bookPreProcessingService";
import { Book } from "./BookViewer";
import "./LibraryView.css";
import { syncBookToCloud } from "../services/epub-processor";

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Load books from storage and check processing status
  useEffect(() => {
    let mounted = true;

    // Initial load function that checks both local and cloud storage
    const loadStatuses = async () => {
      // Initialize statuses
      const initialStatuses: Record<string, ProcessingStatus> = {};

      // Process books sequentially to avoid too many concurrent requests
      for (const book of books) {
        if (!mounted) return; // Stop if component unmounted

        try {
          // Use the cloud-aware status check
          const status =
            await BookPreProcessingService.getProcessingStatusWithCloud(
              book.id
            );
          initialStatuses[book.id] = status;

          // If we found it in the cloud but not locally, trigger a force sync
          if (status.status !== "processed" && status.inCloud) {
            console.log(
              `[CLOUD] Book ${book.id} found in cloud but not locally, triggering sync`
            );
            // Force sync from cloud to local to ensure we have the book data locally
            await syncBookToCloud(book.id).catch((err) =>
              console.error(`Error syncing book ${book.id} from cloud:`, err)
            );

            // Update the book in the library with the processed ID if we have an update callback
            if (onUpdateBook && book.processedBookId !== book.id) {
              console.log(
                `[CLOUD] Updating book ${book.id} with processed ID ${book.id}`
              );
              onUpdateBook({
                ...book,
                processedBookId: book.id,
              });
            }
          }
        } catch (error) {
          console.error(
            `Error checking processing status for book ${book.id}:`,
            error
          );
          initialStatuses[book.id] =
            BookPreProcessingService.getProcessingStatus(book.id);
        }
      }

      if (mounted) {
        setProcessingStatuses(initialStatuses);
        // Set processing stats
        setProcessingStats(BookPreProcessingService.getProcessingStats());
      }
    };

    // Start initial load
    loadStatuses();

    // Set up polling with the regular checks (no need for cloud check on every poll)
    const interval = setInterval(() => {
      if (!mounted) return;

      const updatedStatuses: Record<string, ProcessingStatus> = {};

      books.forEach((book) => {
        updatedStatuses[book.id] = BookPreProcessingService.getProcessingStatus(
          book.id
        );
      });

      setProcessingStatuses(updatedStatuses);
      setProcessingStats(BookPreProcessingService.getProcessingStats());
    }, 1000);

    // Cleanup
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [books, onUpdateBook]);

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

  // Force sync all books to cloud
  const handleForceSyncToCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncMessage("Syncing processed books to cloud...");

      // Sync all processed books
      await syncBookToCloud();

      setSyncMessage("Sync completed successfully!");

      // Clear the message after a few seconds
      setTimeout(() => {
        setSyncMessage(null);
      }, 3000);
    } catch (error) {
      console.error("Error syncing books to cloud:", error);
      setSyncMessage(`Sync error: ${(error as Error).message}`);

      // Clear error message after a longer timeout
      setTimeout(() => {
        setSyncMessage(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Force sync a specific book
  const handleForceSyncBook = async (book: Book) => {
    if (!book.id) return;

    try {
      setIsSyncing(true);
      setSyncMessage(`Syncing "${book.title}" to cloud...`);

      // Sync specific book
      await syncBookToCloud(book.id);

      setSyncMessage(`"${book.title}" synced successfully!`);

      // Clear the message after a few seconds
      setTimeout(() => {
        setSyncMessage(null);
      }, 3000);
    } catch (error) {
      console.error(`Error syncing book ${book.id} to cloud:`, error);
      setSyncMessage(`Sync error: ${(error as Error).message}`);

      // Clear error message after a longer timeout
      setTimeout(() => {
        setSyncMessage(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="library-view">
      <div className="library-header">
        <h1>My Library</h1>

        <div className="library-actions">
          {/* Sync button for all books */}
          <button
            className="action-button sync-button"
            onClick={handleForceSyncToCloud}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing..." : "Force Sync to Cloud"}
          </button>

          {processingStats && processingStats.inProgress > 0 && (
            <div className="processing-stats">
              <span>{processingStats.inProgress} book(s) processing</span>
            </div>
          )}
        </div>

        {/* Sync status message */}
        {syncMessage && <div className="sync-message">{syncMessage}</div>}
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
                {processingStatuses[book.id]?.status === "processing" && (
                  <div className="processing-overlay">
                    <div className="processing-indicator">
                      <div
                        className="progress-bar"
                        style={{
                          width: `${processingStatuses[book.id].progress}%`,
                        }}
                      ></div>
                    </div>
                    <span className="progress-text">
                      {Math.round(processingStatuses[book.id].progress || 0)}%
                    </span>
                  </div>
                )}

                {/* Display processed indicator */}
                {processingStatuses[book.id]?.status === "processed" && (
                  <div
                    className="processed-badge"
                    title={
                      processingStatuses[book.id]?.inCloud
                        ? "This book has been processed and is stored in the cloud"
                        : "This book has been processed"
                    }
                  >
                    ✓
                  </div>
                )}

                {/* Cloud storage indicator - only show if book is in cloud but not processed locally */}
                {processingStatuses[book.id]?.inCloud &&
                  processingStatuses[book.id]?.status !== "processed" && (
                    <div
                      className="cloud-badge"
                      title="This book is available in cloud storage"
                    >
                      ☁
                    </div>
                  )}

                {/* Display error indicator */}
                {processingStatuses[book.id]?.error && (
                  <div
                    className="error-badge"
                    title={processingStatuses[book.id].error}
                  >
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
                  processingStatuses[book.id]?.status !== "processing" && (
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

                {/* Sync button for processed books */}
                {(processingStatuses[book.id]?.status === "processed" ||
                  book.processedBookId) && (
                  <button
                    className="action-button sync-button"
                    onClick={() => handleForceSyncBook(book)}
                    disabled={isSyncing}
                    title="Sync to cloud storage"
                  >
                    Sync
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
