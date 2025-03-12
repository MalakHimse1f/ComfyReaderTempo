import JSZip from "jszip";
import { DOMParser } from "xmldom";
import {
  Chapter,
  EpubMetadata,
  EpubStructure,
  ManifestItem,
  ProcessedBook,
  Resource,
  SpineItem,
  TocItem,
} from "./types";

/**
 * Main function to process an EPUB file into HTML
 */
export async function processEpubToHtml(
  epubFile: File
): Promise<ProcessedBook> {
  try {
    // Load the EPUB file using JSZip
    const zip = await JSZip.loadAsync(epubFile);

    // Parse the EPUB structure
    const structure = await parseEpubStructure(zip);

    // Process the chapters
    const chapters = await processChapters(zip, structure);

    // Process resources (images, fonts, etc.)
    const resources = await processResources(zip, structure);

    // Extract CSS from the EPUB
    const css = await extractCss(zip, structure);

    // Create a unique ID for the processed book
    const id = `book-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    // Return the processed book
    return {
      id,
      metadata: structure.metadata,
      chapters,
      toc: structure.toc,
      resources,
      css,
    };
  } catch (error) {
    console.error("Error processing EPUB:", error);
    throw new Error(`Failed to process EPUB: ${(error as Error).message}`);
  }
}

/**
 * Parse the EPUB structure (container.xml, content.opf, etc.)
 */
async function parseEpubStructure(zip: JSZip): Promise<EpubStructure> {
  // Get the path to the content.opf file from container.xml
  const contentPath = await getContentPath(zip);

  // Get the base directory path (for resolving relative paths)
  const basePath = contentPath.substring(0, contentPath.lastIndexOf("/") + 1);

  // Parse the content.opf file to get metadata, manifest, and spine
  const opfContent = await zip.file(contentPath)!.async("text");
  const opfDoc = new DOMParser().parseFromString(opfContent, "application/xml");

  // Extract metadata
  const metadata = extractMetadata(opfDoc);

  // Extract manifest items
  const manifest = extractManifest(opfDoc, basePath);

  // Extract spine items
  const spine = extractSpine(opfDoc);

  // Parse the Table of Contents (from NCX or nav document)
  const toc = await parseToc(zip, opfDoc, manifest, basePath, spine);

  return {
    contentPath,
    basePath,
    metadata,
    manifest,
    spine,
    toc,
  };
}

/**
 * Get the path to the content.opf file from container.xml
 */
async function getContentPath(zip: JSZip): Promise<string> {
  const containerXml = await zip.file("META-INF/container.xml")!.async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const rootfiles = containerDoc.getElementsByTagName("rootfile");

  for (let i = 0; i < rootfiles.length; i++) {
    const rootfile = rootfiles[i];
    if (
      rootfile.getAttribute("media-type") === "application/oebps-package+xml"
    ) {
      return rootfile.getAttribute("full-path") || "";
    }
  }

  throw new Error("Could not find content.opf path in container.xml");
}

/**
 * Extract metadata from the content.opf file
 */
function extractMetadata(opfDoc: Document): EpubMetadata {
  const metadataNode = opfDoc.getElementsByTagName("metadata")[0];
  const metadata: EpubMetadata = {
    title: getElementText(metadataNode, "dc:title") || "Unknown Title",
    creator: getElementArray(metadataNode, "dc:creator"),
    language: getElementText(metadataNode, "dc:language") || "en",
    publisher: getElementText(metadataNode, "dc:publisher"),
    identifier:
      getElementText(metadataNode, "dc:identifier") || `id-${Date.now()}`,
    description: getElementText(metadataNode, "dc:description"),
    publicationDate: getElementText(metadataNode, "dc:date"),
    rights: getElementText(metadataNode, "dc:rights"),
  };

  return metadata;
}

/**
 * Helper function to get text content from an XML element
 */
function getElementText(parent: Element, tagName: string): string | undefined {
  const elements = parent.getElementsByTagName(tagName);
  if (elements.length > 0) {
    return elements[0].textContent || undefined;
  }
  return undefined;
}

/**
 * Helper function to get an array of text content from XML elements
 */
function getElementArray(parent: Element, tagName: string): string[] {
  const elements = parent.getElementsByTagName(tagName);
  const result: string[] = [];

  for (let i = 0; i < elements.length; i++) {
    const text = elements[i].textContent;
    if (text) {
      result.push(text);
    }
  }

  return result.length ? result : ["Unknown"];
}

/**
 * Extract manifest items from the content.opf file
 */
function extractManifest(
  opfDoc: Document,
  basePath: string
): Map<string, ManifestItem> {
  const manifestNode = opfDoc.getElementsByTagName("manifest")[0];
  const items = manifestNode.getElementsByTagName("item");
  const manifest = new Map<string, ManifestItem>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = item.getAttribute("id") || "";
    const href = item.getAttribute("href") || "";
    const mediaType = item.getAttribute("media-type") || "";

    manifest.set(id, { id, href, mediaType });
  }

  return manifest;
}

/**
 * Extract spine items from the content.opf file
 */
function extractSpine(opfDoc: Document): SpineItem[] {
  const spineNode = opfDoc.getElementsByTagName("spine")[0];
  const items = spineNode.getElementsByTagName("itemref");
  const spine: SpineItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const idref = item.getAttribute("idref") || "";
    const linear = item.getAttribute("linear") !== "no";

    spine.push({ idref, linear, index: i });
  }

  return spine;
}

/**
 * Parse the Table of Contents (from NCX or nav document)
 */
async function parseToc(
  zip: JSZip,
  opfDoc: Document,
  manifest: Map<string, ManifestItem>,
  basePath: string,
  spine: SpineItem[]
): Promise<TocItem[]> {
  // First try to find the NCX file
  const spineElement = opfDoc.getElementsByTagName("spine")[0];
  const tocId = spineElement.getAttribute("toc");

  if (tocId && manifest.has(tocId)) {
    // Parse NCX file (EPUB2)
    const ncxPath = resolveHref(manifest.get(tocId)!.href, basePath);
    return parseNcxToc(await zip.file(ncxPath)!.async("text"));
  } else {
    // Look for nav document (EPUB3)
    for (const item of manifest.values()) {
      if (
        item.mediaType === "application/xhtml+xml" &&
        item.href.includes("nav")
      ) {
        const navPath = resolveHref(item.href, basePath);
        return parseNavToc(await zip.file(navPath)!.async("text"));
      }
    }
  }

  // Fallback: Create TOC from spine
  return createTocFromSpine(spine, manifest);
}

/**
 * Parse NCX TOC (EPUB2)
 */
function parseNcxToc(ncxContent: string): TocItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ncxContent, "application/xml");
  const navPoints = doc.getElementsByTagName("navPoint");
  const result: TocItem[] = [];

  function processNavPoint(navPoint: Element, level: number): TocItem {
    const labelNode = navPoint.getElementsByTagName("navLabel")[0];
    const textNode = labelNode.getElementsByTagName("text")[0];
    const contentNode = navPoint.getElementsByTagName("content")[0];

    const title = textNode.textContent || "Unknown";
    const href = contentNode.getAttribute("src") || "";

    const item: TocItem = {
      title,
      href,
      level,
      children: [],
    };

    // Process child navPoints
    const childNavPoints = Array.from(navPoint.childNodes).filter(
      (node) => node.nodeName === "navPoint"
    );

    for (const childNode of childNavPoints) {
      item.children.push(processNavPoint(childNode as Element, level + 1));
    }

    return item;
  }

  for (let i = 0; i < navPoints.length; i++) {
    const navPoint = navPoints[i];
    // Only process top-level navPoints
    if (!navPoint.parentNode || navPoint.parentNode.nodeName !== "navPoint") {
      result.push(processNavPoint(navPoint, 0));
    }
  }

  return result;
}

/**
 * Parse Nav TOC (EPUB3)
 */
function parseNavToc(navContent: string): TocItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(navContent, "text/html");
  const navElement = doc.querySelector(
    'nav[epub\\:type="toc"], nav[role="doc-toc"]'
  );

  if (!navElement) {
    return [];
  }

  function processListItem(li: Element, level: number): TocItem {
    const anchor = li.querySelector("a");
    const title = anchor?.textContent || "Unknown";
    const href = anchor?.getAttribute("href") || "";

    const item: TocItem = {
      title,
      href,
      level,
      children: [],
    };

    // Process nested lists
    const nestedList = li.querySelector("ol, ul");
    if (nestedList) {
      const nestedItems = nestedList.querySelectorAll("li");
      for (let i = 0; i < nestedItems.length; i++) {
        item.children.push(processListItem(nestedItems[i], level + 1));
      }
    }

    return item;
  }

  const result: TocItem[] = [];
  const listItems = navElement.querySelectorAll("ol > li, ul > li");

  for (let i = 0; i < listItems.length; i++) {
    result.push(processListItem(listItems[i], 0));
  }

  return result;
}

/**
 * Create a TOC from the spine as a fallback
 */
function createTocFromSpine(
  spine: SpineItem[],
  manifest: Map<string, ManifestItem>
): TocItem[] {
  const result: TocItem[] = [];

  for (const spineItem of spine) {
    const manifestItem = manifest.get(spineItem.idref);
    if (manifestItem) {
      result.push({
        title: `Chapter ${spineItem.index + 1}`,
        href: manifestItem.href,
        level: 0,
        children: [],
      });
    }
  }

  return result;
}

/**
 * Helper function to resolve relative paths
 */
function resolveHref(href: string, basePath: string): string {
  if (!href) return "";

  // Handle absolute paths
  if (href.startsWith("/")) {
    return href.substring(1);
  }

  // Handle relative paths
  if (href.startsWith("../")) {
    const newBase = basePath.split("/").slice(0, -1).join("/");
    return resolveHref(href.substring(3), newBase + "/");
  }

  return basePath + href;
}

/**
 * Process chapters from the EPUB
 */
async function processChapters(
  zip: JSZip,
  structure: EpubStructure
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];

  for (const spineItem of structure.spine) {
    const manifestItem = structure.manifest.get(spineItem.idref);

    if (manifestItem && manifestItem.mediaType === "application/xhtml+xml") {
      const chapterPath = resolveHref(manifestItem.href, structure.basePath);
      const chapterContent = await zip.file(chapterPath)?.async("text");

      if (chapterContent) {
        // Find a title for the chapter
        const title = findChapterTitle(
          chapterContent,
          manifestItem.id,
          spineItem.index
        );

        chapters.push({
          id: manifestItem.id,
          href: manifestItem.href,
          title,
          order: spineItem.index,
          html: await processHtmlContent(
            chapterContent,
            chapterPath,
            structure
          ),
        });
      }
    }
  }

  return chapters;
}

/**
 * Find a title for a chapter
 */
function findChapterTitle(html: string, id: string, index: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Try to find a title in the following order:
  // 1. Document title
  const docTitle = doc.getElementsByTagName("title")[0]?.textContent;
  if (docTitle) return docTitle;

  // 2. First h1 element
  const h1 = doc.getElementsByTagName("h1")[0]?.textContent;
  if (h1) return h1;

  // 3. First h2 element
  const h2 = doc.getElementsByTagName("h2")[0]?.textContent;
  if (h2) return h2;

  // Fallback to a generic chapter title
  return `Chapter ${index + 1}`;
}

/**
 * Process HTML content to make it suitable for the reader
 */
async function processHtmlContent(
  html: string,
  chapterPath: string,
  structure: EpubStructure
): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove doctype, html, head, and body tags, keeping only the content
  const content = doc.body ? doc.body.innerHTML : html;

  // TODO: Process images, links, and other elements to update paths

  return content;
}

/**
 * Process resources from the EPUB (images, fonts, etc.)
 */
async function processResources(
  zip: JSZip,
  structure: EpubStructure
): Promise<Map<string, Resource>> {
  const resources = new Map<string, Resource>();

  for (const item of structure.manifest.values()) {
    // Process all resources except HTML/XML files
    if (
      item.mediaType !== "application/xhtml+xml" &&
      item.mediaType !== "application/xml" &&
      item.mediaType !== "text/css"
    ) {
      const resourcePath = resolveHref(item.href, structure.basePath);
      const file = zip.file(resourcePath);

      if (file) {
        const data = await file.async("blob");
        resources.set(item.href, {
          id: item.id,
          href: item.href,
          mediaType: item.mediaType,
          data,
        });
      }
    }
  }

  return resources;
}

/**
 * Extract CSS from the EPUB
 */
async function extractCss(
  zip: JSZip,
  structure: EpubStructure
): Promise<string[]> {
  const cssFiles: string[] = [];

  for (const item of structure.manifest.values()) {
    if (item.mediaType === "text/css") {
      const cssPath = resolveHref(item.href, structure.basePath);
      const file = zip.file(cssPath);

      if (file) {
        const content = await file.async("text");
        cssFiles.push(content);
      }
    }
  }

  return cssFiles;
}
