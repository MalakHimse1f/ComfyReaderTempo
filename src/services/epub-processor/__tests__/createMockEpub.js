import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createMockEpub() {
  const zip = new JSZip();

  // Add mimetype file
  zip.file("mimetype", "application/epub+zip");

  // Add META-INF/container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version='1.0' encoding='UTF-8'?>
  <container xmlns='urn:oasis:names:tc:opendocument:xmlns:container' version='1.0'>
    <rootfiles>
      <rootfile full-path='OEBPS/content.opf' media-type='application/oebps-package+xml'/>
    </rootfiles>
  </container>`
  );

  // Add content.opf
  zip.file(
    "OEBPS/content.opf",
    `<?xml version='1.0' encoding='UTF-8'?>
  <package xmlns='http://www.idpf.org/2007/opf' version='3.0' unique-identifier='BookId'>
    <metadata xmlns:dc='http://purl.org/dc/elements/1.1/'>
      <dc:title>Test Book</dc:title>
      <dc:creator>Test Author</dc:creator>
      <dc:language>en</dc:language>
      <dc:identifier id='BookId'>urn:uuid:12345678-1234-1234-1234-123456789012</dc:identifier>
    </metadata>
    <manifest>
      <item id='nav' href='nav.xhtml' media-type='application/xhtml+xml' properties='nav'/>
      <item id='chapter1' href='chapter1.xhtml' media-type='application/xhtml+xml'/>
      <item id='chapter2' href='chapter2.xhtml' media-type='application/xhtml+xml'/>
      <item id='style' href='css/style.css' media-type='text/css'/>
    </manifest>
    <spine>
      <itemref idref='chapter1'/>
      <itemref idref='chapter2'/>
    </spine>
  </package>`
  );

  // Add nav.xhtml
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version='1.0' encoding='UTF-8'?>
  <html xmlns='http://www.w3.org/1999/xhtml' xmlns:epub='http://www.idpf.org/2007/ops'>
    <head>
      <title>Test Book</title>
    </head>
    <body>
      <nav epub:type='toc'>
        <h1>Table of Contents</h1>
        <ol>
          <li><a href='chapter1.xhtml'>Chapter 1</a></li>
          <li><a href='chapter2.xhtml'>Chapter 2</a></li>
        </ol>
      </nav>
    </body>
  </html>`
  );

  // Add chapters
  zip.file(
    "OEBPS/chapter1.xhtml",
    `<?xml version='1.0' encoding='UTF-8'?>
  <html xmlns='http://www.w3.org/1999/xhtml'>
    <head>
      <title>Chapter 1</title>
      <link rel='stylesheet' type='text/css' href='css/style.css'/>
    </head>
    <body>
      <h1>Chapter 1</h1>
      <p>This is the content of chapter 1.</p>
    </body>
  </html>`
  );

  zip.file(
    "OEBPS/chapter2.xhtml",
    `<?xml version='1.0' encoding='UTF-8'?>
  <html xmlns='http://www.w3.org/1999/xhtml'>
    <head>
      <title>Chapter 2</title>
      <link rel='stylesheet' type='text/css' href='css/style.css'/>
    </head>
    <body>
      <h1>Chapter 2</h1>
      <p>This is the content of chapter 2.</p>
    </body>
  </html>`
  );

  // Add CSS
  zip.file("OEBPS/css/style.css", `body { font-family: serif; }`);

  // Generate the EPUB file
  const epubContent = await zip.generateAsync({ type: "nodebuffer" });

  // Ensure directory exists
  const fixturesDir = path.join(__dirname, "fixtures");
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Write the file
  const outputPath = path.join(fixturesDir, "mock-book.epub");
  fs.writeFileSync(outputPath, epubContent);
  console.log("Mock EPUB file created at " + outputPath);
}

createMockEpub().catch(console.error);
