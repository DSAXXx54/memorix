#!/usr/bin/env node
/**
 * CLI entry point for the refactored coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import { APP_NAME } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = APP_NAME;
process.env.MEMCODE_CODING_AGENT = "true";
// Default embedding to "auto" so memcode uses local embeddings (fastembed/transformers)
// when available, falling back to BM25. Users can still override via MEMORIX_EMBEDDING env var.
process.env.MEMORIX_EMBEDDING = process.env.MEMORIX_EMBEDDING || "auto";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

main(process.argv.slice(2));
