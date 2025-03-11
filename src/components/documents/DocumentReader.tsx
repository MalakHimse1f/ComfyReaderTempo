import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronLeft,
  Settings,
  Sun,
  Moon,
  Bookmark,
  Download,
  Share2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface DocumentReaderProps {
  documentTitle?: string;
  onBack?: () => void;
}

export default function DocumentReader({
  documentTitle = "Sample Document.pdf",
  onBack = () => {},
}: DocumentReaderProps) {
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("inter");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [margins, setMargins] = useState(16);

  // Sample document content
  const sampleContent = `
    # Document Title

    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam in dui mauris. Vivamus hendrerit arcu sed erat molestie vehicula. Sed auctor neque eu tellus rhoncus ut eleifend nibh porttitor. Ut in nulla enim.

    ## Section 1

    Suspendisse in justo eu magna luctus suscipit. Sed lectus. Integer euismod lacus luctus magna. Quisque cursus, metus vitae pharetra auctor, sem massa mattis sem, at interdum magna augue eget diam.

    Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Morbi lacinia molestie dui. Praesent blandit dolor. Sed non quam. In vel mi sit amet augue congue elementum. Morbi in ipsum sit amet pede facilisis laoreet.

    ## Section 2

    Donec lacus nunc, viverra nec, blandit vel, egestas et, augue. Vestibulum tincidunt malesuada tellus. Ut ultrices ultrices enim. Curabitur sit amet mauris. Morbi in dui quis est pulvinar ullamcorper.

    Nulla facilisi. Integer lacinia sollicitudin massa. Cras metus. Sed aliquet risus a tortor. Integer id quam. Morbi mi. Quisque nisl felis, venenatis tristique, dignissim in, ultrices sit amet, augue.

    ## Section 3

    Proin sodales libero eget ante. Nulla quam. Aenean laoreet. Vestibulum nisi lectus, commodo ac, facilisis ac, ultricies eu, pede. Ut orci risus, accumsan porttitor, cursus quis, aliquet eget, justo.

    Sed pretium blandit orci. Ut eu diam at pede suscipit sodales. Aenean lectus elit, fermentum non, convallis id, sagittis at, neque. Nullam mauris orci, aliquet et, iaculis et, viverra vitae, ligula. Nulla ut felis in purus aliquam imperdiet.
  `;

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-800"}`}
    >
      {/* Top Navigation */}
      <header
        className={`sticky top-0 z-10 ${isDarkMode ? "bg-gray-800" : "bg-white"} border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"} px-4 py-2`}
      >
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="ml-2 font-medium truncate">{documentTitle}</h1>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" title="Bookmark">
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" title="Download">
              <Download className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" title="Share">
              <Share2 className="h-5 w-5" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" title="Settings">
                  <Settings className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <h3 className="font-medium">Reading Settings</h3>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="theme-toggle">Dark Mode</Label>
                      <div className="flex items-center space-x-2">
                        <Sun className="h-4 w-4 text-gray-500" />
                        <Switch
                          id="theme-toggle"
                          checked={isDarkMode}
                          onCheckedChange={setIsDarkMode}
                        />
                        <Moon className="h-4 w-4 text-gray-500" />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Font Size: {fontSize}px</Label>
                    <Slider
                      value={[fontSize]}
                      min={12}
                      max={24}
                      step={1}
                      onValueChange={(value) => setFontSize(value[0])}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Font Family</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inter">Inter</SelectItem>
                        <SelectItem value="georgia">Georgia</SelectItem>
                        <SelectItem value="times">Times New Roman</SelectItem>
                        <SelectItem value="courier">Courier New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Line Spacing: {lineSpacing}x</Label>
                    <Slider
                      value={[lineSpacing * 10]}
                      min={10}
                      max={30}
                      step={1}
                      onValueChange={(value) => setLineSpacing(value[0] / 10)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Margins: {margins}px</Label>
                    <Slider
                      value={[margins]}
                      min={0}
                      max={64}
                      step={4}
                      onValueChange={(value) => setMargins(value[0])}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Document Content */}
      <main className="container mx-auto py-8">
        <div
          className={`mx-auto prose ${isDarkMode ? "prose-invert" : ""} max-w-none`}
          style={{
            fontFamily:
              fontFamily === "inter"
                ? "Inter, sans-serif"
                : fontFamily === "georgia"
                  ? "Georgia, serif"
                  : fontFamily === "times"
                    ? '"Times New Roman", Times, serif'
                    : '"Courier New", Courier, monospace',
            fontSize: `${fontSize}px`,
            lineHeight: lineSpacing,
            padding: `0 ${margins}px`,
            maxWidth: `calc(100% - ${margins * 2}px)`,
          }}
        >
          {/* This would be the actual document content */}
          <div
            dangerouslySetInnerHTML={{
              __html: sampleContent
                .split("\n")
                .map((line) => {
                  if (line.startsWith("# ")) {
                    return `<h1>${line.substring(2)}</h1>`;
                  } else if (line.startsWith("## ")) {
                    return `<h2>${line.substring(3)}</h2>`;
                  } else if (line.trim() === "") {
                    return "<p>&nbsp;</p>";
                  } else {
                    return `<p>${line}</p>`;
                  }
                })
                .join(""),
            }}
          />
        </div>
      </main>
    </div>
  );
}
