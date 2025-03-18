import React from 'react';
import MainLayout from '../layouts/MainLayout';
import ChatInterface from '../components/ChatInterface';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { authenticated, logout } = usePrivy();
  const navigate = useNavigate();
 
  React.useEffect(() => {
    if (!authenticated) {
      navigate('/');
      toast({
        title: "Authentication required",
        description: "Please connect your wallet to access the dashboard.",
        variant: "destructive",
      });
    }
  }, [authenticated, navigate]);

  return (
    <MainLayout>
      <div className="pt-20 px-4 md:pt-24 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold mb-2">Welcome to Aelix</h1>
            <p className="text-muted-foreground">
              Your AI assistant for Monad blockchain operations
            </p>
          </div>
          <div className="mx-auto w-full max-w-4xl">
            <div className="h-[70vh] max-h-[700px] rounded-2xl overflow-hidden shadow-lg bg-white/5 backdrop-blur-sm border border-white/10">
              <ChatInterface />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;