import {
    createSIWEConfig,
    SIWECreateMessageArgs,
    formatMessage,
    SIWESession,
    SIWEVerifyMessageArgs,
  } from '@web3modal/siwe';
  import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
  import { getCsrfToken, getSession, signIn, signOut } from 'next-auth/react';
  import { cookieStorage, createStorage } from 'wagmi';
  import { baseSepolia} from 'wagmi/chains';
  import { createPublicClient,http } from 'viem';

  // Get projectId from https://cloud.walletconnect.com
  export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
  
  if (!projectId) throw new Error('Project ID is not defined');
  
  export const metadata = {
    name: 'EscrowGuild',
    description: 'EscrowGuild is a multi-LLM project built with langgraph that leverages specialized models and Gaianet nodes to solve complex tasks like code generation.',
    url: 'https://escrowguild.vercel.app/', // origin must match your domain & subdomain
    icons: ['https://raw.githubusercontent.com/shreyan001/AgentsGuild/refs/heads/main/public/guildlogo.png'],
  };
  
  export const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  });
  // Create wagmiConfig
  const chains = [baseSepolia] as const;
  export const config = defaultWagmiConfig({
    chains,
    projectId,
    metadata,
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
  });
  

  
  export const siweConfig = createSIWEConfig({
    getMessageParams: async () => ({
      domain: typeof window !== 'undefined' ? window.location.host : '',
      uri: typeof window !== 'undefined' ? window.location.origin : '',
      chains: [baseSepolia.id],
      statement: 'Please sign with your account',
    }),
    createMessage: ({ address, ...args }: SIWECreateMessageArgs) =>
      formatMessage(args, address),
    getNonce: async () => {
      const nonce = await getCsrfToken();
      if (!nonce) {
        throw new Error('Failed to get nonce!');
      }
  
      return nonce;
    },
    getSession: async () => {
      const session = await getSession();
      if (!session) {
        throw new Error('Failed to get session!');
      }
  
      const { address, chainId } = session as unknown as SIWESession;
  
      return { address, chainId };
    },
    verifyMessage: async ({ message, signature }: SIWEVerifyMessageArgs) => {
      try {
        const success = await signIn('credentials', {
          message,
          redirect: false,
          signature,
          callbackUrl: '/protected',
        });
  
        return Boolean(success?.ok);
      } catch (error) {
        return false;
      }
    },
    signOut: async () => {
      try {
        await signOut({
          redirect: false,
        });
  
        return true;
      } catch (error) {
        return false;
      }
    },
  });