"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";
import {
  argentWallet,
  trustWallet,
  ledgerWallet,
} from '@rainbow-me/rainbowkit/wallets';

export const config = getDefaultConfig({
  appName: "Plateau",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "default-project-id",
  chains: [baseSepolia],
  wallets: [
    {
      groupName: 'Popular',
      wallets: [argentWallet, trustWallet, ledgerWallet],
    },
  ],
  ssr: true,
});