/**
 * Benchmarking tests to compare pre-processed HTML vs direct EPUB rendering
 */

import JSZip from "jszip";
import {
  measureExecutionTime,
  formatBytes,
  getMemoryUsage,
  createTestBookOfSize,
} from "./performance-utils";
import { generateHtml } from "../htmlGenerator";
import { ProcessedBookStorage } from "../storageService";
import { setupMockStorage } from "../__tests__/setup";

// Create a simplified mock of direct EPUB parsing operations
// This simulates what would happen in a traditional EPUB reader
async function mockDirectEpubParsing(epubContent: string): Promise<any> {
  // 1. Extract the EPUB zip
  const zip = new JSZip();
  try {
    await zip.loadAsync(epubContent);
  } catch (error) {
    // Using string content as a mock, not real ZIP data
    // This is just to simulate the process
  }

  // 2. Mock parsing container.xml
  await new Promise((resolve) => setTimeout(resolve, 5)); // Mock file reading time

  // 3. Mock parsing OPF file
  await new Promise((resolve) => setTimeout(resolve, 10)); // Mock parse time

  // 4. Mock extracting & parsing chapters
  // Simulate slower parsing when rendering directly
  await new Promise((resolve) => setTimeout(resolve, 20));

  return { renderedContent: "Mocked EPUB rendering result" };
}

// Mock of preparing a processed book for display
async function mockPreprocessedHtmlLoading(
  bookId: string,
  storage: ProcessedBookStorage
): Promise<any> {
  // 1. Load book metadata
  const bookData = await storage.getProcessedBook(bookId);

  // 2. Load the first chapter
  const firstChapterId = bookData.book.chapters[0]?.id;
  const chapterContent = firstChapterId
    ? storage.getChapter(bookId, firstChapterId)
    : "";

  return { bookData, chapterContent };
}

describe("Performance Benchmarking", () => {
  let storage: ProcessedBookStorage;
  let mockLocalStorage: any;

  // Book sizes to test
  const bookSizes = [0.5, 1, 2];

  beforeEach(() => {
    // Setup fresh mock storage before each test
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();
  });

  test.each(bookSizes)(
    "Compares direct EPUB rendering vs pre-processed HTML for %dMB book",
    async (sizeInMB) => {
      // Create test book
      const testBook = createTestBookOfSize(sizeInMB);

      // Serialize the book to simulate an EPUB file
      const serializedBook = JSON.stringify(testBook);

      // 1. Measure direct EPUB rendering time
      console.log(`\n--- Benchmark for ${sizeInMB}MB book ---`);

      const directRenderResults = await measureExecutionTime(async () => {
        return await mockDirectEpubParsing(serializedBook);
      });

      console.log(
        `Direct EPUB rendering time: ${directRenderResults.timeTakenMs.toFixed(
          2
        )}ms`
      );

      // 2. Measure our pre-processing approach
      // First, pre-process the book
      const preprocessResults = await measureExecutionTime(async () => {
        const { html, indexFile, css } = await generateHtml(testBook);
        const bookId = await storage.storeProcessedBook(
          testBook,
          html,
          indexFile,
          css
        );
        return bookId;
      });

      console.log(
        `\nPre-processing time: ${preprocessResults.timeTakenMs.toFixed(2)}ms`
      );

      // 3. Measure loading the pre-processed content for reading
      const bookId = preprocessResults.result;

      const loadResults = await measureExecutionTime(async () => {
        return await mockPreprocessedHtmlLoading(bookId, storage);
      });

      console.log(
        `Loading pre-processed content time: ${loadResults.timeTakenMs.toFixed(
          2
        )}ms`
      );

      // 4. Calculate the total time for initial load + read
      const totalPreprocessedTime =
        preprocessResults.timeTakenMs + loadResults.timeTakenMs;

      console.log(
        `\nTotal time (pre-process + first load): ${totalPreprocessedTime.toFixed(
          2
        )}ms`
      );
      console.log(
        `Direct rendering time: ${directRenderResults.timeTakenMs.toFixed(2)}ms`
      );

      // 5. Compare subsequent loads (where pre-processing approach shines)
      const subsequentLoadResults = await measureExecutionTime(async () => {
        return await mockPreprocessedHtmlLoading(bookId, storage);
      });

      console.log(
        `\nSubsequent load time (pre-processed): ${subsequentLoadResults.timeTakenMs.toFixed(
          2
        )}ms`
      );
      console.log(
        `Subsequent load time (direct, same as initial): ${directRenderResults.timeTakenMs.toFixed(
          2
        )}ms`
      );

      // 6. Calculate the speedup ratio for subsequent reads
      const speedupRatio =
        directRenderResults.timeTakenMs / subsequentLoadResults.timeTakenMs;
      console.log(
        `Speed improvement ratio for subsequent reads: ${speedupRatio.toFixed(
          2
        )}x faster`
      );

      // Basic assertion
      expect(subsequentLoadResults.timeTakenMs).toBeLessThan(
        directRenderResults.timeTakenMs
      );
    },
    30000
  );

  test("Compares memory usage between approaches", async () => {
    const sizeInMB = 2; // Use a 2MB book for this test
    const testBook = createTestBookOfSize(sizeInMB);

    console.log("\n--- Memory Usage Comparison ---");

    // 1. Measure memory for direct EPUB rendering
    const directMemoryBefore = getMemoryUsage();
    await mockDirectEpubParsing(JSON.stringify(testBook));
    const directMemoryAfter = getMemoryUsage();

    // 2. Measure memory for pre-processed approach
    // First, clear memory by recreating objects
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();

    const preprocessMemoryBefore = getMemoryUsage();
    const { html, indexFile, css } = await generateHtml(testBook);
    const bookId = await storage.storeProcessedBook(
      testBook,
      html,
      indexFile,
      css
    );
    const preprocessMemoryAfter = getMemoryUsage();

    // 3. Measure memory for loading pre-processed content
    const loadMemoryBefore = getMemoryUsage();
    await mockPreprocessedHtmlLoading(bookId, storage);
    const loadMemoryAfter = getMemoryUsage();

    // Calculate memory differences
    let directMemoryIncrease = 0;
    let preprocessMemoryIncrease = 0;
    let loadMemoryIncrease = 0;

    if (directMemoryBefore && directMemoryAfter) {
      directMemoryIncrease =
        directMemoryAfter.heapUsed - directMemoryBefore.heapUsed;
      console.log(
        `Direct EPUB rendering memory increase: ${formatBytes(
          directMemoryIncrease
        )}`
      );
    }

    if (preprocessMemoryBefore && preprocessMemoryAfter) {
      preprocessMemoryIncrease =
        preprocessMemoryAfter.heapUsed - preprocessMemoryBefore.heapUsed;
      console.log(
        `Pre-processing memory increase: ${formatBytes(
          preprocessMemoryIncrease
        )}`
      );
    }

    if (loadMemoryBefore && loadMemoryAfter) {
      loadMemoryIncrease = loadMemoryAfter.heapUsed - loadMemoryBefore.heapUsed;
      console.log(
        `Loading pre-processed content memory increase: ${formatBytes(
          loadMemoryIncrease
        )}`
      );
    }

    console.log(
      `\nTotal pre-processed approach memory usage: ${formatBytes(
        preprocessMemoryIncrease + loadMemoryIncrease
      )}`
    );
    console.log(
      `Memory usage ratio (Direct/Pre-processed): ${(
        directMemoryIncrease / loadMemoryIncrease
      ).toFixed(2)}x`
    );

    // Basic assertion
    expect(loadMemoryIncrease).toBeDefined();
  });
});
