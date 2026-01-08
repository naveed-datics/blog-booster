import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";

// Get Azure OpenAI config (same as write-blog route)
let azureApiKey = process.env.AZURE_OPENAI_API_KEY;
let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
let azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
let azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

// Remove quotes if present (common in .env files)
if (azureApiKey) azureApiKey = azureApiKey.replace(/^["']|["']$/g, "");
if (azureEndpoint) azureEndpoint = azureEndpoint.replace(/^["']|["']$/g, "");
if (azureDeploymentName) azureDeploymentName = azureDeploymentName.replace(/^["']|["']$/g, "");
if (azureApiVersion) azureApiVersion = azureApiVersion.replace(/^["']|["']$/g, "");

// Check if Azure OpenAI is configured
const useAzure = azureApiKey && azureEndpoint && azureDeploymentName;

// Initialize OpenAI client
let openaiClient;
if (useAzure) {
  // Configure for Azure OpenAI
  const endpoint = azureEndpoint.replace(/\/$/, "");
  openaiClient = new OpenAI({
    apiKey: azureApiKey,
    baseURL: `${endpoint}/openai/deployments/${azureDeploymentName}`,
    defaultQuery: { "api-version": azureApiVersion },
    defaultHeaders: { "api-key": azureApiKey },
  });
} else {
  // Use standard OpenAI
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Initialize the service adapter with the configured OpenAI client
const serviceAdapter = new OpenAIAdapter({ openai: openaiClient });

// Initialize the Copilot Runtime
const runtime = new CopilotRuntime();

export async function POST(req) {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
}

