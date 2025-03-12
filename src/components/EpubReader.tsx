import React, { useEffect, useState, useCallback } from "react";
import { HtmlBookReader } from "./HtmlBookReader";
import { processEpub, getProcessedBooks } from "../services/epub-processor";

interface EpubReaderProps {
  file: File;
  onProgressUpdate?: (progress: number) => void;
  initialLocation?: string;
}

/**
 * EPUB Reader component that preprocesses EPUBs to HTML and displays them
 */
export function EpubReader({
  file,
  onProgressUpdate,
  initialLocation,
}: EpubReaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedBookId, setProcessedBookId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if this file has already been processed
  const checkIfProcessed = useCallback(async () => {
    try {
      // This is a simple check based on the file name
      // In a real implementation, we'd use a more reliable method (hash, etc.)
      const processedBooks = getProcessedBooks();
      const matchingBook = processedBooks.find((book) =>
        book.title.includes(file.name.replace(".epub", ""))
      );

      if (matchingBook) {
        return matchingBook.id;
      }

      return null;
    } catch (err) {
      console.error("Error checking if book is processed:", err);
      return null;
    }
  }, [file.name]);

  // Process the EPUB file when component mounts
  useEffect(() => {
    async function processFile() {
      try {
        setIsProcessing(true);

        // First check if we've already processed this file
        const existingBookId = await checkIfProcessed();

        if (existingBookId) {
          setProcessedBookId(existingBookId);
          setIsProcessing(false);
          return;
        }

        // Process the file if it hasn't been processed yet
        const bookId = await processEpub(file);
        setProcessedBookId(bookId);
        setIsProcessing(false);
      } catch (err) {
        console.error("Error processing EPUB:", err);
        setError(`Failed to process EPUB: ${(err as Error).message}`);
        setIsProcessing(false);
      }
    }

    processFile();
  }, [file, checkIfProcessed]);

  // Show processing state
  if (isProcessing) {
    return (
      <div className="epub-reader-processing">
        <p>Processing EPUB file...</p>
        <div className="processing-spinner"></div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="epub-reader-error">
        <p>Error: {error}</p>
      </div>
    );
  }

  // Show the HTML book reader if we have a processed book ID
  if (processedBookId) {
    return (
      <HtmlBookReader
        bookId={processedBookId}
        onProgressUpdate={onProgressUpdate}
        initialLocation={initialLocation}
        onError={(err) => setError(err.message)}
      />
    );
  }

  // Fallback
  return (
    <div className="epub-reader-loading">
      <p>Preparing to display EPUB...</p>
    </div>
  );
}
