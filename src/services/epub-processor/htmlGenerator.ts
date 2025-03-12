import { Chapter, ProcessedBook, Resource, TocItem } from "./types";

/**
 * Generate HTML files from the processed book
 */
export async function generateHtml(book: ProcessedBook): Promise<{
  html: Map<string, string>;
  indexFile: string;
  css: string;
}> {
  // Normalize and combine CSS
  const normalizedCss = normalizeStyles(book.css);

  // Generate HTML for each chapter
  const htmlFiles = new Map<string, string>();
  for (const chapter of book.chapters) {
    htmlFiles.set(
      `chapter_${chapter.id}.html`,
      createChapterHtml(chapter, book)
    );
  }

  // Create index file with TOC
  const indexFile = createIndexHtml(book);

  return {
    html: htmlFiles,
    indexFile,
    css: normalizedCss,
  };
}

/**
 * Normalize and combine CSS styles
 */
function normalizeStyles(cssFiles: string[]): string {
  let combinedCss = "";

  // Simple combination of CSS files
  for (const css of cssFiles) {
    combinedCss += css + "\n\n";
  }

  // Add additional styles for the reader
  combinedCss += `
    /* Reader-specific styles */
    .epub-content {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.5;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .epub-chapter {
      break-after: always;
      padding-bottom: 2em;
    }
    
    img {
      max-width: 100%;
      height: auto;
    }
    
    /* Dark mode styles */
    .dark-mode .epub-content {
      background-color: #121212;
      color: #e0e0e0;
    }
    
    .dark-mode a {
      color: #90caf9;
    }
    
    /* Printing styles */
    @media print {
      .epub-chapter {
        page-break-after: always;
      }
    }
  `;

  return combinedCss;
}

/**
 * Create HTML for a chapter
 */
function createChapterHtml(chapter: Chapter, book: ProcessedBook): string {
  return `<!DOCTYPE html>
<html lang="${book.metadata.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${chapter.title} - ${book.metadata.title}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="epub-content">
  <div class="epub-chapter" id="${chapter.id}">
    <h1>${chapter.title}</h1>
    ${chapter.html}
  </div>
  <script>
    // Script to handle navigation and other interactive features
    document.addEventListener('DOMContentLoaded', function() {
      // Update resource paths
      updateResourcePaths();
      
      // Create navigation event listeners
      setupNavigation();
    });
    
    function updateResourcePaths() {
      // Update image sources, link hrefs, etc.
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        if (img.src && img.src.startsWith('file://')) {
          // Update to point to the correct resource location
          const path = img.src.split('/').pop();
          if (path) {
            img.src = 'resources/' + path;
          }
        }
      });
    }
    
    function setupNavigation() {
      // Add event listeners for navigation
    }
  </script>
</body>
</html>`;
}

/**
 * Create the index HTML file with table of contents
 */
function createIndexHtml(book: ProcessedBook): string {
  return `<!DOCTYPE html>
<html lang="${book.metadata.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${book.metadata.title}</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .toc-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .book-info {
      margin-bottom: 2em;
      padding-bottom: 1em;
      border-bottom: 1px solid #ccc;
    }
    
    .toc-list {
      list-style-type: none;
      padding-left: 0;
    }
    
    .toc-list li {
      margin-bottom: 0.5em;
    }
    
    .toc-list li a {
      text-decoration: none;
      color: #0066cc;
    }
    
    .toc-level-1 {
      padding-left: 1.5em;
    }
    
    .toc-level-2 {
      padding-left: 3em;
    }
    
    .dark-mode .toc-list li a {
      color: #90caf9;
    }
  </style>
</head>
<body>
  <div class="toc-container">
    <div class="book-info">
      <h1>${book.metadata.title}</h1>
      <p>${book.metadata.creator.join(", ")}</p>
      ${
        book.metadata.publisher
          ? `<p>Published by: ${book.metadata.publisher}</p>`
          : ""
      }
    </div>
    
    <h2>Table of Contents</h2>
    <ul class="toc-list">
      ${renderTocItems(book.toc, book)}
    </ul>
  </div>
</body>
</html>`;
}

/**
 * Render TOC items recursively
 */
function renderTocItems(items: TocItem[], book: ProcessedBook): string {
  let html = "";

  for (const item of items) {
    // Find the chapter that contains this TOC item
    const chapterId = findChapterIdByHref(item.href, book.chapters);

    html += `<li class="toc-item ${
      item.level > 0 ? `toc-level-${item.level}` : ""
    }">
      <a href="chapter_${chapterId}.html${
      item.href.includes("#") ? item.href.substring(item.href.indexOf("#")) : ""
    }">${item.title}</a>
    </li>`;

    if (item.children && item.children.length > 0) {
      html += renderTocItems(item.children, book);
    }
  }

  return html;
}

/**
 * Find the chapter ID that contains a given HREF
 */
function findChapterIdByHref(href: string, chapters: Chapter[]): string {
  // Extract the file path part (remove fragment)
  const filePath = href.split("#")[0];

  // Find the chapter that matches this path
  for (const chapter of chapters) {
    if (chapter.href === filePath) {
      return chapter.id;
    }
  }

  // Default to the first chapter if no match is found
  return chapters.length > 0 ? chapters[0].id : "unknown";
}
