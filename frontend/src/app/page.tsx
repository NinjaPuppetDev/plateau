// src/app/page.tsx
'use client';

import React, { useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useFarcaster } from '../lib/farcaster';
import { useFarcasterActions } from '../hooks/useFarcasterActions';
import ConnectWallet from './components/ConnectWallet';
import CreateJob from './components/CreateJob';
import JobList from './components/JobList';
import MyJobs from './components/MyJobs';

const REQUIRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);

export default function Page() {
  const { isInMiniApp, user, isLoading: farcasterLoading } = useFarcaster();
  const { signIn, addMiniApp } = useFarcasterActions();

  // RainbowKit hooks
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [error, setError] = useState<string | null>(null);

  // Environment-specific variables
  const currentEnvironment = isInMiniApp ? 'farcaster' : 'web';

  // Check if we're on the correct network
  const networkMismatch = !isInMiniApp && isConnected && chainId !== REQUIRED_CHAIN_ID;

  // Request network switch
  const requestSwitchNetwork = async () => {
    if (isInMiniApp) return;
    
    try {
      await switchChain({ chainId: REQUIRED_CHAIN_ID });
      setError(null);
    } catch (err: any) {
      console.error('Network switch failed:', err);
      setError('Failed to switch network. Please switch manually in your wallet.');
    }
  };

  const handleAddToFarcaster = async () => {
    if (!isInMiniApp) return;
    setError(null);
    try {
      await addMiniApp();
    } catch (err: any) {
      console.error('Add mini app error:', err);
      setError(err?.message || 'Failed to add to Farcaster');
    }
  };

  const handleSignIn = async () => {
    if (!isInMiniApp) return;
    setError(null);
    try {
      const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await signIn(nonce);
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err?.message || 'Failed to sign in');
    }
  };

  if (farcasterLoading) {
    return (
      <main className={`min-h-screen bg-white flex items-center justify-center text-gray-900 ${isInMiniApp ? 'p-2' : 'p-4'}`}>
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading Plateau...</div>
          <div className="text-gray-600">
            Initializing {isInMiniApp ? 'Farcaster Mini App' : 'Web App'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-white text-gray-900 ${isInMiniApp ? 'p-2' : 'p-4 md:p-8'}`}>
      <div className={`mx-auto space-y-6 ${isInMiniApp ? 'max-w-full' : 'max-w-6xl'}`}>
        
        {/* Header */}
        <header className={`flex items-start justify-between gap-4 ${isInMiniApp ? 'flex-col' : 'flex-row'}`}>
          <div className="flex-1">
            <h1 className={`font-bold text-gray-900 ${isInMiniApp ? 'text-2xl text-center' : 'text-3xl'}`}>
              Plateau
            </h1>
            <p className={`text-gray-600 mt-2 ${isInMiniApp ? 'text-sm text-center' : ''}`}>
              {isInMiniApp 
                ? 'Browse and apply to jobs with your Farcaster profile' 
                : 'Create new jobs and browse recent ones indexed on-chain.'
              }
            </p>

            {/* User info */}
            {user && (
              <div className={`text-gray-500 mt-2 ${isInMiniApp ? 'text-xs text-center' : 'text-sm'}`}>
                Signed in as {user.displayName || user.username || `FID: ${user.fid}`}
              </div>
            )}

            {/* Environment indicator */}
            <div className={`mt-3 ${isInMiniApp ? 'text-center' : ''}`}>
              {isInMiniApp ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                  ✅ Farcaster Mini App
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                  🔧 Web Browser
                </span>
              )}
            </div>

            {/* Network info for web */}
            {!isInMiniApp && (
              <div className="text-xs text-gray-500 mt-2">
                Network: {chainId ?? 'Not connected'}
              </div>
            )}
          </div>

          {/* Connect Wallet - Only in web */}
          {!isInMiniApp && (
            <div className="flex-shrink-0">
              <ConnectWallet />
            </div>
          )}
        </header>

        {/* Error Display */}
        {error && (
          <div className={`bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 ${isInMiniApp ? 'text-sm' : ''}`}>
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Network Mismatch Warning */}
        {networkMismatch && (
          <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-yellow-700 font-medium">Wrong Network</p>
                <p className="text-yellow-600 text-sm mt-1">
                  Please switch your wallet to the required network (Chain ID: {REQUIRED_CHAIN_ID})
                </p>
                <button 
                  onClick={requestSwitchNetwork} 
                  className="mt-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Switch Network
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Job Section - Web Only */}
        {!isInMiniApp && (
          <section className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Create New Job
            </h2>
            <CreateJob />
          </section>
        )}

        {/* My Jobs Section - Web Only with Connected Wallet */}
        {!isInMiniApp && isConnected && (
          <section className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              My Job Postings
            </h2>
            <MyJobs />
          </section>
        )}

        {/* Job List Section */}
        <section className={`bg-white rounded-xl border border-gray-200 shadow-sm ${isInMiniApp ? 'p-4' : 'p-6'}`}>
          <h2 className={`font-semibold text-gray-900 mb-4 ${isInMiniApp ? 'text-lg' : 'text-xl'}`}>
            {isInMiniApp ? 'Available Jobs' : 'Recent Jobs'}
          </h2>
          <JobList 
            farcasterUser={isInMiniApp ? user : null}
            environment={currentEnvironment}
          />
        </section>

        {/* Farcaster Actions - Mini App Only */}
        {isInMiniApp && user && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button 
              onClick={handleAddToFarcaster} 
              className="flex items-center justify-center px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium transition-colors w-full sm:w-auto"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add to Farcaster
            </button>
            <button 
              onClick={handleSignIn} 
              className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors w-full sm:w-auto"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
              Sign In
            </button>
          </div>
        )}
      </div>
    </main>
  );
}