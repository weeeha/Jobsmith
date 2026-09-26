import { createGateway } from "@ai-sdk/gateway";
import { createAnthropic } from "@ai-sdk/anthropic";
import { env } from "@/lib/env";
import type { AiConfig } from "./config";
import type { AiDriver } from "./driver";
import { createSdkDriver, type SdkProviderOptions } from "./sdk-driver";
import { createFakeDriver } from "./fake";

export const GATEWAY_PROVIDER_OPTIONS = { gateway: { zeroDataRetention: true } } as const satisfies SdkProviderOptions;

export function driverFromConfig(config: AiConfig): AiDriver {
  if (config.provider === "gateway") {
    const gateway = createGateway(config.apiKey ? { apiKey: config.apiKey } : {});
    return createSdkDriver({
      name: "gateway",
      model: gateway(config.model),
      modelId: config.model,
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
    });
  }
  if (config.provider === "anthropic") {
    return createSdkDriver({
      name: "anthropic",
      model: createAnthropic({ apiKey: config.apiKey })(config.model),
      modelId: config.model,
    });
  }
  return createFakeDriver();
}

let cachedDriver: AiDriver | null | undefined;

export function getAiDriver(): AiDriver | null {
  if (cachedDriver === undefined) {
    const config = env().AI;
    cachedDriver = config ? driverFromConfig(config) : null;
  }
  return cachedDriver;
}
