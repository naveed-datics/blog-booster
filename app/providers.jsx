"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { CopilotKit } from "@copilotkit/react-core";
import { Toaster } from "@/components/ui/sonner";

function CopilotKitWrapper({ children }) {
  const { data: session, status } = useSession();
  
  // Only render CopilotKit when authenticated
  if (status === "loading") {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  if (status === "authenticated" && session) {
    return (
      <CopilotKit runtimeUrl="/api/copilotkit">
        {children}
        <Toaster />
      </CopilotKit>
    );
  }

  // Not authenticated - render without CopilotKit
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

export function Providers({ children }) {
  return (
    <SessionProvider>
      <CopilotKitWrapper>{children}</CopilotKitWrapper>
    </SessionProvider>
  );
}

