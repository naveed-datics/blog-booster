import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedHandleRequest = null;

function getAzureConfig() {
  let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  let azureApiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
  if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
  if (azureDeploymentName) {
    azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
  }
  if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

  return { azureApiKey, azureEndpoint, azureDeploymentName, azureApiVersion };
}

function createOpenAIClient() {
  const { azureApiKey, azureEndpoint, azureDeploymentName, azureApiVersion } =
    getAzureConfig();
  const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;

  if (useAzure) {
    const endpoint = azureEndpoint.replace(/\/$/, "");
    return new OpenAI({
      apiKey: azureApiKey,
      baseURL: `${endpoint}/openai/deployments/${azureDeploymentName}`,
      defaultQuery: { "api-version": azureApiVersion },
      defaultHeaders: { "api-key": azureApiKey },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI is not configured. Set OPENAI_API_KEY or Azure OpenAI variables."
    );
  }

  return new OpenAI({ apiKey });
}

function getHandleRequest() {
  if (cachedHandleRequest) {
    return cachedHandleRequest;
  }

  const openaiClient = createOpenAIClient();
  const serviceAdapter = new OpenAIAdapter({ openai: openaiClient });
  const runtime = new CopilotRuntime();
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  cachedHandleRequest = handleRequest;
  return handleRequest;
}

async function handleCopilotRequest(req) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const handleRequest = getHandleRequest();
    return handleRequest(req);
  } catch (error) {
    console.error("[CopilotKit] Configuration error:", error.message);
    return NextResponse.json(
      { error: error.message || "AI service is not configured" },
      { status: 503 }
    );
  }
}

export async function GET(req) {
  return handleCopilotRequest(req);
}

export async function POST(req) {
  return handleCopilotRequest(req);
}
