import React, { useState } from "react";
import TopNavigation from "../dashboard/layout/TopNavigation";
import Sidebar from "../dashboard/layout/Sidebar";
import DocumentLibrary from "../documents/DocumentLibrary";
import DocumentReader from "../documents/DocumentReader";

const Dashboard = () => {
  const [currentView, setCurrentView] = useState<"library" | "reader">(
    "library",
  );

  return (
    <div className="min-h-screen bg-white">
      <TopNavigation />

      <div className="flex pt-16">
        <Sidebar
          items={[
            {
              icon: <span className="h-5 w-5">📚</span>,
              label: "Library",
              isActive: currentView === "library",
            },
            {
              icon: <span className="h-5 w-5">📖</span>,
              label: "Reader",
              isActive: currentView === "reader",
            },
            { icon: <span className="h-5 w-5">⭐</span>, label: "Favorites" },
            { icon: <span className="h-5 w-5">📱</span>, label: "Offline" },
          ]}
          activeItem={currentView === "library" ? "Library" : "Reader"}
          onItemClick={(label) => {
            if (label === "Library") setCurrentView("library");
            if (label === "Reader") setCurrentView("reader");
          }}
        />

        <main className="flex-1 overflow-auto">
          {currentView === "library" ? (
            <DocumentLibrary />
          ) : (
            <DocumentReader onBack={() => setCurrentView("library")} />
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
