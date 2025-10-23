// components/JobList.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { apolloClient } from '@/lib/apollo';
import { gql } from '@apollo/client';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import TalentEscrowJson from '@/abi/TalentEscrow.json';
import { ESCROW_ADDRESS } from '@/lib/escrow';
import { useFarcasterActions } from '../../hooks/useFarcasterActions';

interface JobListProps {
  farcasterUser?: any;
  environment: 'farcaster' | 'web';
  view?: 'browse' | 'my-applications';
}

interface Job {
  job_id: string;
  client: string;
  token_addr: string;
  amount: string;
  partial_pct: string;
  tx_hash: string;
  block_number: string;
  block_timestamp: string;
  description: string;
}

interface Application {
  id: string;
  job_id: string;
  applicant_address: string | null;
  applicant_fid: string | null;
  applicant_username: string | null;
  applicant_display_name: string | null;
  applicant_pfp_url: string | null;
  applied_at: string;
  status: string;
  application_message: string | null;
  hired_by: string | null;
  hired_at: string | null;
  job: Job;
}

interface ApplicationResponse {
  createApplication: {
    success: boolean;
    message: string;
    application: Application;
  };
}

interface ApplicationsData {
  applicationsByApplicant: {
    success: boolean;
    message: string;
    applications: Application[];
  };
}

const GET_LATEST_JOBS = gql`
  query LatestJobs($limit: Int!) {
    latestJobs(limit: $limit) {
      job_id
      client
      token_addr
      amount
      partial_pct
      tx_hash
      block_number
      block_timestamp
      description
    }
  }
`;

const GET_MY_APPLICATIONS = gql`
  query ApplicationsByApplicant($applicant_address: String, $applicant_fid: String) {
    applicationsByApplicant(
      applicant_address: $applicant_address
      applicant_fid: $applicant_fid
    ) {
      success
      message
      applications {
        id
        job_id
        applicant_address
        applicant_fid
        applicant_username
        applicant_display_name
        applicant_pfp_url
        applied_at
        status
        application_message
        hired_by
        hired_at
        job {
          job_id
          client
          token_addr
          amount
          partial_pct
          tx_hash
          block_number
          block_timestamp
          description
        }
      }
    }
  }
`;

const CREATE_APPLICATION = gql`
  mutation CreateApplication($input: ApplicationInput!) {
    createApplication(input: $input) {
      success
      message
      application {
        id
        job_id
        status
        applied_at
        applicant_address
        applicant_fid
        applicant_username
        applicant_display_name
      }
    }
  }
`;

export default function JobList({ farcasterUser, environment, view = 'browse' }: JobListProps) {
  const { address, isConnected } = useAccount();
  
  // Separate states for different operations
  const [currentApplyJob, setCurrentApplyJob] = useState<string | null>(null);
  const [currentAcceptJob, setCurrentAcceptJob] = useState<string | null>(null);
  const [currentAcceptTx, setCurrentAcceptTx] = useState<{
    hash: `0x${string}` | undefined;
    jobId: string | null;
  }>({ hash: undefined, jobId: null });

  const { writeContract, error: contractError, isPending: isContractPending } = useWriteContract();
  const { isLoading: isAcceptConfirming, isSuccess: isAcceptConfirmed } = 
    useWaitForTransactionReceipt({ hash: currentAcceptTx.hash });

  const { getProviderAndSigner } = useFarcasterActions();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'browse' | 'my-applications'>(view);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  const canApply = environment === 'farcaster' ? !!farcasterUser : isConnected;
  const isMiniApp = environment === 'farcaster';

  // Load data based on active view
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (activeView === 'browse') {
          await fetchJobs();
        } else {
          await fetchMyApplications();
        }
      } catch (err) {
        setError('Cannot connect to server. Please check if server is running.');
        setLoading(false);
      }
    };

    loadData();
  }, [activeView]);

  // Real-time application status polling
  useEffect(() => {
    if (activeView === 'my-applications' && canApply) {
      const interval = setInterval(() => {
        fetchMyApplications();
      }, 15000); // Poll every 15 seconds

      return () => clearInterval(interval);
    }
  }, [activeView, canApply]);

  // Handle successful accept transaction
  useEffect(() => {
    if (isAcceptConfirmed && currentAcceptTx.jobId) {
      console.log('✅ Accept job transaction confirmed for job:', currentAcceptTx.jobId);
      setStatusMessage('✅ Job accepted successfully! Escrow is now active.');
      setCurrentAcceptTx({ hash: undefined, jobId: null });
      setCurrentAcceptJob(null);
      
      // Refresh applications to show updated status
      setTimeout(() => fetchMyApplications(), 2000);
    }
  }, [isAcceptConfirmed, currentAcceptTx.jobId]);

  // Handle transaction errors
  useEffect(() => {
    if (contractError && currentAcceptTx.jobId) {
      console.error('❌ Contract transaction failed:', contractError);
      setStatusMessage(`❌ Failed to accept job: ${contractError.message}`);
      setCurrentAcceptTx({ hash: undefined, jobId: null });
      setCurrentAcceptJob(null);
    }
  }, [contractError, currentAcceptTx.jobId]);

  const fetchJobs = async () => {
    try {
      const result = await apolloClient.query<{ latestJobs: Job[] }>({
        query: GET_LATEST_JOBS,
        variables: { limit: 20 },
        fetchPolicy: 'network-only',
      });

      if (result.data?.latestJobs) {
        setJobs(result.data.latestJobs);
      } else {
        setJobs([]);
        setError('No jobs data received');
      }
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      setError('Failed to load jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyApplications = async () => {
    if (!canApply) {
      setError('Please connect to view your applications');
      setLoading(false);
      return;
    }

    try {
      const variables: any = {};
      
      if (environment === 'farcaster' && farcasterUser) {
        variables.applicant_fid = String(farcasterUser.fid);
      } else if (environment === 'web' && address) {
        variables.applicant_address = address;
      }

      const result = await apolloClient.query<ApplicationsData>({
        query: GET_MY_APPLICATIONS,
        variables,
        fetchPolicy: 'network-only',
      });

      if (result.data?.applicationsByApplicant?.success) {
        setApplications(result.data.applicationsByApplicant.applications);
      } else {
        setApplications([]);
        setError(result.data?.applicationsByApplicant?.message || 'No applications found');
      }
    } catch (err: any) {
      console.error('Error fetching applications:', err);
      setError('Failed to load your applications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const connectFarcasterWallet = async (): Promise<string | undefined> => {
    try {
      setConnectingWallet('connecting');
      const result = await getProviderAndSigner();
      const signer = 'signer' in result ? result.signer : result.signerInstance;
      const farcasterAddress = await signer.getAddress();
      setConnectingWallet(null);
      return farcasterAddress;
    } catch (error) {
      console.error('Failed to connect Farcaster wallet:', error);
      setConnectingWallet(null);
      setStatusMessage('❌ Failed to connect wallet. Please try again.');
      return undefined;
    }
  };

  // SEPARATE FUNCTION: Just apply for a job (database only)
  const handleApply = async (jobId: string) => {
    if (!canApply) {
      setStatusMessage(environment === 'farcaster' 
        ? 'Please sign in with Farcaster to apply for jobs'
        : 'Please connect your wallet to apply for jobs'
      );
      return;
    }

    if (currentApplyJob) {
      setStatusMessage('Please wait for the current application to complete');
      return;
    }

    setCurrentApplyJob(jobId);
    setStatusMessage(null);

    try {
      setStatusMessage('Creating application...');

      const input: any = {
        job_id: jobId,
        application_message: `Applied via ${environment}`
      };

      // Add applicant info based on environment
      if (environment === 'farcaster' && farcasterUser) {
        input.applicant_fid = String(farcasterUser.fid);
        input.applicant_username = farcasterUser.username || '';
        input.applicant_display_name = farcasterUser.displayName || '';
        input.applicant_pfp_url = farcasterUser.pfpUrl || '';
        
        // Try to get Farcaster wallet address (optional for application)
        try {
          const applicantAddress = await connectFarcasterWallet();
          if (applicantAddress) {
            input.applicant_address = applicantAddress;
          }
        } catch (walletError) {
          console.warn('⚠ Could not get Farcaster wallet address during application');
          // Continue without address - user can connect later
        }
      } else if (environment === 'web' && address) {
        input.applicant_address = address;
      }

      // Create application in database only - NO on-chain transaction
      const result = await apolloClient.mutate<ApplicationResponse>({
        mutation: CREATE_APPLICATION,
        variables: { input }
      });

      if (result.data?.createApplication?.success) {
        setStatusMessage('✅ Application submitted successfully! The employer will review your application.');
        
        // Refresh the view if we're in my-applications
        if (activeView === 'my-applications') {
          setTimeout(() => fetchMyApplications(), 1000);
        }
      } else {
        setStatusMessage(`❌ Failed to create application: ${result.data?.createApplication?.message}`);
      }
    } catch (err: any) {
      console.error('Apply error:', err);
      setStatusMessage(`❌ Failed to apply: ${err.message}`);
    } finally {
      setCurrentApplyJob(null);
    }
  };

  // SEPARATE FUNCTION: Accept a job that you've been hired for (on-chain)
  const handleAcceptJob = async (application: Application) => {
    if (!canApply) {
      setStatusMessage('Please connect to accept jobs');
      return;
    }

    // Prevent multiple accept operations
    if (currentAcceptJob || currentAcceptTx.jobId) {
      setStatusMessage('Please wait for the current transaction to complete');
      return;
    }

    setCurrentAcceptJob(application.job_id);
    setStatusMessage(null);

    try {
      setStatusMessage('Preparing to accept job on-chain...');

      // For Farcaster users, ensure they have a connected wallet
      let applicantAddress = application.applicant_address;
      
      if (environment === 'farcaster' && !applicantAddress) {
        setStatusMessage('Connecting your wallet...');
        const connectedAddress = await connectFarcasterWallet();
        
        if (!connectedAddress) {
          throw new Error('Failed to connect wallet');
        }
        applicantAddress = connectedAddress;
        
        // Update the application with the connected address
        setApplications(prev => prev.map(app => 
          app.id === application.id 
            ? { ...app, applicant_address: applicantAddress }
            : app
        ));
      }

      // Convert job_id to number for the contract
      const jobId = parseInt(application.job_id);
      if (isNaN(jobId)) {
        throw new Error('Invalid job ID format');
      }

      console.log('📝 Calling acceptJob with jobId:', jobId);
      
      // Call the smart contract to accept the job and start escrow
      writeContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: TalentEscrowJson,
        functionName: 'acceptJob',
        args: [BigInt(jobId)],
      }, {
        onSuccess: (hash) => {
          console.log('✅ Accept job transaction submitted:', hash);
          setCurrentAcceptTx({ hash, jobId: application.job_id });
          setStatusMessage('Transaction submitted! Waiting for confirmation...');
        },
        onError: (err) => {
          console.error('❌ Contract write error:', err);
          setStatusMessage(`❌ Failed to accept job: ${err.message}`);
          setCurrentAcceptJob(null);
        }
      });

    } catch (err: any) {
      console.error('Accept job error:', err);
      setStatusMessage(`❌ Failed to accept job: ${err.message}`);
      setCurrentAcceptJob(null);
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return 'N/A';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount: string) => {
    return (parseInt(amount) / 1000000).toLocaleString('en-US');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HIRED': return 'bg-green-100 text-green-800 border-green-200';
      case 'REJECTED': return 'bg-red-100 text-red-800 border-red-200';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusDescription = (application: Application) => {
    switch (application.status) {
      case 'HIRED':
        return 'You have been hired! Accept the job to start working.';
      case 'REJECTED':
        return 'Your application was not selected.';
      case 'PENDING':
        return 'Your application is under review.';
      default:
        return 'Application status unknown.';
    }
  };

  // Check if a specific job is currently being processed
  const isJobBeingApplied = (jobId: string) => {
    return currentApplyJob === jobId;
  };

  const isJobBeingAccepted = (jobId: string) => {
    return currentAcceptJob === jobId || currentAcceptTx.jobId === jobId;
  };

  // Loading state
  if (loading) {
    return (
      <div className={`${isMiniApp ? 'space-y-3' : 'space-y-6'}`}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`bg-white border border-gray-200 rounded-xl animate-pulse ${
            isMiniApp ? 'p-4' : 'p-6'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-3 bg-gray-200 rounded w-32"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded w-16"></div>
            </div>
            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`text-center py-8 ${isMiniApp ? 'px-2' : 'px-4'}`}>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button 
            onClick={activeView === 'browse' ? fetchJobs : fetchMyApplications}
            className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isMiniApp ? 'space-y-4' : 'space-y-6'}`}>
      {/* View Toggle */}
      {!isMiniApp && (
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveView('browse')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeView === 'browse'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Browse Jobs
          </button>
          <button
            onClick={() => setActiveView('my-applications')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeView === 'my-applications'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            My Applications ({applications.length})
          </button>
        </div>
      )}

      {/* Status Messages */}
      {statusMessage && (
        <div className={`p-3 rounded-lg border text-sm ${
          statusMessage.includes('✅') 
            ? 'bg-green-50 border-green-200 text-green-700'
            : statusMessage.includes('❌')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {statusMessage}
        </div>
      )}

      {/* Connection Status */}
      {!canApply && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-yellow-700 text-sm">
            {environment === 'farcaster' 
              ? "Sign in with Farcaster to apply for jobs"
              : "Connect your wallet to apply for jobs"
            }
          </p>
        </div>
      )}

      {/* Browse Jobs View */}
      {activeView === 'browse' && (
        <>
          {jobs.length === 0 ? (
            <div className={`text-center py-8 ${isMiniApp ? 'px-2' : 'px-4'}`}>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <div className="text-4xl mb-3">💼</div>
                <h3 className="font-semibold text-gray-700 mb-2">No jobs available</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Check back later for new opportunities
                </p>
                <button 
                  onClick={fetchJobs}
                  className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <div className={`space-y-4 ${!isMiniApp && 'md:grid md:grid-cols-2 md:gap-6 md:space-y-0'}`}>
              {jobs.map((job) => {
                const hasApplied = applications.some(app => app.job_id === job.job_id);
                const isApplying = isJobBeingApplied(job.job_id);
                
                return (
                  <div 
                    key={job.job_id} 
                    className="bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                  >
                    {/* Job Header */}
                    <div className={`border-b border-gray-100 ${isMiniApp ? 'p-4' : 'p-6'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className={`font-semibold text-gray-900 ${isMiniApp ? 'text-base' : 'text-lg'}`}>
                            Job #{job.job_id}
                          </h3>
                          <p className="text-gray-500 text-sm mt-1">
                            Posted by {formatAddress(job.client)}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold text-gray-900 ${isMiniApp ? 'text-lg' : 'text-xl'}`}>
                            {formatAmount(job.amount)} USDC
                          </div>
                          <div className="text-gray-600 text-sm">
                            {job.partial_pct}% upfront
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className={`text-gray-700 ${isMiniApp ? 'text-sm line-clamp-2' : 'text-base'}`}>
                        {job.description || 'No description provided'}
                      </p>
                    </div>

                    {/* Job Footer */}
                    <div className={`${isMiniApp ? 'p-4' : 'p-6'}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>{formatDate(job.block_timestamp)}</span>
                          {!isMiniApp && (
                            <a 
                              href={`https://sepolia.basescan.org/tx/${job.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-gray-700 transition-colors"
                            >
                              View on BaseScan
                            </a>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          {/* Apply Button - SEPARATE from Accept Job */}
                          {hasApplied ? (
                            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-lg border border-green-200">
                              ✅ Applied
                            </span>
                          ) : (
                            <button
                              onClick={() => handleApply(job.job_id)}
                              disabled={!canApply || isApplying}
                              className={`
                                px-4 py-2 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                                ${isMiniApp 
                                  ? 'text-sm bg-black text-white hover:bg-gray-800' 
                                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500'
                                }
                              `}
                            >
                              {isApplying ? (
                                <div className="flex items-center space-x-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  <span>Applying...</span>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2">
                                  <span>📝</span>
                                  <span>{isMiniApp ? 'Apply' : 'Apply Now'}</span>
                                </div>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Farcaster User Info */}
                      {isMiniApp && farcasterUser && !hasApplied && (
                        <div className="mt-3 p-2 bg-purple-50 rounded-lg border border-purple-200">
                          <div className="flex items-center space-x-2 text-sm text-purple-700">
                            {farcasterUser.pfpUrl && (
                              <img 
                                src={farcasterUser.pfpUrl} 
                                alt="Profile" 
                                className="w-4 h-4 rounded-full"
                              />
                            )}
                            <span>
                              Applying as {farcasterUser.displayName || farcasterUser.username}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* My Applications View */}
      {activeView === 'my-applications' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="text-center py-8">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <div className="text-4xl mb-3">📝</div>
                <h3 className="font-semibold text-gray-700 mb-2">No applications yet</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Apply to jobs to see them here
                </p>
                <button 
                  onClick={() => setActiveView('browse')}
                  className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 transition-colors"
                >
                  Browse Jobs
                </button>
              </div>
            </div>
          ) : (
            applications.map((application) => {
              const isAccepting = isJobBeingAccepted(application.job_id);
              const canAccept = application.status === 'HIRED';
              
              return (
                <div 
                  key={application.id} 
                  className={`bg-white border rounded-xl p-4 ${
                    application.status === 'HIRED' 
                      ? 'border-green-200 bg-green-50' 
                      : application.status === 'REJECTED'
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Job #{application.job.job_id}
                      </h3>
                      <p className="text-gray-500 text-sm mt-1">
                        Client: {formatAddress(application.job.client)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 text-lg">
                        {formatAmount(application.job.amount)} USDC
                      </div>
                      <div className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(application.status)}`}>
                        {application.status}
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-700 text-sm mb-3">
                    {application.job.description || 'No description provided'}
                  </p>

                  {/* Status Description */}
                  <div className="mb-3">
                    <p className="text-sm text-gray-600">
                      {getStatusDescription(application)}
                    </p>
                  </div>

                  {/* SEPARATE Action Buttons for Accept vs Apply */}
                  <div className="flex gap-2 mt-4">
                    {/* Accept Job Button - Only show if hired */}
                    {application.status === 'HIRED' && (
                      <button
                        onClick={() => handleAcceptJob(application)}
                        disabled={isAccepting}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isAccepting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Accepting...
                          </>
                        ) : (
                          <>
                            <span>✅</span>
                            Accept Job & Start Escrow
                          </>
                        )}
                      </button>
                    )}

                    {/* Connect Wallet Button for Farcaster users without address */}
                    {!application.applicant_address && environment === 'farcaster' && application.status === 'HIRED' && (
                      <button
                        onClick={() => connectFarcasterWallet().then(() => fetchMyApplications())}
                        disabled={connectingWallet !== null}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {connectingWallet ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Connecting...
                          </>
                        ) : (
                          <>
                            <span>🔗</span>
                            Connect Wallet
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Wallet Status */}
                  {application.applicant_address && (
                    <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-green-700 text-sm">
                        <strong>✅ Wallet connected:</strong> {formatAddress(application.applicant_address)}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm text-gray-500 mt-3">
                    <span>Applied {formatDate(application.applied_at)}</span>
                    {application.hired_at && (
                      <span>Hired {formatDate(application.hired_at)}</span>
                    )}
                  </div>

                  {application.application_message && (
                    <div className="mt-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-gray-700 text-sm">
                        <strong>Your message:</strong> "{application.application_message}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Refresh Button */}
      <div className="text-center pt-4">
        <button
          onClick={activeView === 'browse' ? fetchJobs : fetchMyApplications}
          className={`
            px-4 py-2 border border-gray-300 rounded-lg transition-colors hover:bg-gray-50
            ${isMiniApp ? 'text-sm' : ''}
          `}
        >
          🔄 Refresh {activeView === 'browse' ? 'Jobs' : 'Applications'}
        </button>
      </div>

      {/* Footer Note */}
      <div className="text-center text-gray-500 text-sm pt-4 border-t border-gray-200">
        <p>
          {isMiniApp 
            ? 'Apply with your Farcaster profile - accept jobs to start escrow'
            : 'All jobs are secured by smart contracts on Base Sepolia'
          }
        </p>
      </div>
    </div>
  );
}