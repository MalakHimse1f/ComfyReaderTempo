// Utility functions for managing offline documents

// Interface for offline document metadata
export interface OfflineDocument {
  id: string;
  title: string;
  fileType: string;
  fileSize: string;
  uploadDate: string;
  lastOpened?: string;
  isOffline: boolean;
}

// Save document for offline access
export async function saveDocumentOffline(
  documentId: string,
  documentData: Blob,
  metadata: OfflineDocument,
): Promise<void> {
  // Only enable mock mode for testing if explicitly requested
  // Uncomment the line below to enable mock mode for testing
  // if (import.meta.env.DEV) localStorage.setItem("use_mock_data", "true");

  try {
    // First, try to use IndexedDB
    try {
      // Save the document content to IndexedDB
      const db = await openDatabase();
      const tx = db.transaction(["documents", "metadata"], "readwrite");
      const store = tx.objectStore("documents");

      // Store the document content
      store.put(documentData, documentId);

      // Store the document metadata
      const metadataStore = tx.objectStore("metadata");
      metadataStore.put({ ...metadata, isOffline: true }, documentId);

      // Update the list of offline document IDs
      const offlineDocIds = await getOfflineDocumentIds();
      if (!offlineDocIds.includes(documentId)) {
        localStorage.setItem(
          "offlineDocumentIds",
          JSON.stringify([...offlineDocIds, documentId]),
        );
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => {
          console.error("Transaction error:", tx.error);
          reject(tx.error);
        };
      });
    } catch (indexedDBError) {
      // Fallback to localStorage if IndexedDB fails
      console.warn(
        "IndexedDB failed, falling back to localStorage:",
        indexedDBError,
      );

      // For localStorage, we can only store metadata and a flag
      // We can't store the actual blob data efficiently
      const offlineDocIds = await getOfflineDocumentIds();
      if (!offlineDocIds.includes(documentId)) {
        localStorage.setItem(
          "offlineDocumentIds",
          JSON.stringify([...offlineDocIds, documentId]),
        );
      }

      // Store metadata in localStorage
      localStorage.setItem(
        `doc_metadata_${documentId}`,
        JSON.stringify({ ...metadata, isOffline: true }),
      );

      // We'll just store a flag that it's available offline
      // The actual content won't be available in this fallback mode
      localStorage.setItem(`doc_offline_${documentId}`, "true");
    }
  } catch (error) {
    console.error("Error saving document offline:", error);
    throw error;
  }
}

// Remove document from offline storage
export async function removeDocumentOffline(documentId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(["documents", "metadata"], "readwrite");

    // Remove document content
    const store = tx.objectStore("documents");
    await store.delete(documentId);

    // Update metadata to mark as not offline
    const metadataStore = tx.objectStore("metadata");
    const metadata = await metadataStore.get(documentId);
    if (metadata) {
      metadata.isOffline = false;
      await metadataStore.put(metadata, documentId);
    }

    // Update the list of offline document IDs
    const offlineDocIds = await getOfflineDocumentIds();
    localStorage.setItem(
      "offlineDocumentIds",
      JSON.stringify(offlineDocIds.filter((id) => id !== documentId)),
    );

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Error removing document from offline storage:", error);
    throw error;
  }
}

// Get document content from offline storage
export async function getOfflineDocumentContent(
  documentId: string,
): Promise<Blob | null> {
  try {
    // First check if the document is marked as offline
    const isOffline = await isDocumentAvailableOffline(documentId);
    if (!isOffline) {
      console.log(`Document ${documentId} is not marked as offline`);
      return null;
    }

    // Try to get content from IndexedDB
    try {
      const db = await openDatabase();
      const tx = db.transaction(["documents"], "readonly");
      const store = tx.objectStore("documents");

      return new Promise((resolve, reject) => {
        const request = store.get(documentId);

        request.onsuccess = () => {
          const content = request.result;
          console.log(
            `IndexedDB content for ${documentId}:`,
            content ? "Found" : "Not found",
          );

          if (content) {
            // Return the actual content from IndexedDB
            resolve(content);
          } else {
            // No content in IndexedDB, check localStorage as fallback
            if (localStorage.getItem(`doc_offline_${documentId}`) === "true") {
              console.log(`Using localStorage fallback for ${documentId}`);
              // We don't have the actual content, just return null
              // This will trigger the fallback message in DocumentReader
              resolve(null);
            } else {
              resolve(null);
            }
          }
        };

        request.onerror = (event) => {
          console.error(
            "Error getting document from IndexedDB:",
            request.error,
          );
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("Error accessing IndexedDB:", error);
      return null;
    }
  } catch (error) {
    console.error("Error getting offline document content:", error);
    return null;
  }
}

// Get document metadata from offline storage
export async function getOfflineDocumentMetadata(
  documentId: string,
): Promise<OfflineDocument | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(["metadata"], "readonly");
    const store = tx.objectStore("metadata");

    return store.get(documentId);
  } catch (error) {
    console.error("Error getting offline document metadata:", error);
    return null;
  }
}

// Get all offline document metadata
export async function getAllOfflineDocumentMetadata(): Promise<
  OfflineDocument[]
> {
  try {
    const offlineDocIds = await getOfflineDocumentIds();
    if (offlineDocIds.length === 0) return [];

    try {
      // Try to get metadata from IndexedDB first
      const db = await openDatabase();
      const tx = db.transaction(["metadata"], "readonly");
      const store = tx.objectStore("metadata");

      const promises = offlineDocIds.map((id) => store.get(id));
      const results = await Promise.all(promises);

      return results.filter(Boolean) as OfflineDocument[];
    } catch (indexedDBError) {
      // Fallback to localStorage
      console.warn(
        "IndexedDB failed, falling back to localStorage for metadata",
        indexedDBError,
      );

      const results = offlineDocIds.map((id) => {
        const metadataStr = localStorage.getItem(`doc_metadata_${id}`);
        if (metadataStr) {
          return JSON.parse(metadataStr) as OfflineDocument;
        }

        // If no metadata is found but the ID is in the offline list,
        // create a minimal metadata object
        if (localStorage.getItem(`doc_offline_${id}`) === "true") {
          return {
            id,
            title: `Document ${id}`,
            fileType: "unknown",
            fileSize: "Unknown size",
            uploadDate: new Date().toISOString(),
            isOffline: true,
          } as OfflineDocument;
        }

        return null;
      });

      return results.filter(Boolean) as OfflineDocument[];
    }
  } catch (error) {
    console.error("Error getting all offline document metadata:", error);
    return [];
  }
}

// Check if a document is available offline
export async function isDocumentAvailableOffline(
  documentId: string,
): Promise<boolean> {
  try {
    // First check localStorage for the flag
    const localStorageFlag =
      localStorage.getItem(`doc_offline_${documentId}`) === "true";

    if (localStorageFlag) {
      return true;
    }

    // Then check the offline document IDs list
    const offlineDocIds = await getOfflineDocumentIds();
    const isInOfflineList = offlineDocIds.includes(documentId);

    if (isInOfflineList) {
      return true;
    }

    // Finally, try to check IndexedDB directly
    try {
      const db = await openDatabase();
      const tx = db.transaction(["documents"], "readonly");
      const store = tx.objectStore("documents");

      return new Promise((resolve) => {
        const request = store.count(documentId);

        request.onsuccess = () => {
          // If count is greater than 0, the document exists
          resolve(request.result > 0);
        };

        request.onerror = () => {
          console.error("Error checking IndexedDB:", request.error);
          resolve(false);
        };
      });
    } catch (dbError) {
      console.error(
        "Error accessing IndexedDB for availability check:",
        dbError,
      );
      return false;
    }
  } catch (error) {
    console.error("Error checking if document is available offline:", error);
    return false;
  }
}

// Get list of offline document IDs
export async function getOfflineDocumentIds(): Promise<string[]> {
  const idsString = localStorage.getItem("offlineDocumentIds");
  return idsString ? JSON.parse(idsString) : [];
}

// Open IndexedDB database
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Check if IndexedDB is available
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this browser"));
      return;
    }

    try {
      const request = indexedDB.open("DocumentReaderOfflineDB", 1);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Create object store for document content
        if (!db.objectStoreNames.contains("documents")) {
          db.createObjectStore("documents");
        }

        // Create object store for document metadata
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        console.error("IndexedDB error:", request.error);
        reject(request.error || new Error("Failed to open IndexedDB"));
      };
    } catch (error) {
      console.error("Error opening IndexedDB:", error);
      reject(error);
    }
  });
}
