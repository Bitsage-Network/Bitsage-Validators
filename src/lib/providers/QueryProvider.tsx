"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, ReactNode } from "react";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 30 seconds
            staleTime: 30 * 1000,
            // Cache data for 5 minutes
            gcTime: 5 * 60 * 1000,
            // Only retry on transient errors (5xx), not on 4xx or network failures
            retry: (failureCount, error) => {
              if (failureCount >= 2) return false;
              // Don't retry client errors (4xx) or network errors (coordinator down)
              const status = (error as { response?: { status?: number } })?.response?.status;
              if (status && status < 500) return false;
              if (!status) return false; // Network error = coordinator unreachable
              return true;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            // Refetch on window focus for real-time data
            refetchOnWindowFocus: true,
            // Don't refetch on mount if data is still fresh
            refetchOnMount: true,
          },
          mutations: {
            // Retry mutations once on failure
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
