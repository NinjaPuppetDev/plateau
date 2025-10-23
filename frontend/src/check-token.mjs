// scripts/check-token.mjs
import { Contract, JsonRpcProvider } from 'ethers';

function pickCliOrEnv(name, envNames = []) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].split('=')[1];
  }
  for (const n of envNames) {
    if (process.env[n]) return process.env[n];
  }
  return undefined;
}

async function checkToken(provider, tokenAddr, escrowAddr, holderAddr = '0x0000000000000000000000000000000000000000') {
  console.log('---');
  console.log('Token address:', tokenAddr);
  try {
    const code = await provider.getCode(tokenAddr);
    console.log('getCode ->', code === '0x' ? 'NO CONTRACT (0x)' : `bytecode length ${code.length}`);
    if (code === '0x') {
      console.warn('No contract at token address on this RPC/network.');
      return;
    }
  } catch (err) {
    console.error('getCode failed:', err?.message ?? err);
    return;
  }

  const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function allowance(address,address) view returns (uint256)',
  ];

  const token = new Contract(tokenAddr, ERC20_ABI, provider);

  try {
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    console.log('name / symbol / decimals ->', name, '/', symbol, '/', decimals.toString());
  } catch (err) {
    console.warn('Failed to read name/symbol/decimals:', err?.message ?? err);
  }

  if (escrowAddr) {
    try {
      const allowance = await token.allowance(holderAddr, escrowAddr);
      console.log(`allowance(${holderAddr} -> ${escrowAddr}) =`, allowance.toString());
    } catch (err) {
      console.warn('allowance() call failed:', err?.message ?? err);
    }
  }
}

async function main() {
  const rpc = pickCliOrEnv('rpc', ['RPC_URL', 'RPC', 'NEXT_PUBLIC_BASE_RPC']);
  const token = pickCliOrEnv('token', ['TOKEN', 'NEXT_PUBLIC_TOKEN_ADDRESS', 'NEXT_PUBLIC_TOKEN']);
  const alt = pickCliOrEnv('alt', ['ALT', 'NEXT_PUBLIC_TOKEN_ALT_ADDRESS']);
  const escrow = pickCliOrEnv('escrow', ['ESCROW', 'NEXT_PUBLIC_ESCROW_ADDRESS']);
  const holder = pickCliOrEnv('holder', ['HOLDER', 'CHECKER_ADDRESS']);

  if (!rpc) {
    console.error('RPC URL not provided. Use --rpc or set RPC_URL / NEXT_PUBLIC_BASE_RPC env var.');
    process.exit(2);
  }

  const provider = new JsonRpcProvider(rpc);
  try {
    const net = await provider.getNetwork();
    console.log('Connected RPC network:', net);
  } catch (err) {
    console.error('Failed to talk to RPC:', err?.message ?? err);
    process.exit(3);
  }

  if (token) {
    await checkToken(provider, token, escrow, holder);
  } else {
    console.log('no primary token provided');
  }

  if (alt) {
    await checkToken(provider, alt, escrow, holder);
  } else {
    console.log('no alt token provided');
  }

  console.log('Done.');
}

main().catch(e => {
  console.error('Fatal:', e?.message ?? e);
  process.exit(1);
});
