import { ProcessedBook, Resource } from "./types";
import { supabase } from "../../../supabase/supabase";

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
 * Sync status for offline processing
 */
export interface SyncStatus {
  bookId: string;
  status: "pending" | "syncing" | "synced" | "error";
  createdAt: string;
  syncedAt?: string;
  error?: string;
}

/**
 * Storage service for processed EPUB books
 */
export class ProcessedBookStorage {
  private readonly STORAGE_PREFIX = "epub_processed_";
  private readonly INDEX_KEY = "epub_processed_index";
  private readonly HISTORY_KEY = "epub_reading_history";
  private readonly SYNC_QUEUE_KEY = "epub_sync_queue";
  private readonly DB_NAME = "ProcessedBooksDB";
  private readonly DB_VERSION = 1;

  /**
   * Open IndexedDB database
   */
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not supported in this browser"));
        return;
      }

      try {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = request.result;

          // Create object stores for our data
          if (!db.objectStoreNames.contains("books")) {
            db.createObjectStore("books");
          }

          if (!db.objectStoreNames.contains("chapters")) {
            db.createObjectStore("chapters");
          }

          if (!db.objectStoreNames.contains("resources")) {
            db.createObjectStore("resources");
          }

          if (!db.objectStoreNames.contains("index")) {
            db.createObjectStore("index");
          }

          if (!db.objectStoreNames.contains("history")) {
            db.createObjectStore("history");
          }

          if (!db.objectStoreNames.contains("syncQueue")) {
            db.createObjectStore("syncQueue");
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error("IndexedDB error:", request.error);
          reject(request.error || new Error("Failed to open IndexedDB"));
        };
      } catch (error) {
        console.error("Error opening IndexedDB:", error);
        reject(error);
      }
    });
  }

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
      const bookId = book.id;

      // Create book data object
      const bookData = {
        id: bookId,
        metadata: book.metadata,
        toc: book.toc,
        chapterIds: book.chapters.map((c) => c.id),
        createdAt: new Date().toISOString(),
        indexFile,
        css,
      };

      // Store in IndexedDB
      const db = await this.openDatabase();

      // Store book data
      const bookTx = db.transaction(["books"], "readwrite");
      const bookStore = bookTx.objectStore("books");
      await this.promisifyRequest(bookStore.put(bookData, bookId));

      // Store HTML files in separate transaction to avoid blocking
      const chapterTx = db.transaction(["chapters"], "readwrite");
      const chapterStore = chapterTx.objectStore("chapters");

      const chapterPromises = [];
      for (const [filename, content] of htmlFiles.entries()) {
        const key = `${bookId}_${filename}`;
        chapterPromises.push(
          this.promisifyRequest(chapterStore.put(content, key))
        );
      }
      await Promise.all(chapterPromises);

      // Store resources in separate transaction
      await this.storeResources(book.id, book.resources);

      // Update the book index
      await this.addToIndex(book);

      // Add to sync queue if we need to sync to cloud
      await this.addToSyncQueue(bookId);

      // Try to sync if we're online
      if (navigator.onLine) {
        this.syncProcessedBooks().catch((err) =>
          console.warn("Background sync failed:", err)
        );
      }

      return bookId;
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
      // Try to get from IndexedDB
      const db = await this.openDatabase();
      const tx = db.transaction(["books"], "readonly");
      const store = tx.objectStore("books");

      const bookData = await this.promisifyRequest<any>(store.get(bookId));

      if (!bookData) {
        throw new Error(`Book with ID ${bookId} not found`);
      }

      return {
        book: bookData,
        indexFile: bookData.indexFile,
        css: bookData.css,
      };
    } catch (error) {
      console.error("Error retrieving processed book:", error);

      // Try to get from cloud storage as fallback
      try {
        const { data } = await supabase.storage
          .from("processed-books")
          .download(`${bookId}/book-data.json`);

        if (!data) {
          throw new Error(`Book with ID ${bookId} not found in cloud storage`);
        }

        const bookDataText = await data.text();
        const bookData = JSON.parse(bookDataText);

        // Get index file from cloud
        const { data: indexData } = await supabase.storage
          .from("processed-books")
          .download(`${bookId}/index.html`);

        // Get CSS from cloud
        const { data: cssData } = await supabase.storage
          .from("processed-books")
          .download(`${bookId}/styles.css`);

        const indexFile = indexData ? await indexData.text() : "";
        const css = cssData ? await cssData.text() : "";

        // Store locally for future use
        this.storeBookFromCloud(bookId, bookData, indexFile, css);

        return {
          book: bookData,
          indexFile,
          css,
        };
      } catch (cloudError) {
        console.error("Error retrieving from cloud:", cloudError);
        throw new Error(
          `Failed to retrieve processed book: ${(error as Error).message}`
        );
      }
    }
  }

  /**
   * Get a chapter by ID
   */
  public async getChapter(bookId: string, chapterId: string): Promise<string> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["chapters"], "readonly");
      const store = tx.objectStore("chapters");

      const key = `${bookId}_chapter_${chapterId}.html`;
      const chapterContent = await this.promisifyRequest<string>(
        store.get(key)
      );

      if (chapterContent) {
        return chapterContent;
      }

      // If not found locally, try to get from cloud
      const { data } = await supabase.storage
        .from("processed-books")
        .download(`${bookId}/chapters/chapter_${chapterId}.html`);

      if (!data) {
        return "";
      }

      const content = await data.text();

      // Store locally for future use
      const storeTx = db.transaction(["chapters"], "readwrite");
      const chapterStore = storeTx.objectStore("chapters");
      await this.promisifyRequest(chapterStore.put(content, key));

      return content;
    } catch (error) {
      console.error("Error retrieving chapter:", error);
      return "";
    }
  }

  /**
   * Store book resources (images, fonts, etc.)
   */
  private async storeResources(
    bookId: string,
    resources: Map<string, Resource>
  ): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["resources"], "readwrite");
      const store = tx.objectStore("resources");

      const resourcePromises = [];

      for (const [path, resource] of resources.entries()) {
        const key = `${bookId}_${path}`;
        const resourceData = {
          id: resource.id,
          href: resource.href,
          mediaType: resource.mediaType,
          data: resource.data,
        };

        resourcePromises.push(
          this.promisifyRequest(store.put(resourceData, key))
        );
      }

      await Promise.all(resourcePromises);
    } catch (error) {
      console.error("Error storing resources:", error);
    }
  }

  /**
   * Add a book to the index
   */
  private async addToIndex(book: ProcessedBook): Promise<void> {
    try {
      // Get current index
      const db = await this.openDatabase();
      const tx = db.transaction(["index"], "readwrite");
      const store = tx.objectStore("index");

      let index =
        (await this.promisifyRequest<any[]>(store.get(this.INDEX_KEY))) || [];

      // Add this book to index
      const bookEntry = {
        id: book.id,
        title: book.metadata.title,
        author: book.metadata.creator.join(", "),
        createdAt: new Date().toISOString(),
      };

      // Remove if already exists
      index = index.filter((item) => item.id !== book.id);

      // Add to beginning
      index.unshift(bookEntry);

      // Store updated index
      await this.promisifyRequest(store.put(index, this.INDEX_KEY));
    } catch (error) {
      console.error("Error updating book index:", error);
    }
  }

  /**
   * Get a list of all processed books
   */
  public async getProcessedBooks(): Promise<
    Array<{
      id: string;
      title: string;
      author: string;
      createdAt: string;
    }>
  > {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["index"], "readonly");
      const store = tx.objectStore("index");

      const index =
        (await this.promisifyRequest<any[]>(store.get(this.INDEX_KEY))) || [];
      return index;
    } catch (error) {
      console.error("Error retrieving book index:", error);
      return [];
    }
  }

  /**
   * Delete a processed book
   */
  public async deleteProcessedBook(bookId: string): Promise<void> {
    try {
      const db = await this.openDatabase();

      // Delete book data
      const bookTx = db.transaction(["books"], "readwrite");
      const bookStore = bookTx.objectStore("books");
      await this.promisifyRequest(bookStore.delete(bookId));

      // Delete chapters
      const chapterTx = db.transaction(["chapters"], "readwrite");
      const chapterStore = chapterTx.objectStore("chapters");
      const chapterKeys = await this.getAllKeysWithPrefix(
        chapterStore,
        `${bookId}_`
      );

      for (const key of chapterKeys) {
        await this.promisifyRequest(chapterStore.delete(key));
      }

      // Delete resources
      const resourceTx = db.transaction(["resources"], "readwrite");
      const resourceStore = resourceTx.objectStore("resources");
      const resourceKeys = await this.getAllKeysWithPrefix(
        resourceStore,
        `${bookId}_`
      );

      for (const key of resourceKeys) {
        await this.promisifyRequest(resourceStore.delete(key));
      }

      // Update index
      const indexTx = db.transaction(["index"], "readwrite");
      const indexStore = indexTx.objectStore("index");

      const index =
        (await this.promisifyRequest<any[]>(indexStore.get(this.INDEX_KEY))) ||
        [];
      const updatedIndex = index.filter((book) => book.id !== bookId);

      await this.promisifyRequest(indexStore.put(updatedIndex, this.INDEX_KEY));

      // Update reading history
      await this.removeFromReadingHistory(bookId);

      // Delete from cloud if online
      if (navigator.onLine) {
        try {
          await supabase.storage.from("processed-books").remove([`${bookId}`]);
        } catch (cloudError) {
          console.error("Error deleting from cloud storage:", cloudError);
        }
      }
    } catch (error) {
      console.error("Error deleting processed book:", error);
    }
  }

  /**
   * Add or update reading history entry
   */
  public async addToReadingHistory(entry: ReadingHistoryEntry): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["history"], "readwrite");
      const store = tx.objectStore("history");

      let history =
        (await this.promisifyRequest<ReadingHistoryEntry[]>(
          store.get(this.HISTORY_KEY)
        )) || [];

      // Remove existing entry for this book if it exists
      history = history.filter((item) => item.bookId !== entry.bookId);

      // Add new entry at the beginning (most recent)
      history.unshift(entry);

      // Limit history to 50 entries
      if (history.length > 50) {
        history.pop();
      }

      // Store updated history
      await this.promisifyRequest(store.put(history, this.HISTORY_KEY));
    } catch (error) {
      console.error("Error updating reading history:", error);
    }
  }

  /**
   * Get reading history
   */
  public async getReadingHistory(): Promise<ReadingHistoryEntry[]> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["history"], "readonly");
      const store = tx.objectStore("history");

      const history =
        (await this.promisifyRequest<ReadingHistoryEntry[]>(
          store.get(this.HISTORY_KEY)
        )) || [];
      return history;
    } catch (error) {
      console.error("Error retrieving reading history:", error);
      return [];
    }
  }

  /**
   * Remove book from reading history
   */
  public async removeFromReadingHistory(bookId: string): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["history"], "readwrite");
      const store = tx.objectStore("history");

      const history =
        (await this.promisifyRequest<ReadingHistoryEntry[]>(
          store.get(this.HISTORY_KEY)
        )) || [];
      const updatedHistory = history.filter((item) => item.bookId !== bookId);

      await this.promisifyRequest(store.put(updatedHistory, this.HISTORY_KEY));
    } catch (error) {
      console.error("Error removing from reading history:", error);
    }
  }

  /**
   * Clear reading history
   */
  public async clearReadingHistory(): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["history"], "readwrite");
      const store = tx.objectStore("history");

      await this.promisifyRequest(store.delete(this.HISTORY_KEY));
    } catch (error) {
      console.error("Error clearing reading history:", error);
    }
  }

  /**
   * Promisify an IndexedDB request
   */
  private promisifyRequest<T>(request: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all keys with a specific prefix
   */
  private async getAllKeysWithPrefix(
    store: IDBObjectStore,
    prefix: string
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const keys = request.result.filter((key) =>
          String(key).startsWith(prefix)
        );
        resolve(keys as string[]);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store a book retrieved from cloud
   */
  private async storeBookFromCloud(
    bookId: string,
    bookData: any,
    indexFile: string,
    css: string
  ): Promise<void> {
    try {
      const db = await this.openDatabase();

      // Store book data
      const bookTx = db.transaction(["books"], "readwrite");
      const bookStore = bookTx.objectStore("books");

      // Add index file and CSS to the book data
      bookData.indexFile = indexFile;
      bookData.css = css;

      await this.promisifyRequest(bookStore.put(bookData, bookId));

      // Add to index if needed
      try {
        // Create a book-like object with the required properties for addToIndex
        // We don't need all properties as addToIndex only uses id, metadata, and toc
        const bookObj = {
          id: bookId,
          metadata: bookData.metadata,
          toc: bookData.toc,
          chapters: bookData.chapterIds.map((id: string) => ({ id })),
          resources: new Map(),
          // Add properties needed by ProcessedBook type
          css: [css], // Correctly set as string array
          content: {}, // Not actually used by addToIndex
        };

        // Use type assertion with 'unknown' first to avoid TypeScript error
        await this.addToIndex(bookObj as unknown as ProcessedBook);
      } catch (indexError) {
        console.error("Error adding book to index:", indexError);
      }
    } catch (error) {
      console.error("Error storing book from cloud:", error);
    }
  }

  /**
   * Add book to sync queue
   */
  private async addToSyncQueue(bookId: string): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["syncQueue"], "readwrite");
      const store = tx.objectStore("syncQueue");

      const syncItem: SyncStatus = {
        bookId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await this.promisifyRequest(store.put(syncItem, bookId));
    } catch (error) {
      console.error("Error adding to sync queue:", error);
    }
  }

  /**
   * Sync processed books to cloud storage
   */
  public async syncProcessedBooks(): Promise<void> {
    if (!navigator.onLine) {
      console.log("Offline - will sync later");
      return;
    }

    try {
      // Get items from sync queue
      const db = await this.openDatabase();
      const tx = db.transaction(["syncQueue"], "readonly");
      const store = tx.objectStore("syncQueue");

      const allKeys = await this.getAllKeysWithPrefix(store, "");

      for (const bookId of allKeys) {
        const syncItem = await this.promisifyRequest<SyncStatus>(
          store.get(bookId)
        );

        if (syncItem && syncItem.status === "pending") {
          await this.syncBookToCloud(bookId);
        }
      }
    } catch (error) {
      console.error("Error syncing books:", error);
    }
  }

  /**
   * Sync a specific book to cloud storage
   */
  private async syncBookToCloud(bookId: string): Promise<void> {
    try {
      // Update status to processing
      await this.updateSyncStatus(bookId, "syncing");

      // Get the book data
      const db = await this.openDatabase();
      const bookTx = db.transaction(["books"], "readonly");
      const bookStore = bookTx.objectStore("books");

      const bookData = await this.promisifyRequest<any>(bookStore.get(bookId));

      if (!bookData) {
        throw new Error(`Book not found: ${bookId}`);
      }

      // Upload book data to Supabase
      const { error: bookError } = await supabase.storage
        .from("processed-books")
        .upload(
          `${bookId}/book-data.json`,
          new Blob([JSON.stringify(bookData)], {
            type: "application/json",
          }),
          {
            upsert: true,
          }
        );

      if (bookError) throw bookError;

      // Upload index file
      const { error: indexError } = await supabase.storage
        .from("processed-books")
        .upload(
          `${bookId}/index.html`,
          new Blob([bookData.indexFile], {
            type: "text/html",
          }),
          {
            upsert: true,
          }
        );

      if (indexError) throw indexError;

      // Upload CSS
      const { error: cssError } = await supabase.storage
        .from("processed-books")
        .upload(
          `${bookId}/styles.css`,
          new Blob([bookData.css], {
            type: "text/css",
          }),
          {
            upsert: true,
          }
        );

      if (cssError) throw cssError;

      // Upload chapters
      const chapterTx = db.transaction(["chapters"], "readonly");
      const chapterStore = chapterTx.objectStore("chapters");

      const chapterKeys = await this.getAllKeysWithPrefix(
        chapterStore,
        `${bookId}_`
      );

      for (const key of chapterKeys) {
        const chapterContent = await this.promisifyRequest<string>(
          chapterStore.get(key)
        );
        const chapterFilename = key.replace(`${bookId}_`, "");

        const { error: chapterError } = await supabase.storage
          .from("processed-books")
          .upload(
            `${bookId}/chapters/${chapterFilename}`,
            new Blob([chapterContent], {
              type: "text/html",
            }),
            {
              upsert: true,
            }
          );

        if (chapterError) throw chapterError;
      }

      // Update status to synced
      await this.updateSyncStatus(bookId, "synced");
    } catch (error) {
      console.error(`Error syncing book ${bookId} to cloud:`, error);

      // Update status to error
      await this.updateSyncStatus(bookId, "error", (error as Error).message);
    }
  }

  /**
   * Update sync status for a book
   */
  private async updateSyncStatus(
    bookId: string,
    status: "pending" | "syncing" | "synced" | "error",
    error?: string
  ): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["syncQueue"], "readwrite");
      const store = tx.objectStore("syncQueue");

      const syncItem = (await this.promisifyRequest<SyncStatus>(
        store.get(bookId)
      )) || {
        bookId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      syncItem.status = status;

      if (status === "synced") {
        syncItem.syncedAt = new Date().toISOString();
      } else if (status === "error" && error) {
        syncItem.error = error;
      }

      await this.promisifyRequest(store.put(syncItem, bookId));
    } catch (error) {
      console.error("Error updating sync status:", error);
    }
  }

  /**
   * Setup sync listeners for online/offline events
   */
  public setupSyncListeners(): void {
    // Sync when we come back online
    window.addEventListener("online", () => {
      console.log("Back online, syncing books...");
      this.syncProcessedBooks().catch((err) =>
        console.warn("Background sync failed:", err)
      );
    });

    // Initialize sync on startup if online
    if (navigator.onLine) {
      setTimeout(() => {
        this.syncProcessedBooks().catch((err) =>
          console.warn("Initial sync failed:", err)
        );
      }, 5000); // Delay to allow app to initialize
    }
  }
}

// Create instance for export
export const processedBookStorage = new ProcessedBookStorage();

// Setup sync listeners
processedBookStorage.setupSyncListeners();
