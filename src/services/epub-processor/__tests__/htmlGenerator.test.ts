import { createMockProcessedBook } from "./setup";
import { generateHtml } from "../htmlGenerator";

describe("HTML Generator", () => {
  describe("generateHtml", () => {
    it("should generate HTML files from a processed book", async () => {
      const mockBook = createMockProcessedBook();

      const result = await generateHtml(mockBook);

      // Check that the result has the expected structure
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.html instanceof Map).toBe(true);
      expect(result.indexFile).toBeDefined();
      expect(result.css).toBeDefined();

      // Check that HTML was generated for each chapter
      expect(result.html.size).toBe(mockBook.chapters.length);

      // Check that the index file contains book title
      expect(result.indexFile).toContain(mockBook.metadata.title);

      // Check that CSS was processed
      expect(result.css).toContain("font-family");
    });

    it("should handle books with no chapters", async () => {
      const mockBook = createMockProcessedBook();
      mockBook.chapters = [];

      const result = await generateHtml(mockBook);

      expect(result.html.size).toBe(0);
      expect(result.indexFile).toBeDefined();
      expect(result.css).toBeDefined();
    });

    it("should handle books with no CSS", async () => {
      const mockBook = createMockProcessedBook();
      mockBook.css = [];

      const result = await generateHtml(mockBook);

      expect(result.css).toBeDefined();
      // Even with no CSS, we should have some default styles
      expect(result.css.length).toBeGreaterThan(0);
    });
  });
});
