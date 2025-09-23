import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("fogwar:address", "Print FogWar address")
  .addOptionalParam("address", "Optionally specify the FogWar contract address")
  .setAction(async (args, hre) => {
    if (args.address) {
      console.log(`FogWar: ${args.address}`);
      return;
    }
    const d = await hre.deployments.get("FogWar");
    console.log(`FogWar: ${d.address}`);
  });

task("fogwar:create", "Create a new game")
  .addFlag("defender", "Create as defender (default attacker if omitted)")
  .addOptionalParam("address", "Optionally specify the FogWar contract address")
  .setAction(async (args, hre) => {
    const addr = args.address || (await hre.deployments.get("FogWar")).address;
    const [signer] = await hre.ethers.getSigners();
    const c = await hre.ethers.getContractAt("FogWar", addr);
    const tx = await c.connect(signer).createGame(args.defender);
    console.log(`createGame tx: ${tx.hash}`);
    const rc = await tx.wait();
    // Fetch nextGameId to infer id or parse event logs if needed; here we read state
    const next = await c.nextGameId();
    console.log(`created gameId: ${next.toString()}`);
  });

task("fogwar:join:defender", "Join as defender")
  .addOptionalParam("address", "Optionally specify the FogWar contract address")
  .addParam("gameid", "Game id")
  .setAction(async (args, hre) => {
    const addr = args.address || (await hre.deployments.get("FogWar")).address;
    const [signer] = await hre.ethers.getSigners();
    const c = await hre.ethers.getContractAt("FogWar", addr);
    const tx = await c.connect(signer).joinAsDefender(Number(args.gameid));
    console.log(`joinAsDefender tx: ${tx.hash}`);
    await tx.wait();
  });

task("fogwar:join:attacker", "Join as attacker")
  .addOptionalParam("address", "Optionally specify the FogWar contract address")
  .addParam("gameid", "Game id")
  .setAction(async (args, hre) => {
    const addr = args.address || (await hre.deployments.get("FogWar")).address;
    const [signer] = await hre.ethers.getSigners();
    const c = await hre.ethers.getContractAt("FogWar", addr);
    const tx = await c.connect(signer).joinAsAttacker(Number(args.gameid));
    console.log(`joinAsAttacker tx: ${tx.hash}`);
    await tx.wait();
  });

task("fogwar:move", "Move a soldier")
  .addParam("index", "Soldier index (0..2)")
  .addParam("x", "New X (1..9)")
  .addParam("y", "New Y (1..9)")
  .addOptionalParam("address", "Optionally specify the FogWar contract address")
  .addParam("gameid", "Game id")
  .setAction(async (args: TaskArguments & { address?: string; gameid: string }, hre) => {
    const addr = args.address || (await hre.deployments.get("FogWar")).address;
    const [signer] = await hre.ethers.getSigners();
    const c = await hre.ethers.getContractAt("FogWar", addr);
    const tx = await c
      .connect(signer)
      .moveMySoldier(Number(args.gameid), Number(args.index), Number(args.x), Number(args.y));
    console.log(`move tx: ${tx.hash}`);
    await tx.wait();
  });

task("fogwar:list", "List all gameIds")
  .addOptionalParam("address", "Optionally specify the FogWar contract address")
  .setAction(async (args, hre) => {
    const addr = args.address || (await hre.deployments.get("FogWar")).address;
    const c = await hre.ethers.getContractAt("FogWar", addr);
    const ids: bigint[] = await c.listGames();
    console.log(`gameIds: ${ids.map((x) => x.toString()).join(", ")}`);
  });
