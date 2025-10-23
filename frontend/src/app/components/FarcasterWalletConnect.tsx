// components/FarcasterWalletConnect.tsx
'use client';

import React, { useState } from 'react';
import { useFarcasterActions } from '../../hooks/useFarcasterActions';

interface FarcasterWalletConnectProps {
  applicationId: string;
  onWalletConnected: (address: string) => void;
}

export default function FarcasterWalletConnect({ applicationId, onWalletConnected }: FarcasterWalletConnectProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  
  const { getProviderAndSigner, providerReady } = useFarcasterActions();

  const connectWallet = async () => {
    setConnecting(true);
    setError(null);
    
    try {
      const result = await getProviderAndSigner();
      // Handle both return types from getProviderAndSigner
      const signer = 'signer' in result ? result.signer : result.signerInstance;
      const address = await signer.getAddress();
      
      setConnectedAddress(address);
      onWalletConnected(address);
      
      console.log('✅ Farcaster wallet connected:', address);
    } catch (err: any) {
      console.error('❌ Failed to connect Farcaster wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  };

  if (connectedAddress) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-700 text-sm font-medium">✅ Wallet Connected</p>
            <p className="text-green-600 text-xs mt-1">
              {connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-blue-700 text-sm font-medium">Connect Your Wallet</p>
          <p className="text-blue-600 text-xs mt-1">
            Connect your embedded wallet to receive payments for this job
          </p>
          {error && (
            <p className="text-red-600 text-xs mt-1">{error}</p>
          )}
        </div>
        <button
          onClick={connectWallet}
          disabled={connecting}
          className="ml-3 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {connecting ? (
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
          ) : (
            'Connect'
          )}
        </button>
      </div>
    </div>
  );
}