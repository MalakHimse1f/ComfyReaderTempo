import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Home,
  LayoutDashboard,
  Settings,
  HelpCircle,
  FolderKanban,
  Star,
  WifiOff,
  Menu,
  X,
} from "lucide-react";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href?: string;
  isActive?: boolean;
}

interface SidebarProps {
  items?: NavItem[];
  activeItem?: string;
  onItemClick?: (label: string) => void;
  isCollapsed?: boolean;
  forceCollapse?: boolean;
}

const defaultNavItems: NavItem[] = [
  { icon: <Home size={18} />, label: "Home" },
  { icon: <LayoutDashboard size={18} />, label: "Library", isActive: true },
  { icon: <Star size={18} />, label: "Favorites" },
  { icon: <WifiOff size={18} />, label: "Offline" },
];

const defaultBottomItems: NavItem[] = [
  { icon: <Settings size={18} />, label: "Settings" },
  { icon: <HelpCircle size={18} />, label: "Help" },
];

const Sidebar = ({
  items = defaultNavItems,
  activeItem = "Library",
  onItemClick = () => {},
  forceCollapse = false,
}: SidebarProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkIfMobile();

    // Add event listener
    window.addEventListener("resize", checkIfMobile);

    // Cleanup
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);

  // Determine if sidebar should be collapsed
  const shouldCollapse = isMobile || forceCollapse;

  // Close sidebar by default on mobile
  useEffect(() => {
    if (shouldCollapse) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }
  }, [shouldCollapse]);

  return (
    <>
      {/* Hamburger menu button - only visible when collapsed */}
      {shouldCollapse && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-20 left-4 z-50 bg-white shadow-md rounded-full h-10 w-10"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </Button>
      )}

      {/* Backdrop - only visible on mobile when sidebar is open */}
      {shouldCollapse && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          shouldCollapse
            ? "fixed left-0 top-0 z-40 h-full transition-transform duration-300 ease-in-out pt-16"
            : "w-[240px] h-full border-r border-gray-200"
        } 
          ${shouldCollapse && !isOpen ? "-translate-x-full" : "translate-x-0"}
          bg-white flex flex-col`}
      >
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-1">Documents</h2>
          <p className="text-sm text-gray-500">Manage your reading library</p>
        </div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1">
            {items.map((item) => (
              <Button
                key={item.label}
                variant={item.label === activeItem ? "secondary" : "ghost"}
                className="w-full justify-start gap-2 text-sm h-10"
                onClick={() => {
                  onItemClick(item.label);
                  if (shouldCollapse) setIsOpen(false);
                }}
              >
                {item.icon}
                {item.label}
              </Button>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-1">
            <h3 className="text-xs font-medium px-3 py-2 text-gray-500">
              Filters
            </h3>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm h-9"
            >
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              PDF Files
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm h-9"
            >
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              Text Files
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm h-9"
            >
              <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
              Recently Added
            </Button>
          </div>
        </ScrollArea>

        <div className="p-3 mt-auto border-t border-gray-200">
          {defaultBottomItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              className="w-full justify-start gap-2 text-sm h-10 mb-1"
              onClick={() => {
                onItemClick(item.label);
                if (shouldCollapse) setIsOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
