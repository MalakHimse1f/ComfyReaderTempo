/**
 * Performance tests for measuring EPUB processing speed
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

describe("EPUB Processing Performance Tests", () => {
  let storage: ProcessedBookStorage;
  let mockLocalStorage: any;

  beforeEach(() => {
    // Setup fresh mock storage before each test
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();
  });

  // Test books of increasing sizes
  const bookSizes = [0.5, 1, 2, 5]; // sizes in MB

  test.each(bookSizes)(
    "Measures HTML generation speed for %dMB book",
    async (sizeInMB) => {
      // Create a test book of specified size
      const testBook = createTestBookOfSize(sizeInMB);

      // Measure memory before processing
      const memoryBefore = getMemoryUsage();

      // Measure HTML generation time
      const { timeTakenMs } = await measureExecutionTime(async () => {
        return await generateHtml(testBook);
      });

      // Measure memory after processing
      const memoryAfter = getMemoryUsage();

      // Log the results
      console.log(`\nResults for ${sizeInMB}MB book:`);
      console.log(`HTML generation time: ${timeTakenMs.toFixed(2)}ms`);

      if (memoryBefore && memoryAfter) {
        const heapUsedDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
        console.log(`Memory usage increase: ${formatBytes(heapUsedDiff)}`);
      }

      // Ensure the test passes by making a basic assertion
      expect(timeTakenMs).toBeGreaterThan(0);
    },
    // Set a longer timeout for larger books
    30000
  );

  test.each(bookSizes)(
    "Measures storage speed for %dMB book",
    async (sizeInMB) => {
      // Create a test book of specified size
      const testBook = createTestBookOfSize(sizeInMB);

      // Generate HTML first
      const { html, indexFile, css } = await generateHtml(testBook);

      // Measure storage time
      const { timeTakenMs } = await measureExecutionTime(async () => {
        return await storage.storeProcessedBook(testBook, html, indexFile, css);
      });

      // Get the approximate size of stored data
      const bookData = JSON.stringify(testBook);
      const htmlSize = Array.from(html.values()).reduce(
        (size, content) => size + content.length,
        0
      );
      const totalStoredBytes =
        bookData.length + htmlSize + indexFile.length + css.length;

      // Log the results
      console.log(`\nResults for storing ${sizeInMB}MB book:`);
      console.log(`Storage time: ${timeTakenMs.toFixed(2)}ms`);
      console.log(`Total stored data size: ${formatBytes(totalStoredBytes)}`);
      console.log(
        `Storage speed: ${formatBytes(
          totalStoredBytes / (timeTakenMs / 1000)
        )}/s`
      );

      // Ensure the test passes by making a basic assertion
      expect(timeTakenMs).toBeGreaterThan(0);
    },
    // Set a longer timeout for larger books
    30000
  );

  test.each(bookSizes)(
    "Measures full processing pipeline speed for %dMB book",
    async (sizeInMB) => {
      // Create a test book of specified size
      const testBook = createTestBookOfSize(sizeInMB);

      // Measure memory before processing
      const memoryBefore = getMemoryUsage();

      // Measure the entire pipeline: HTML generation + storage
      const { timeTakenMs } = await measureExecutionTime(async () => {
        const { html, indexFile, css } = await generateHtml(testBook);
        const bookId = await storage.storeProcessedBook(
          testBook,
          html,
          indexFile,
          css
        );
        return bookId;
      });

      // Measure memory after processing
      const memoryAfter = getMemoryUsage();

      // Log the results
      console.log(
        `\nResults for full pipeline processing of ${sizeInMB}MB book:`
      );
      console.log(`Total processing time: ${timeTakenMs.toFixed(2)}ms`);
      console.log(
        `Processing speed: ${formatBytes(
          (sizeInMB * 1024 * 1024) / (timeTakenMs / 1000)
        )}/s`
      );

      if (memoryBefore && memoryAfter) {
        const heapUsedDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
        console.log(`Memory usage increase: ${formatBytes(heapUsedDiff)}`);
      }

      // Ensure the test passes by making a basic assertion
      expect(timeTakenMs).toBeGreaterThan(0);
    },
    // Set a longer timeout for larger books
    30000
  );
});
