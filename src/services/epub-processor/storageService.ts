import { ProcessedBook, Resource } from "./types";

/**
 * Reading history entry
 */
export interface ReadingHistoryEntry {
  bookId: string;
  title: string;
  author: string;
  lastRead: string; // ISO date string
  progress: number; // 0-1
  chapterId: string;
}

/**
 * Storage service for processed EPUB books
 */
export class ProcessedBookStorage {
  private readonly STORAGE_PREFIX = "epub_processed_";
  private readonly INDEX_KEY = "epub_processed_index";
  private readonly HISTORY_KEY = "epub_reading_history";

  /**
   * Store a processed book
   */
  public async storeProcessedBook(
    book: ProcessedBook,
    htmlFiles: Map<string, string>,
    indexFile: string,
    css: string
  ): Promise<string> {
    try {
      // Create the storage structure
      const storageKey = `${this.STORAGE_PREFIX}${book.id}`;

      // Store book metadata and structure
      const bookData = {
        id: book.id,
        metadata: book.metadata,
        toc: book.toc,
        chapterIds: book.chapters.map((c) => c.id),
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(`${storageKey}_data`, JSON.stringify(bookData));

      // Store HTML files
      for (const [filename, content] of htmlFiles.entries()) {
        localStorage.setItem(`${storageKey}_html_${filename}`, content);
      }

      // Store index file
      localStorage.setItem(`${storageKey}_index`, indexFile);

      // Store CSS
      localStorage.setItem(`${storageKey}_css`, css);

      // Store resources (binary data)
      await this.storeResources(book.id, book.resources);

      // Update the book index
      await this.addToIndex(book);

      return book.id;
    } catch (error) {
      console.error("Error storing processed book:", error);
      throw new Error(
        `Failed to store processed book: ${(error as Error).message}`
      );
    }
  }

  /**
   * Retrieve a processed book
   */
  public async getProcessedBook(bookId: string): Promise<{
    book: Partial<ProcessedBook>;
    indexFile: string;
    css: string;
  }> {
    try {
      const storageKey = `${this.STORAGE_PREFIX}${bookId}`;

      // Get book data
      const bookDataJson = localStorage.getItem(`${storageKey}_data`);
      if (!bookDataJson) {
        throw new Error(`Book with ID ${bookId} not found`);
      }

      const bookData = JSON.parse(bookDataJson);

      // Get index file
      const indexFile = localStorage.getItem(`${storageKey}_index`) || "";

      // Get CSS
      const css = localStorage.getItem(`${storageKey}_css`) || "";

      return {
        book: bookData,
        indexFile,
        css,
      };
    } catch (error) {
      console.error("Error retrieving processed book:", error);
      throw new Error(
        `Failed to retrieve processed book: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get a chapter by ID
   */
  public getChapter(bookId: string, chapterId: string): string {
    const storageKey = `${this.STORAGE_PREFIX}${bookId}`;
    const key = `${storageKey}_html_chapter_${chapterId}.html`;

    return localStorage.getItem(key) || "";
  }

  /**
   * Store book resources (images, fonts, etc.)
   */
  private async storeResources(
    bookId: string,
    resources: Map<string, Resource>
  ): Promise<void> {
    // For IndexedDB implementation, use the following pattern
    // This is a placeholder for future implementation

    // const db = await this.getDatabase();
    // const transaction = db.transaction(['resources'], 'readwrite');
    // const store = transaction.objectStore('resources');

    // for (const [path, resource] of resources.entries()) {
    //   await store.put({
    //     bookId,
    //     path,
    //     data: resource.data,
    //     mediaType: resource.mediaType
    //   });
    // }

    // In the simpler localStorage version, we can use:
    const storageKey = `${this.STORAGE_PREFIX}${bookId}`;

    // Store resource metadata
    const resourceMetadata = Array.from(resources.entries()).map(
      ([path, resource]) => ({
        id: resource.id,
        href: resource.href,
        mediaType: resource.mediaType,
      })
    );

    localStorage.setItem(
      `${storageKey}_resources_meta`,
      JSON.stringify(resourceMetadata)
    );

    // For now, we're not storing the actual binary data in localStorage
    // as it's not optimized for this. In a real implementation, use IndexedDB
    // or a similar mechanism
  }

  /**
   * Add a book to the index
   */
  private async addToIndex(book: ProcessedBook): Promise<void> {
    try {
      // Get current index
      const indexJson = localStorage.getItem(this.INDEX_KEY) || "[]";
      const index = JSON.parse(indexJson) as Array<{
        id: string;
        title: string;
        author: string;
        createdAt: string;
      }>;

      // Add this book to index
      index.push({
        id: book.id,
        title: book.metadata.title,
        author: book.metadata.creator.join(", "),
        createdAt: new Date().toISOString(),
      });

      // Store updated index
      localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      console.error("Error updating book index:", error);
    }
  }

  /**
   * Get a list of all processed books
   */
  public getProcessedBooks(): Array<{
    id: string;
    title: string;
    author: string;
    createdAt: string;
  }> {
    try {
      const indexJson = localStorage.getItem(this.INDEX_KEY) || "[]";
      return JSON.parse(indexJson);
    } catch (error) {
      console.error("Error retrieving book index:", error);
      return [];
    }
  }

  /**
   * Delete a processed book
   */
  public deleteProcessedBook(bookId: string): void {
    try {
      const storageKey = `${this.STORAGE_PREFIX}${bookId}`;

      // Remove all associated data
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith(storageKey)
      );

      for (const key of keys) {
        localStorage.removeItem(key);
      }

      // Update index
      const indexJson = localStorage.getItem(this.INDEX_KEY) || "[]";
      const index = JSON.parse(indexJson) as Array<{
        id: string;
        title: string;
        author: string;
        createdAt: string;
      }>;

      const updatedIndex = index.filter((book) => book.id !== bookId);
      localStorage.setItem(this.INDEX_KEY, JSON.stringify(updatedIndex));

      // Update reading history
      this.removeFromReadingHistory(bookId);
    } catch (error) {
      console.error("Error deleting processed book:", error);
    }
  }

  /**
   * Add or update reading history entry
   */
  public addToReadingHistory(entry: ReadingHistoryEntry): void {
    try {
      // Get current history
      const historyJson = localStorage.getItem(this.HISTORY_KEY) || "[]";
      const history = JSON.parse(historyJson) as ReadingHistoryEntry[];

      // Remove existing entry for this book if it exists
      const updatedHistory = history.filter(
        (item) => item.bookId !== entry.bookId
      );

      // Add new entry at the beginning (most recent)
      updatedHistory.unshift(entry);

      // Limit history to 50 entries
      if (updatedHistory.length > 50) {
        updatedHistory.pop();
      }

      // Store updated history
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Error updating reading history:", error);
    }
  }

  /**
   * Get reading history
   */
  public getReadingHistory(): ReadingHistoryEntry[] {
    try {
      const historyJson = localStorage.getItem(this.HISTORY_KEY) || "[]";
      return JSON.parse(historyJson);
    } catch (error) {
      console.error("Error retrieving reading history:", error);
      return [];
    }
  }

  /**
   * Remove book from reading history
   */
  public removeFromReadingHistory(bookId: string): void {
    try {
      const historyJson = localStorage.getItem(this.HISTORY_KEY) || "[]";
      const history = JSON.parse(historyJson) as ReadingHistoryEntry[];

      const updatedHistory = history.filter((item) => item.bookId !== bookId);

      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Error removing from reading history:", error);
    }
  }

  /**
   * Clear reading history
   */
  public clearReadingHistory(): void {
    localStorage.removeItem(this.HISTORY_KEY);
  }
}

// Create instance for export
export const processedBookStorage = new ProcessedBookStorage();
