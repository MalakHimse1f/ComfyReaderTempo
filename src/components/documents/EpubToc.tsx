import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface EpubTocProps {
  isVisible: boolean;
  toc: any[];
  onClose: () => void;
  onNavigate: (href: string) => void;
}

/**
 * Table of Contents component for EPUB reader
 */
const EpubToc: React.FC<EpubTocProps> = ({
  isVisible,
  toc,
  onClose,
  onNavigate,
}) => {
  if (!isVisible) return null;

  return (
    <div className="absolute top-0 left-0 h-full z-40 bg-white dark:bg-gray-800 shadow-lg border-r dark:border-gray-700 w-64 overflow-auto">
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Contents</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {toc.length === 0 ? (
          <p className="text-sm text-gray-500">
            No table of contents available
          </p>
        ) : (
          <ul className="space-y-1">
            {toc.map((item, index) => (
              <li key={index}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left truncate"
                  onClick={() => onNavigate(item.href)}
                >
                  {item.label}
                </Button>

                {/* Handle nested TOC items */}
                {item.subitems && item.subitems.length > 0 && (
                  <ul className="pl-4 space-y-1 mt-1">
                    {item.subitems.map((subitem: any, subIndex: number) => (
                      <li key={`${index}-${subIndex}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left truncate text-sm"
                          onClick={() => onNavigate(subitem.href)}
                        >
                          {subitem.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default EpubToc;
