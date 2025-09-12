// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, ebool, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title FogWar - A blockchain-based fog of war game
/// @notice 9x9 board game with encrypted soldier positions in home territories
contract FogWar is SepoliaConfig {
    
    // Game constants
    uint8 constant BOARD_SIZE = 9;
    uint8 constant SOLDIERS_PER_PLAYER = 3;
    uint8 constant DEFENDER_HOME_START = 1;
    uint8 constant DEFENDER_HOME_END = 3;
    uint8 constant NEUTRAL_START = 4;
    uint8 constant NEUTRAL_END = 6;
    uint8 constant ATTACKER_HOME_START = 7;
    uint8 constant ATTACKER_HOME_END = 9;

    enum GameState { WaitingForPlayers, InProgress, Finished }
    enum PlayerType { None, Defender, Attacker }

    struct Game {
        address defender;
        address attacker;
        address currentPlayer;
        GameState state;
        uint256 gameId;
    }

    struct Soldier {
        uint8 x; // 1-9 position on board
        uint8 y; // 1-9 position on board
        bool isAlive;
        bool isEncrypted; // true if position is encrypted
    }

    struct EncryptedSoldier {
        euint8 x; // encrypted x position 
        euint8 y; // encrypted y position
        ebool isAlive;
        bool isEncrypted; // always true for encrypted soldiers
    }

    // Game storage
    mapping(uint256 => Game) public games;
    mapping(uint256 => mapping(address => mapping(uint8 => Soldier))) public soldiers; // gameId => player => soldierIndex => soldier
    mapping(uint256 => mapping(address => mapping(uint8 => EncryptedSoldier))) public encryptedSoldiers; // gameId => player => soldierIndex => encrypted soldier
    
    uint256 public gameCounter;
    
    // Events
    event GameCreated(uint256 indexed gameId, address indexed defender);
    event PlayerJoined(uint256 indexed gameId, address indexed attacker);
    event GameStarted(uint256 indexed gameId);
    event SoldierMoved(uint256 indexed gameId, address indexed player, uint8 soldierIndex, uint8 newX, uint8 newY);
    event SoldierDecrypted(uint256 indexed gameId, address indexed player, uint8 soldierIndex, uint8 x, uint8 y);

    modifier onlyPlayer(uint256 gameId) {
        require(msg.sender == games[gameId].defender || msg.sender == games[gameId].attacker, "Not a player");
        _;
    }

    modifier onlyCurrentPlayer(uint256 gameId) {
        require(msg.sender == games[gameId].currentPlayer, "Not current player");
        _;
    }

    modifier gameInProgress(uint256 gameId) {
        require(games[gameId].state == GameState.InProgress, "Game not in progress");
        _;
    }

    /// @notice Create a new game as defender
    function createGame() external returns (uint256) {
        gameCounter++;
        uint256 gameId = gameCounter;
        
        games[gameId] = Game({
            defender: msg.sender,
            attacker: address(0),
            currentPlayer: address(0),
            state: GameState.WaitingForPlayers,
            gameId: gameId
        });

        emit GameCreated(gameId, msg.sender);
        return gameId;
    }

    /// @notice Join an existing game as attacker
    function joinGame(uint256 gameId) external {
        require(games[gameId].defender != address(0), "Game does not exist");
        require(games[gameId].attacker == address(0), "Game already full");
        require(games[gameId].defender != msg.sender, "Cannot join your own game");
        
        games[gameId].attacker = msg.sender;
        games[gameId].currentPlayer = games[gameId].defender; // Defender starts
        games[gameId].state = GameState.InProgress;

        emit PlayerJoined(gameId, msg.sender);
        emit GameStarted(gameId);
    }

    /// @notice Initialize soldiers for a player (called after joining)
    function initializeSoldiers(
        uint256 gameId,
        uint8[3] memory xPositions,
        uint8[3] memory yPositions
    ) external onlyPlayer(gameId) {
        require(games[gameId].state == GameState.InProgress, "Game not started");
        
        PlayerType playerType = getPlayerType(gameId, msg.sender);
        
        for (uint8 i = 0; i < SOLDIERS_PER_PLAYER; i++) {
            require(xPositions[i] >= 1 && xPositions[i] <= BOARD_SIZE, "Invalid x position");
            require(yPositions[i] >= 1 && yPositions[i] <= BOARD_SIZE, "Invalid y position");
            
            // Check if position is in home territory
            bool inHomeTerritory = isInHomeTerritory(playerType, yPositions[i]);
            
            if (inHomeTerritory) {
                // Store as encrypted in home territory
                encryptedSoldiers[gameId][msg.sender][i] = EncryptedSoldier({
                    x: FHE.asEuint8(xPositions[i]),
                    y: FHE.asEuint8(yPositions[i]),
                    isAlive: FHE.asEbool(true),
                    isEncrypted: true
                });
                
                // Grant permissions
                FHE.allowThis(encryptedSoldiers[gameId][msg.sender][i].x);
                FHE.allowThis(encryptedSoldiers[gameId][msg.sender][i].y);
                FHE.allowThis(encryptedSoldiers[gameId][msg.sender][i].isAlive);
                FHE.allow(encryptedSoldiers[gameId][msg.sender][i].x, msg.sender);
                FHE.allow(encryptedSoldiers[gameId][msg.sender][i].y, msg.sender);
                FHE.allow(encryptedSoldiers[gameId][msg.sender][i].isAlive, msg.sender);
            } else {
                // Store as plaintext outside home territory
                soldiers[gameId][msg.sender][i] = Soldier({
                    x: xPositions[i],
                    y: yPositions[i],
                    isAlive: true,
                    isEncrypted: false
                });
            }
        }
    }

    /// @notice Move a soldier to a new position
    function moveSoldier(
        uint256 gameId,
        uint8 soldierIndex,
        externalEuint8 newX,
        externalEuint8 newY,
        bytes calldata inputProof
    ) external onlyCurrentPlayer(gameId) gameInProgress(gameId) {
        require(soldierIndex < SOLDIERS_PER_PLAYER, "Invalid soldier index");
        
        euint8 encryptedNewX = FHE.fromExternal(newX, inputProof);
        euint8 encryptedNewY = FHE.fromExternal(newY, inputProof);
        
        PlayerType playerType = getPlayerType(gameId, msg.sender);
        
        // Check if soldier is currently encrypted
        if (encryptedSoldiers[gameId][msg.sender][soldierIndex].isEncrypted) {
            // Moving from encrypted position
            _moveEncryptedSoldier(gameId, msg.sender, soldierIndex, encryptedNewX, encryptedNewY, playerType);
        } else {
            // Moving from plaintext position - need to decrypt the new position first
            // For simplicity, we'll require moves to be submitted as plaintext when soldier is not encrypted
            revert("Use moveSoldierPlaintext for non-encrypted soldiers");
        }
        
        // Switch turns
        _switchTurn(gameId);
    }

    /// @notice Move a soldier (plaintext version for non-encrypted soldiers)
    function moveSoldierPlaintext(
        uint256 gameId,
        uint8 soldierIndex,
        uint8 newX,
        uint8 newY
    ) external onlyCurrentPlayer(gameId) gameInProgress(gameId) {
        require(soldierIndex < SOLDIERS_PER_PLAYER, "Invalid soldier index");
        require(newX >= 1 && newX <= BOARD_SIZE && newY >= 1 && newY <= BOARD_SIZE, "Invalid position");
        require(soldiers[gameId][msg.sender][soldierIndex].isAlive, "Soldier is dead");
        require(!soldiers[gameId][msg.sender][soldierIndex].isEncrypted, "Use encrypted move function");
        
        uint8 currentX = soldiers[gameId][msg.sender][soldierIndex].x;
        uint8 currentY = soldiers[gameId][msg.sender][soldierIndex].y;
        
        // Validate move (adjacent squares only)
        require(_isValidMove(currentX, currentY, newX, newY), "Invalid move");
        
        PlayerType playerType = getPlayerType(gameId, msg.sender);
        bool newPosInHome = isInHomeTerritory(playerType, newY);
        
        if (newPosInHome) {
            // Moving back to home territory - encrypt the position
            delete soldiers[gameId][msg.sender][soldierIndex];
            encryptedSoldiers[gameId][msg.sender][soldierIndex] = EncryptedSoldier({
                x: FHE.asEuint8(newX),
                y: FHE.asEuint8(newY),
                isAlive: FHE.asEbool(true),
                isEncrypted: true
            });
            
            // Grant permissions
            FHE.allowThis(encryptedSoldiers[gameId][msg.sender][soldierIndex].x);
            FHE.allowThis(encryptedSoldiers[gameId][msg.sender][soldierIndex].y);
            FHE.allowThis(encryptedSoldiers[gameId][msg.sender][soldierIndex].isAlive);
            FHE.allow(encryptedSoldiers[gameId][msg.sender][soldierIndex].x, msg.sender);
            FHE.allow(encryptedSoldiers[gameId][msg.sender][soldierIndex].y, msg.sender);
            FHE.allow(encryptedSoldiers[gameId][msg.sender][soldierIndex].isAlive, msg.sender);
        } else {
            // Staying in plaintext territory
            soldiers[gameId][msg.sender][soldierIndex].x = newX;
            soldiers[gameId][msg.sender][soldierIndex].y = newY;
        }
        
        emit SoldierMoved(gameId, msg.sender, soldierIndex, newX, newY);
        
        // Switch turns
        _switchTurn(gameId);
    }

    /// @notice Internal function to move encrypted soldier
    function _moveEncryptedSoldier(
        uint256 gameId,
        address player,
        uint8 soldierIndex,
        euint8 newX,
        euint8 newY,
        PlayerType playerType
    ) internal {
        // For encrypted moves, we need to handle the transition logic with FHE operations
        // This is a simplified version - in a full implementation, you'd need more complex logic
        // to handle the transition from encrypted to plaintext positions
        
        // Check if new position is outside home territory
        euint8 homeThreshold;
        if (playerType == PlayerType.Defender) {
            homeThreshold = FHE.asEuint8(DEFENDER_HOME_END);
        } else {
            homeThreshold = FHE.asEuint8(ATTACKER_HOME_START);
        }
        
        // Update encrypted position
        encryptedSoldiers[gameId][player][soldierIndex].x = newX;
        encryptedSoldiers[gameId][player][soldierIndex].y = newY;
        
        // Grant permissions
        FHE.allowThis(encryptedSoldiers[gameId][player][soldierIndex].x);
        FHE.allowThis(encryptedSoldiers[gameId][player][soldierIndex].y);
        FHE.allow(encryptedSoldiers[gameId][player][soldierIndex].x, player);
        FHE.allow(encryptedSoldiers[gameId][player][soldierIndex].y, player);
    }

    /// @notice Check if a position is in home territory for a player type
    function isInHomeTerritory(PlayerType playerType, uint8 y) public pure returns (bool) {
        if (playerType == PlayerType.Defender) {
            return y >= DEFENDER_HOME_START && y <= DEFENDER_HOME_END;
        } else if (playerType == PlayerType.Attacker) {
            return y >= ATTACKER_HOME_START && y <= ATTACKER_HOME_END;
        }
        return false;
    }

    /// @notice Get player type
    function getPlayerType(uint256 gameId, address player) public view returns (PlayerType) {
        if (games[gameId].defender == player) {
            return PlayerType.Defender;
        } else if (games[gameId].attacker == player) {
            return PlayerType.Attacker;
        }
        return PlayerType.None;
    }

    /// @notice Validate if a move is legal (adjacent squares only)
    function _isValidMove(uint8 fromX, uint8 fromY, uint8 toX, uint8 toY) internal pure returns (bool) {
        uint8 deltaX = fromX > toX ? fromX - toX : toX - fromX;
        uint8 deltaY = fromY > toY ? fromY - toY : toY - fromY;
        
        // Allow moves to adjacent squares (including diagonals)
        return deltaX <= 1 && deltaY <= 1 && !(deltaX == 0 && deltaY == 0);
    }

    /// @notice Switch turn to other player
    function _switchTurn(uint256 gameId) internal {
        if (games[gameId].currentPlayer == games[gameId].defender) {
            games[gameId].currentPlayer = games[gameId].attacker;
        } else {
            games[gameId].currentPlayer = games[gameId].defender;
        }
    }

    /// @notice Get game information
    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    /// @notice Get plaintext soldier information
    function getSoldier(uint256 gameId, address player, uint8 soldierIndex) external view returns (Soldier memory) {
        return soldiers[gameId][player][soldierIndex];
    }

    /// @notice Get encrypted soldier information (requires ACL permissions)
    function getEncryptedSoldier(uint256 gameId, address player, uint8 soldierIndex) external view returns (EncryptedSoldier memory) {
        return encryptedSoldiers[gameId][player][soldierIndex];
    }

    /// @notice Check if a position is occupied (for collision detection)
    function isPositionOccupied(uint256 gameId, uint8 x, uint8 y) external view returns (bool) {
        // Check all plaintext soldiers for both players
        for (uint8 player = 0; player < 2; player++) {
            address playerAddr = player == 0 ? games[gameId].defender : games[gameId].attacker;
            if (playerAddr == address(0)) continue;
            
            for (uint8 i = 0; i < SOLDIERS_PER_PLAYER; i++) {
                if (soldiers[gameId][playerAddr][i].isAlive && 
                    !soldiers[gameId][playerAddr][i].isEncrypted &&
                    soldiers[gameId][playerAddr][i].x == x && 
                    soldiers[gameId][playerAddr][i].y == y) {
                    return true;
                }
            }
        }
        return false;
    }
}