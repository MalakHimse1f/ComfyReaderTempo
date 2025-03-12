/**
 * Test setup and utilities for EPUB processor tests
 */

import * as fs from "fs";
import * as path from "path";
import { ProcessedBook, Chapter, Resource } from "../types";

/**
 * Load a test EPUB file from the fixtures directory
 */
export function loadTestEpub(filename: string): Buffer {
  try {
    const fixturePath = path.join(__dirname, "fixtures", filename);
    if (fs.existsSync(fixturePath)) {
      return fs.readFileSync(fixturePath);
    }
    console.warn(
      `Test EPUB file ${filename} not found. Returning mock content.`
    );
    return Buffer.from("mock epub content");
  } catch (error) {
    console.error("Error loading test EPUB:", error);
    return Buffer.from("");
  }
}

/**
 * Mock implementation of localStorage for testing
 */
export class MockStorage {
  private store: Record<string, string> = {};

  getItem = jest.fn((key: string): string | null => {
    return this.store[key] || null;
  });

  setItem = jest.fn((key: string, value: string): void => {
    this.store[key] = value;
  });

  removeItem = jest.fn((key: string): void => {
    delete this.store[key];
  });

  clear = jest.fn((): void => {
    this.store = {};
  });

  key = jest.fn((index: number): string | null => {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  });

  get length(): number {
    return Object.keys(this.store).length;
  }
}

/**
 * Setup mock localStorage for testing
 */
export function setupMockStorage(): MockStorage {
  const mockStorage = new MockStorage();

  // Replace global localStorage with our mock
  Object.defineProperty(global, "localStorage", {
    value: mockStorage,
    writable: true,
  });

  return mockStorage;
}

/**
 * Create a mock ProcessedBook object for testing
 */
export function createMockProcessedBook(): ProcessedBook {
  // Create Blobs from buffer data
  const cssBlob = new Blob(["body { font-family: serif; }"], {
    type: "text/css",
  });
  const imageBlob = new Blob(["mock image data"], { type: "image/jpeg" });

  return {
    id: "test-book-id",
    metadata: {
      title: "Test Book",
      creator: ["Test Author"],
      language: "en",
      publisher: "Test Publisher",
      identifier: "urn:isbn:123456789",
    },
    chapters: [
      {
        id: "chapter1",
        href: "chapter1.xhtml",
        title: "Chapter 1",
        order: 1,
        html: "Chapter 1 content",
      },
      {
        id: "chapter2",
        href: "chapter2.xhtml",
        title: "Chapter 2",
        order: 2,
        html: "Chapter 2 content",
      },
      {
        id: "chapter3",
        href: "chapter3.xhtml",
        title: "Chapter 3",
        order: 3,
        html: "Chapter 3 content",
      },
    ],
    toc: [
      {
        title: "Chapter 1",
        href: "chapter1.xhtml",
        level: 1,
        children: [],
      },
      {
        title: "Chapter 2",
        href: "chapter2.xhtml",
        level: 1,
        children: [
          {
            title: "Section 2.1",
            href: "chapter2.xhtml#section1",
            level: 2,
            children: [],
          },
          {
            title: "Section 2.2",
            href: "chapter2.xhtml#section2",
            level: 2,
            children: [],
          },
        ],
      },
      {
        title: "Chapter 3",
        href: "chapter3.xhtml",
        level: 1,
        children: [],
      },
    ],
    resources: new Map<string, Resource>([
      [
        "css/style.css",
        {
          id: "style",
          href: "css/style.css",
          mediaType: "text/css",
          data: cssBlob,
        },
      ],
      [
        "images/cover.jpg",
        {
          id: "cover",
          href: "images/cover.jpg",
          mediaType: "image/jpeg",
          data: imageBlob,
        },
      ],
    ]),
    css: ["body { font-family: serif; }"],
  };
}

/**
 * Create mock HTML content for a chapter
 */
export function createMockHtmlContent(chapterId: string): string {
  return `
    <div id="epub-chapter-${chapterId}" class="epub-chapter">
      <h1>Chapter Title for ${chapterId}</h1>
      <p>This is a paragraph of content for testing purposes in ${chapterId}.</p>
      <p>Additional paragraph with <b>bold</b> and <i>italic</i> text.</p>
    </div>
  `;
}
