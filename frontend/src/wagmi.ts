import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, hardhat } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'FogWar',
  projectId: 'YOUR_PROJECT_ID', // Get this from WalletConnect Cloud
  chains: [sepolia, hardhat],
  ssr: false, // If your dApp uses server side rendering (SSR)
});