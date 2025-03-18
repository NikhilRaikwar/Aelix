import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { sendMessageToAgent } from '@/utils/monadAgent';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown'; // For Markdown rendering
import remarkGfm from 'remark-gfm'; // For GitHub-flavored Markdown (links, tables, etc.)
import rehypeRaw from 'rehype-raw'; // To allow raw HTML in Markdown (if needed)

// Interface for messages
interface Message {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

const ChatInterface: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      content:
        "Hi, I'm Aelix, your AI agent on Monad Testnet blockchain. I can help you perform operations like creating tokens, managing wallets, and more. Try 'help' to see available commands or start by setting your wallet with 'setWallet <privateKey>'.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let privateKey: string | undefined;
      if (input.toLowerCase().startsWith('setwallet') && input.split(' ').length > 1) {
        privateKey = input.split(' ')[1];
      }

      const response = await sendMessageToAgent(input, privateKey);

      const agentMessage: Message = {
        role: 'agent',
        content: response.response,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prevMessages) => [...prevMessages, agentMessage]);

      toast({
        title: 'Request Processed',
        description: 'Your request to Aelix agent was successful.',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error from Monad agent service:', error);

      const errorMessage: Message = {
        role: 'agent',
        content:
          'Sorry, I encountered an error processing your request. Please check that the VITE_API_ENDPOINT environment variable is set correctly to point to the Aelix agent service.',
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);

      toast({
        title: 'Connection Error',
        description: 'Failed to reach the Aelix agent service. Please check your VITE_API_ENDPOINT configuration.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Custom render function for messages using ReactMarkdown
  const renderMessageContent = (content: string) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]} // Support GitHub-flavored Markdown (links, tables, etc.)
        rehypePlugins={[rehypeRaw]} // Allow raw HTML if present
        components={{
          // Customize link rendering to open in a new tab
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {children}
            </a>
          ),
          // Optional: Customize other Markdown elements if needed
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 md:px-4 md:py-3 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                  : 'bg-muted/70 text-foreground rounded-2xl rounded-tl-sm'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm md:text-base">
                {renderMessageContent(message.content)}
              </div>
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}
              >
                {message.timestamp}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t p-3">
        <div className="flex gap-2 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? 'Processing...' : 'Type a command or ask a question...'}
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-full bg-background border focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10 md:pr-12 text-sm md:text-base disabled:opacity-70"
            disabled={isLoading}
          />
          <button
            type="submit"
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 md:p-2 rounded-full ${
              isLoading
                ? 'bg-primary/70 cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90'
            } text-primary-foreground transition-colors`}
            aria-label="Send message"
            disabled={isLoading}
          >
            <Send size={16} className="md:size-[18px]" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;