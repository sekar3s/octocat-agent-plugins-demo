// Zero-dependency MCP (Model Context Protocol) server over stdio.
// Source of truth: shared/servers/lib/mcp-stdio.mjs — copied into each plugin by scripts/sync-shared.mjs.
// Do not edit the copies under plugins/*/servers/lib directly.

import { fileURLToPath } from 'node:url';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export class ToolError extends Error {}

/**
 * @typedef {object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {object} inputSchema JSON Schema for the tool arguments
 * @property {object} [annotations] MCP tool annotations (readOnlyHint, etc.)
 * @property {(args: object, ctx: ToolContext) => Promise<unknown> | unknown} handler
 *
 * @typedef {object} ToolContext
 * @property {() => Promise<string[]>} getRoots Workspace roots advertised by the client (absolute paths)
 * @property {(msg: string) => void} log Writes to stderr (never stdout)
 */

export function createServer({ name, version, instructions, tools }) {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  let clientCapabilities = {};
  let nextRequestId = 1;
  const pending = new Map();
  let cachedRoots;

  const log = (msg) => process.stderr.write(`[${name}] ${msg}\n`);
  const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

  function request(method, params, timeoutMs = 3000) {
    const id = `srv-${nextRequestId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }

  async function getRoots() {
    if (cachedRoots) return cachedRoots;
    if (!clientCapabilities?.roots) return [];
    try {
      const result = await request('roots/list', {});
      cachedRoots = (result?.roots ?? [])
        .map((r) => r?.uri)
        .filter((uri) => typeof uri === 'string' && uri.startsWith('file:'))
        .map((uri) => fileURLToPath(uri));
      return cachedRoots;
    } catch (err) {
      log(`roots/list unavailable: ${err.message}`);
      return [];
    }
  }

  function toContent(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return { content: [{ type: 'text', text }] };
  }

  async function handleRequest(msg) {
    const { id, method, params } = msg;
    switch (method) {
      case 'initialize': {
        clientCapabilities = params?.capabilities ?? {};
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
        return send({
          id,
          result: {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name, version },
            ...(instructions ? { instructions } : {}),
          },
        });
      }
      case 'ping':
        return send({ id, result: {} });
      case 'tools/list':
        return send({
          id,
          result: {
            tools: tools.map(({ name: n, description, inputSchema, annotations }) => ({
              name: n,
              description,
              inputSchema,
              ...(annotations ? { annotations } : {}),
            })),
          },
        });
      case 'tools/call': {
        const tool = toolMap.get(params?.name);
        if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
        try {
          const value = await tool.handler(params?.arguments ?? {}, { getRoots, log });
          return send({ id, result: toContent(value) });
        } catch (err) {
          const message = err instanceof ToolError ? err.message : `Internal error: ${err.message}`;
          if (!(err instanceof ToolError)) log(err.stack ?? String(err));
          return send({ id, result: { content: [{ type: 'text', text: message }], isError: true } });
        }
      }
      default:
        if (id !== undefined) send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  }

  function handleLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: 'Parse error' } });
    }
    // Responses (no method) are never requests: settle a pending server request or drop them
    // (e.g. a roots/list reply that arrives after its timeout).
    if (!msg.method) {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      pending.delete(msg.id);
      return msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result);
    }
    if (msg.method === 'notifications/roots/list_changed') {
      cachedRoots = undefined;
      return;
    }
    if (msg.method?.startsWith('notifications/')) return;
    handleRequest(msg).catch((err) => log(err.stack ?? String(err)));
  }

  return {
    start() {
      let buffer = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          handleLine(line);
        }
      });
      process.stdin.on('end', () => process.exit(0));
      log(`v${version} ready (stdio)`);
    },
  };
}
