/**
 * Types for the EPUB to HTML pre-processor
 */

/**
 * Metadata from the EPUB file
 */
export interface EpubMetadata {
  title: string;
  creator: string[];
  language: string;
  publisher?: string;
  identifier: string;
  description?: string;
  publicationDate?: string;
  rights?: string;
  coverImage?: string;
}

/**
 * Represents a chapter or section of the book
 */
export interface Chapter {
  id: string;
  href: string;
  title: string;
  order: number;
  html: string;
}

/**
 * Represents an item in the table of contents
 */
export interface TocItem {
  title: string;
  href: string;
  level: number;
  children: TocItem[];
}

/**
 * Represents a resource in the EPUB (image, font, etc.)
 */
export interface Resource {
  id: string;
  href: string;
  mediaType: string;
  data: Blob;
}

/**
 * The complete processed book
 */
export interface ProcessedBook {
  id: string;
  metadata: EpubMetadata;
  chapters: Chapter[];
  toc: TocItem[];
  resources: Map<string, Resource>;
  css: string[];
}

/**
 * Represents an item from the EPUB manifest
 */
export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

/**
 * Represents an item from the EPUB spine
 */
export interface SpineItem {
  idref: string;
  linear: boolean;
  index: number;
}

/**
 * Internal representation of the EPUB structure during processing
 */
export interface EpubStructure {
  contentPath: string;
  basePath: string;
  metadata: EpubMetadata;
  manifest: Map<string, ManifestItem>;
  spine: SpineItem[];
  toc: TocItem[];
}
