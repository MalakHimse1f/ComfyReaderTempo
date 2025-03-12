import { ProcessedBook } from "./types";
import { processEpubToHtml } from "./epubProcessor";
import { generateHtml } from "./htmlGenerator";
import { processedBookStorage, ReadingHistoryEntry } from "./storageService";

/**
 * Main function to process an EPUB file and store the processed content
 */
export async function processEpub(file: File): Promise<string> {
  try {
    // Process EPUB to intermediate format
    const processedBook = await processEpubToHtml(file);

    // Generate HTML/CSS from the processed book
    const { html, indexFile, css } = await generateHtml(processedBook);

    // Store the processed book and generated content
    const bookId = await processedBookStorage.storeProcessedBook(
      processedBook,
      html,
      indexFile,
      css
    );

    return bookId;
  } catch (error) {
    console.error("Error in EPUB processing:", error);
    throw new Error(`Failed to process EPUB: ${(error as Error).message}`);
  }
}

/**
 * Get processed book data
 */
export async function getProcessedBook(bookId: string): Promise<{
  book: Partial<ProcessedBook>;
  indexFile: string;
  css: string;
}> {
  return processedBookStorage.getProcessedBook(bookId);
}

/**
 * Get a specific chapter from a processed book
 */
export async function getChapter(
  bookId: string,
  chapterId: string
): Promise<string> {
  return processedBookStorage.getChapter(bookId, chapterId);
}

/**
 * Get a list of all processed books
 */
export async function getProcessedBooks(): Promise<
  Array<{
    id: string;
    title: string;
    author: string;
    createdAt: string;
  }>
> {
  return processedBookStorage.getProcessedBooks();
}

/**
 * Remove a processed book
 */
export function removeProcessedBook(bookId: string): void {
  processedBookStorage.deleteProcessedBook(bookId);
}

/**
 * Get reading history
 */
export async function getReadingHistory(): Promise<ReadingHistoryEntry[]> {
  return processedBookStorage.getReadingHistory();
}

/**
 * Add or update reading history entry
 */
export async function addToReadingHistory(
  entry: ReadingHistoryEntry
): Promise<void> {
  return processedBookStorage.addToReadingHistory(entry);
}

/**
 * Remove a book from reading history
 */
export function removeFromReadingHistory(bookId: string): void {
  processedBookStorage.removeFromReadingHistory(bookId);
}

/**
 * Clear all reading history
 */
export function clearReadingHistory(): void {
  processedBookStorage.clearReadingHistory();
}

/**
 * Force synchronization of a book to cloud storage
 * @param bookId Optional book ID to sync. If not provided, all pending books will be synced.
 */
export async function syncBookToCloud(bookId?: string): Promise<void> {
  return processedBookStorage.forceSyncToCloud(bookId);
}

/**
 * Check if a book exists in cloud storage
 * @param bookId The ID of the book to check
 */
export async function isBookInCloudStorage(bookId: string): Promise<boolean> {
  return processedBookStorage.isBookInCloudStorage(bookId);
}

/**
 * Get a combined processing status, checking both local and cloud storage
 * @param bookId The ID of the book to check
 */
export async function getProcessingStatusWithCloud(bookId: string): Promise<{
  isProcessed: boolean;
  isProcessing: boolean;
  inCloud: boolean;
  progress: number;
  error?: Error;
}> {
  return processedBookStorage.getProcessingStatusWithCloud(bookId);
}

// Export the ReadingHistoryEntry interface
export type { ReadingHistoryEntry } from "./storageService";

// Export everything from individual modules for direct access
export * from "./types";
export { processEpubToHtml } from "./epubProcessor";
export { generateHtml } from "./htmlGenerator";
