/**
 * Memcode TUI — opencode-style minimalist layout.
 *
 * Central visual anchor (logo), centered input box, clean footer.
 * No log dumping. Status messages appear briefly then disappear.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { AgentSessionRuntime } from "../core/agent-session-runtime.ts";
import type { AgentSessionEvent } from "../core/agent-session.ts";
import { theme } from "./theme.ts";
import { InputBar } from "./components/inputbar.tsx";
import type { Message, MemorySource } from "./components/messages.tsx";
import {
	getGitDiffContext,
	createGitCommandHandlers,
} from "./integrations/git.ts";
import { useKeymap } from "./keymap.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppProps {
	runtime: AgentSessionRuntime;
}

// ---------------------------------------------------------------------------
// Memory attribution extraction
// ---------------------------------------------------------------------------

function extractMemorySources(details: any): MemorySource[] {
	if (!details || details.error) return [];
	const entryCount = details.entryCount ?? 0;
	if (entryCount === 0) return [];
	return [{ scope: "project", name: "memory", count: entryCount }];
}

// ---------------------------------------------------------------------------
// Git context cache
// ---------------------------------------------------------------------------

let gitContextCache: { context: string; ts: number } | null = null;
const GIT_CONTEXT_TTL_MS = 10_000;

async function getCachedGitDiffContext(cwd: string): Promise<string> {
	const now = Date.now();
	if (gitContextCache && now - gitContextCache.ts < GIT_CONTEXT_TTL_MS) {
		return gitContextCache.context;
	}
	const context = await getGitDiffContext(cwd);
	gitContextCache = { context, ts: now };
	return context;
}

function invalidateGitContextCache(): void {
	gitContextCache = null;
}

function parseGitCommand(text: string): { sub: string; arg: string } | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/git")) return null;
	const rest = trimmed.slice(4).trim();
	const spaceIdx = rest.indexOf(" ");
	if (spaceIdx === -1) return { sub: rest, arg: "" };
	return { sub: rest.slice(0, spaceIdx), arg: rest.slice(spaceIdx + 1).trim() };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App({ runtime }: AppProps) {
	const cwd = runtime.cwd;
	const sessionId = (runtime.session.sessionId ?? runtime.session.sessionFile ?? "local").slice(-6);
	const modelName = runtime.session.model?.name ?? runtime.session.model?.id ?? "unknown";
	const thinkingLevel = runtime.session.thinkingLevel ?? "off";

	// --- State ---
	const [messages, setMessages] = useState<Message[]>([]);
	const [status, setStatus] = useState("");
	const [memoryCount] = useState(0);
	const [streamingContent, setStreamingContent] = useState("");
	const [showMessages, setShowMessages] = useState(false);
	const pendingAttributionRef = useRef<MemorySource[]>([]);

	// --- Git command handlers ---
	const addMessage = useCallback((role: "assistant", content: string) => {
		setMessages((prev) => [...prev, { role, content }]);
	}, []);

	const sendMessage = useCallback(async (text: string) => {
		await runtime.session.prompt(text);
	}, [runtime]);

	const gitHandlers = useRef(createGitCommandHandlers(cwd, addMessage, sendMessage));
	useEffect(() => {
		gitHandlers.current = createGitCommandHandlers(cwd, addMessage, sendMessage);
	}, [addMessage, sendMessage, cwd]);

	// --- Help overlay ---
	const [showHelp, setShowHelp] = useState(false);

	// --- Keyboard shortcuts ---
	const keymap = useKeymap({
		onInterrupt: useCallback(() => {
			setStatus("Interrupted");
			setStreamingContent("");
			setTimeout(() => setStatus(""), 1500);
		}, []),
		onExit: useCallback(() => { process.exit(0); }, []),
		onHelp: useCallback(() => {
			let wasOpen = false;
			setShowHelp((prev) => { wasOpen = prev; return !prev; });
			return wasOpen;
		}, []),
		onPromote: useCallback(async () => {
			try {
				const mod = await import("./commands/memory-commands.ts");
				const promoteHandler = mod.MEMORY_COMMANDS.promote;
				if (promoteHandler) {
					const result = await promoteHandler("", {
						cwd, runtime,
						toast: (msg: string) => setStatus(msg),
						addMessage: (msg: string) => setMessages((prev) => [...prev, { role: "assistant", content: msg }]),
					});
					if (result.toast) {
						setStatus(result.toast.msg);
						setTimeout(() => setStatus(""), 2000);
					}
				}
			} catch (err) {
				setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
				setTimeout(() => setStatus(""), 2000);
			}
		}, [cwd, runtime]),
		scroll: {
			scrollDown: useCallback(() => {}, []),
			scrollUp: useCallback(() => {}, []),
			scrollToTop: useCallback(() => {}, []),
			scrollToBottom: useCallback(() => {}, []),
			pageDown: useCallback(() => {}, []),
			pageUp: useCallback(() => {}, []),
		},
	});

	// --- Subscribe to agent events ---
	useEffect(() => {
		const unsubscribe = runtime.session.subscribe((event: AgentSessionEvent) => {
			switch (event.type) {
				case "message_start":
					if (event.message.role === "assistant") {
						setStatus("Thinking...");
						setStreamingContent("");
					}
					break;
				case "message_update":
					if (event.message.role === "assistant") {
						const textParts = event.message.content
							.filter((c: any) => c.type === "text")
							.map((c: any) => c.text);
						setStreamingContent(textParts.join(""));
					}
					break;
				case "message_end":
					if (event.message.role === "assistant") {
						const textParts = event.message.content
							.filter((c: any) => c.type === "text")
							.map((c: any) => c.text);
						const content = textParts.join("") || streamingContent;
						if (content) {
							const attribution = pendingAttributionRef.current.length > 0
								? pendingAttributionRef.current : undefined;
							setMessages((prev) => [...prev, { role: "assistant", content, attribution }]);
						}
						pendingAttributionRef.current = [];
						setStreamingContent("");
						setStatus("");
					}
					break;
				case "tool_execution_start":
					setStatus(`Using ${event.toolName}...`);
					break;
				case "tool_execution_end": {
					if (event.toolName === "memorix_search" && !event.isError && event.result) {
						const newSources = extractMemorySources(event.result.details);
						if (newSources.length > 0) pendingAttributionRef.current.push(...newSources);
					}
					setStatus("");
					break;
				}
				case "turn_end":
				case "agent_end":
					setStatus("");
					setStreamingContent("");
					break;
			}
		});
		return unsubscribe;
	}, [runtime]);

	// --- Send handler ---
	const handleSend = useCallback(async (text: string) => {
		if (!text.trim()) return;

		// Handle /git commands locally
		const gitCmd = parseGitCommand(text);
		if (gitCmd) {
			const fullKey = `git ${gitCmd.sub}` as keyof typeof gitHandlers.current;
			const handler = gitHandlers.current[fullKey];
			if (handler) {
				setShowMessages(true);
				setMessages((prev) => [...prev, { role: "user", content: text }]);
				setStatus("Running git...");
				try {
					const result = await handler(gitCmd.arg || undefined);
					setMessages((prev) => [...prev, { role: "assistant", content: result }]);
					invalidateGitContextCache();
				} catch (err) {
					setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
				}
				setStatus("");
				return;
			}
		}

		// Auto-inject git diff context
		let promptText = text;
		if (!text.startsWith("/")) {
			try {
				const gitContext = await getCachedGitDiffContext(cwd);
				if (gitContext) promptText = `${gitContext}\n\n${text}`;
			} catch { /* non-fatal */ }
		}

		// Show messages view and append user message
		setShowMessages(true);
		setMessages((prev) => [...prev, { role: "user", content: text }]);
		setStatus("Sending...");

		try {
			await runtime.session.prompt(promptText);
		} catch (err) {
			setStatus("");
			setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
		}
	}, [runtime, cwd]);

	// --- Render ---
	return (
		<box width="100%" height="100%" backgroundColor={theme.bgBase} flexDirection="column">
			{/* ── Central content area ── */}
			<box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">

				{/* Logo */}
				<box flexDirection="column" alignItems="center" marginBottom={2}>
					<text fg={theme.brand}>{"◆ MEMCODE"}</text>
					<text fg={theme.textMuted}>{"v1.0.10"}</text>
				</box>

				{/* Input box — centered, max 75% width */}
				<box width="75%" maxWidth={90} flexDirection="column">
					<InputBar
						onSend={handleSend}
						vimMode={keymap.vimMode}
						onSwitchToNormal={() => keymap.setVimMode("NORMAL")}
					/>
				</box>

				{/* Project info — dim, below input */}
				<box marginTop={1} flexDirection="row" alignItems="center">
					<text fg={theme.textMuted}>
						{`project: ${cwd.split(/[\\/]/).pop()} · branch: ... · session:${sessionId}`}
					</text>
				</box>

				{/* Status message — appears briefly then disappears */}
				{status ? (
					<box marginTop={1}>
						<text fg={theme.textSecondary}>{status}</text>
					</box>
				) : null}

				{/* Streaming content — shows while agent is responding */}
				{streamingContent ? (
					<box width="75%" maxWidth={90} marginTop={1} paddingLeft={1} paddingRight={1}>
						<text fg={theme.textPrimary}>{streamingContent.slice(0, 500)}</text>
					</box>
				) : null}
			</box>

			{/* ── Footer — model info left, shortcuts right ── */}
			<box height={1} flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
				<text fg={theme.textMuted}>{`${modelName} · ${thinkingLevel}`}</text>
				<text fg={theme.textMuted}>{"esc  ctrl+c  ? help"}</text>
			</box>

			{/* ── Help overlay ── */}
			{showHelp ? (
				<box position="absolute" top={0} left={0} width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="center" zIndex={100}>
					<box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor={theme.bgBase} opacity={0.8} />
					<box width={50} flexDirection="column" border borderColor={theme.borderSubtle} backgroundColor={theme.bgSurface} paddingLeft={1} paddingRight={1}>
						<text fg={theme.brand}>{"Keyboard Shortcuts"}</text>
						<text fg={theme.textMuted}>{"────────────────────────────────"}</text>
						<text fg={theme.textSecondary}>{"  Esc ........ interrupt / vim NORMAL"}</text>
						<text fg={theme.textSecondary}>{"  Ctrl+C ..... exit"}</text>
						<text fg={theme.textSecondary}>{"  ? .......... toggle help"}</text>
						<text fg={theme.textSecondary}>{"  j/k ........ scroll down/up"}</text>
						<text fg={theme.textSecondary}>{"  gg/G ....... top/bottom"}</text>
						<text fg={theme.textSecondary}>{"  p .......... promote to memory"}</text>
						<text fg={theme.textSecondary}>{"  /vim ....... toggle vim mode"}</text>
						<text fg={theme.textMuted}>{"────────────────────────────────"}</text>
						<text fg={theme.textMuted}>{"Press ? or Esc to close"}</text>
					</box>
				</box>
			) : null}
		</box>
	);
}

export { App };
export type { AppProps };
