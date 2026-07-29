// Chooses the adapter at build time based on env.
//   VITE_API_MODE=mock  (default) → uses in-memory fixtures
//   VITE_API_MODE=live            → hits the NestJS gateway
//   VITE_API_BASE_URL=https://inbox.example.com/api

import { createMockAdapter } from "./mock-adapter";
import { createHttpAdapter } from "./http-adapter";
import type { MailClient } from "./types";

const mode = (import.meta.env.VITE_API_MODE as string | undefined) ?? "mock";
const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export const mailClient: MailClient =
  mode === "live" ? createHttpAdapter(baseUrl) : createMockAdapter();

export const isLiveMode = mode === "live";
export * from "./types";
