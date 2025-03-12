import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';

// Main EPUB Reader component
const EpubReader = ({ file, onError }) => {
const [book, setBook] = useState(null);
const [metadata, setMetadata] = useState({});
const [spine, setSpine] = useState([]);
const [toc, setToc] = useState([]);
const [currentChapter, setCurrentChapter] = useState(0);
const [isLoading, setIsLoading] = useState(true);
const [chapterContent, setChapterContent] = useState(null);
const [totalPages, setTotalPages] = useState(0);
const [currentPage, setCurrentPage] = useState(1);

const contentRef = useRef(null);
const observerRef = useRef(null);
const chapterRefs = useRef({});
const basePath = useRef('');

// Initialize reader
useEffect(() => {
if (file) {
loadEpub(file);
}

    return () => {
      // Clean up any resources when component unmounts
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };

}, [file]);

// Setup intersection observer for lazy loading
useEffect(() => {
if (contentRef.current && book) {
setupLazyLoading();
}
}, [chapterContent, book]);

// Load EPUB file
const loadEpub = async (file) => {
try {
setIsLoading(true);

      // Read file as ArrayBuffer
      const arrayBuffer = await readFileAsArrayBuffer(file);

      // Load with JSZip
      const zip = await JSZip.loadAsync(arrayBuffer);
      setBook(zip);

      // Parse container.xml to find content.opf
      const containerXml = await zip.file("META-INF/container.xml").async("text");
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(containerXml, "application/xml");
      const rootfilePath = containerDoc.querySelector("rootfile").getAttribute("full-path");

      // Store base path for resolving relative paths
      basePath.current = rootfilePath.substring(0, rootfilePath.lastIndexOf("/") + 1);

      // Parse content.opf
      const contentOpf = await zip.file(rootfilePath).async("text");
      const contentDoc = parser.parseFromString(contentOpf, "application/xml");

      // Extract metadata
      const meta = parseMetadata(contentDoc);
      setMetadata(meta);

      // Parse manifest and spine
      const { manifest, spineItems } = parseManifest(contentDoc, basePath.current);
      setSpine(spineItems);

      // Parse TOC
      const tocItems = await parseToc(zip, contentDoc, manifest, basePath.current, spineItems);
      setToc(tocItems);

      // Load first chapter
      if (spineItems.length > 0) {
        await loadChapter(0);
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Error loading EPUB:", error);
      if (onError) onError(error);
      setIsLoading(false);
    }

};

// Read file as ArrayBuffer
const readFileAsArrayBuffer = (file) => {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = (e) => resolve(e.target.result);
reader.onerror = (e) => reject(e.target.error);
reader.readAsArrayBuffer(file);
});
};

// Parse metadata from content.opf
const parseMetadata = (contentDoc) => {
const metadataNode = contentDoc.querySelector("metadata");
const meta = {};

    if (metadataNode) {
      const getValue = (selector) => {
        const el = metadataNode.querySelector(selector);
        return el ? el.textContent.trim() : null;
      };

      meta.title = getValue("dc\\:title") || getValue("title");
      meta.creator = getValue("dc\\:creator") || getValue("creator");
      meta.language = getValue("dc\\:language") || getValue("language");
      meta.publisher = getValue("dc\\:publisher") || getValue("publisher");
      meta.identifier = getValue("dc\\:identifier") || getValue("identifier");
    }

    return meta;

};

// Parse manifest and spine
const parseManifest = (contentDoc, basePath) => {
const manifest = {};
const spineItems = [];

    // Parse manifest items
    contentDoc.querySelectorAll("manifest > item").forEach(item => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      const mediaType = item.getAttribute("media-type");

      manifest[id] = {
        href: resolveHref(href, basePath),
        mediaType
      };
    });

    // Parse spine
    contentDoc.querySelectorAll("spine > itemref").forEach((itemref, index) => {
      const idref = itemref.getAttribute("idref");
      const linear = itemref.getAttribute("linear") !== "no";

      if (manifest[idref]) {
        spineItems.push({
          id: idref,
          href: manifest[idref].href,
          mediaType: manifest[idref].mediaType,
          linear,
          index
        });
      }
    });

    return { manifest, spineItems };

};

// Parse TOC (supports both EPUB2 NCX and EPUB3 Navigation Document)
const parseToc = async (zip, contentDoc, manifest, basePath, spineItems) => {
// Find TOC file
let tocPath = null;
let tocItems = [];

    // Try EPUB3 method first
    const navItem = contentDoc.querySelector('item[properties~="nav"]');
    if (navItem) {
      tocPath = resolveHref(navItem.getAttribute("href"), basePath);
    } else {
      // Fallback to EPUB2 method
      const ncxId = contentDoc.querySelector("spine").getAttribute("toc");
      if (ncxId && manifest[ncxId]) {
        tocPath = manifest[ncxId].href;
      }
    }

    if (tocPath) {
      try {
        const tocContent = await zip.file(tocPath).async("text");
        const tocDoc = new DOMParser().parseFromString(tocContent, "application/xhtml+xml");

        // Check for EPUB3 nav
        const navElement = tocDoc.querySelector('nav[epub\\:type="toc"]');
        if (navElement) {
          const navOl = navElement.querySelector('ol');
          if (navOl) {
            tocItems = parseNavList(navOl, basePath, spineItems);
          }
        } else {
          // Fallback to EPUB2 NCX
          const navPoints = tocDoc.querySelectorAll("navMap > navPoint");
          if (navPoints.length > 0) {
            tocItems = parseNcxNavPoints(navPoints, basePath, spineItems);
          }
        }
      } catch (error) {
        console.warn("Error parsing TOC:", error);
      }
    }

    // Create default TOC if none found
    if (tocItems.length === 0) {
      tocItems = spineItems.map((item, i) => ({
        title: `Chapter ${i + 1}`,
        href: item.href,
        index: i
      }));
    }

    return tocItems;

};

// Parse EPUB3 navigation list
const parseNavList = (ol, basePath, spineItems, level = 0) => {
const items = [];
ol.querySelectorAll(":scope > li").forEach(li => {
const link = li.querySelector("a");
if (link) {
const href = link.getAttribute("href");
const title = link.textContent.trim();
const resolvedHref = resolveHref(href.split("#")[0], basePath);

        // Find spine index
        const spineIndex = spineItems.findIndex(item =>
          item.href === resolvedHref || resolvedHref.startsWith(item.href)
        );

        const tocItem = {
          title,
          href: resolveHref(href, basePath),
          index: spineIndex !== -1 ? spineIndex : 0,
          level,
          children: []
        };

        // Parse nested lists
        const nestedList = li.querySelector(":scope > ol");
        if (nestedList) {
          tocItem.children = parseNavList(nestedList, basePath, spineItems, level + 1);
        }

        items.push(tocItem);
      }
    });

    return items;

};

// Parse EPUB2 NCX nav points
const parseNcxNavPoints = (navPoints, basePath, spineItems, level = 0) => {
const items = [];

    navPoints.forEach(navPoint => {
      const labelEl = navPoint.querySelector("navLabel text");
      const contentEl = navPoint.querySelector("content");

      if (labelEl && contentEl) {
        const title = labelEl.textContent.trim();
        const src = contentEl.getAttribute("src");
        const resolvedHref = resolveHref(src.split("#")[0], basePath);

        // Find spine index
        const spineIndex = spineItems.findIndex(item =>
          item.href === resolvedHref || resolvedHref.startsWith(item.href)
        );

        const tocItem = {
          title,
          href: resolveHref(src, basePath),
          index: spineIndex !== -1 ? spineIndex : 0,
          level,
          children: []
        };

        // Parse child nav points
        const childNavPoints = navPoint.querySelectorAll(":scope > navPoint");
        if (childNavPoints.length > 0) {
          tocItem.children = parseNcxNavPoints(childNavPoints, basePath, spineItems, level + 1);
        }

        items.push(tocItem);
      }
    });

    return items;

};

// Load a specific chapter
const loadChapter = async (index) => {
if (!book || index < 0 || index >= spine.length) return;

    try {
      setIsLoading(true);
      const chapter = spine[index];

      // Load chapter content
      const content = await book.file(chapter.href).async("text");

      // Parse HTML
      const doc = new DOMParser().parseFromString(content, "application/xhtml+xml");

      // Process content
      await processChapterContent(doc, chapter.href);

      // Set current chapter and content
      setCurrentChapter(index);
      setChapterContent(doc.body.innerHTML);

      // Reset pagination (if using paginated mode)
      calculatePagination();
      setCurrentPage(1);

      setIsLoading(false);
    } catch (error) {
      console.error("Error loading chapter:", error);
      setIsLoading(false);
    }

};

// Process chapter content (fix URLs, load resources)
const processChapterContent = async (doc, chapterPath) => {
const chapterDir = chapterPath.substring(0, chapterPath.lastIndexOf("/") + 1);

    // Process images
    const images = doc.querySelectorAll("img");
    for (const img of images) {
      const src = img.getAttribute("src");
      if (src && !src.startsWith("data:")) {
        img.setAttribute("data-src", resolveHref(src, chapterDir));
        img.setAttribute("src", "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3C/svg%3E");
        img.classList.add("epub-image");
      }
    }

    // Process stylesheets
    const links = doc.querySelectorAll("link[rel='stylesheet']");
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href) {
        try {
          const stylePath = resolveHref(href, chapterDir);
          const styleContent = await book.file(stylePath).async("text");

          // Create style element
          const style = doc.createElement("style");
          style.textContent = fixCssUrls(styleContent, stylePath);

          // Replace link with style
          link.parentNode.replaceChild(style, link);
        } catch (error) {
          console.warn(`Failed to load stylesheet: ${href}`, error);
        }
      }
    }

    // Fix inline styles
    const styles = doc.querySelectorAll("style");
    for (const style of styles) {
      style.textContent = fixCssUrls(style.textContent, chapterPath);
    }

    // Process internal links
    const links = doc.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href && !href.startsWith("#") && !href.includes("://")) {
        link.setAttribute("data-internal-link", href);

        // Add class for styling
        link.classList.add("epub-internal-link");
      }
    }

    return doc;

};

// Fix CSS URLs
const fixCssUrls = (css, basePath) => {
return css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, url) => {
if (url.startsWith("data:") || url.includes("://")) {
return match;
}
return `url("data-epub-url:${resolveHref(url, basePath)}")`;
});
};

// Resolve relative URLs
const resolveHref = (href, base) => {
if (!href) return "";

    // Handle absolute paths
    if (href.startsWith("/")) {
      return href.substring(1);
    }

    // Handle relative paths
    return base + href;

};

// Setup lazy loading for images and resources
const setupLazyLoading = () => {
// Clean up previous observer
if (observerRef.current) {
observerRef.current.disconnect();
}

    // Create new IntersectionObserver
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const element = entry.target;

          // Handle lazy loading of images
          if (element.classList.contains("epub-image") && element.dataset.src) {
            try {
              const imageData = await book.file(element.dataset.src).async("blob");
              const url = URL.createObjectURL(imageData);
              element.onload = () => URL.revokeObjectURL(url);
              element.src = url;
              observerRef.current.unobserve(element);
            } catch (error) {
              console.warn(`Failed to load image: ${element.dataset.src}`, error);
            }
          }
        }
      });
    }, {
      rootMargin: "200px 0px" // Load images when they're within 200px of viewport
    });

    // Observe images
    if (contentRef.current) {
      const images = contentRef.current.querySelectorAll(".epub-image");
      images.forEach(img => observerRef.current.observe(img));
    }

};

// Calculate pagination
const calculatePagination = () => {
if (!contentRef.current) return;

    // For a simple approach, just use content height and viewport
    const contentHeight = contentRef.current.scrollHeight;
    const viewportHeight = contentRef.current.clientHeight;
    const pages = Math.ceil(contentHeight / viewportHeight);

    setTotalPages(pages > 0 ? pages : 1);

};

// Handle page navigation
const goToPage = (page) => {
if (!contentRef.current) return;

    const newPage = Math.max(1, Math.min(page, totalPages));
    const viewportHeight = contentRef.current.clientHeight;

    contentRef.current.scrollTop = (newPage - 1) * viewportHeight;
    setCurrentPage(newPage);

};

// Handle internal link navigation
const handleInternalLink = (href) => {
// Split href into filename and fragment
const [path, fragment] = href.split("#");

    if (path) {
      // Find the chapter with this path
      const resolvedPath = resolveHref(path, basePath.current);
      const targetChapterIndex = spine.findIndex(item =>
        item.href === resolvedPath || resolvedPath.startsWith(item.href)
      );

      if (targetChapterIndex !== -1) {
        loadChapter(targetChapterIndex).then(() => {
          // After loading chapter, scroll to fragment if present
          if (fragment && contentRef.current) {
            setTimeout(() => {
              const targetElement = contentRef.current.querySelector(`#${fragment}`);
              if (targetElement) {
                targetElement.scrollIntoView();
              }
            }, 100);
          }
        });
      }
    } else if (fragment && contentRef.current) {
      // Just scroll to fragment in current chapter
      const targetElement = contentRef.current.querySelector(`#${fragment}`);
      if (targetElement) {
        targetElement.scrollIntoView();
      }
    }

};

// Render epub content
return (
<div className="epub-reader">
{/_ Reader controls _/}
<div className="epub-controls">
<button
onClick={() => loadChapter(currentChapter - 1)}
disabled={currentChapter <= 0 || isLoading} >
Previous
</button>

        <select
          value={currentChapter}
          onChange={(e) => loadChapter(parseInt(e.target.value, 10))}
          disabled={isLoading}
        >
          {toc.map((item, i) => (
            <option key={i} value={item.index}>
              {item.title}
            </option>
          ))}
        </select>

        <button
          onClick={() => loadChapter(currentChapter + 1)}
          disabled={currentChapter >= spine.length - 1 || isLoading}
        >
          Next
        </button>
      </div>

      {/* Page navigation (if using pagination mode) */}
      <div className="epub-pagination">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
        >
          ←
        </button>

        <span>{currentPage} / {totalPages}</span>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
        >
          →
        </button>
      </div>

      {/* Content container */}
      <div
        ref={contentRef}
        className="epub-content"
        dangerouslySetInnerHTML={{ __html: chapterContent }}
        onClick={(e) => {
          // Handle internal links
          if (e.target.matches('.epub-internal-link')) {
            e.preventDefault();
            const href = e.target.getAttribute('data-internal-link');
            if (href) {
              handleInternalLink(href);
            }
          }
        }}
        onScroll={() => {
          // Update current page on scroll
          if (contentRef.current) {
            const scrollTop = contentRef.current.scrollTop;
            const viewportHeight = contentRef.current.clientHeight;
            const newPage = Math.floor(scrollTop / viewportHeight) + 1;

            if (newPage !== currentPage) {
              setCurrentPage(newPage);
            }
          }
        }}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="epub-loading">Loading...</div>
      )}
    </div>

);
};

export default EpubReader;
