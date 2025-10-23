// scripts/inspect.js  (run with node scripts/inspect.js)
const { ethers } = require('ethers');

const RPC = process.env.RPC || 'https://base-sepolia.g.alchemy.com/v2/YOUR_KEY';
const ESCROW = process.env.ESCROW || '0xFd18d3ab67c18B689EFD94bb33C19D1fD3614b2b';
const TOKEN = process.env.TOKEN || '0x3934A6a5952b2159B87C652b1919F718fb300eD6';
const HOLDER = process.env.HOLDER || '0xC022d2263835D14D5AcA7E3f45ADA019D1E23D9e'; // your wallet

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

const ESCROW_ABI = [
  "function token() view returns (address)",
  "function jobCount() view returns (uint256)",
  "function jobs(uint256) view returns (address client,address worker,uint256 amount,uint256 partialPct,uint8 state)",
];

async function main(){
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log('Connected to', (await provider.getNetwork()).chainId);

  // check code at escrow
  const escrowCode = await provider.getCode(ESCROW);
  console.log('Escrow bytecode present?', escrowCode && escrowCode !== '0x');

  // inspect token stored in escrow
  try {
    const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, provider);
    const tokenAddr = await escrow.token();
    console.log('Escrow.token() =>', tokenAddr);
  } catch(e){
    console.warn('Could not read escrow.token()', e.message || e);
  }

  // inspect token contract
  try {
    const token = new ethers.Contract(TOKEN, ERC20_ABI, provider);
    const [name, sym, dec, bal, allowance] = await Promise.all([
      token.name().catch(()=>'<no name>'),
      token.symbol().catch(()=>'<no symbol>'),
      token.decimals().catch(()=>18),
      token.balanceOf(HOLDER).catch(()=>ethers.BigInt(0)),
      token.allowance(HOLDER, ESCROW).catch(()=>ethers.BigInt(0)),
    ]);
    console.log('Token name/symbol/decimals =>', name, sym, Number(dec));
    console.log('Holder balance =>', bal.toString());
    console.log('Allowance to escrow =>', allowance.toString());
  } catch (e) {
    console.error('Failed to query token:', e.message || e);
  }
}

main().catch(console.error);
