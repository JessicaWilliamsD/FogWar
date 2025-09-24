import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const deployed = await deploy("FogWar", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: false,
  });

  log(`FogWar contract deployed at: ${deployed.address}`);
};

export default func;
func.id = "deploy_fogwar";
func.tags = ["FogWar"];
