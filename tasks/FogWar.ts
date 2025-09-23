import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:deployFogWar")
  .setDescription("Deploy FogWar contract")
  .setAction(async function (taskArguments: TaskArguments, { ethers, deployments }) {
    const { deploy } = deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("Deploying FogWar contract...");
    console.log("Deployer address:", deployer.address);

    const deployment = await deploy("FogWar", {
      from: deployer.address,
      log: true,
    });

    console.log(`FogWar deployed at: ${deployment.address}`);
    console.log(`Gas used: ${deployment.receipt?.gasUsed}`);
  });

task("task:createGame")
  .setDescription("Create a new FogWar game")
  .addOptionalParam("contract", "FogWar contract address")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    let contractAddress = taskArguments.contract;
    if (!contractAddress) {
      // Try to get from deployments
      try {
        const deployment = await ethers.deployments.get("FogWar");
        contractAddress = deployment.address;
      } catch (error) {
        console.error("Contract address not provided and no deployment found");
        return;
      }
    }

    const FogWar = await ethers.getContractFactory("FogWar");
    const fogWar = FogWar.attach(contractAddress);

    console.log("Creating new game...");
    const tx = await fogWar.createGame();
    const receipt = await tx.wait();

    // Get gameId from event
    const event = receipt?.logs?.find((log: any) => {
      try {
        return fogWar.interface.parseLog(log)?.name === "GameCreated";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsedEvent = fogWar.interface.parseLog(event);
      console.log(`Game created with ID: ${parsedEvent?.args?.gameId}`);
    } else {
      console.log("Game created but ID not found in events");
    }
  });

task("task:joinGame")
  .setDescription("Join an existing FogWar game")
  .addParam("gameid", "Game ID to join")
  .addOptionalParam("contract", "FogWar contract address")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const accounts = await ethers.getSigners();
    const player = accounts[1]; // Use second account as attacker

    let contractAddress = taskArguments.contract;
    if (!contractAddress) {
      try {
        const deployment = await ethers.deployments.get("FogWar");
        contractAddress = deployment.address;
      } catch (error) {
        console.error("Contract address not provided and no deployment found");
        return;
      }
    }

    const FogWar = await ethers.getContractFactory("FogWar");
    const fogWar = FogWar.attach(contractAddress).connect(player);

    console.log(`Joining game ${taskArguments.gameid}...`);
    const tx = await fogWar.joinGame(taskArguments.gameid);
    await tx.wait();

    console.log("Successfully joined the game!");
  });

task("task:getGame")
  .setDescription("Get game information")
  .addParam("gameid", "Game ID to query")
  .addOptionalParam("contract", "FogWar contract address")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    let contractAddress = taskArguments.contract;
    if (!contractAddress) {
      try {
        const deployment = await ethers.deployments.get("FogWar");
        contractAddress = deployment.address;
      } catch (error) {
        console.error("Contract address not provided and no deployment found");
        return;
      }
    }

    const FogWar = await ethers.getContractFactory("FogWar");
    const fogWar = FogWar.attach(contractAddress);

    const game = await fogWar.getGame(taskArguments.gameid);
    
    console.log("Game Information:");
    console.log(`Game ID: ${game.gameId}`);
    console.log(`Defender: ${game.defender}`);
    console.log(`Attacker: ${game.attacker}`);
    console.log(`Current Player: ${game.currentPlayer}`);
    console.log(`State: ${game.state}`);
  });