"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

// The CopilotKit provider was removed along with Azure OpenAI: the Claude
// LLM relay that replaced it is asynchronous and has no streaming
// chat-completions surface, so there is no runtime for it to talk to.
// Mounting it would have the client retry /api/copilotkit on every page.
export function Providers({ children }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
