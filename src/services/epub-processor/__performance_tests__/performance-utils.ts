/**
 * Utility functions for performance testing
 */

import { ProcessedBook, Resource } from "../types";

/**
 * Measures the execution time of a function
 * @param fn Function to measure
 * @returns Result of the function and time taken in milliseconds
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; timeTakenMs: number }> {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();

  return {
    result,
    timeTakenMs: endTime - startTime,
  };
}

/**
 * Formats bytes to a human-readable size
 * @param bytes Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Gets the current memory usage if supported by the environment
 * Note: In browser environments, this might require performance.memory which is non-standard
 * In Node.js, this uses process.memoryUsage()
 * @returns Memory usage information or null if not available
 */
export function getMemoryUsage(): Record<string, number> | null {
  if (typeof process !== "undefined" && process.memoryUsage) {
    // Node.js environment
    const { heapUsed, heapTotal, rss } = process.memoryUsage();
    return {
      heapUsed,
      heapTotal,
      rss,
    };
  }

  if (typeof performance !== "undefined" && (performance as any).memory) {
    // Chrome browser environment
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
    };
  }

  return null;
}

/**
 * Creates a test book of a specific size by repeating content
 * @param sizeInMB Approximate size of the book in MB
 * @returns Mock book data of the specified size
 */
export function createTestBookOfSize(sizeInMB: number): ProcessedBook {
  // Each character is roughly 1 byte
  const targetSizeInBytes = sizeInMB * 1024 * 1024;

  // Create a base chapter content
  const baseChapterContent = `
    <h1>Test Chapter</h1>
    <p>This is a paragraph of test content. It contains various words and sentences to make it somewhat realistic.</p>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec auctor, nisl eget ultricies tincidunt, nisl nisl aliquam nisl, eget ultricies nisl nisl eget nisl.</p>
  `.repeat(50); // Repeat to make it substantial

  const baseChapterSizeBytes = baseChapterContent.length;
  const numChaptersNeeded = Math.ceil(targetSizeInBytes / baseChapterSizeBytes);

  // Create a test book with the required number of chapters
  const chapters = [];
  for (let i = 0; i < numChaptersNeeded; i++) {
    chapters.push({
      id: `chapter-${i}`,
      href: `chapter-${i}.xhtml`,
      title: `Chapter ${i + 1}`,
      order: i,
      html: baseChapterContent,
    });
  }

  // Create resources map
  const resourcesMap = new Map<string, Resource>();

  return {
    id: `test-book-${sizeInMB}mb`,
    metadata: {
      title: `Test Book (${sizeInMB}MB)`,
      creator: ["Performance Tester"],
      language: "en",
      publisher: "Performance Tests, Inc.",
      identifier: `test-book-id-${sizeInMB}mb`,
      rights: "Public Domain",
      publicationDate: new Date().toISOString(),
    },
    chapters,
    toc: chapters.map((chapter) => ({
      title: chapter.title,
      href: chapter.href,
      id: chapter.id,
      level: 1,
      children: [],
    })),
    resources: resourcesMap,
    css: ["body { font-family: serif; }"],
  };
}
