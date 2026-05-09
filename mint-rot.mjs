import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';

const DEFAULT_MCP_URL = 'https://www.brainrot.dog/api/mcp';
const RELAYER_NOT_CONFIGURED_ERROR = 'error: RELAYER_SERVER_URL not configured';

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function readMintAddress() {
  if (process.env.MINT_ADDRESS) {
    return process.env.MINT_ADDRESS;
  }

  const ownerPrivateKey =
    process.env.OWNER_PRIVATE_KEY ?? process.env.PRIVATE_KEY;

  if (!ownerPrivateKey) {
    throw new Error(
      'Missing MINT_ADDRESS. Set MINT_ADDRESS or OWNER_PRIVATE_KEY/PRIVATE_KEY.',
    );
  }

  if (!ownerPrivateKey.startsWith('0x')) {
    throw new Error('OWNER_PRIVATE_KEY/PRIVATE_KEY must start with 0x');
  }

  return privateKeyToAccount(ownerPrivateKey).address;
}

function readCount() {
  const rawCount = process.env.MINT_COUNT ?? '1';
  const count = Number(rawCount);

  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error('MINT_COUNT must be an integer in range 1-10');
  }

  return count;
}

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

function parseWalletStatus(text) {
  const delegated = /delegated:\s*true/i.test(text);
  const slotsRemainingMatch = text.match(/slots remaining:\s*(\d+)/i);
  const slotsRemaining = slotsRemainingMatch
    ? Number(slotsRemainingMatch[1])
    : null;

  return { delegated, slotsRemaining };
}

function shouldRetry(error) {
  return error instanceof Error && error.message.includes(RELAYER_NOT_CONFIGURED_ERROR);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const address = readMintAddress();
  const count = readCount();
  const retryDelayMs = readRetryDelayMs();
  const maxRetries = readMaxRetries();

  const walletStatus = unwrapToolResult(
    await callMcp('tools/call', {
      name: 'check_wallet',
      arguments: { address },
    }),
  );

  const supplyStatus = unwrapToolResult(
    await callMcp('tools/call', {
      name: 'get_supply',
      arguments: {},
    }),
  );

  const { delegated, slotsRemaining } = parseWalletStatus(walletStatus);

  if (!delegated) {
    throw new Error(
      `Wallet ${address} not delegated yet.\n${walletStatus}`,
    );
  }

  if (slotsRemaining !== null && count > slotsRemaining) {
    throw new Error(
      `Requested ${count} slot(s), but only ${slotsRemaining} slot(s) remain for ${address}.`,
    );
  }

  let result;
  let attempt = 0;

  while (true) {
    try {
      result = unwrapToolResult(
        await callMcp('tools/call', {
          name: count === 1 ? 'mint' : 'batch_mint',
          arguments: count === 1 ? { address } : { address, count },
        }),
      );
      break;
    } catch (error) {
      if (!shouldRetry(error)) {
        throw error;
      }

      if (maxRetries !== 0 && attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      console.error(
        `${error.message}. Retrying in ${Math.floor(retryDelayMs / 1000)}s (attempt ${attempt}${maxRetries === 0 ? '' : `/${maxRetries}`})...`,
      );
      await sleep(retryDelayMs);
    }
  }

  console.log(`MCP endpoint: ${process.env.MCP_URL ?? DEFAULT_MCP_URL}`);
  console.log(`Address: ${address}`);
  console.log(`Count: ${count}`);
  console.log('');
  console.log(walletStatus);
  console.log('');
  console.log(supplyStatus);
  console.log('');
  console.log(result);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unknown MCP mint error',
  );
  process.exit(1);
});
