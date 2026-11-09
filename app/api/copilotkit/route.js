import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The in-app CopilotKit assistant is disabled.
//
// It previously ran on Azure OpenAI through an OpenAI-compatible streaming
// client. Azure has been removed, and the Claude LLM relay that replaced it
// is asynchronous (submit a job, poll for the result) with no streaming
// chat-completions surface, so it cannot back CopilotKit's runtime adapter.
//
// The route is kept so the mounted client gets a clean, explicit 501 instead
// of a network error or a confusing GraphQL failure. To bring the assistant
// back, point it at a streaming OpenAI-compatible endpoint and restore the
// CopilotRuntime wiring here.
function disabledResponse() {
  return NextResponse.json(
    {
      error: "AI chat is disabled",
      detail:
        "The CopilotKit assistant was retired along with Azure OpenAI. Article generation runs on the Claude LLM relay configured in Settings.",
    },
    { status: 501 }
  );
}

async function handleCopilotRequest() {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return disabledResponse();
}

export async function GET() {
  return handleCopilotRequest();
}

export async function POST() {
  return handleCopilotRequest();
}
