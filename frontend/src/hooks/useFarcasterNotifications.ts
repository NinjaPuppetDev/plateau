// hooks/useFarcasterNotifications.ts
import { useCallback } from 'react';
import { useFarcasterActions } from './useFarcasterActions';

export function useFarcasterNotifications() {
  const { composeCast } = useFarcasterActions();

  const notifyWalletConnection = useCallback(async (applicantFid: string, jobId: string, clientDisplayName?: string) => {
    try {
      const message = `🎉 You've been hired for a job! To receive payments, please connect your embedded wallet in the Plateau app. Job: #${jobId}`;
      
      // You could send a cast notification
      await composeCast(message);
      
      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }, [composeCast]);

  const sendHiredNotification = useCallback(async (applicantFid: string, jobId: string, amount: string) => {
    try {
      const message = `🎊 Congratulations! You've been hired for a job paying ${amount} USDC. Your funds are secured in escrow. Job: #${jobId}`;
      
      await composeCast(message);
      
      return true;
    } catch (error) {
      console.error('Failed to send hired notification:', error);
      return false;
    }
  }, [composeCast]);

  return {
    notifyWalletConnection,
    sendHiredNotification,
  };
}