"use client";

import { SessionProvider } from "next-auth/react";
import { CopilotKit } from "@copilotkit/react-core";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }) {
  return (
    <SessionProvider>
      <CopilotKit runtimeUrl="/api/copilotkit">
        {children}
        <Toaster />
      </CopilotKit>
    </SessionProvider>
  );
}

