import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import TopNavigation from "../dashboard/layout/TopNavigation";
import Sidebar from "../dashboard/layout/Sidebar";
import DocumentLibrary from "../documents/DocumentLibrary";
import DocumentReader from "../documents/DocumentReader";
import { supabase } from "../../../supabase/supabase";
import { useAuth } from "../../../supabase/auth";

const Dashboard = () => {
  const [currentView, setCurrentView] = useState<"library" | "reader">(
    "library",
  );
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(
    null,
  );
  const [documentTitle, setDocumentTitle] = useState<string>("");
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Parse URL parameters to determine view and document ID
    const params = new URLSearchParams(location.search);
    const viewParam = params.get("view");
    const docId = params.get("id");

    if (viewParam === "reader" && docId) {
      setCurrentView("reader");
      setCurrentDocumentId(docId);
      fetchDocumentTitle(docId);
    }
  }, [location]);

  const fetchDocumentTitle = async (docId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("documents")
        .select("title")
        .eq("id", docId)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      if (data) setDocumentTitle(data.title);
    } catch (error) {
      console.error("Error fetching document title:", error);
    }
  };

  // State for active filter
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-white">
      <TopNavigation />

      <div className="flex pt-16">
        {/* Only show sidebar in library view, and force collapse in reader view */}
        {currentView === "library" ? (
          <Sidebar
            items={[
              {
                icon: <span className="h-5 w-5">📚</span>,
                label: "Library",
                isActive: activeFilter === null,
              },
              {
                icon: <span className="h-5 w-5">⭐</span>,
                label: "Favorites",
                isActive: activeFilter === "Favorites",
              },
              {
                icon: <span className="h-5 w-5">📱</span>,
                label: "Offline",
                isActive: activeFilter === "Offline",
              },
            ]}
            activeItem={activeFilter || "Library"}
            onItemClick={(label) => {
              // Set active filter based on sidebar selection
              if (label === "Library") {
                setActiveFilter(null);
              } else {
                setActiveFilter(label);
              }
              setCurrentView("library");
            }}
          />
        ) : null}

        <main className="flex-1 overflow-auto">
          {currentView === "library" ? (
            <DocumentLibrary activeFilter={activeFilter} />
          ) : (
            <DocumentReader
              documentTitle={documentTitle}
              documentId={currentDocumentId}
              onBack={() => {
                setCurrentView("library");
                // Update URL without reloading the page
                window.history.pushState({}, "", "/dashboard");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
