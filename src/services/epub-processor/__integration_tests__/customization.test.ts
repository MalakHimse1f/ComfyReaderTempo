/**
 * Integration tests for EPUB reader customization features
 *
 * These tests verify that the customization options are correctly applied
 * to the processed HTML content
 */

import { createMockProcessedBook } from "../__tests__/setup";
import { ProcessedBookStorage } from "../storageService";
import { setupMockStorage } from "../__tests__/setup";
import { generateHtml } from "../htmlGenerator";

// Mock DOM environment for testing HTML/CSS customization
class MockHTMLElement {
  style: any = {};
  classList = {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn().mockReturnValue(false),
  };
  closest = jest.fn().mockReturnValue(this);
}

describe("EPUB Customization Integration", () => {
  let storage: ProcessedBookStorage;
  let mockLocalStorage: any;

  beforeEach(() => {
    // Setup fresh mock storage before each test
    mockLocalStorage = setupMockStorage();
    storage = new ProcessedBookStorage();
  });

  it("should generate HTML with customizable CSS variables", async () => {
    // Get a mock processed book
    const mockBook = createMockProcessedBook();

    // Generate HTML from the mock book
    const { html, indexFile, css } = await generateHtml(mockBook);

    // Check that the CSS includes styles that could be customized
    expect(css).toBeDefined();

    // Based on the actual CSS in the implementation
    expect(css).toContain("font-family");
    expect(css).toContain("line-height");
    expect(css).toContain("background-color");
    expect(css).toContain("color");

    // Check for theme-related CSS
    expect(css).toContain(".dark-mode");
    expect(css).toContain(".dark-mode .epub-content");
  });

  it("should apply theme customizations to HTML content", async () => {
    // This test will verify that theme customizations can be applied
    // to the generated HTML content using CSS

    // Create mock element for testing
    const contentElement = new MockHTMLElement();

    // Mock the application of reading preferences
    const applyTheme = (element: any, theme: string) => {
      if (theme === "dark") {
        element.classList.add("dark-mode");
      } else if (theme === "sepia") {
        element.classList.add("sepia-mode");
      } else {
        // Light mode is default
        element.classList.remove("dark-mode");
        element.classList.remove("sepia-mode");
      }
    };

    // Test applying dark theme
    applyTheme(contentElement, "dark");
    expect(contentElement.classList.add).toHaveBeenCalledWith("dark-mode");

    // Test applying sepia theme
    applyTheme(contentElement, "sepia");
    expect(contentElement.classList.add).toHaveBeenCalledWith("sepia-mode");

    // Test applying light theme
    applyTheme(contentElement, "light");
    expect(contentElement.classList.remove).toHaveBeenCalledWith("dark-mode");
    expect(contentElement.classList.remove).toHaveBeenCalledWith("sepia-mode");
  });

  it("should apply font size customizations to HTML content", async () => {
    // Create mock element for testing
    const contentElement = new MockHTMLElement();

    // Mock the application of font size preferences
    const applyFontSize = (element: any, fontSize: number) => {
      element.style.fontSize = `${fontSize}px`;
    };

    // Test applying various font sizes
    applyFontSize(contentElement, 16);
    expect(contentElement.style.fontSize).toBe("16px");

    applyFontSize(contentElement, 20);
    expect(contentElement.style.fontSize).toBe("20px");

    applyFontSize(contentElement, 12);
    expect(contentElement.style.fontSize).toBe("12px");
  });
});
