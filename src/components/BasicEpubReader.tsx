import React from "react";

interface BasicEpubReaderProps {
  bookPath: string;
  onProgressUpdate?: (progress: number) => void;
}

/**
 * This is a stub for the existing/legacy EPUB reader component
 * It will be replaced by the HTML-based reader for processed EPUBs
 */
export const BasicEpubReader: React.FC<BasicEpubReaderProps> = ({
  bookPath,
  onProgressUpdate,
}) => {
  // In a real implementation, this would use a library like epub.js to render the book

  return (
    <div className="basic-epub-reader">
      <div className="reader-header">
        <h2>Basic EPUB Reader (Stub)</h2>
      </div>
      <div className="reader-content">
        <p>This is a stub for the legacy EPUB reader component.</p>
        <p>It would normally render the EPUB content from: {bookPath}</p>
        <p>
          In the actual implementation, this would use epub.js or a similar
          library.
        </p>

        {/* Simulated controls that would be in the real component */}
        <div className="reader-controls">
          <button onClick={() => onProgressUpdate?.(0.25)}>
            Simulate 25% Progress
          </button>
          <button onClick={() => onProgressUpdate?.(0.5)}>
            Simulate 50% Progress
          </button>
          <button onClick={() => onProgressUpdate?.(0.75)}>
            Simulate 75% Progress
          </button>
        </div>
      </div>
    </div>
  );
};

export default BasicEpubReader;
