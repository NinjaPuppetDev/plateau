// src/lib/farcaster.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

interface FarcasterContextType {
  isReady: boolean;
  user: any | null;
  isLoading: boolean;
  isInMiniApp: boolean; // Add this line
}

const FarcasterContext = createContext<FarcasterContextType | undefined>(undefined);

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        // Check if we're in a Farcaster Mini App environment
        const inMiniAppEnv = await sdk.isInMiniApp();
        setIsInMiniApp(inMiniAppEnv);
        
        if (inMiniAppEnv) {
          // Get user context from Farcaster
          const context = sdk.context;
          setUser((await context).user);
          
          // Hide splash screen and show your app
          await sdk.actions.ready();
          
          console.log('Farcaster Mini App initialized', context);
        } else {
          console.log('Not in Farcaster Mini App - running in regular browser');
        }
        
        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize Farcaster SDK:', error);
        setIsReady(true);
      } finally {
        setIsLoading(false);
      }
    };

    initializeFarcaster();
  }, []);

  return (
    <FarcasterContext.Provider value={{ 
      isReady, 
      user, 
      isLoading, 
      isInMiniApp  // Make sure this is included
    }}>
      {children}
    </FarcasterContext.Provider>
  );
}

export const useFarcaster = () => {
  const context = useContext(FarcasterContext);
  if (context === undefined) {
    throw new Error('useFarcaster must be used within a FarcasterProvider');
  }
  return context;
};