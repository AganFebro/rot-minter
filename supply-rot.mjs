import 'dotenv/config';

const DEFAULT_MCP_URL = 'https://www.brainrot.dog/api/mcp';
const FETCH_FAILED_ERROR = 'fetch failed';
const RETRYABLE_STATUS_ERRORS = [
  'MCP request failed with status 502',
  'MCP request failed with status 503',
  'MCP request failed with status 504',
];

function readRetryDelayMs() {
  const rawDelay = process.env.RETRY_DELAY_MS ?? '15000';
  const delay = Number(rawDelay);

  if (!Number.isInteger(delay) || delay < 0) {
    throw new Error('RETRY_DELAY_MS must be a non-negative integer');
  }

  return delay;
}

function readMaxRetries() {
  const rawRetries = process.env.MAX_RETRIES ?? '0';
  const maxRetries = Number(rawRetries);

  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error('MAX_RETRIES must be a non-negative integer');
  }

  return maxRetries;
}

function extractText(result) {
  if (!result?.content || !Array.isArray(result.content)) {
    return JSON.stringify(result, null, 2);
  }

  return result.content
    .filter((entry) => entry?.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
}

function unwrapToolResult(result) {
  const text = extractText(result);

  if (result?.isError) {
    throw new Error(text || 'MCP tool returned an error');
  }

  return text;
}

async function callMcp(method, params) {
  const response = await fetch(process.env.MCP_URL ?? DEFAULT_MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP request failed with status ${response.status}`);
  }

  const raw = await response.text();
  const dataLine = raw
    .split('\n')
    .find((line) => line.startsWith('data: '));

  if (!dataLine) {
    throw new Error(`Unexpected MCP response: ${raw}`);
  }

  const payload = JSON.parse(dataLine.slice(6));

  if (payload.error) {
    throw new Error(payload.error.message);
  }

  return payload.result;
}

function shouldRetry(error) {
  return (
    error instanceof Error &&
    (
      error.message.includes(FETCH_FAILED_ERROR) ||
      RETRYABLE_STATUS_ERRORS.some((message) => error.message.includes(message))
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const retryDelayMs = readRetryDelayMs();
  const maxRetries = readMaxRetries();
  let attempt = 0;

  while (true) {
    try {
      const result = unwrapToolResult(
        await callMcp('tools/call', {
          name: 'get_supply',
          arguments: {},
        }),
      );

      console.log(`MCP endpoint: ${process.env.MCP_URL ?? DEFAULT_MCP_URL}`);
      console.log(result);
      return;
    } catch (error) {
      if (!shouldRetry(error)) {
        throw error;
      }

      if (maxRetries !== 0 && attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      if (error instanceof Error && error.message.includes(FETCH_FAILED_ERROR)) {
        console.error('error fetch failed, retrying now');
      } else {
        console.error(
          `${error.message}. Retrying in ${Math.floor(retryDelayMs / 1000)}s (attempt ${attempt}${maxRetries === 0 ? '' : `/${maxRetries}`})...`,
        );
      }
      await sleep(retryDelayMs);
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unknown MCP supply error',
  );
  process.exit(1);
});
