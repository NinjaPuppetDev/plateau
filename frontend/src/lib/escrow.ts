// src/lib/escrow.ts
import type { Abi } from 'abitype';
import TalentEscrowJson from '@/abi/TalentEscrow.json';

export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '') as `0x${string}`;
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? '') as `0x${string}`;
export const escrowAbi = (TalentEscrowJson ?? TalentEscrowJson) as Abi;
