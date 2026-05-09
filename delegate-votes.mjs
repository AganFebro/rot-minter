import 'dotenv/config';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const DELEGATE_CONTRACT = '0x1D370cFCeD3c7F9101f5dCa5EE626447276d20be';

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

async function main() {
  const rpcUrl = readRequiredEnv('RPC_URL');
  const privateKey = readRequiredEnv('PRIVATE_KEY');

  if (!isAddress(DELEGATE_CONTRACT)) {
    throw new Error(`Invalid delegate contract: ${DELEGATE_CONTRACT}`);
  }

  if (!privateKey.startsWith('0x')) {
    throw new Error('PRIVATE_KEY must start with 0x');
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  const currentDelegation = await publicClient.getDelegation({
    address: account.address,
  });

  if (
    currentDelegation &&
    currentDelegation.toLowerCase() === DELEGATE_CONTRACT.toLowerCase()
  ) {
    console.log(
      `Wallet ${account.address} already delegated to ${DELEGATE_CONTRACT}`,
    );
    return;
  }

  const authorization = await walletClient.signAuthorization({
    account,
    contractAddress: DELEGATE_CONTRACT,
    executor: 'self',
  });

  const hash = await walletClient.sendTransaction({
    account,
    authorizationList: [authorization],
    to: account.address,
    data: '0x',
    value: 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const updatedDelegation = await publicClient.getDelegation({
    address: account.address,
  });

  if (
    !updatedDelegation ||
    updatedDelegation.toLowerCase() !== DELEGATE_CONTRACT.toLowerCase()
  ) {
    throw new Error(
      `Delegation update failed. Current delegation: ${updatedDelegation ?? 'none'}`,
    );
  }

  console.log(`EIP-7702 delegation updated for ${account.address}`);
  console.log(`Delegate contract: ${DELEGATE_CONTRACT}`);
  console.log(`Authorization nonce: ${authorization.nonce}`);
  console.log(`Tx hash: ${hash}`);
  console.log(`Block: ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unknown EIP-7702 error',
  );
  process.exit(1);
});
