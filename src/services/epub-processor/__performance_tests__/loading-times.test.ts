/**
 * Performance tests for measuring loading times and memory usage
 */

import {
  measureExecutionTime,
  formatBytes,
  getMemoryUsage,
  createTestBookOfSize,
} from "./performance-utils";
import { generateHtml } from "../htmlGenerator";
import { ProcessedBookStorage } from "../storageService";
import { setupMockStorage } from "../__tests__/setup";
import { ProcessedBook } from "../types";

describe("EPUB Reading Performance Tests", () => {
  let storage: ProcessedBookStorage;
  let mockLocalStorage: any;

  // Array to store books of different sizes along with their IDs
  const testBooks: { size: number; id: string; book: ProcessedBook }[] = [];

  // Setup test data - process books of different sizes and store them
  beforeAll(async () => {
    // Setup mock storage
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();

    // Create and store books of different sizes
    const bookSizes = [0.5, 1, 2, 5]; // sizes in MB

    for (const size of bookSizes) {
      const book = createTestBookOfSize(size);
      const { html, indexFile, css } = await generateHtml(book);
      const bookId = await storage.storeProcessedBook(
        book,
        html,
        indexFile,
        css
      );

      testBooks.push({
        size,
        id: bookId,
        book,
      });
    }
  }, 60000); // Longer timeout for setup

  describe("Retrieval Performance", () => {
    test.each(testBooks)(
      "Measures book metadata retrieval time for $size MB book",
      async ({ size, id }) => {
        // Measure memory before loading
        const memoryBefore = getMemoryUsage();

        // Measure retrieval time
        const { result, timeTakenMs } = await measureExecutionTime(async () => {
          return await storage.getProcessedBook(id);
        });

        // Measure memory after loading
        const memoryAfter = getMemoryUsage();

        // Log the results
        console.log(`\nResults for retrieving ${size}MB book metadata:`);
        console.log(`Retrieval time: ${timeTakenMs.toFixed(2)}ms`);

        if (memoryBefore && memoryAfter) {
          const heapUsedDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
          console.log(`Memory usage increase: ${formatBytes(heapUsedDiff)}`);
        }

        // Ensure the test passes with basic assertions
        expect(result).toBeDefined();
        expect(result.book).toBeDefined();
        expect(timeTakenMs).toBeGreaterThan(0);
      }
    );

    test.each(testBooks)(
      "Measures chapter content retrieval time for $size MB book",
      async ({ size, id, book }) => {
        // Get first chapter ID
        const chapterId = book.chapters[0].id;

        // Measure memory before loading
        const memoryBefore = getMemoryUsage();

        // Measure retrieval time for a chapter
        const { result, timeTakenMs } = await measureExecutionTime(async () => {
          return storage.getChapter(id, chapterId);
        });

        // Measure memory after loading
        const memoryAfter = getMemoryUsage();

        // Log the results
        console.log(`\nResults for retrieving chapter from ${size}MB book:`);
        console.log(`Chapter retrieval time: ${timeTakenMs.toFixed(2)}ms`);
        console.log(
          `Chapter content size: ${formatBytes(result?.length || 0)}`
        );

        if (memoryBefore && memoryAfter) {
          const heapUsedDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
          console.log(`Memory usage increase: ${formatBytes(heapUsedDiff)}`);
        }

        // Basic assertions
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      }
    );

    test.each(testBooks)(
      "Measures full book content retrieval time for $size MB book",
      async ({ size, id, book }) => {
        // Measure memory before loading
        const memoryBefore = getMemoryUsage();

        // First retrieve the book metadata
        const { result: bookData } = await measureExecutionTime(async () => {
          return await storage.getProcessedBook(id);
        });

        // Then measure the time to retrieve all chapters
        const { timeTakenMs } = await measureExecutionTime(async () => {
          const allChaptersPromises = book.chapters.map((chapter) =>
            storage.getChapter(id, chapter.id)
          );
          return await Promise.all(allChaptersPromises);
        });

        // Measure memory after loading
        const memoryAfter = getMemoryUsage();

        // Log the results
        console.log(
          `\nResults for retrieving all content from ${size}MB book:`
        );
        console.log(`Total chapters: ${book.chapters.length}`);
        console.log(`Full content retrieval time: ${timeTakenMs.toFixed(2)}ms`);
        console.log(
          `Average time per chapter: ${(
            timeTakenMs / book.chapters.length
          ).toFixed(2)}ms`
        );

        if (memoryBefore && memoryAfter) {
          const heapUsedDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
          console.log(`Memory usage increase: ${formatBytes(heapUsedDiff)}`);
          console.log(
            `Memory per chapter: ${formatBytes(
              heapUsedDiff / book.chapters.length
            )}`
          );
        }

        // Basic assertions
        expect(bookData).toBeDefined();
        expect(timeTakenMs).toBeGreaterThan(0);
      }
    );
  });
});
