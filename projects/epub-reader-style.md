/_ EPUB Reader Styles _/

.epub-reader {
display: flex;
flex-direction: column;
height: 100%;
max-width: 1000px;
margin: 0 auto;
background: #fff;
box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
border-radius: 8px;
overflow: hidden;
}

/_ Controls _/
.epub-controls {
display: flex;
padding: 12px;
background: #f5f5f5;
border-bottom: 1px solid #ddd;
gap: 8px;
}

.epub-controls button {
padding: 8px 16px;
background: #4a90e2;
color: white;
border: none;
border-radius: 4px;
cursor: pointer;
font-weight: 500;
transition: background 0.2s;
}

.epub-controls button:hover {
background: #3a80d2;
}

.epub-controls button:disabled {
background: #ccc;
cursor: not-allowed;
}

.epub-controls select {
flex-grow: 1;
padding: 8px;
border: 1px solid #ddd;
border-radius: 4px;
}

/_ Pagination controls _/
.epub-pagination {
display: flex;
align-items: center;
justify-content: center;
padding: 8px;
background: #fafafa;
border-bottom: 1px solid #eee;
gap: 12px;
}

.epub-pagination button {
width: 32px;
height: 32px;
display: flex;
align-items: center;
justify-content: center;
background: white;
border: 1px solid #ddd;
border-radius: 50%;
cursor: pointer;
}

.epub-pagination button:disabled {
color: #ccc;
cursor: not-allowed;
}

.epub-pagination span {
font-size: 14px;
color: #666;
}

/_ Content area _/
.epub-content {
flex-grow: 1;
overflow-y: auto;
padding: 24px 32px;
line-height: 1.6;
font-size: 16px;
color: #333;

/_ For smooth scrolling _/
scroll-behavior: smooth;

/_ For pagination mode _/
height: calc(100vh - 120px);
box-sizing: border-box;
}

/_ For fixed layout EPUBs _/
.epub-content.fixed-layout {
overflow: hidden;
display: flex;
justify-content: center;
align-items: center;
}

.epub-content.fixed-layout img {
max-width: 100%;
max-height: 100%;
object-fit: contain;
}

/_ Additional image styling _/
.epub-content img {
max-width: 100%;
height: auto;
}

.epub-image {
transition: opacity 0.2s;
opacity: 0;
}

.epub-image[src^="data:image"] {
min-height: 100px;
background: #f5f5f5;
display: block;
}

.epub-image[src^="blob:"] {
opacity: 1;
}

/_ Internal links _/
.epub-internal-link {
color: #4a90e2;
text-decoration: none;
}

.epub-internal-link:hover {
text-decoration: underline;
}

/_ Loading indicator _/
.epub-loading {
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
background: rgba(255, 255, 255, 0.8);
display: flex;
align-items: center;
justify-content: center;
font-size: 18px;
z-index: 10;
}

/_ Media queries for responsive design _/
@media (max-width: 768px) {
.epub-content {
padding: 16px;
font-size: 14px;
}

.epub-controls {
flex-wrap: wrap;
}

.epub-controls select {
order: -1;
flex-basis: 100%;
margin-bottom: 8px;
}
}

/_ Dark mode _/
.epub-reader.dark-mode {
background: #222;
color: #eee;
}

.epub-reader.dark-mode .epub-controls,
.epub-reader.dark-mode .epub-pagination {
background: #333;
border-color: #444;
}

.epub-reader.dark-mode .epub-content {
color: #ddd;
}

.epub-reader.dark-mode .epub-internal-link {
color: #66b5ff;
}

/_ Paginated mode _/
.epub-reader.paginated .epub-content {
overflow: hidden;
column-width: 100%;
column-gap: 0;
break-inside: avoid;
width: 100%;
}

/_ Two-page layout _/
.epub-reader.two-page .epub-content {
column-count: 2;
column-gap: 40px;
column-rule: 1px solid #eee;
}
