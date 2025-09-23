import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying FogWar contract...");
  
  const deployment = await deploy("FogWar", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  console.log(`FogWar contract deployed at: ${deployment.address}`);
  console.log(`Transaction hash: ${deployment.transactionHash}`);
};

export default func;
func.tags = ["FogWar"];