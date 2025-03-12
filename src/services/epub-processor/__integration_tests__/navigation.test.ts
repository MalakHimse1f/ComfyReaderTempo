/**
 * Integration tests for EPUB navigation and TOC functionality
 *
 * These tests verify that the navigation structure is correctly processed and accessible
 */

import { createMockProcessedBook } from "../__tests__/setup";
import { ProcessedBookStorage } from "../storageService";
import { setupMockStorage } from "../__tests__/setup";
import { generateHtml } from "../htmlGenerator";

describe("EPUB Navigation and TOC Integration", () => {
  let storage: ProcessedBookStorage;
  let mockLocalStorage: any;

  beforeEach(() => {
    // Setup fresh mock storage before each test
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();
  });

  it("should correctly process and store TOC structure", async () => {
    // Get a mock processed book with TOC
    const mockBook = createMockProcessedBook();

    // Generate HTML from the mock book
    const { html, indexFile, css } = await generateHtml(mockBook);

    // Store the processed book
    const bookId = await storage.storeProcessedBook(
      mockBook,
      html,
      indexFile,
      css
    );

    // Retrieve the stored book
    const retrievedBook = await storage.getProcessedBook(bookId);

    // Verify TOC was correctly stored and retrieved
    expect(retrievedBook.book).toBeDefined();
    expect(retrievedBook.indexFile).toContain("Table of Contents"); // The index should have TOC

    // We need to check the book data for TOC - using 'as any' for now due to type issues
    const bookData = retrievedBook.book as any;
    expect(bookData.toc).toBeDefined();

    // If we can access the TOC, verify its structure matches the original
    if (bookData.toc) {
      expect(bookData.toc.length).toBe(mockBook.toc.length);

      // Check first chapter title
      expect(bookData.toc[0].title).toBe(mockBook.toc[0].title);

      // Check that nested TOC items are preserved
      if (mockBook.toc[1].children.length > 0) {
        expect(bookData.toc[1].children).toBeDefined();
        expect(bookData.toc[1].children.length).toBe(
          mockBook.toc[1].children.length
        );
      }
    }
  });

  it("should generate HTML index with working navigation links", async () => {
    // Get a mock processed book
    const mockBook = createMockProcessedBook();

    // Generate HTML from the mock book
    const { html, indexFile, css } = await generateHtml(mockBook);

    // Store the processed book
    const bookId = await storage.storeProcessedBook(
      mockBook,
      html,
      indexFile,
      css
    );

    // Verify that the index file contains links to all chapters
    for (const chapter of mockBook.chapters) {
      // Check that index contains links to each chapter
      // Using the actual format from the implementation: chapter_[id].html
      expect(indexFile).toContain(`href="chapter_${chapter.id}.html"`);
    }

    // Verify TOC structure in index
    expect(indexFile).toContain("Table of Contents");

    // Check that TOC items have correct hrefs
    mockBook.toc.forEach((tocItem) => {
      // Extract the chapter ID from the href
      const hrefMatch = tocItem.href.match(/([^#/]+)\.xhtml/);
      if (hrefMatch && hrefMatch[1]) {
        const chapterId = hrefMatch[1];

        // TOC in index file should have links to chapters
        expect(indexFile).toContain(`href="chapter_${chapterId}.html"`);
        expect(indexFile).toContain(tocItem.title);
      }
    });
  });
});
