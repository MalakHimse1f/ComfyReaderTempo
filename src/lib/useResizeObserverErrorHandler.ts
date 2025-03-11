import { useEffect } from "react";

/**
 * Custom hook to handle ResizeObserver loop errors
 * This hook intercepts console.error calls and suppresses ResizeObserver loop errors
 */
export function useResizeObserverErrorHandler() {
  useEffect(() => {
    // Store the original console.error function
    const originalConsoleError = window.console.error;

    // Replace console.error with our custom implementation
    window.console.error = function (...args) {
      // Check if this is a ResizeObserver loop error
      const isResizeObserverError =
        (args.length > 0 &&
          typeof args[0] === "string" &&
          args[0].includes("ResizeObserver loop")) ||
        (args[0] instanceof Error &&
          args[0].message &&
          args[0].message.includes("ResizeObserver loop"));

      // If it's a ResizeObserver error, don't log it
      if (isResizeObserverError) {
        return;
      }

      // Otherwise, pass through to the original console.error
      originalConsoleError.apply(console, args);
    };

    // Cleanup function to restore the original console.error
    return () => {
      window.console.error = originalConsoleError;
    };
  }, []);
}
