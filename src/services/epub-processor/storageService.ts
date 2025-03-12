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
      };

      // Store in IndexedDB
      const db = await this.openDatabase();

      // Store book data
      const bookTx = db.transaction(["books"], "readwrite");
      const bookStore = bookTx.objectStore("books");
      await this.promisifyRequest(bookStore.put(bookData, bookId));

      // Store resources like index.html and styles.css
      const resourcesTx = db.transaction(["resources"], "readwrite");
      const resourcesStore = resourcesTx.objectStore("resources");

      // Store index file
      await this.promisifyRequest(
        resourcesStore.put(indexFile, `${bookId}/index.html`)
      );

      // Store CSS
      await this.promisifyRequest(
        resourcesStore.put(css, `${bookId}/styles.css`)
      );

      // Store HTML files in separate transaction to avoid blocking
      const chapterTx = db.transaction(["chapters"], "readwrite");
      const chapterStore = chapterTx.objectStore("chapters");

      const chapterPromises = [];
      for (const [filename, content] of htmlFiles.entries()) {
        // Convert filename to consistent format
        // Ensure it uses the same pattern as in the sync process
        const key = `${bookId}/chapters/${filename.replace(/^chapter_/, "")}`;
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

      // Get book data
      const bookTx = db.transaction(["books"], "readonly");
      const bookStore = bookTx.objectStore("books");
      const bookData = await this.promisifyRequest<any>(bookStore.get(bookId));

      if (!bookData) {
        throw new Error(`Book with ID ${bookId} not found`);
      }

      // Get index file
      const resourcesTx = db.transaction(["resources"], "readonly");
      const resourcesStore = resourcesTx.objectStore("resources");
      const indexFile = await this.promisifyRequest<string>(
        resourcesStore.get(`${bookId}/index.html`)
      );

      // Get CSS
      const css = await this.promisifyRequest<string>(
        resourcesStore.get(`${bookId}/styles.css`)
      );

      return {
        book: bookData,
        indexFile,
        css,
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

      // Use the same key format as we use for storing
      const key = `${bookId}/chapters/chapter_${chapterId}.html`;
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
      console.log("[SYNC] Starting syncProcessedBooks...");
      // Get items from sync queue
      const db = await this.openDatabase();
      const tx = db.transaction(["syncQueue"], "readonly");
      const store = tx.objectStore("syncQueue");

      const allKeys = await this.getAllKeysWithPrefix(store, "");
      console.log(`[SYNC] Found ${allKeys.length} books in sync queue`);

      for (const bookId of allKeys) {
        const syncItem = await this.promisifyRequest<SyncStatus>(
          store.get(bookId)
        );

        console.log(`[SYNC] Book ${bookId} status: ${syncItem?.status}`);
        if (syncItem && syncItem.status === "pending") {
          console.log(`[SYNC] Synchronizing book ${bookId} to cloud...`);
          await this.syncBookToCloud(bookId);
        }
      }
      console.log("[SYNC] Completed syncProcessedBooks");
    } catch (error) {
      console.error("[SYNC] Error syncing books:", error);
    }
  }

  /**
   * Sync a specific book to cloud storage
   */
  private async syncBookToCloud(bookId: string): Promise<void> {
    console.log(`[SYNC] Starting cloud sync for book ${bookId}`);

    try {
      // Update sync status to syncing
      await this.updateSyncStatus(bookId, "syncing");

      const db = await this.openDatabase();

      // First transaction: Get book data
      const bookData = await new Promise<any>((resolve, reject) => {
        const transaction = db.transaction(["books"], "readonly");
        const store = transaction.objectStore("books");
        const request = store.get(bookId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!bookData) {
        console.error(`[SYNC] Book ${bookId} not found in local storage`);
        await this.updateSyncStatus(
          bookId,
          "error",
          "Book not found in local storage"
        );
        return;
      }

      console.log(
        `[SYNC] Retrieved book data for ${bookId}, title: ${bookData.title}`
      );

      // Upload book data
      const bookDataPath = `${bookId}/book-data.json`;
      console.log(`[SYNC] Uploading book data to Supabase: ${bookDataPath}`);

      const { error: bookDataError } = await supabase.storage
        .from("processed-books")
        .upload(bookDataPath, JSON.stringify(bookData), {
          contentType: "application/json",
          upsert: true,
        });

      if (bookDataError) {
        console.error(
          `[SYNC] Error uploading book data: ${bookDataError.message}`
        );
        await this.updateSyncStatus(
          bookId,
          "error",
          `Error uploading book data: ${bookDataError.message}`
        );
        return;
      }

      console.log(`[SYNC] Book data uploaded successfully`);

      // Second transaction: Get index file
      const indexFile = await new Promise<string>((resolve, reject) => {
        const transaction = db.transaction(["resources"], "readonly");
        const store = transaction.objectStore("resources");
        const request = store.get(`${bookId}/index.html`);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Upload index file
      console.log(`[SYNC] Uploading index file: ${bookId}/index.html`);
      const { error: indexError } = await supabase.storage
        .from("processed-books")
        .upload(`${bookId}/index.html`, indexFile, {
          contentType: "text/html",
          upsert: true,
        });

      if (indexError) {
        console.error(
          `[SYNC] Error uploading index file: ${indexError.message}`
        );
        await this.updateSyncStatus(
          bookId,
          "error",
          `Error uploading index file: ${indexError.message}`
        );
        return;
      }

      console.log(`[SYNC] Index file uploaded successfully`);

      // Third transaction: Get CSS
      const css = await new Promise<string>((resolve, reject) => {
        const transaction = db.transaction(["resources"], "readonly");
        const store = transaction.objectStore("resources");
        const request = store.get(`${bookId}/styles.css`);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Upload CSS
      console.log(`[SYNC] Uploading CSS: ${bookId}/styles.css`);
      const { error: cssError } = await supabase.storage
        .from("processed-books")
        .upload(`${bookId}/styles.css`, css, {
          contentType: "text/css",
          upsert: true,
        });

      if (cssError) {
        console.error(`[SYNC] Error uploading CSS: ${cssError.message}`);
        await this.updateSyncStatus(
          bookId,
          "error",
          `Error uploading CSS: ${cssError.message}`
        );
        return;
      }

      console.log(`[SYNC] CSS uploaded successfully`);

      // Fourth transaction: Get chapter keys in a separate transaction
      const chapterKeys = await new Promise<string[]>((resolve, reject) => {
        const transaction = db.transaction(["chapters"], "readonly");
        const store = transaction.objectStore("chapters");

        this.getAllKeysWithPrefix(store, `${bookId}/chapters/`)
          .then(resolve)
          .catch(reject);
      });

      console.log(`[SYNC] Found ${chapterKeys.length} chapters to upload`);

      // Upload chapters one by one, each in its own transaction
      let successfulUploads = 0;
      for (let i = 0; i < chapterKeys.length; i++) {
        const chapterKey = chapterKeys[i];

        try {
          // Periodic logging to show progress
          if (i % 10 === 0 || i === chapterKeys.length - 1) {
            console.log(
              `[SYNC] Uploading chapter ${i + 1} of ${
                chapterKeys.length
              }: ${chapterKey}`
            );
          }

          // Get chapter content in its own transaction
          const chapterContent = await new Promise<string>(
            (resolve, reject) => {
              const transaction = db.transaction(["chapters"], "readonly");
              const store = transaction.objectStore("chapters");
              const request = store.get(chapterKey);

              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            }
          );

          // Upload the chapter
          const supabaseKey = chapterKey; // Same path in Supabase
          const { error: chapterError } = await supabase.storage
            .from("processed-books")
            .upload(supabaseKey, chapterContent, {
              contentType: "text/html",
              upsert: true,
            });

          if (chapterError) {
            console.error(
              `[SYNC] Error uploading chapter ${chapterKey}: ${chapterError.message}`
            );
            // Continue with other chapters instead of failing completely
          } else {
            successfulUploads++;
            // Periodic logging for successful uploads
            if (
              successfulUploads % 10 === 0 ||
              successfulUploads === chapterKeys.length
            ) {
              console.log(
                `[SYNC] Successfully uploaded ${successfulUploads} of ${chapterKeys.length} chapters`
              );
            }
          }
        } catch (error) {
          console.error(
            `[SYNC] Error processing chapter ${chapterKey}:`,
            error
          );
          // Continue with other chapters
        }
      }

      // Consider it a success if we uploaded at least 90% of chapters
      const uploadPercentage = (successfulUploads / chapterKeys.length) * 100;
      if (successfulUploads === 0) {
        await this.updateSyncStatus(
          bookId,
          "error",
          "Failed to upload any chapters"
        );
      } else if (uploadPercentage < 90) {
        await this.updateSyncStatus(
          bookId,
          "error",
          `Partial upload: only ${successfulUploads} of ${chapterKeys.length} chapters uploaded`
        );
      } else {
        // Success - even if a few chapters failed
        console.log(
          `[SYNC] Book ${bookId} synced successfully with ${successfulUploads} of ${chapterKeys.length} chapters`
        );
        await this.updateSyncStatus(bookId, "synced");
      }
    } catch (error) {
      console.error(`[SYNC] Error syncing book ${bookId} to cloud:`, error);
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
      console.log(
        `[SYNC] Updating sync status for book ${bookId} to ${status}${
          error ? ` with error: ${error}` : ""
        }`
      );
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
      console.log(`[SYNC] Sync status updated successfully for book ${bookId}`);
    } catch (error) {
      console.error("[SYNC] Error updating sync status:", error);
    }
  }

  /**
   * Setup sync listeners for online/offline events
   */
  public setupSyncListeners(): void {
    // Ensure the storage bucket exists
    this.ensureSupabaseBucketExists().catch((err) =>
      console.error("[SYNC] Error ensuring Supabase bucket exists:", err)
    );

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

  /**
   * Ensure the Supabase storage bucket exists
   */
  private async ensureSupabaseBucketExists(): Promise<void> {
    try {
      console.log(
        "[SYNC] Checking if 'processed-books' bucket exists in Supabase..."
      );

      // First check if the bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(
        (bucket) => bucket.name === "processed-books"
      );

      if (!bucketExists) {
        console.log(
          "[SYNC] Bucket 'processed-books' does not exist, creating it..."
        );

        // Create the bucket with public access
        const { error } = await supabase.storage.createBucket(
          "processed-books",
          {
            public: true, // Make the bucket publicly accessible
          }
        );

        if (error) {
          console.error("[SYNC] Error creating bucket:", error);
          throw error;
        }

        console.log("[SYNC] Successfully created 'processed-books' bucket");
      } else {
        console.log("[SYNC] Bucket 'processed-books' already exists");
      }
    } catch (error) {
      console.error("[SYNC] Error checking/creating Supabase bucket:", error);
      throw error;
    }
  }

  /**
   * Force synchronization of a specific book or all pending books
   * @param bookId Optional book ID to sync. If not provided, all pending books will be synced.
   */
  public async forceSyncToCloud(bookId?: string): Promise<void> {
    try {
      if (!navigator.onLine) {
        console.log("[SYNC] Can't force sync - device is offline");
        return;
      }

      console.log(
        `[SYNC] Force sync triggered ${
          bookId ? `for book ${bookId}` : "for all pending books"
        }`
      );

      if (bookId) {
        // Sync specific book
        await this.updateSyncStatus(bookId, "pending");
        await this.syncBookToCloud(bookId);
      } else {
        // Sync all pending books
        await this.syncProcessedBooks();
      }

      console.log("[SYNC] Force sync completed");
    } catch (error) {
      console.error("[SYNC] Error during force sync:", error);
      throw error;
    }
  }

  /**
   * Check if a book is stored in cloud storage
   */
  public async isBookInCloudStorage(bookId: string): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      console.log(
        `[CLOUD] Checking if book ${bookId} exists in cloud storage...`
      );

      // Try to fetch book data from cloud storage - this is more reliable than listing
      const { data, error } = await supabase.storage
        .from("processed-books")
        .download(`${bookId}/book-data.json`);

      if (error) {
        console.error(`[CLOUD] Error checking cloud storage:`, error);
        return false;
      }

      // If we successfully downloaded the book data, the book exists
      const exists = !!data;
      console.log(
        `[CLOUD] Book ${bookId} ${
          exists ? "found" : "not found"
        } in cloud storage`
      );

      // If the book exists in the cloud but we don't have it locally, try to fetch it
      if (exists) {
        try {
          const bookDataText = await data.text();
          const bookData = JSON.parse(bookDataText);

          // Store the book data locally
          const db = await this.openDatabase();
          const tx = db.transaction(["books"], "readwrite");
          const store = tx.objectStore("books");

          // Check if we already have it
          const existingBook = await this.promisifyRequest(store.get(bookId));
          if (!existingBook) {
            console.log(
              `[CLOUD] Storing book ${bookId} from cloud to local storage`
            );
            await this.promisifyRequest(store.put(bookData, bookId));

            // Add to index
            await this.addToIndex({
              id: bookId,
              metadata: bookData.metadata,
              toc: bookData.toc,
              chapters: bookData.chapterIds.map((id: string) => ({ id })),
              resources: new Map(),
              css: Array.isArray(bookData.css) ? bookData.css : [bookData.css],
              content: {},
            } as unknown as ProcessedBook);
          }
        } catch (importError) {
          console.error(
            `[CLOUD] Error importing book from cloud:`,
            importError
          );
          // We still return true as the book does exist in the cloud
        }
      }

      return exists;
    } catch (error) {
      console.error(`[CLOUD] Error checking if book is in cloud:`, error);
      return false;
    }
  }

  /**
   * Get a combined processing status, checking both local and cloud storage
   */
  public async getProcessingStatusWithCloud(bookId: string): Promise<{
    isProcessed: boolean;
    isProcessing: boolean;
    inCloud: boolean;
    progress: number;
    error?: Error;
  }> {
    // First check local storage
    let localStatus = {
      isProcessed: false,
      isProcessing: false,
      progress: 0,
      error: undefined as Error | undefined,
    };

    try {
      const db = await this.openDatabase();
      const tx = db.transaction(["syncQueue"], "readonly");
      const store = tx.objectStore("syncQueue");

      const syncItem = await this.promisifyRequest<SyncStatus>(
        store.get(bookId)
      );

      if (syncItem) {
        if (syncItem.status === "synced") {
          localStatus.isProcessed = true;
        } else if (syncItem.status === "syncing") {
          localStatus.isProcessing = true;
          localStatus.progress = 50; // Arbitrary
        } else if (syncItem.status === "error" && syncItem.error) {
          localStatus.error = new Error(syncItem.error);
        }
      }

      // Also check the book store to confirm it exists locally
      const bookTx = db.transaction(["books"], "readonly");
      const bookStore = bookTx.objectStore("books");
      const bookExists = await this.promisifyRequest<any>(
        bookStore.get(bookId)
      );

      if (bookExists) {
        localStatus.isProcessed = true;
      }
    } catch (error) {
      console.error(`[CLOUD] Error checking local status:`, error);
    }

    // Then check cloud storage
    let inCloud = false;

    if (navigator.onLine) {
      inCloud = await this.isBookInCloudStorage(bookId);
    }

    // Return combined status
    return {
      ...localStatus,
      inCloud,
    };
  }
}

// Create instance for export
export const processedBookStorage = new ProcessedBookStorage();

// Setup sync listeners
processedBookStorage.setupSyncListeners();
