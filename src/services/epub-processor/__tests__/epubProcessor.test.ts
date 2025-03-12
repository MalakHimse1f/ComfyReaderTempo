import { loadTestEpub } from "./setup";
import { processEpubToHtml } from "../epubProcessor";
import JSZip from "jszip";

// Mock JSZip
jest.mock("jszip", () => {
  const mockZip = {
    files: {
      "META-INF/container.xml": {
        async: jest.fn().mockResolvedValue(`
        <?xml version="1.0" encoding="UTF-8"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>
      `),
      },
      "OEBPS/content.opf": {
        async: jest.fn().mockResolvedValue(`
        <?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Test Book</dc:title>
            <dc:creator>Test Author</dc:creator>
            <dc:language>en</dc:language>
            <dc:identifier id="uid">test-id-123</dc:identifier>
          </metadata>
          <manifest>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
            <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
            <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
            <item id="style" href="css/style.css" media-type="text/css"/>
          </manifest>
          <spine>
            <itemref idref="chapter1"/>
            <itemref idref="chapter2"/>
          </spine>
        </package>
      `),
      },
      "OEBPS/nav.xhtml": {
        async: jest.fn().mockResolvedValue(`
        <?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
          <body>
            <nav epub:type="toc">
              <ol>
                <li><a href="chapter1.xhtml">Chapter 1</a></li>
                <li><a href="chapter2.xhtml">Chapter 2</a></li>
              </ol>
            </nav>
          </body>
        </html>
      `),
      },
      "OEBPS/chapter1.xhtml": {
        async: jest.fn().mockResolvedValue(`
        <html>
          <head><title>Chapter 1</title></head>
          <body><h1>Chapter 1</h1><p>Content of chapter 1</p></body>
        </html>
      `),
      },
      "OEBPS/chapter2.xhtml": {
        async: jest.fn().mockResolvedValue(`
        <html>
          <head><title>Chapter 2</title></head>
          <body><h1>Chapter 2</h1><p>Content of chapter 2</p></body>
        </html>
      `),
      },
      "OEBPS/css/style.css": {
        async: jest.fn().mockResolvedValue(`body { font-family: serif; }`),
      },
    },
    file: jest.fn().mockImplementation((path) => mockZip.files[path]),
  };

  return {
    loadAsync: jest.fn().mockResolvedValue(mockZip),
  };
});

// Mock XMLDom
jest.mock("xmldom", () => {
  // A basic mock implementation of DOMParser that returns objects with the expected methods
  class MockDOMParser {
    parseFromString(content: string, contentType: string) {
      // Create a basic mock document with necessary methods
      return {
        getElementsByTagName: (tagName: string) => {
          if (tagName === "rootfile") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "full-path") return "OEBPS/content.opf";
                  if (attr === "media-type")
                    return "application/oebps-package+xml";
                  return "";
                },
              },
            ];
          }
          if (tagName === "metadata") {
            return [
              {
                getElementsByTagName: (childTagName: string) => {
                  if (childTagName === "dc:title") {
                    return [{ textContent: "Test Book" }];
                  }
                  if (childTagName === "dc:creator") {
                    return [{ textContent: "Test Author" }];
                  }
                  if (childTagName === "dc:language") {
                    return [{ textContent: "en" }];
                  }
                  if (childTagName === "dc:identifier") {
                    return [{ textContent: "test-id-123" }];
                  }
                  if (childTagName === "dc:publisher") {
                    return [{ textContent: "Test Publisher" }];
                  }
                  return [];
                },
              },
            ];
          }
          if (tagName === "manifest") {
            return [
              {
                getElementsByTagName: (childTagName: string) => {
                  if (childTagName === "item") {
                    return [
                      {
                        getAttribute: (attr: string) => {
                          if (attr === "id") return "chapter1";
                          if (attr === "href") return "chapter1.xhtml";
                          if (attr === "media-type")
                            return "application/xhtml+xml";
                          return "";
                        },
                      },
                      {
                        getAttribute: (attr: string) => {
                          if (attr === "id") return "chapter2";
                          if (attr === "href") return "chapter2.xhtml";
                          if (attr === "media-type")
                            return "application/xhtml+xml";
                          return "";
                        },
                      },
                      {
                        getAttribute: (attr: string) => {
                          if (attr === "id") return "nav";
                          if (attr === "href") return "nav.xhtml";
                          if (attr === "media-type")
                            return "application/xhtml+xml";
                          if (attr === "properties") return "nav";
                          return "";
                        },
                      },
                    ];
                  }
                  return [];
                },
              },
            ];
          }
          if (tagName === "spine") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "toc") return "nav";
                  return "";
                },
                getElementsByTagName: (childTagName: string) => {
                  if (childTagName === "itemref") {
                    return [
                      {
                        getAttribute: (attr: string) => {
                          if (attr === "idref") return "chapter1";
                          if (attr === "linear") return "yes";
                          return "";
                        },
                      },
                      {
                        getAttribute: (attr: string) => {
                          if (attr === "idref") return "chapter2";
                          if (attr === "linear") return "yes";
                          return "";
                        },
                      },
                    ];
                  }
                  return [];
                },
              },
            ];
          }
          if (tagName === "dc:title") {
            return [{ textContent: "Test Book" }];
          }
          if (tagName === "dc:creator") {
            return [{ textContent: "Test Author" }];
          }
          if (tagName === "dc:language") {
            return [{ textContent: "en" }];
          }
          if (tagName === "dc:identifier") {
            return [{ textContent: "test-id-123" }];
          }
          if (tagName === "item") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "id") return "chapter1";
                  if (attr === "href") return "chapter1.xhtml";
                  if (attr === "media-type") return "application/xhtml+xml";
                  return "";
                },
              },
              {
                getAttribute: (attr: string) => {
                  if (attr === "id") return "chapter2";
                  if (attr === "href") return "chapter2.xhtml";
                  if (attr === "media-type") return "application/xhtml+xml";
                  return "";
                },
              },
              {
                getAttribute: (attr: string) => {
                  if (attr === "id") return "nav";
                  if (attr === "href") return "nav.xhtml";
                  if (attr === "media-type") return "application/xhtml+xml";
                  if (attr === "properties") return "nav";
                  return "";
                },
              },
            ];
          }
          if (tagName === "itemref") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "idref") return "chapter1";
                  return "";
                },
              },
              {
                getAttribute: (attr: string) => {
                  if (attr === "idref") return "chapter2";
                  return "";
                },
              },
            ];
          }
          if (tagName === "nav") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "epub:type") return "toc";
                  return "";
                },
              },
            ];
          }
          if (tagName === "ol") {
            return [
              {
                childNodes: [
                  {
                    nodeName: "li",
                    childNodes: [
                      {
                        nodeName: "a",
                        getAttribute: (attr: string) =>
                          attr === "href" ? "chapter1.xhtml" : "",
                        textContent: "Chapter 1",
                      },
                    ],
                  },
                  {
                    nodeName: "li",
                    childNodes: [
                      {
                        nodeName: "a",
                        getAttribute: (attr: string) =>
                          attr === "href" ? "chapter2.xhtml" : "",
                        textContent: "Chapter 2",
                      },
                    ],
                  },
                ],
              },
            ];
          }
          return [];
        },
        querySelector: (selector: string) => {
          if (selector === "rootfile") {
            return { getAttribute: () => "OEBPS/content.opf" };
          }
          if (selector === "package") {
            return { getAttribute: () => "3.0" };
          }
          if (selector === "nav[epub\\:type='toc']") {
            return {
              getElementsByTagName: (tagName: string) => {
                if (tagName === "ol") {
                  return [
                    {
                      childNodes: [
                        {
                          nodeName: "li",
                          childNodes: [
                            {
                              nodeName: "a",
                              getAttribute: (attr: string) =>
                                attr === "href" ? "chapter1.xhtml" : "",
                              textContent: "Chapter 1",
                            },
                          ],
                        },
                        {
                          nodeName: "li",
                          childNodes: [
                            {
                              nodeName: "a",
                              getAttribute: (attr: string) =>
                                attr === "href" ? "chapter2.xhtml" : "",
                              textContent: "Chapter 2",
                            },
                          ],
                        },
                      ],
                    },
                  ];
                }
                return [];
              },
            };
          }
          return null;
        },
        querySelectorAll: (selector: string) => {
          if (selector === "metadata > *") {
            return [
              { nodeName: "dc:title", textContent: "Test Book" },
              { nodeName: "dc:creator", textContent: "Test Author" },
              { nodeName: "dc:language", textContent: "en" },
              {
                nodeName: "dc:identifier",
                textContent: "test-id-123",
                getAttribute: () => "uid",
              },
            ];
          }
          if (selector === "item") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "id") return "chapter1";
                  if (attr === "href") return "chapter1.xhtml";
                  if (attr === "media-type") return "application/xhtml+xml";
                  return "";
                },
              },
              {
                getAttribute: (attr: string) => {
                  if (attr === "id") return "chapter2";
                  if (attr === "href") return "chapter2.xhtml";
                  if (attr === "media-type") return "application/xhtml+xml";
                  return "";
                },
              },
              {
                getAttribute: (attr: string) => {
                  if (attr === "id") return "nav";
                  if (attr === "href") return "nav.xhtml";
                  if (attr === "media-type") return "application/xhtml+xml";
                  if (attr === "properties") return "nav";
                  return "";
                },
              },
            ];
          }
          if (selector === "itemref") {
            return [
              {
                getAttribute: (attr: string) => {
                  if (attr === "idref") return "chapter1";
                  return "";
                },
              },
              {
                getAttribute: (attr: string) => {
                  if (attr === "idref") return "chapter2";
                  return "";
                },
              },
            ];
          }
          return [];
        },
      };
    }
  }

  return {
    DOMParser: MockDOMParser,
  };
});

// Create a minimal mock File class for testing
global.File = class MockFile {
  name: string;
  type: string;
  size: number;
  lastModified: number;

  constructor(parts: BlobPart[], options: FilePropertyBag & { name: string }) {
    this.name = options.name;
    this.type = options.type || "";
    this.size = 0;
    this.lastModified = Date.now();
  }
} as any;

describe("EPUB Processor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processEpubToHtml", () => {
    it("should process EPUB file to HTML", async () => {
      // Create a mock EPUB file
      const mockEpubBuffer = await loadTestEpub("mock-book.epub");
      const mockFile = new File([mockEpubBuffer], "mock-book.epub", {
        type: "application/epub+zip",
      });

      const result = await processEpubToHtml(mockFile);

      // Check that JSZip was called properly
      expect(JSZip.loadAsync).toHaveBeenCalled();

      // Check the returned ProcessedBook structure
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.metadata.title).toBe("Test Book");
      expect(result.metadata.creator).toContain("Test Author");
      expect(result.chapters.length).toBeGreaterThan(0);
      expect(result.toc).toBeDefined();
    });

    it("should throw error when EPUB processing fails", async () => {
      // Create a mock EPUB file
      const mockEpubBuffer = await loadTestEpub("mock-book.epub");
      const mockFile = new File([mockEpubBuffer], "mock-book.epub", {
        type: "application/epub+zip",
      });

      // Mock an error in JSZip.loadAsync
      (JSZip.loadAsync as jest.Mock).mockRejectedValueOnce(
        new Error("Failed to load EPUB")
      );

      await expect(processEpubToHtml(mockFile)).rejects.toThrow();
    });
  });
});
