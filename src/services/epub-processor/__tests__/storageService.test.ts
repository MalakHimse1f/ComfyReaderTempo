import {
  setupMockStorage,
  createMockProcessedBook,
  createMockHtmlContent,
} from "./setup";
import { ProcessedBookStorage, ReadingHistoryEntry } from "../storageService";

describe("ProcessedBookStorage", () => {
  let storage: ProcessedBookStorage;
  let mockLocalStorage: any;

  beforeEach(() => {
    // Setup fresh mock storage before each test
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();
  });

  describe("storeProcessedBook", () => {
    it("should store book data and html files", async () => {
      const mockBook = createMockProcessedBook();
      const htmlFiles = new Map([
        ["chapter1", createMockHtmlContent("chapter1")],
        ["chapter2", createMockHtmlContent("chapter2")],
        ["chapter3", createMockHtmlContent("chapter3")],
      ]);
      const indexFile = "<html><body>Index</body></html>";
      const css = "body { font-family: serif; }";

      const bookId = await storage.storeProcessedBook(
        mockBook,
        htmlFiles,
        indexFile,
        css
      );

      // Check that book ID is returned
      expect(bookId).toBe(mockBook.id);

      // Check that book data was stored
      const bookDataKey = `epub_processed_${mockBook.id}_data`;
      expect(mockLocalStorage.getItem(bookDataKey)).toBeDefined();

      // Parse stored book data
      const storedBookData = JSON.parse(mockLocalStorage.getItem(bookDataKey));
      expect(storedBookData.metadata.title).toBe(mockBook.metadata.title);
      expect(storedBookData.chapterIds.length).toBe(mockBook.chapters.length);

      // Check HTML files
      htmlFiles.forEach((_, key) => {
        const htmlKey = `epub_processed_${mockBook.id}_html_${key}`;
        expect(mockLocalStorage.getItem(htmlKey)).toBeDefined();
      });

      // Check index file
      const indexKey = `epub_processed_${mockBook.id}_index`;
      expect(mockLocalStorage.getItem(indexKey)).toBe(indexFile);

      // Check CSS
      const cssKey = `epub_processed_${mockBook.id}_css`;
      expect(mockLocalStorage.getItem(cssKey)).toBe(css);

      // Check book index
      const indexJson = mockLocalStorage.getItem("epub_processed_index");
      expect(indexJson).toBeDefined();
      const index = JSON.parse(indexJson);
      expect(index.length).toBe(1);
      expect(index[0].id).toBe(mockBook.id);
      expect(index[0].title).toBe(mockBook.metadata.title);
    });

    it("should throw error when storage fails", async () => {
      const mockBook = createMockProcessedBook();
      const htmlFiles = new Map([
        ["chapter1", createMockHtmlContent("chapter1")],
      ]);
      const indexFile = "<html><body>Index</body></html>";
      const css = "body { font-family: serif; }";

      // Mock storage error
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error("Storage full");
      });

      await expect(
        storage.storeProcessedBook(mockBook, htmlFiles, indexFile, css)
      ).rejects.toThrow("Failed to store processed book");
    });
  });

  describe("getProcessedBook", () => {
    it("should retrieve a stored book", async () => {
      const mockBook = createMockProcessedBook();
      const bookId = mockBook.id;

      // Store mock book data
      mockLocalStorage.setItem(
        `epub_processed_${bookId}_data`,
        JSON.stringify({
          metadata: mockBook.metadata,
          chapterIds: mockBook.chapters.map((c) => c.id),
        })
      );

      // Store mock chapters
      mockBook.chapters.forEach((chapter) => {
        mockLocalStorage.setItem(
          `epub_processed_${bookId}_html_${chapter.id}`,
          chapter.html
        );
      });

      const result = await storage.getProcessedBook(bookId);

      expect(result).toBeDefined();
      expect(result.book.metadata?.title).toBe(mockBook.metadata.title);
      expect(result.book.chapters?.length).toBe(mockBook.chapters.length);
    });

    it("should throw error when book not found", async () => {
      await expect(storage.getProcessedBook("nonexistent-id")).rejects.toThrow(
        "Book with ID nonexistent-id not found"
      );
    });
  });

  describe("getChapter", () => {
    it("should retrieve chapter content", () => {
      const bookId = "test-book";
      const chapterId = "chapter1";
      const chapterContent = "<html><body>Chapter content</body></html>";

      mockLocalStorage.setItem(
        `epub_processed_${bookId}_html_${chapterId}`,
        chapterContent
      );

      const result = storage.getChapter(bookId, chapterId);
      expect(result).toBe(chapterContent);
    });

    it("should return empty string when chapter not found", () => {
      const result = storage.getChapter("test-book", "nonexistent-chapter");
      expect(result).toBe("");
    });
  });

  describe("readingHistory", () => {
    it("should add entry to reading history", () => {
      const entry: ReadingHistoryEntry = {
        bookId: "test-book",
        title: "Test Book",
        author: "Test Author",
        lastRead: new Date().toISOString(),
        progress: 0.5,
        chapterId: "chapter1",
      };

      storage.addToReadingHistory(entry);

      const historyJson = mockLocalStorage.getItem("epub_reading_history");
      expect(historyJson).toBeDefined();

      const history = JSON.parse(historyJson);
      expect(history.length).toBe(1);
      expect(history[0].bookId).toBe(entry.bookId);
    });

    it("should update entry when book already in history", () => {
      const entry1: ReadingHistoryEntry = {
        bookId: "test-book",
        title: "Test Book",
        author: "Test Author",
        lastRead: "2023-01-01T12:00:00Z",
        progress: 0.3,
        chapterId: "chapter1",
      };

      const entry2: ReadingHistoryEntry = {
        bookId: "test-book",
        title: "Test Book",
        author: "Test Author",
        lastRead: "2023-01-02T12:00:00Z",
        progress: 0.5,
        chapterId: "chapter2",
      };

      mockLocalStorage.setItem(
        "epub_reading_history",
        JSON.stringify([entry1])
      );

      storage.addToReadingHistory(entry2);

      const historyJson = mockLocalStorage.getItem("epub_reading_history");
      const history = JSON.parse(historyJson);
      expect(history.length).toBe(1);
      expect(history[0].progress).toBe(entry2.progress);
      expect(history[0].chapterId).toBe(entry2.chapterId);
    });

    it("should remove entry from reading history", () => {
      const entries = [
        {
          bookId: "test-book-1",
          title: "Test Book 1",
          author: "Test Author",
          lastRead: "2023-01-01T12:00:00Z",
          progress: 0.3,
          chapterId: "chapter1",
        },
        {
          bookId: "test-book-2",
          title: "Test Book 2",
          author: "Test Author",
          lastRead: "2023-01-02T12:00:00Z",
          progress: 0.5,
          chapterId: "chapter2",
        },
      ];

      mockLocalStorage.setItem("epub_reading_history", JSON.stringify(entries));

      storage.removeFromReadingHistory("test-book-1");

      const historyJson = mockLocalStorage.getItem("epub_reading_history");
      const history = JSON.parse(historyJson);
      expect(history.length).toBe(1);
      expect(history[0].bookId).toBe("test-book-2");
    });

    it("should get reading history", () => {
      const entries = [
        {
          bookId: "test-book-1",
          title: "Test Book 1",
          author: "Test Author",
          lastRead: "2023-01-01T12:00:00Z",
          progress: 0.3,
          chapterId: "chapter1",
        },
        {
          bookId: "test-book-2",
          title: "Test Book 2",
          author: "Test Author",
          lastRead: "2023-01-02T12:00:00Z",
          progress: 0.5,
          chapterId: "chapter2",
        },
      ];

      mockLocalStorage.setItem("epub_reading_history", JSON.stringify(entries));

      const history = storage.getReadingHistory();
      expect(history.length).toBe(2);
      expect(history[0].bookId).toBe("test-book-1");
      expect(history[1].bookId).toBe("test-book-2");
    });

    it("should clear reading history", () => {
      const entries = [
        {
          bookId: "test-book-1",
          title: "Test Book 1",
          author: "Test Author",
          lastRead: "2023-01-01T12:00:00Z",
          progress: 0.3,
          chapterId: "chapter1",
        },
      ];

      mockLocalStorage.setItem("epub_reading_history", JSON.stringify(entries));

      storage.clearReadingHistory();

      const historyJson = mockLocalStorage.getItem("epub_reading_history");
      const history = JSON.parse(historyJson);
      expect(history.length).toBe(0);
    });
  });

  describe("deleteProcessedBook", () => {
    it("should delete book data and files", () => {
      const bookId = "test-book";

      // Setup mock data in localStorage
      mockLocalStorage.setItem(
        `epub_processed_${bookId}_data`,
        JSON.stringify({
          metadata: { title: "Test Book" },
          chapterIds: ["chapter1"],
        })
      );
      mockLocalStorage.setItem(
        `epub_processed_${bookId}_html_chapter1`,
        "<html><body>Chapter 1</body></html>"
      );
      mockLocalStorage.setItem(
        `epub_processed_${bookId}_index`,
        "<html><body>Index</body></html>"
      );
      mockLocalStorage.setItem(
        `epub_processed_${bookId}_css`,
        "body { font-family: serif; }"
      );
      mockLocalStorage.setItem(
        "epub_processed_index",
        JSON.stringify([
          {
            id: bookId,
            title: "Test Book",
            author: "Test Author",
            createdAt: "2023-01-01T12:00:00Z",
          },
          {
            id: "other-book",
            title: "Other",
            author: "Author",
            createdAt: "2023-01-01T12:00:00Z",
          },
        ])
      );

      // Call the method under test
      storage.deleteProcessedBook(bookId);

      // Check that items were removed from localStorage
      expect(
        mockLocalStorage.getItem(`epub_processed_${bookId}_data`)
      ).toBeNull();
      expect(
        mockLocalStorage.getItem(`epub_processed_${bookId}_html_chapter1`)
      ).toBeNull();
      expect(
        mockLocalStorage.getItem(`epub_processed_${bookId}_index`)
      ).toBeNull();
      expect(
        mockLocalStorage.getItem(`epub_processed_${bookId}_css`)
      ).toBeNull();

      // Check index was updated
      const indexJson = mockLocalStorage.getItem("epub_processed_index");
      const index = JSON.parse(indexJson);
      expect(index.length).toBe(1);
      expect(index[0].id).toBe("other-book");
    });
  });
});
