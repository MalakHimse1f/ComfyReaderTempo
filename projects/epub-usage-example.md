import React, { useState } from 'react';
import EpubReader from './EpubReader';
import './epub-reader.css';

const EpubReaderApp = () => {
const [file, setFile] = useState(null);
const [viewMode, setViewMode] = useState('scroll'); // 'scroll', 'paginated', 'two-page'
const [theme, setTheme] = useState('light'); // 'light', 'dark'

const handleFileChange = (event) => {
const selectedFile = event.target.files[0];
if (selectedFile && selectedFile.name.toLowerCase().endsWith('.epub')) {
setFile(selectedFile);
} else {
alert('Please select a valid EPUB file');
}
};

const handleDrop = (event) => {
event.preventDefault();
event.stopPropagation();

    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.epub')) {
      setFile(droppedFile);
    } else {
      alert('Please drop a valid EPUB file');
    }

};

const handleDragOver = (event) => {
event.preventDefault();
event.stopPropagation();
};

return (
<div className="app-container">
{!file ? (
<div 
          className="drop-area"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
<h2>EPUB Reader</h2>
<p>Drag and drop an EPUB file here, or click to browse</p>

          <input
            type="file"
            id="epub-file"
            accept=".epub"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <button onClick={() => document.getElementById('epub-file').click()}>
            Browse Files
          </button>
        </div>
      ) : (
        <div className="reader-wrapper">
          <div className="reader-toolbar">
            <button onClick={() => setFile(null)}>
              ← Back
            </button>

            <div className="view-controls">
              <label>
                <input
                  type="radio"
                  name="viewMode"
                  value="scroll"
                  checked={viewMode === 'scroll'}
                  onChange={() => setViewMode('scroll')}
                />
                Scroll
              </label>

              <label>
                <input
                  type="radio"
                  name="viewMode"
                  value="paginated"
                  checked={viewMode === 'paginated'}
                  onChange={() => setViewMode('paginated')}
                />
                Pages
              </label>

              <label>
                <input
                  type="radio"
                  name="viewMode"
                  value="two-page"
                  checked={viewMode === 'two-page'}
                  onChange={() => setViewMode('two-page')}
                />
                Two Pages
              </label>
            </div>

            <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          <div className={`epub-reader-container ${viewMode} ${theme}-mode`}>
            <EpubReader
              file={file}
              onError={(error) => alert(`Error loading EPUB: ${error.message}`)}
            />
          </div>
        </div>
      )}
    </div>

);
};

export default EpubReaderApp;
