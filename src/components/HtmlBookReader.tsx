import React, { useEffect, useState, useRef, useCallback } from "react";
import { getProcessedBook, getChapter } from "../services/epub-processor";
import {
  processedBookStorage,
  ReadingHistoryEntry,
} from "../services/epub-processor/storageService";

interface HtmlBookReaderProps {
  bookId: string;
  onProgressUpdate?: (progress: number) => void;
  initialLocation?: string;
  onError?: (error: Error) => void;
}

// Define a specific type for the book data we receive from storage
interface BookData {
  id: string;
  metadata: {
    title: string;
    creator: string[];
    language: string;
    publisher?: string;
    identifier: string;
  };
  toc: TocItem[];
  chapterIds: string[];
  createdAt: string;
}

// TOC item structure
interface TocItem {
  title: string;
  href: string;
  level: number;
  children: TocItem[];
}

// Update the ReadingSettings interface to include accessibility options
interface ReadingSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: string;
  theme: "light" | "dark" | "sepia";
  margins: number;
  isHighContrast: boolean;
  reduceAnimations: boolean;
}

// Update default settings
const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 18,
  fontFamily: "Georgia, serif",
  lineHeight: "1.6",
  theme: "light",
  margins: 20,
  isHighContrast: false,
  reduceAnimations: false,
};

interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  text: string;
  // Store normalized index for highlighting
  index: number;
  // Context to show around the search result
  before: string;
  after: string;
}

/**
 * Component to display processed HTML books
 */
export function HtmlBookReader({
  bookId,
  onProgressUpdate,
  initialLocation,
  onError,
}: HtmlBookReaderProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<string>("");
  const [cssContent, setCssContent] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  // UI state
  const [isTocOpen, setIsTocOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [readingSettings, setReadingSettings] =
    useState<ReadingSettings>(DEFAULT_SETTINGS);

  const contentRef = useRef<HTMLDivElement>(null);

  // Cached chapters to avoid repeated loading
  const [cachedChapters, setCachedChapters] = useState<Record<string, string>>(
    {}
  );

  // Preload status for nearby chapters
  const [preloadingStatus, setPreloadingStatus] = useState<
    Record<string, boolean>
  >({});

  // Reference to keep track of current chapter for preloading
  const currentChapterRef = useRef<string | null>(null);

  // Search feature states
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);

  // Smooth scrolling state
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollTargetRef = useRef<HTMLElement | null>(null);
  const prevScrollPosition = useRef<number>(0);

  // Touch gesture tracking
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const MIN_SWIPE_DISTANCE = 50; // Minimum distance in pixels to be considered a swipe
  const MAX_SWIPE_TIME = 300; // Maximum time in ms for a swipe
  const MAX_SWIPE_VERTICAL_DISTANCE = 100; // Maximum vertical distance for horizontal swipe to be valid

  // Update current chapter ref when it changes
  useEffect(() => {
    currentChapterRef.current = currentChapterId;
  }, [currentChapterId]);

  // Load book data when component mounts
  useEffect(() => {
    async function loadBook() {
      try {
        setLoading(true);
        const { book, css } = await getProcessedBook(bookId);

        setBookData(book as BookData);
        setCssContent(css);

        // Set initial chapter
        if (initialLocation) {
          // Parse the initial location to get chapter ID
          setCurrentChapterId(initialLocation);
        } else if (
          (book as BookData).chapterIds &&
          (book as BookData).chapterIds.length > 0
        ) {
          // Default to first chapter
          setCurrentChapterId((book as BookData).chapterIds[0]);
        }

        // Try to load saved settings
        const savedSettings = localStorage.getItem(`reader_settings_${bookId}`);
        if (savedSettings) {
          try {
            setReadingSettings(JSON.parse(savedSettings));
          } catch (e) {
            console.error("Error loading saved settings:", e);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error("Error loading book:", err);
        setError(`Failed to load book: ${(err as Error).message}`);
        setLoading(false);
        if (onError) {
          onError(err as Error);
        }
      }
    }

    loadBook();
  }, [bookId, initialLocation, onError]);

  // Apply reading settings to content
  useEffect(() => {
    if (contentRef.current) {
      // Apply font size
      contentRef.current.style.fontSize = `${readingSettings.fontSize}px`;

      // Apply font family
      contentRef.current.style.fontFamily = readingSettings.fontFamily;

      // Apply line height
      contentRef.current.style.lineHeight =
        readingSettings.lineHeight.toString();

      // Apply margins
      contentRef.current.style.padding = `24px ${readingSettings.margins}px`;

      // Save settings
      localStorage.setItem(
        `reader_settings_${bookId}`,
        JSON.stringify(readingSettings)
      );
    }
  }, [readingSettings, bookId]);

  // Load chapter content when the current chapter changes
  useEffect(() => {
    if (currentChapterId) {
      // Check if we have the chapter cached
      if (cachedChapters[currentChapterId]) {
        setChapterContent(cachedChapters[currentChapterId]);
      } else {
        // Load from storage
        const content = getChapter(bookId, currentChapterId);

        // Update content state
        setChapterContent(content);

        // Cache the chapter
        setCachedChapters((prev) => ({
          ...prev,
          [currentChapterId]: content,
        }));
      }

      // Update progress
      if (bookData?.chapterIds) {
        const currentIndex = bookData.chapterIds.indexOf(currentChapterId);
        const newProgress = currentIndex / bookData.chapterIds.length;
        setProgress(newProgress);

        if (onProgressUpdate) {
          onProgressUpdate(newProgress);
        }

        // Save last read position
        localStorage.setItem(`reader_position_${bookId}`, currentChapterId);
      }
    }
  }, [bookId, currentChapterId, bookData, onProgressUpdate, cachedChapters]);

  // Preload adjacent chapters
  useEffect(() => {
    // Only preload if we have book data and a current chapter
    if (!bookData?.chapterIds || !currentChapterId) return;

    const currentIndex = bookData.chapterIds.indexOf(currentChapterId);
    if (currentIndex === -1) return;

    // Preload next and previous chapters
    const chaptersToPreload: string[] = [];

    // Add next chapter
    if (currentIndex < bookData.chapterIds.length - 1) {
      chaptersToPreload.push(bookData.chapterIds[currentIndex + 1]);
    }

    // Add previous chapter
    if (currentIndex > 0) {
      chaptersToPreload.push(bookData.chapterIds[currentIndex - 1]);
    }

    // Filter out chapters that are already cached or being preloaded
    const chaptersToLoad = chaptersToPreload.filter(
      (chapterId) => !cachedChapters[chapterId] && !preloadingStatus[chapterId]
    );

    if (chaptersToLoad.length === 0) return;

    // Mark chapters as being preloaded
    setPreloadingStatus((prev) => {
      const newStatus = { ...prev };
      chaptersToLoad.forEach((chapterId) => {
        newStatus[chapterId] = true;
      });
      return newStatus;
    });

    // Preload chapters in the background
    const preloadChapters = async () => {
      for (const chapterId of chaptersToLoad) {
        // Check if current chapter has changed during preloading
        if (currentChapterRef.current !== currentChapterId) break;

        // Load the chapter
        const content = getChapter(bookId, chapterId);

        // Cache the chapter
        setCachedChapters((prev) => ({
          ...prev,
          [chapterId]: content,
        }));

        // Update preloading status
        setPreloadingStatus((prev) => ({
          ...prev,
          [chapterId]: false,
        }));

        // Small delay to prevent UI blocking
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    preloadChapters();
  }, [bookId, bookData, currentChapterId, cachedChapters, preloadingStatus]);

  // Cache management - limit size to prevent memory issues
  useEffect(() => {
    const MAX_CACHED_CHAPTERS = 5;

    if (!bookData?.chapterIds || !currentChapterId) return;

    // If we have too many cached chapters, remove the furthest ones
    if (Object.keys(cachedChapters).length > MAX_CACHED_CHAPTERS) {
      const currentIndex = bookData.chapterIds.indexOf(currentChapterId);

      // Sort chapter IDs by distance from current chapter
      const sortedChapterIds = Object.keys(cachedChapters).sort((a, b) => {
        const aIndex = bookData.chapterIds.indexOf(a);
        const bIndex = bookData.chapterIds.indexOf(b);

        const aDist = Math.abs(aIndex - currentIndex);
        const bDist = Math.abs(bIndex - currentIndex);

        return aDist - bDist;
      });

      // Keep only the MAX_CACHED_CHAPTERS closest chapters
      const chaptersToKeep = sortedChapterIds.slice(0, MAX_CACHED_CHAPTERS);
      const newCachedChapters: Record<string, string> = {};

      chaptersToKeep.forEach((chapterId) => {
        newCachedChapters[chapterId] = cachedChapters[chapterId];
      });

      setCachedChapters(newCachedChapters);
    }
  }, [bookData, currentChapterId, cachedChapters]);

  // Update reading history
  useEffect(() => {
    if (currentChapterId && bookData) {
      // Create reading history entry
      const historyEntry: ReadingHistoryEntry = {
        bookId,
        title: bookData.metadata.title,
        author: bookData.metadata.creator.join(", "),
        lastRead: new Date().toISOString(),
        progress,
        chapterId: currentChapterId,
      };

      // Add to reading history
      processedBookStorage.addToReadingHistory(historyEntry);
    }
  }, [bookId, currentChapterId, bookData, progress]);

  // Enhanced chapter navigation with smooth transitions
  const goToNextChapterWithTransition = useCallback(() => {
    if (bookData?.chapterIds && currentChapterId) {
      const currentIndex = bookData.chapterIds.indexOf(currentChapterId);
      if (currentIndex < bookData.chapterIds.length - 1) {
        // Save scroll position before transition
        if (contentRef.current?.parentElement) {
          prevScrollPosition.current =
            contentRef.current.parentElement.scrollTop;
        }

        // Create a fade-out effect
        if (contentRef.current) {
          contentRef.current.style.transition = "opacity 0.3s ease-out";
          contentRef.current.style.opacity = "0";

          // Wait for animation to complete before changing chapter
          setTimeout(() => {
            setCurrentChapterId(bookData.chapterIds[currentIndex + 1]);

            // Schedule a fade-in effect after the new chapter is loaded
            setTimeout(() => {
              if (contentRef.current) {
                contentRef.current.style.opacity = "1";

                // Scroll to top smoothly
                if (contentRef.current.parentElement) {
                  contentRef.current.parentElement.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }
              }
            }, 100);
          }, 300);
        } else {
          // Fallback to immediate change if ref is not available
          setCurrentChapterId(bookData.chapterIds[currentIndex + 1]);
        }
      }
    }
  }, [bookData, currentChapterId]);

  const goToPrevChapterWithTransition = useCallback(() => {
    if (bookData?.chapterIds && currentChapterId) {
      const currentIndex = bookData.chapterIds.indexOf(currentChapterId);
      if (currentIndex > 0) {
        // Save scroll position before transition
        if (contentRef.current?.parentElement) {
          prevScrollPosition.current =
            contentRef.current.parentElement.scrollTop;
        }

        // Create a fade-out effect
        if (contentRef.current) {
          contentRef.current.style.transition = "opacity 0.3s ease-out";
          contentRef.current.style.opacity = "0";

          // Wait for animation to complete before changing chapter
          setTimeout(() => {
            setCurrentChapterId(bookData.chapterIds[currentIndex - 1]);

            // Schedule a fade-in effect after the new chapter is loaded
            setTimeout(() => {
              if (contentRef.current) {
                contentRef.current.style.opacity = "1";

                // When going to previous chapter, scroll to bottom
                if (contentRef.current.parentElement) {
                  contentRef.current.parentElement.scrollTo({
                    top: contentRef.current.parentElement.scrollHeight,
                    behavior: "smooth",
                  });
                }
              }
            }, 100);
          }, 300);
        } else {
          // Fallback to immediate change if ref is not available
          setCurrentChapterId(bookData.chapterIds[currentIndex - 1]);
        }
      }
    }
  }, [bookData, currentChapterId]);

  // Initialize content with transitions when chapter content changes
  useEffect(() => {
    if (contentRef.current && chapterContent) {
      // Set initial opacity to 0
      contentRef.current.style.opacity = "0";
      contentRef.current.style.transition = "opacity 0.5s ease-in";

      // Fade in content after a brief delay
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.style.opacity = "1";
        }
      }, 50);
    }
  }, [chapterContent]);

  // Implement smooth scrolling for navigation
  const smoothScrollTo = useCallback(
    (element: HTMLElement, to: number, duration: number) => {
      setIsScrolling(true);

      const start = element.scrollTop;
      const change = to - start;
      let currentTime = 0;
      const increment = 20;

      const animateScroll = () => {
        currentTime += increment;
        const val = easeInOutQuad(currentTime, start, change, duration);
        element.scrollTop = val;

        if (currentTime < duration) {
          scrollTimer.current = setTimeout(animateScroll, increment);
        } else {
          setIsScrolling(false);
          scrollTimer.current = null;
        }
      };

      // Clear any existing scroll animation
      if (scrollTimer.current) {
        clearTimeout(scrollTimer.current);
      }

      animateScroll();
    },
    []
  );

  // Easing function for smooth scrolling
  const easeInOutQuad = (t: number, b: number, c: number, d: number) => {
    t /= d / 2;
    if (t < 1) return (c / 2) * t * t + b;
    t--;
    return (-c / 2) * (t * (t - 2) - 1) + b;
  };

  // Handle scroll events for progress tracking and infinite scrolling
  useEffect(() => {
    const contentContainer = contentRef.current?.parentElement;
    if (!contentContainer) return;

    const handleScroll = () => {
      if (isScrolling) return; // Don't process during programmatic scrolling

      // Calculate reading progress based on scroll position
      const { scrollTop, scrollHeight, clientHeight } = contentContainer;
      const scrollProgress = scrollTop / (scrollHeight - clientHeight);

      // Update progress if significantly changed
      if (Math.abs(scrollProgress - progress) > 0.01) {
        const newProgress = Math.min(
          bookData?.chapterIds
            ? (bookData.chapterIds.indexOf(currentChapterId || "") +
                scrollProgress) /
                bookData.chapterIds.length
            : scrollProgress,
          1
        );
        setProgress(newProgress);

        if (onProgressUpdate) {
          onProgressUpdate(newProgress);
        }
      }

      // Auto-load next chapter when near bottom (if enabled)
      if (
        scrollProgress > 0.9 &&
        bookData?.chapterIds &&
        currentChapterId &&
        bookData.chapterIds.indexOf(currentChapterId) <
          bookData.chapterIds.length - 1
      ) {
        // We're near the bottom, prepare to show "load next chapter" UI or prefetch
        // This could be enhanced with an actual UI element
      }
    };

    contentContainer.addEventListener("scroll", handleScroll);
    return () => contentContainer.removeEventListener("scroll", handleScroll);
  }, [bookData, currentChapterId, isScrolling, onProgressUpdate, progress]);

  // Enhanced keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          // If at bottom of page, go to next chapter
          const container = contentRef.current?.parentElement;
          if (container) {
            const { scrollTop, scrollHeight, clientHeight } = container;
            if (scrollTop + clientHeight >= scrollHeight - 50) {
              goToNextChapterWithTransition();
            } else {
              // Otherwise smooth scroll down by a page
              smoothScrollTo(container, scrollTop + clientHeight * 0.9, 300);
            }
          }
          e.preventDefault();
          break;

        case "ArrowLeft":
        case "PageUp":
          // If at top of page, go to previous chapter
          const containerUp = contentRef.current?.parentElement;
          if (containerUp) {
            if (containerUp.scrollTop <= 50) {
              goToPrevChapterWithTransition();
            } else {
              // Otherwise smooth scroll up by a page
              smoothScrollTo(
                containerUp,
                containerUp.scrollTop - containerUp.clientHeight * 0.9,
                300
              );
            }
          }
          e.preventDefault();
          break;

        case "Home":
          // Scroll to top of chapter with animation
          if (contentRef.current?.parentElement) {
            smoothScrollTo(contentRef.current.parentElement, 0, 500);
          }
          e.preventDefault();
          break;

        case "End":
          // Scroll to bottom of chapter with animation
          if (contentRef.current?.parentElement) {
            smoothScrollTo(
              contentRef.current.parentElement,
              contentRef.current.parentElement.scrollHeight,
              500
            );
          }
          e.preventDefault();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    goToNextChapterWithTransition,
    goToPrevChapterWithTransition,
    smoothScrollTo,
  ]);

  // Memoize navigation functions to avoid recreation in dependencies
  const goToNextChapter = useCallback(() => {
    if (bookData?.chapterIds && currentChapterId) {
      const currentIndex = bookData.chapterIds.indexOf(currentChapterId);
      if (currentIndex < bookData.chapterIds.length - 1) {
        setCurrentChapterId(bookData.chapterIds[currentIndex + 1]);
      }
    }
  }, [bookData, currentChapterId]);

  // Navigate to the previous chapter
  const goToPrevChapter = useCallback(() => {
    if (bookData?.chapterIds && currentChapterId) {
      const currentIndex = bookData.chapterIds.indexOf(currentChapterId);
      if (currentIndex > 0) {
        setCurrentChapterId(bookData.chapterIds[currentIndex - 1]);
      }
    }
  }, [bookData, currentChapterId]);

  // Go to a specific chapter
  const goToChapter = useCallback(
    (chapterId: string) => {
      if (bookData?.chapterIds?.includes(chapterId)) {
        setCurrentChapterId(chapterId);
        setIsTocOpen(false); // Close the TOC after selecting a chapter
      }
    },
    [bookData, setIsTocOpen]
  );

  // Update a reading setting
  const updateSettings = useCallback(
    (newSettings: Partial<ReadingSettings>) => {
      setReadingSettings((prev) => {
        const updated = { ...prev, ...newSettings };

        // Save to localStorage
        localStorage.setItem(
          `reader_settings_${bookId}`,
          JSON.stringify(updated)
        );

        return updated;
      });
    },
    [bookId]
  );

  // Handle key presses for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          goToNextChapter();
          break;
        case "ArrowLeft":
          goToPrevChapter();
          break;
        case "Escape":
          setIsTocOpen(false);
          setIsSettingsOpen(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToNextChapter, goToPrevChapter]);

  // Perform search across chapters
  const performSearch = useCallback(async () => {
    if (!searchQuery.trim() || !bookData) return;

    setIsSearching(true);
    setSearchResults([]);

    // Start with current chapter and nearby chapters
    const results: SearchResult[] = [];
    const chapterIds = [...bookData.chapterIds];

    // If we have a current chapter, move it and nearby chapters to the front for faster results
    if (currentChapterId) {
      const currentIndex = chapterIds.indexOf(currentChapterId);
      if (currentIndex !== -1) {
        // Create a prioritized array with current chapter and nearby chapters first
        const prioritizedIds: string[] = [];

        // Current chapter
        prioritizedIds.push(chapterIds[currentIndex]);

        // Next few chapters
        for (let i = 1; i <= 2; i++) {
          if (currentIndex + i < chapterIds.length) {
            prioritizedIds.push(chapterIds[currentIndex + i]);
          }
        }

        // Previous few chapters
        for (let i = 1; i <= 2; i++) {
          if (currentIndex - i >= 0) {
            prioritizedIds.push(chapterIds[currentIndex - i]);
          }
        }

        // Remove these chapters from the original array
        prioritizedIds.forEach((id) => {
          const idx = chapterIds.indexOf(id);
          if (idx !== -1) {
            chapterIds.splice(idx, 1);
          }
        });

        // Combine prioritized + remaining
        chapterIds.unshift(...prioritizedIds);
      }
    }

    // Process chapters in batches to prevent UI freeze
    const BATCH_SIZE = 3;
    const normalizedQuery = searchQuery.toLowerCase();

    for (let i = 0; i < chapterIds.length; i += BATCH_SIZE) {
      const batch = chapterIds.slice(i, i + BATCH_SIZE);

      // Process this batch in parallel
      await Promise.all(
        batch.map(async (chapterId) => {
          // Get chapter content - use cache if available
          let chapterContent = cachedChapters[chapterId];
          if (!chapterContent) {
            chapterContent = getChapter(bookId, chapterId);
          }

          // Create a temporary element to parse HTML content
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = chapterContent;

          // Extract text content
          const textContent = tempDiv.textContent || "";
          const normalizedContent = textContent.toLowerCase();

          // Find all occurrences
          let startIndex = 0;
          let index;

          while (
            (index = normalizedContent.indexOf(normalizedQuery, startIndex)) !==
            -1
          ) {
            // Get context around the match
            const contextStart = Math.max(0, index - 40);
            const contextEnd = Math.min(
              textContent.length,
              index + normalizedQuery.length + 40
            );

            const before = textContent.substring(contextStart, index);
            const match = textContent.substring(
              index,
              index + normalizedQuery.length
            );
            const after = textContent.substring(
              index + normalizedQuery.length,
              contextEnd
            );

            // Find the chapter title
            const chapterTitle =
              bookData.toc.find((item) => item.href === chapterId)?.title ||
              "Unknown Chapter";

            results.push({
              chapterId,
              chapterTitle,
              text: match,
              index,
              before,
              after,
            });

            startIndex = index + normalizedQuery.length;

            // Limit results per chapter
            if (results.length >= 100) break;
          }
        })
      );

      // Update results incrementally
      if (results.length > 0) {
        setSearchResults([...results]);
      }

      // Pause briefly to prevent UI freeze
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Stop if we have a reasonable number of results already
      if (results.length >= 50) break;
    }

    setIsSearching(false);
  }, [bookId, bookData, currentChapterId, searchQuery, cachedChapters]);

  // Trigger search when search query changes (with debounce)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      performSearch();
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  // Go to a search result
  const goToSearchResult = (result: SearchResult) => {
    // Navigate to the chapter containing the result
    goToChapter(result.chapterId);

    // Wait for the chapter to load and highlight the text
    setTimeout(() => {
      if (contentRef.current) {
        // Clear any existing highlights
        const existingHighlights =
          contentRef.current.querySelectorAll(".search-highlight");
        existingHighlights.forEach((el) => {
          const parent = el.parentNode;
          if (parent) {
            parent.replaceChild(
              document.createTextNode(el.textContent || ""),
              el
            );
            // Normalize the text nodes
            parent.normalize();
          }
        });

        // Find text nodes containing the search text
        const walker = document.createTreeWalker(
          contentRef.current,
          NodeFilter.SHOW_TEXT,
          null
        );

        const searchText = searchQuery.toLowerCase();
        const textNodes: Node[] = [];
        let node;

        // Collect all text nodes
        while ((node = walker.nextNode())) {
          if (
            node.textContent &&
            node.textContent.toLowerCase().includes(searchText)
          ) {
            textNodes.push(node);
          }
        }

        // Highlight matches in the text nodes
        textNodes.forEach((textNode) => {
          const text = textNode.textContent || "";
          const lowerText = text.toLowerCase();

          let startIndex = 0;
          let index;

          // Check if this node contains the text
          while ((index = lowerText.indexOf(searchText, startIndex)) !== -1) {
            // Split text node into parts
            const before = text.substring(0, index);
            const match = text.substring(index, index + searchText.length);
            const after = text.substring(index + searchText.length);

            // Create text nodes for before and after
            const beforeNode = document.createTextNode(before);
            const afterNode = document.createTextNode(after);

            // Create span for highlighted text
            const highlightNode = document.createElement("span");
            highlightNode.className = "search-highlight";
            highlightNode.style.backgroundColor = "yellow";
            highlightNode.style.color = "black";
            highlightNode.appendChild(document.createTextNode(match));

            // Replace the original node with these three new nodes
            const parent = textNode.parentNode;
            if (parent) {
              parent.insertBefore(beforeNode, textNode);
              parent.insertBefore(highlightNode, textNode);
              parent.insertBefore(afterNode, textNode);
              parent.removeChild(textNode);

              // Continue with the after node as our new text node
              textNode = afterNode;

              // Scroll the first highlight into view
              if (index === 0) {
                highlightNode.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }

              break; // Move to next text node after making a replacement
            }

            startIndex = index + searchText.length;
          }
        });
      }
    }, 100);
  };

  // Navigate to next/previous search result
  const goToNextSearchResult = () => {
    if (searchResults.length === 0) return;

    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    goToSearchResult(searchResults[nextIndex]);
  };

  const goToPrevSearchResult = () => {
    if (searchResults.length === 0) return;

    const prevIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    goToSearchResult(searchResults[prevIndex]);
  };

  // Render search panel
  const renderSearchPanel = () => {
    if (!isSearchOpen) return null;

    return (
      <div
        className="search-panel"
        style={{
          position: "absolute",
          top: "50px",
          right: "10px",
          width: "300px",
          maxHeight: "80vh",
          overflowY: "auto",
          backgroundColor: "white",
          boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          zIndex: 1000,
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        <div style={{ display: "flex", marginBottom: "10px" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in book..."
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            style={{
              marginLeft: "5px",
              padding: "5px 10px",
              backgroundColor: "#f0f0f0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {isSearching && (
          <div style={{ textAlign: "center", padding: "10px" }}>
            Searching...
          </div>
        )}

        {!isSearching && searchResults.length > 0 && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "10px",
                padding: "5px",
                backgroundColor: "#f5f5f5",
                borderRadius: "4px",
              }}
            >
              <span>{searchResults.length} results</span>
              <div>
                <button
                  onClick={goToPrevSearchResult}
                  style={{
                    marginRight: "5px",
                    padding: "3px 8px",
                    backgroundColor: "#f0f0f0",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={goToNextSearchResult}
                  style={{
                    padding: "3px 8px",
                    backgroundColor: "#f0f0f0",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  ↓
                </button>
              </div>
            </div>

            <div>
              {searchResults.map((result, index) => (
                <div
                  key={`${result.chapterId}-${result.index}`}
                  onClick={() => {
                    setCurrentSearchIndex(index);
                    goToSearchResult(result);
                  }}
                  style={{
                    padding: "8px",
                    margin: "5px 0",
                    cursor: "pointer",
                    backgroundColor:
                      currentSearchIndex === index ? "#f0f0f0" : "transparent",
                    borderRadius: "4px",
                    border: "1px solid #eee",
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: "3px" }}>
                    {result.chapterTitle}
                  </div>
                  <div>
                    <span style={{ color: "#666" }}>{result.before}</span>
                    <span style={{ backgroundColor: "yellow", color: "black" }}>
                      {result.text}
                    </span>
                    <span style={{ color: "#666" }}>{result.after}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isSearching && searchQuery && searchResults.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px" }}>
            No results found
          </div>
        )}
      </div>
    );
  };

  // Handle touch gestures for navigation
  useEffect(() => {
    const contentContainer = contentRef.current?.parentElement;
    if (!contentContainer) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default to avoid scrolling while swiping horizontally
      if (touchStartX.current !== null) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX.current;
        const deltaY = touch.clientY - touchStartY.current;

        // If clearly a horizontal swipe, prevent default scrolling
        if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > 20) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;
      const timeDelta = Date.now() - touchStartTime.current;

      // Check if the gesture is a horizontal swipe
      if (
        Math.abs(deltaX) > MIN_SWIPE_DISTANCE && // Moved enough horizontally
        Math.abs(deltaY) < MAX_SWIPE_VERTICAL_DISTANCE && // Didn't move too much vertically
        timeDelta < MAX_SWIPE_TIME // Was quick enough
      ) {
        if (deltaX > 0) {
          // Swipe right = go to previous chapter
          goToPrevChapterWithTransition();
        } else {
          // Swipe left = go to next chapter
          goToNextChapterWithTransition();
        }
      }

      // Single tap in margin areas for page navigation
      else if (
        timeDelta < 200 &&
        Math.abs(deltaX) < 10 &&
        Math.abs(deltaY) < 10
      ) {
        const width = contentContainer.clientWidth;
        const tapX = touch.clientX;

        // Tap in left 20% of screen = previous page
        if (tapX < width * 0.2) {
          if (contentContainer.scrollTop <= 0) {
            goToPrevChapterWithTransition();
          } else {
            smoothScrollTo(
              contentContainer,
              contentContainer.scrollTop - contentContainer.clientHeight * 0.9,
              300
            );
          }
        }
        // Tap in right 20% of screen = next page
        else if (tapX > width * 0.8) {
          if (
            contentContainer.scrollTop + contentContainer.clientHeight >=
            contentContainer.scrollHeight - 50
          ) {
            goToNextChapterWithTransition();
          } else {
            smoothScrollTo(
              contentContainer,
              contentContainer.scrollTop + contentContainer.clientHeight * 0.9,
              300
            );
          }
        }
        // Tap in middle = toggle controls visibility (could be implemented)
      }

      // Reset touch tracking
      touchStartX.current = null;
      touchStartY.current = null;
    };

    contentContainer.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    contentContainer.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    contentContainer.addEventListener("touchend", handleTouchEnd);

    return () => {
      contentContainer.removeEventListener("touchstart", handleTouchStart);
      contentContainer.removeEventListener("touchmove", handleTouchMove);
      contentContainer.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    goToNextChapterWithTransition,
    goToPrevChapterWithTransition,
    smoothScrollTo,
  ]);

  // Double tap gesture for zooming in (optional functionality)
  useEffect(() => {
    const contentContainer = contentRef.current?.parentElement;
    if (!contentContainer) return;

    let lastTap = 0;
    let tapTimeout: NodeJS.Timeout | null = null;

    const handleDoubleTap = (e: TouchEvent) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;

      clearTimeout(tapTimeout as NodeJS.Timeout);

      if (tapLength < 300 && tapLength > 0) {
        // Double tap detected
        e.preventDefault();

        // Toggle between normal and slightly larger font size
        updateSettings({
          fontSize:
            readingSettings.fontSize === DEFAULT_SETTINGS.fontSize
              ? readingSettings.fontSize * 1.2
              : DEFAULT_SETTINGS.fontSize,
        });

        lastTap = 0; // Reset
      } else {
        // Single tap - wait to see if it becomes a double tap
        lastTap = currentTime;
        tapTimeout = setTimeout(() => {
          // It was a single tap
          lastTap = 0;
        }, 300);
      }
    };

    contentContainer.addEventListener("touchend", handleDoubleTap);

    return () => {
      contentContainer.removeEventListener("touchend", handleDoubleTap);
      if (tapTimeout) clearTimeout(tapTimeout);
    };
  }, [readingSettings, updateSettings]);

  // Add a visual indicator for swipe gestures
  const [showSwipeIndicator, setShowSwipeIndicator] = useState<
    "left" | "right" | null
  >(null);

  // Show momentary swipe indicators
  useEffect(() => {
    if (showSwipeIndicator) {
      const timer = setTimeout(() => {
        setShowSwipeIndicator(null);
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [showSwipeIndicator]);

  // Enhanced goToNextChapter with swipe indicator
  const goToNextChapterWithIndicator = useCallback(() => {
    setShowSwipeIndicator("left");
    goToNextChapterWithTransition();
  }, [goToNextChapterWithTransition]);

  // Enhanced goToPrevChapter with swipe indicator
  const goToPrevChapterWithIndicator = useCallback(() => {
    setShowSwipeIndicator("right");
    goToPrevChapterWithTransition();
  }, [goToPrevChapterWithTransition]);

  // Show loading state
  if (loading) {
    return (
      <div className="html-book-reader-loading">
        <div className="loading-spinner"></div>
        <p>Loading book...</p>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="html-book-reader-error">
        <p>Error: {error}</p>
      </div>
    );
  }

  // Render the reader UI
  return (
    <div
      className="html-book-reader"
      style={{ position: "relative", height: "100%" }}
    >
      {/* Navigation buttons */}
      <div
        className="reader-controls"
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px",
          backgroundColor: "#f5f5f5",
          borderBottom: "1px solid #ddd",
        }}
      >
        <div>
          <button
            onClick={() => setIsTocOpen(!isTocOpen)}
            style={{
              marginRight: "10px",
              padding: "5px 10px",
              backgroundColor: isTocOpen ? "#e0e0e0" : "#f0f0f0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Contents
          </button>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            style={{
              padding: "5px 10px",
              backgroundColor: isSettingsOpen ? "#e0e0e0" : "#f0f0f0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Settings
          </button>
        </div>

        <div>
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            style={{
              marginRight: "10px",
              padding: "5px 10px",
              backgroundColor: isSearchOpen ? "#e0e0e0" : "#f0f0f0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Search
          </button>
          <button
            onClick={goToPrevChapterWithIndicator}
            disabled={
              !bookData ||
              !currentChapterId ||
              bookData.chapterIds.indexOf(currentChapterId) <= 0
            }
            style={{
              marginRight: "10px",
              padding: "5px 10px",
              backgroundColor: "#f0f0f0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              opacity:
                !bookData ||
                !currentChapterId ||
                bookData.chapterIds.indexOf(currentChapterId) <= 0
                  ? 0.5
                  : 1,
            }}
          >
            Previous
          </button>
          <button
            onClick={goToNextChapterWithIndicator}
            disabled={
              !bookData ||
              !currentChapterId ||
              bookData.chapterIds.indexOf(currentChapterId) >=
                bookData.chapterIds.length - 1
            }
            style={{
              padding: "5px 10px",
              backgroundColor: "#f0f0f0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              opacity:
                !bookData ||
                !currentChapterId ||
                bookData.chapterIds.indexOf(currentChapterId) >=
                  bookData.chapterIds.length - 1
                  ? 0.5
                  : 1,
            }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className="reader-content"
        style={{
          height: "calc(100% - 50px)",
          overflowY: "auto",
          padding: "20px",
          backgroundColor: readingSettings.theme === "dark" ? "#222" : "#fff",
          color: readingSettings.theme === "dark" ? "#eee" : "#000",
          position: "relative", // Needed for the swipe indicators
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "50px" }}>Loading...</div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "50px", color: "red" }}>
            {error}
          </div>
        ) : (
          <div
            ref={contentRef}
            className="book-content"
            style={{
              margin: "0 auto",
              maxWidth: "800px",
              lineHeight: readingSettings.lineHeight,
              fontSize: readingSettings.fontSize + "px",
              fontFamily: readingSettings.fontFamily,
              padding: `0 ${readingSettings.margins}px`,
            }}
            dangerouslySetInnerHTML={{ __html: chapterContent }}
          />
        )}

        {/* Swipe indicators */}
        {showSwipeIndicator === "left" && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              right: "10px",
              transform: "translateY(-50%)",
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "white",
              padding: "15px",
              borderRadius: "50%",
              animation: "fadeInOut 0.8s ease",
              zIndex: 100,
            }}
          >
            →
          </div>
        )}

        {showSwipeIndicator === "right" && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "10px",
              transform: "translateY(-50%)",
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "white",
              padding: "15px",
              borderRadius: "50%",
              animation: "fadeInOut 0.8s ease",
              zIndex: 100,
            }}
          >
            ←
          </div>
        )}

        {/* Add CSS animations */}
        <style>
          {`
            @keyframes fadeInOut {
              0% { opacity: 0; }
              20% { opacity: 1; }
              80% { opacity: 1; }
              100% { opacity: 0; }
            }
            
            /* Add touch-specific styles */
            @media (hover: none) and (pointer: coarse) {
              /* Styles specific to touch devices */
              .book-content {
                padding-left: 10% !important;
                padding-right: 10% !important;
              }
              
              /* Hide buttons on touch devices for a cleaner reading experience */
              .reader-controls {
                opacity: 0;
                transition: opacity 0.3s ease;
              }
              
              .html-book-reader:hover .reader-controls,
              .reader-controls:hover {
                opacity: 1;
              }
            }
          `}
        </style>
      </div>

      {/* Table of Contents panel */}
      {isTocOpen && (
        <div className="toc-panel">
          <h2>Table of Contents</h2>
          <div className="toc-content">
            {bookData?.toc?.length ? (
              <ul className="toc-list">
                {bookData.toc.map((item, index) => (
                  <TocItemComponent
                    key={index}
                    item={item}
                    bookData={bookData}
                    onSelectChapter={goToChapter}
                    currentChapterId={currentChapterId}
                  />
                ))}
              </ul>
            ) : (
              <p>No table of contents available</p>
            )}
          </div>
        </div>
      )}

      {/* Settings panel */}
      {isSettingsOpen && (
        <div className="settings-panel">
          <h2>Reading Settings</h2>
          <div className="settings-content">
            <div className="settings-group">
              <label htmlFor="fontSize">
                Font Size: {readingSettings.fontSize}px
              </label>
              <input
                type="range"
                id="fontSize"
                min="12"
                max="24"
                value={readingSettings.fontSize}
                onChange={(e) =>
                  updateSettings({ fontSize: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="settings-group">
              <label htmlFor="lineHeight">
                Line Height: {readingSettings.lineHeight}
              </label>
              <input
                type="range"
                id="lineHeight"
                min="1"
                max="2"
                step="0.1"
                value={readingSettings.lineHeight}
                onChange={(e) => updateSettings({ lineHeight: e.target.value })}
              />
            </div>

            <div className="settings-group">
              <label htmlFor="margins">
                Margins: {readingSettings.margins}px
              </label>
              <input
                type="range"
                id="margins"
                min="0"
                max="100"
                value={readingSettings.margins}
                onChange={(e) =>
                  updateSettings({ margins: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="settings-group">
              <label>Theme:</label>
              <div className="theme-options">
                <button
                  className={`theme-button ${
                    readingSettings.theme === "light" ? "active" : ""
                  }`}
                  onClick={() => updateSettings({ theme: "light" })}
                >
                  Light
                </button>
                <button
                  className={`theme-button ${
                    readingSettings.theme === "sepia" ? "active" : ""
                  }`}
                  onClick={() => updateSettings({ theme: "sepia" })}
                >
                  Sepia
                </button>
                <button
                  className={`theme-button ${
                    readingSettings.theme === "dark" ? "active" : ""
                  }`}
                  onClick={() => updateSettings({ theme: "dark" })}
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="settings-group">
              <label htmlFor="fontFamily">Font Family:</label>
              <select
                id="fontFamily"
                value={readingSettings.fontFamily}
                onChange={(e) => updateSettings({ fontFamily: e.target.value })}
              >
                <option value='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'>
                  System Font
                </option>
                <option value='"Times New Roman", Times, serif'>Serif</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="Arial, Helvetica, sans-serif">Sans-serif</option>
                <option value='"Courier New", Courier, monospace'>
                  Monospace
                </option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Search panel */}
      {renderSearchPanel()}
    </div>
  );
}

// Component to render TOC items recursively
function TocItemComponent({
  item,
  bookData,
  onSelectChapter,
  currentChapterId,
  level = 0,
}: {
  item: TocItem;
  bookData: BookData;
  onSelectChapter: (id: string) => void;
  currentChapterId: string | null;
  level?: number;
}) {
  // Find the chapter ID that corresponds to this TOC item's href
  const getChapterIdFromHref = (href: string): string | null => {
    // Extract the file path part (remove fragment)
    const filePath = href.split("#")[0];

    // Find the chapter index that matches this path
    for (let i = 0; i < bookData.chapterIds.length; i++) {
      const chapterId = bookData.chapterIds[i];
      // This is a simplified matching - in a real implementation,
      // you'd have a more robust way to map TOC hrefs to chapter IDs
      if (
        chapterId.includes(filePath.replace(".html", "")) ||
        filePath.includes(chapterId)
      ) {
        return chapterId;
      }
    }

    return bookData.chapterIds[0]; // Default to first chapter if not found
  };

  const chapterId = getChapterIdFromHref(item.href);
  const isActive = currentChapterId === chapterId;

  return (
    <li className={`toc-item toc-level-${item.level}`}>
      <div
        className={`toc-link ${isActive ? "active" : ""}`}
        onClick={() => chapterId && onSelectChapter(chapterId)}
      >
        {item.title}
      </div>

      {item.children && item.children.length > 0 && (
        <ul className="toc-list">
          {item.children.map((child, index) => (
            <TocItemComponent
              key={index}
              item={child}
              bookData={bookData}
              onSelectChapter={onSelectChapter}
              currentChapterId={currentChapterId}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
