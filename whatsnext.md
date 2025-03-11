Tempo AI
Document Reader & Manager PWA: Technical Implementation Guide
1. Document Upload Implementation
To get uploads working properly, the following components need to be implemented:

1.1 Supabase Storage Configuration
✅ Create a storage bucket named "documents" in Supabase
✅ Set up appropriate security policies for the bucket to ensure users can only access their own files
✅ Configure CORS settings to allow uploads from your application domain
1.2 Upload Edge Function
✅ Create an Edge Function (upload-document) that handles file uploads
Fix the missing Supabase import in DocumentUpload.tsx:
typescript
Download
Copy code
import { supabase } from "../../../supabase/supabase";
Ensure the Edge Function:
Validates file types (PDF, DOC, DOCX, TXT, EPUB)
Generates unique file paths using user ID and timestamp
Uploads files to the storage bucket
Creates a record in the documents table with metadata
1.3 Upload Progress Tracking
Implement real progress tracking using fetch with progress events:
typescript
Download
Copy code
const xhr = new XMLHttpRequest();
xhr.upload.addEventListener('progress', (event) => {
  if (event.lengthComputable) {
    const percentComplete = Math.round((event.loaded / event.total) * 100);
    setUploadProgress(percentComplete);
  }
});
2. Downloads and Offline Functionality
2.1 Document Download
✅ Implement the download functionality in DocumentLibrary.tsx
Add file caching using the Cache API:
typescript
Download
Copy code
async function cacheDocument(docId, fileBlob, metadata) {
  const cache = await caches.open('document-cache');
  const headers = new Headers({
    'Content-Type': fileBlob.type,
    'Content-Length': fileBlob.size.toString(),
    'X-Document-Metadata': JSON.stringify(metadata)
  });
  const response = new Response(fileBlob, { headers });
  await cache.put(`/documents/${docId}`, response);
}
2.2 Offline Access
Implement a Service Worker for offline capabilities:

javascript
Download
Copy code
// service-worker.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/documents/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});
Register the Service Worker in your main application:

javascript
Download
Copy code
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
2.3 Reading Progress Synchronization
Implement local storage for reading progress:

typescript
Download
Copy code
function saveLocalProgress(docId, progress) {
  localStorage.setItem(`doc_progress_${docId}`, JSON.stringify({
    position: progress.position,
    timestamp: new Date().toISOString(),
    synced: false
  }));
}
Create a sync mechanism that runs when online:

typescript
Download
Copy code
async function syncReadingProgress() {
  if (!navigator.onLine) return;
  
  const keys = Object.keys(localStorage).filter(k => k.startsWith('doc_progress_'));
  for (const key of keys) {
    const docId = key.replace('doc_progress_', '');
    const progress = JSON.parse(localStorage.getItem(key));
    
    if (!progress.synced) {
      try {
        await supabase.functions.invoke('save-reading-progress', {
          body: { documentId: docId, progress: progress }
        });
        
        // Mark as synced
        progress.synced = true;
        localStorage.setItem(key, JSON.stringify(progress));
      } catch (error) {
        console.error('Failed to sync progress:', error);
      }
    }
  }
}

// Listen for online events
window.addEventListener('online', syncReadingProgress);
3. Search Functionality
3.1 Basic Title Search
✅ Implement client-side search in DocumentLibrary.tsx (already filtering by title)
3.2 Full-Text Search
Create a full-text search index in Supabase:

sql
Download
Copy code
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE documents 
ADD COLUMN document_text TEXT;

CREATE INDEX documents_text_search_idx ON documents 
USING GIN (to_tsvector('english', document_text));
Extract text from documents during upload:

typescript
Download
Copy code
// In upload-document edge function
let documentText = '';

if (file.type === 'text/plain') {
  documentText = await file.text();
} else if (file.type === 'application/pdf') {
  // Use PDF.js or similar to extract text
  documentText = await extractPdfText(file);
}

// Add to document record
await supabaseClient.from("documents").update({
  document_text: documentText
}).eq("id", documentData.id);
Implement server-side search:

typescript
Download
Copy code
async function searchDocuments(query) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .textSearch('document_text', query)
    .eq('user_id', user.id);
    
  if (error) throw error;
  return data;
}
4. Document Highlighting and Notes
4.1 Data Structure
Create a data structure for annotations:
typescript
Download
Copy code
interface Annotation {
  id: string;
  documentId: string;
  type: 'highlight' | 'note';
  content?: string;
  color?: string;
  position: {
    startOffset: number;
    endOffset: number;
    textContent: string;
  };
  createdAt: string;
  updatedAt: string;
}
4.2 UI Components
Implement a highlight selection mechanism:

typescript
Download
Copy code
function captureSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  const startOffset = getDocumentOffset(range.startContainer, range.startOffset);
  const endOffset = getDocumentOffset(range.endContainer, range.endOffset);
  
  return {
    startOffset,
    endOffset,
    textContent: selection.toString()
  };
}
Create a notes component:

tsx
Download
Copy code
function NotePopover({ position, onSave, onCancel }) {
  const [noteText, setNoteText] = useState('');
  
  return (
    <Popover>
      <PopoverContent>
        <textarea 
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="w-full p-2 border rounded"
        />
        <div className="flex justify-end mt-2 gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave(noteText)}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
4.3 Storage and Synchronization
Create an edge function for saving annotations:

typescript
Download
Copy code
// save-annotations edge function
const { documentId, annotations } = await req.json();

const { data, error } = await supabaseClient
  .from("documents")
  .update({
    annotations: annotations,
  })
  .eq("id", documentId)
  .eq("user_id", user.id);
Implement local storage for offline annotation:

typescript
Download
Copy code
function saveAnnotationLocally(annotation) {
  const localAnnotations = JSON.parse(localStorage.getItem(`doc_annotations_${documentId}`) || '[]');
  localAnnotations.push(annotation);
  localStorage.setItem(`doc_annotations_${documentId}`, JSON.stringify(localAnnotations));
}
5. Mobile-Friendly Sidebar
5.1 Responsive Design
Update the Sidebar component to be responsive:
tsx
Download
Copy code
function Sidebar({ items, activeItem, onItemClick }) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <>
      {isMobile && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="fixed top-20 left-4 z-50"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X /> : <Menu />}
        </Button>
      )}
      
      <div className={`
        ${isMobile ? 'fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out' : 'w-[240px] h-full border-r'}
        ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}
        bg-white flex flex-col
      `}>
        {/* Sidebar content */}
      </div>
      
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
5.2 Media Query Hook
Create a custom hook for media queries:
typescript
Download
Copy code
function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    
    const handler = (event) => setMatches(event.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
}
5.3 Touch Gestures
Add swipe gestures for mobile navigation:
typescript
Download
Copy code
function useTouchGestures(ref, onSwipeLeft, onSwipeRight) {
  useEffect(() => {
    if (!ref.current) return;
    
    let startX = 0;
    
    const handleTouchStart = (e) => {
      startX = e.touches[0].clientX;
    };
    
    const handleTouchEnd = (e) => {
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      
      if (diff > 50) {
        // Swipe left
        onSwipeLeft?.();
      } else if (diff < -50) {
        // Swipe right
        onSwipeRight?.();
      }
    };
    
    const element = ref.current;
    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight]);
}
This technical guide provides a comprehensive roadmap for implementing all the required features for the Document Reader & Manager PWA. Each section includes the necessary code snippets and explanations to guide the implementation process