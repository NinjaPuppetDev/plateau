import { sdk } from '@farcaster/miniapp-sdk';
import { useCallback, useState, useEffect } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

export function useFarcasterActions() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [providerReady, setProviderReady] = useState(false);

  // Initialize provider and signer once
  const initProvider = useCallback(async () => {
    try {
      const ethProvider = await sdk.wallet.getEthereumProvider();
      if (!ethProvider) throw new Error('Farcaster Ethereum provider not available');

      const browserProvider = new BrowserProvider(ethProvider);
      const signerInstance = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(signerInstance);
      setProviderReady(true);

      return { browserProvider, signerInstance };
    } catch (error) {
      console.error('Farcaster provider init failed:', error);
      throw error;
    }
  }, []);

  // Sign in
  const signIn = useCallback(async (nonce: string) => {
    try {
      const result = await sdk.actions.signIn({
        nonce,
        acceptAuthAddress: true,
      });
      return result;
    } catch (error) {
      console.error('Sign in failed:', error);
      throw error;
    }
  }, []);

  // Compose cast
  const composeCast = useCallback(async (text: string, embeds?: string[]) => {
    try {
      const result = await sdk.actions.composeCast({
        text,
        embeds: embeds as [string] | [string, string] | undefined,
      });
      return result;
    } catch (error) {
      console.error('Compose cast failed:', error);
      throw error;
    }
  }, []);

  // Add mini app
  const addMiniApp = useCallback(async () => {
    try {
      await sdk.actions.addMiniApp();
    } catch (error) {
      console.error('Add mini app failed:', error);
      throw error;
    }
  }, []);

  // Get cached provider and signer or initialize if not ready
  const getProviderAndSigner = useCallback(async () => {
    if (providerReady && provider && signer) {
      return { provider, signer };
    }
    return await initProvider();
  }, [providerReady, provider, signer, initProvider]);

  return {
    signIn,
    composeCast,
    addMiniApp,
    providerReady,
    provider,
    signer,
    initProvider,
    getProviderAndSigner,
  };
}
