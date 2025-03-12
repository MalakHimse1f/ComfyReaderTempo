# Extracting Content from Document Formats to HTML

This guide explains how to extract content from various document formats and convert it to HTML using different open-source libraries.

## EPUBs

EPUBs are essentially ZIP archives containing HTML, CSS, and media files.

```javascript
import JSZip from 'jszip';

async function extractEpub(file) {
  // Load the EPUB file
  const zip = await JSZip.loadAsync(file);
  
  // Find and parse the content.opf file to get the reading order
  const containerXml = await zip.file("META-INF/container.xml").async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const rootfilePath = containerDoc.querySelector("rootfile").getAttribute("full-path");
  const contentOpf = await zip.file(rootfilePath).async("text");
  const contentDoc = parser.parseFromString(contentOpf, "application/xml");
  
  // Extract chapter files in order
  const chapters = [];
  const items = {};
  
  // Build manifest map
  contentDoc.querySelectorAll("manifest > item").forEach(item => {
    items[item.getAttribute("id")] = item.getAttribute("href");
  });
  
  // Get spine (reading order)
  contentDoc.querySelectorAll("spine > itemref").forEach(itemref => {
    const id = itemref.getAttribute("idref");
    if (items[id]) {
      chapters.push(items[id]);
    }
  });
  
  // Extract content from chapters
  const contentHtml = [];
  for (const chapter of chapters) {
    const chapterPath = rootfilePath.substring(0, rootfilePath.lastIndexOf("/") + 1) + chapter;
    const chapterContent = await zip.file(chapterPath).async("text");
    contentHtml.push(chapterContent);
  }
  
  return contentHtml.join('\n');
}
```

## PDFs

PDF extraction is more complex as PDFs store content as drawing instructions rather than structured text.

```javascript
import * as pdfjs from 'pdfjs-dist';

async function extractPdf(file) {
  // Load the PDF file
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  
  let combinedText = '';
  
  // Process each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Transform text items into HTML
    let lastY = null;
    let text = '';
    
    for (const item of textContent.items) {
      if (lastY !== item.transform[5] && lastY !== null) {
        text += '<br>';
      }
      text += item.str;
      lastY = item.transform[5];
    }
    
    combinedText += `<div class="pdf-page">${text}</div>`;
  }
  
  return combinedText;
}
```

## Word Documents (.docx)

Word documents can be parsed using the mammoth.js library.

```javascript
import mammoth from 'mammoth';

async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  
  // Convert to HTML
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value; // HTML string
}
```

## Text Documents (.txt)

Plain text is the simplest to convert to HTML.

```javascript
async function extractTxt(file) {
  const text = await file.text();
  // Convert line breaks to <br> and escape HTML
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  return `<div class="text-content">${html}</div>`;
}
```

## Unified Approach

Here's a function that handles multiple file types:

```javascript
async function convertToHtml(file) {
  const fileType = file.name.split('.').pop().toLowerCase();
  
  switch (fileType) {
    case 'epub':
      return await extractEpub(file);
    case 'pdf':
      return await extractPdf(file);
    case 'docx':
      return await extractDocx(file);
    case 'txt':
      return await extractTxt(file);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
```

## Handling Images

For EPUBs and Word documents, you'll need to extract embedded images:

```javascript
// For EPUB
async function extractEpubImages(zip, basePath) {
  const images = {};
  
  // Find image files in the ZIP
  for (const filename in zip.files) {
    if (/\.(jpg|jpeg|png|gif|svg)$/i.test(filename)) {
      const blob = await zip.file(filename).async('blob');
      const url = URL.createObjectURL(blob);
      images[filename] = url;
    }
  }
  
  return images;
}

// Replace image sources in HTML
function replaceImageSources(html, images, basePath) {
  return html.replace(/src=["']([^"']*)["']/g, (match, src) => {
    // Resolve relative path
    const fullPath = new URL(src, 'file://' + basePath).pathname;
    const imagePath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
    
    return `src="${images[imagePath] || src}"`;
  });
}
```

## Displaying the Content

Once you have the HTML content, you can display it in a container and apply your own styling:

```javascript
function displayContent(htmlContent) {
  const container = document.getElementById('content-display');
  
  // Create a sandbox for the content
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  
  container.appendChild(iframe);
  
  // Write content to iframe
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          margin: 20px;
        }
        img {
          max-width: 100%;
          height: auto;
        }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>
  `);
  iframe.contentWindow.document.close();
}
```

## Necessary Libraries

Here are the key libraries you'll need:

- **JSZip**: For handling EPUB archives
- **pdf.js**: For extracting PDF content
- **mammoth.js**: For converting Word documents to HTML
- **DOMParser**: Browser native for parsing XML/HTML

This approach gives you complete control over how the content is displayed, allowing you to implement your own reading interface, navigation, and styling.
