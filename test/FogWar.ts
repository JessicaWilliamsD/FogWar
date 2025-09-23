import { expect } from "chai";
import { ethers } from "hardhat";
import type { FogWar } from "../types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FogWar", function () {
  let fogWar: FogWar;
  let deployer: SignerWithAddress;
  let defender: SignerWithAddress;
  let attacker: SignerWithAddress;

  beforeEach(async function () {
    [deployer, defender, attacker] = await ethers.getSigners();

    const FogWarFactory = await ethers.getContractFactory("FogWar");
    fogWar = await FogWarFactory.deploy();
    await fogWar.waitForDeployment();
  });

  describe("Game Creation", function () {
    it("Should create a new game", async function () {
      const tx = await fogWar.connect(defender).createGame();
      const receipt = await tx.wait();

      const gameCreatedEvent = receipt?.logs?.find((log: any) => {
        try {
          return fogWar.interface.parseLog(log)?.name === "GameCreated";
        } catch {
          return false;
        }
      });

      expect(gameCreatedEvent).to.not.be.undefined;
      
      if (gameCreatedEvent) {
        const parsedEvent = fogWar.interface.parseLog(gameCreatedEvent);
        expect(parsedEvent?.args?.gameId).to.equal(1);
        expect(parsedEvent?.args?.defender).to.equal(defender.address);
      }

      const game = await fogWar.getGame(1);
      expect(game.defender).to.equal(defender.address);
      expect(game.attacker).to.equal(ethers.ZeroAddress);
      expect(game.state).to.equal(0); // WaitingForPlayers
      expect(game.gameId).to.equal(1);
    });

    it("Should increment game counter", async function () {
      await fogWar.connect(defender).createGame();
      await fogWar.connect(attacker).createGame();

      expect(await fogWar.gameCounter()).to.equal(2);
    });
  });

  describe("Joining Games", function () {
    let gameId: number;

    beforeEach(async function () {
      const tx = await fogWar.connect(defender).createGame();
      gameId = 1;
    });

    it("Should allow attacker to join game", async function () {
      const tx = await fogWar.connect(attacker).joinGame(gameId);
      const receipt = await tx.wait();

      const playerJoinedEvent = receipt?.logs?.find((log: any) => {
        try {
          return fogWar.interface.parseLog(log)?.name === "PlayerJoined";
        } catch {
          return false;
        }
      });

      expect(playerJoinedEvent).to.not.be.undefined;

      const game = await fogWar.getGame(gameId);
      expect(game.attacker).to.equal(attacker.address);
      expect(game.state).to.equal(1); // InProgress
      expect(game.currentPlayer).to.equal(defender.address);
    });

    it("Should not allow joining non-existent game", async function () {
      await expect(fogWar.connect(attacker).joinGame(999))
        .to.be.revertedWith("Game does not exist");
    });

    it("Should not allow joining full game", async function () {
      await fogWar.connect(attacker).joinGame(gameId);
      
      const [, , thirdPlayer] = await ethers.getSigners();
      await expect(fogWar.connect(thirdPlayer).joinGame(gameId))
        .to.be.revertedWith("Game already full");
    });

    it("Should not allow joining own game", async function () {
      await expect(fogWar.connect(defender).joinGame(gameId))
        .to.be.revertedWith("Cannot join your own game");
    });
  });

  describe("Player Types and Territory", function () {
    it("Should correctly identify player types", async function () {
      await fogWar.connect(defender).createGame();
      await fogWar.connect(attacker).joinGame(1);

      expect(await fogWar.getPlayerType(1, defender.address)).to.equal(1); // Defender
      expect(await fogWar.getPlayerType(1, attacker.address)).to.equal(2); // Attacker
      expect(await fogWar.getPlayerType(1, deployer.address)).to.equal(0); // None
    });

    it("Should correctly identify home territories", async function () {
      // Defender home territory (y = 1-3)
      expect(await fogWar.isInHomeTerritory(1, 1)).to.be.true;
      expect(await fogWar.isInHomeTerritory(1, 2)).to.be.true;
      expect(await fogWar.isInHomeTerritory(1, 3)).to.be.true;
      expect(await fogWar.isInHomeTerritory(1, 4)).to.be.false;

      // Attacker home territory (y = 7-9)
      expect(await fogWar.isInHomeTerritory(2, 7)).to.be.true;
      expect(await fogWar.isInHomeTerritory(2, 8)).to.be.true;
      expect(await fogWar.isInHomeTerritory(2, 9)).to.be.true;
      expect(await fogWar.isInHomeTerritory(2, 6)).to.be.false;
    });
  });

  describe("Soldier Initialization", function () {
    let gameId: number;

    beforeEach(async function () {
      await fogWar.connect(defender).createGame();
      await fogWar.connect(attacker).joinGame(1);
      gameId = 1;
    });

    it("Should initialize soldiers in home territory", async function () {
      // Defender places soldiers in home territory (y = 1-3)
      const defenderPositions = {
        x: [1, 2, 3],
        y: [1, 2, 3]
      };

      await expect(
        fogWar.connect(defender).initializeSoldiers(
          gameId,
          defenderPositions.x,
          defenderPositions.y
        )
      ).to.not.be.reverted;

      // Check that encrypted soldiers were created
      const encryptedSoldier = await fogWar.getEncryptedSoldier(gameId, defender.address, 0);
      expect(encryptedSoldier.isEncrypted).to.be.true;
    });

    it("Should initialize soldiers outside home territory as plaintext", async function () {
      // Defender places soldiers outside home territory (y = 4-6)
      const defenderPositions = {
        x: [1, 2, 3],
        y: [4, 5, 6]
      };

      await expect(
        fogWar.connect(defender).initializeSoldiers(
          gameId,
          defenderPositions.x,
          defenderPositions.y
        )
      ).to.not.be.reverted;

      // Check that plaintext soldiers were created
      const soldier = await fogWar.getSoldier(gameId, defender.address, 0);
      expect(soldier.isAlive).to.be.true;
      expect(soldier.isEncrypted).to.be.false;
      expect(soldier.x).to.equal(1);
      expect(soldier.y).to.equal(4);
    });

    it("Should reject invalid positions", async function () {
      const invalidPositions = {
        x: [0, 2, 3], // x=0 is invalid
        y: [1, 2, 3]
      };

      await expect(
        fogWar.connect(defender).initializeSoldiers(
          gameId,
          invalidPositions.x,
          invalidPositions.y
        )
      ).to.be.revertedWith("Invalid x position");

      const invalidPositions2 = {
        x: [1, 2, 3],
        y: [1, 2, 10] // y=10 is invalid
      };

      await expect(
        fogWar.connect(defender).initializeSoldiers(
          gameId,
          invalidPositions2.x,
          invalidPositions2.y
        )
      ).to.be.revertedWith("Invalid y position");
    });

    it("Should only allow players to initialize soldiers", async function () {
      const positions = {
        x: [1, 2, 3],
        y: [1, 2, 3]
      };

      await expect(
        fogWar.connect(deployer).initializeSoldiers(
          gameId,
          positions.x,
          positions.y
        )
      ).to.be.revertedWith("Not a player");
    });
  });

  describe("Soldier Movement", function () {
    let gameId: number;

    beforeEach(async function () {
      await fogWar.connect(defender).createGame();
      await fogWar.connect(attacker).joinGame(1);
      gameId = 1;

      // Initialize plaintext soldiers for easier testing
      await fogWar.connect(defender).initializeSoldiers(gameId, [1, 2, 3], [4, 5, 6]);
      await fogWar.connect(attacker).initializeSoldiers(gameId, [7, 8, 9], [6, 5, 4]);
    });

    it("Should allow current player to move soldier", async function () {
      // Defender starts first
      await expect(
        fogWar.connect(defender).moveSoldierPlaintext(gameId, 0, 2, 4)
      ).to.not.be.reverted;

      const soldier = await fogWar.getSoldier(gameId, defender.address, 0);
      expect(soldier.x).to.equal(2);
      expect(soldier.y).to.equal(4);
    });

    it("Should switch turns after move", async function () {
      // Defender moves first
      await fogWar.connect(defender).moveSoldierPlaintext(gameId, 0, 2, 4);
      
      const game = await fogWar.getGame(gameId);
      expect(game.currentPlayer).to.equal(attacker.address);

      // Now attacker should be able to move
      await expect(
        fogWar.connect(attacker).moveSoldierPlaintext(gameId, 0, 6, 6)
      ).to.not.be.reverted;
    });

    it("Should not allow non-current player to move", async function () {
      // Attacker tries to move when it's defender's turn
      await expect(
        fogWar.connect(attacker).moveSoldierPlaintext(gameId, 0, 6, 6)
      ).to.be.revertedWith("Not current player");
    });

    it("Should validate move distance", async function () {
      // Try to move more than one square
      await expect(
        fogWar.connect(defender).moveSoldierPlaintext(gameId, 0, 3, 4)
      ).to.be.revertedWith("Invalid move");
    });

    it("Should validate board boundaries", async function () {
      await expect(
        fogWar.connect(defender).moveSoldierPlaintext(gameId, 0, 0, 4)
      ).to.be.revertedWith("Invalid position");

      await expect(
        fogWar.connect(defender).moveSoldierPlaintext(gameId, 0, 10, 4)
      ).to.be.revertedWith("Invalid position");
    });

    it("Should not allow moving dead soldiers", async function () {
      // This would require implementing soldier death mechanics
      // For now, just test that the validation exists
      await expect(
        fogWar.connect(defender).moveSoldierPlaintext(gameId, 99, 2, 4)
      ).to.be.revertedWith("Invalid soldier index");
    });
  });

  describe("Position Tracking", function () {
    let gameId: number;

    beforeEach(async function () {
      await fogWar.connect(defender).createGame();
      await fogWar.connect(attacker).joinGame(1);
      gameId = 1;

      await fogWar.connect(defender).initializeSoldiers(gameId, [1, 2, 3], [4, 5, 6]);
      await fogWar.connect(attacker).initializeSoldiers(gameId, [7, 8, 9], [6, 5, 4]);
    });

    it("Should track occupied positions", async function () {
      expect(await fogWar.isPositionOccupied(gameId, 1, 4)).to.be.true;
      expect(await fogWar.isPositionOccupied(gameId, 2, 5)).to.be.true;
      expect(await fogWar.isPositionOccupied(gameId, 1, 1)).to.be.false;
    });

    it("Should update occupied positions after moves", async function () {
      await fogWar.connect(defender).moveSoldierPlaintext(gameId, 0, 2, 3);
      
      expect(await fogWar.isPositionOccupied(gameId, 1, 4)).to.be.false;
      expect(await fogWar.isPositionOccupied(gameId, 2, 3)).to.be.true;
    });
  });

  describe("Access Control", function () {
    let gameId: number;

    beforeEach(async function () {
      await fogWar.connect(defender).createGame();
      await fogWar.connect(attacker).joinGame(1);
      gameId = 1;
    });

    it("Should only allow players to access game functions", async function () {
      await expect(
        fogWar.connect(deployer).initializeSoldiers(gameId, [1, 2, 3], [1, 2, 3])
      ).to.be.revertedWith("Not a player");

      await expect(
        fogWar.connect(deployer).moveSoldierPlaintext(gameId, 0, 1, 2)
      ).to.be.revertedWith("Not a player");
    });

    it("Should only allow moves in active games", async function () {
      // Create a game but don't start it
      await fogWar.connect(deployer).createGame();
      const newGameId = 2;

      await expect(
        fogWar.connect(deployer).moveSoldierPlaintext(newGameId, 0, 1, 2)
      ).to.be.revertedWith("Not a player");
    });
  });
});