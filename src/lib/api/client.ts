// Chooses the adapter at build time based on env.
//
//   VITE_GATEWAY_URL=https://inbox.example.com/api  → live gateway (preferred)
//   VITE_API_MODE=mock|live                         → explicit override
//   VITE_API_BASE_URL=https://inbox.example.com/api → legacy alias for VITE_GATEWAY_URL
//
// If VITE_GATEWAY_URL (or the legacy VITE_API_BASE_URL) is set the frontend
// automatically talks to the NestJS gateway. If neither is set and
// VITE_API_MODE is not "live", the in-memory mock adapter is used so the UI
// keeps working during design work.

import { createMockAdapter } from "./mock-adapter";
import { createHttpAdapter } from "./http-adapter";
import type { MailClient } from "./types";

const gatewayUrl =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined);

const explicitMode = import.meta.env.VITE_API_MODE as string | undefined;

const mode: "live" | "mock" =
  explicitMode === "live" || explicitMode === "mock"
    ? explicitMode
    : gatewayUrl
      ? "live"
      : "mock";

const baseUrl = gatewayUrl ?? "/api";

export const mailClient: MailClient =
  mode === "live" ? createHttpAdapter(baseUrl) : createMockAdapter();

export const isLiveMode = mode === "live";
export const gatewayBaseUrl = baseUrl;
export * from "./types";
