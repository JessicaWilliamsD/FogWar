// FogWar contract deployment (use generated deployment output)
// Must be sourced from deployments/sepolia/FogWar.json
// Ensure you run `npx hardhat deploy --network sepolia` first.

// Local copy of deployed address + abi (generated from hardhat artifact)
// This avoids importing files outside the frontend package.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import FogWarDeployment from './fogwar.deployment.json';

export const CONTRACT_ADDRESS: `0x${string}` = FogWarDeployment.address as `0x${string}`;
export const CONTRACT_ABI = FogWarDeployment.abi as const;

export type FogWarAbi = typeof CONTRACT_ABI;
export type FogWarAddress = typeof CONTRACT_ADDRESS;
