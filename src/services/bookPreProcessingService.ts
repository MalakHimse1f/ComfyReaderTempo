import { processEpubToHtml } from "./epub-processor/epubProcessor";
import { generateHtml } from "./epub-processor/htmlGenerator";
import { ProcessedBookStorage } from "./epub-processor/storageService";
import { getProcessingStatusWithCloud as checkCloudStatus } from "./epub-processor";

/**
 * Represents the processing status of a book
 */
export interface ProcessingStatus {
  status: "idle" | "processing" | "processed" | "error";
  error?: string;
  downloadUrl?: string;
  progress?: number;
  inCloud?: boolean;
  startTime?: number;
  endTime?: number;
}

// In-memory store for processing status
// In a production app, this might be stored in IndexedDB or similar
const processingStatus = new Map<string, ProcessingStatus>();

// For thread safety, we'll track which books are currently being processed
const processingLock = new Set<string>();

/**
 * Service to manage the pre-processing of books from EPUB to HTML
 */
export const BookPreProcessingService = {
  /**
   * Check if a book has been processed
   * @param bookId The ID of the book to check
   * @returns The processing status of the book
   */
  getProcessingStatus(bookId: string): ProcessingStatus {
    return (
      processingStatus.get(bookId) || {
        status: "idle",
      }
    );
  },

  /**
   * Check if a book has been processed, including cloud storage check
   * This is an enhanced version that also checks if the book exists in cloud storage
   * @param bookId The ID of the book to check
   * @returns Promise that resolves to the processing status with cloud information
   */
  async getProcessingStatusWithCloud(
    bookId: string
  ): Promise<ProcessingStatus & { inCloud: boolean }> {
    // First get the local status
    const localStatus = this.getProcessingStatus(bookId);

    // If it's already known to be processed or is currently processing, return that
    if (
      localStatus.status === "processed" ||
      localStatus.status === "processing"
    ) {
      return { ...localStatus, inCloud: false }; // We'll check cloud separately
    }

    // Check cloud status
    try {
      const cloudStatus = await checkCloudStatus(bookId);

      // If it's in the cloud but not marked locally, update local status
      if (cloudStatus.inCloud && localStatus.status !== "processed") {
        processingStatus.set(bookId, {
          status: "processed",
          progress: 100,
          inCloud: true,
        });

        console.log(
          `[CLOUD] Book ${bookId} found in cloud but not locally, updating local status`
        );

        return {
          status: "processed",
          progress: 100,
          inCloud: true,
        };
      }

      return {
        ...localStatus,
        inCloud: cloudStatus.inCloud,
      };
    } catch (error) {
      console.error(`[CLOUD] Error checking cloud status:`, error);
      return { ...localStatus, inCloud: false };
    }
  },

  /**
   * Gets the processing status of all books
   * @returns Map of book IDs to processing status
   */
  getAllProcessingStatuses(): Map<string, ProcessingStatus> {
    return new Map(processingStatus);
  },

  /**
   * Process a book in the background
   * @param bookId The ID of the book to process
   * @param epubFile The EPUB file to process
   * @returns Promise that resolves to the ID of the processed book
   */
  async processBook(bookId: string, epubFile: File): Promise<string> {
    // Check if the book is already being processed
    if (processingLock.has(bookId)) {
      throw new Error(`Book with ID ${bookId} is already being processed`);
    }

    // Acquire the lock
    processingLock.add(bookId);

    // Update status
    const startTime = Date.now();
    processingStatus.set(bookId, {
      status: "processing",
      progress: 0,
      startTime,
    });

    try {
      // Function to update progress
      const updateProgress = (progress: number) => {
        const currentStatus = processingStatus.get(bookId);
        if (currentStatus) {
          processingStatus.set(bookId, {
            ...currentStatus,
            progress,
          });
        }
      };

      // Process the EPUB to HTML
      updateProgress(10);
      const processedBook = await processEpubToHtml(epubFile);

      updateProgress(50);
      // Generate HTML content
      const { html, indexFile, css } = await generateHtml(processedBook);

      updateProgress(80);
      // Store the processed content
      const storage = new ProcessedBookStorage();
      const processedBookId = await storage.storeProcessedBook(
        processedBook,
        html,
        indexFile,
        css
      );

      // Update status to completed
      const endTime = Date.now();
      processingStatus.set(bookId, {
        status: "processed",
        progress: 100,
        startTime,
        endTime,
      });

      // Release the lock
      processingLock.delete(bookId);

      return processedBookId;
    } catch (error) {
      // Handle errors
      const endTime = Date.now();
      processingStatus.set(bookId, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        startTime,
        endTime,
      });

      // Release the lock
      processingLock.delete(bookId);

      throw error;
    }
  },

  /**
   * Clear the processing status of a book
   * @param bookId The ID of the book to clear status for
   */
  clearStatus(bookId: string): void {
    processingStatus.delete(bookId);
  },

  /**
   * Get the number of books currently being processed
   * @returns The number of books being processed
   */
  getProcessingCount(): number {
    return processingLock.size;
  },

  /**
   * Check if a book is being processed
   * @param bookId The ID of the book to check
   * @returns True if the book is being processed
   */
  isProcessing(bookId: string): boolean {
    return processingLock.has(bookId);
  },

  /**
   * Reset the processing status of a book that failed
   * @param bookId The ID of the book to reset
   */
  resetFailedProcessing(bookId: string): void {
    const status = processingStatus.get(bookId);
    if (status && status.error && status.status !== "processing") {
      processingStatus.set(bookId, {
        status: "idle",
      });
    }
  },

  /**
   * Get processing statistics
   * @returns Processing statistics
   */
  getProcessingStats() {
    const allStatuses = Array.from(processingStatus.values());
    const completed = allStatuses.filter(
      (s) => s.status === "processed"
    ).length;
    const failed = allStatuses.filter((s) => !!s.error).length;
    const inProgress = allStatuses.filter(
      (s) => s.status === "processing"
    ).length;

    // Calculate average processing time for completed books
    const completedWithTimes = allStatuses.filter(
      (s) => s.status === "processed" && s.startTime && s.endTime
    );

    let averageTime = 0;
    if (completedWithTimes.length > 0) {
      const totalTime = completedWithTimes.reduce(
        (acc, s) => acc + ((s.endTime || 0) - (s.startTime || 0)),
        0
      );
      averageTime = totalTime / completedWithTimes.length;
    }

    return {
      total: allStatuses.length,
      completed,
      failed,
      inProgress,
      averageProcessingTimeMs: averageTime,
    };
  },

  /**
   * Queue a batch of books for processing
   * @param books Array of {bookId, file} objects to process
   * @param concurrentLimit Maximum number of concurrent processes
   * @param priorityFn Optional function to determine processing priority
   * @returns Promise that resolves when all books are processed
   */
  async processBatch(
    books: Array<{ bookId: string; file: File }>,
    concurrentLimit = 3,
    priorityFn?: (
      a: { bookId: string; file: File },
      b: { bookId: string; file: File }
    ) => number
  ): Promise<string[]> {
    // Sort the books if a priority function is provided
    const queue = [...books];
    if (priorityFn) {
      queue.sort(priorityFn);
    }

    const results: string[] = [];
    const activePromises: Promise<any>[] = [];

    // Process books in batches up to concurrentLimit
    while (queue.length > 0 || activePromises.length > 0) {
      // Fill up to the concurrent limit
      while (activePromises.length < concurrentLimit && queue.length > 0) {
        const book = queue.shift()!;

        // Create a promise that processes the book and removes itself from activePromises when done
        const processPromise = this.processBook(book.bookId, book.file)
          .then((id) => {
            results.push(id);
            const index = activePromises.indexOf(processPromise);
            if (index >= 0) {
              activePromises.splice(index, 1);
            }
            return id;
          })
          .catch((error) => {
            console.error(`Error processing book ${book.bookId}:`, error);
            const index = activePromises.indexOf(processPromise);
            if (index >= 0) {
              activePromises.splice(index, 1);
            }
            throw error;
          });

        activePromises.push(processPromise);
      }

      // Wait for any promise to complete if we're at the limit
      if (
        activePromises.length >= concurrentLimit ||
        (queue.length === 0 && activePromises.length > 0)
      ) {
        await Promise.race(activePromises);
      }
    }

    return results;
  },
};

// Export the service
export default BookPreProcessingService;
