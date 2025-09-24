// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FogWar
 * @notice 9x9 fog-of-war board with two players and 3 soldiers each.
 *         Positions are stored encrypted. In own zone they remain private;
 *         in neutral and opponent zones they are made publicly decryptable.
 *
 * Zones by y (1-based):
 *  - Defender zone: 1..3
 *  - Neutral zone: 4..6
 *  - Attacker zone: 7..9
 */
contract FogWar is SepoliaConfig {
    uint8 public constant BOARD_MIN = 1;
    uint8 public constant BOARD_MAX = 9;

    struct Soldier { euint8 x; euint8 y; }

    struct Game {
        address defender;
        address attacker;
        bool started;
        Soldier[3] defenders;
        Soldier[3] attackers;
    }

    uint256 public nextGameId;
    mapping(uint256 => Game) private games;
    uint256[] private gameIds;

    event GameCreated(uint256 indexed gameId, address indexed creator, string role);
    event Joined(uint256 indexed gameId, address indexed player, string role);
    event Started(uint256 indexed gameId, address indexed defender, address indexed attacker);
    event Moved(uint256 indexed gameId, address indexed player, uint8 indexed index, uint8 x, uint8 y);

    modifier onlyPlayer(uint256 gameId) {
        Game storage g = games[gameId];
        require(msg.sender == g.defender || msg.sender == g.attacker, "Not a player");
        _;
    }

    function listGames() external view returns (uint256[] memory) { return gameIds; }

    function getGame(uint256 gameId) external view returns (address defender, address attacker, bool started) {
        Game storage g = games[gameId];
        return (g.defender, g.attacker, g.started);
    }

    function createGame(bool asDefender) external returns (uint256 gameId) {
        gameId = ++nextGameId;
        Game storage g = games[gameId];
        if (asDefender) {
            g.defender = msg.sender;
            emit GameCreated(gameId, msg.sender, "defender");
        } else {
            g.attacker = msg.sender;
            emit GameCreated(gameId, msg.sender, "attacker");
        }
        gameIds.push(gameId);
    }

    function joinAsDefender(uint256 gameId) external {
        Game storage g = games[gameId];
        require(gameId != 0 && gameId <= nextGameId, "Bad gameId");
        require(g.defender == address(0), "Defender taken");
        require(msg.sender != g.attacker, "Already attacker");
        g.defender = msg.sender;
        emit Joined(gameId, msg.sender, "defender");
        _tryStart(gameId);
    }

    function joinAsAttacker(uint256 gameId) external {
        Game storage g = games[gameId];
        require(gameId != 0 && gameId <= nextGameId, "Bad gameId");
        require(g.attacker == address(0), "Attacker taken");
        require(msg.sender != g.defender, "Already defender");
        g.attacker = msg.sender;
        emit Joined(gameId, msg.sender, "attacker");
        _tryStart(gameId);
    }

    function _tryStart(uint256 gameId) internal {
        Game storage g = games[gameId];
        if (!g.started && g.defender != address(0) && g.attacker != address(0)) {
            uint8[3] memory xs = [uint8(2), uint8(5), uint8(8)];
            for (uint8 i = 0; i < 3; i++) {
                g.defenders[i].x = FHE.asEuint8(xs[i]);
                g.defenders[i].y = FHE.asEuint8(1);
                _grantBaseACL(g.defenders[i], g.defender);

                g.attackers[i].x = FHE.asEuint8(xs[i]);
                g.attackers[i].y = FHE.asEuint8(9);
                _grantBaseACL(g.attackers[i], g.attacker);
            }
            g.started = true;
            emit Started(gameId, g.defender, g.attacker);
        }
    }

    function _grantBaseACL(Soldier storage s, address owner) internal {
        FHE.allowThis(s.x);
        FHE.allow(s.x, owner);
        FHE.allowThis(s.y);
        FHE.allow(s.y, owner);
    }

    function _maybeMakePublic(Soldier storage s, bool makePublic) internal {
        if (makePublic) {
            FHE.makePubliclyDecryptable(s.x);
            FHE.makePubliclyDecryptable(s.y);
        }
    }

    function _validateCoord(uint8 v) internal pure {
        require(v >= BOARD_MIN && v <= BOARD_MAX, "Out of bounds");
    }

    function moveMySoldier(uint256 gameId, uint8 index, uint8 newX, uint8 newY) external onlyPlayer(gameId) {
        Game storage g = games[gameId];
        require(g.started, "Not started");
        require(index < 3, "Bad index");
        _validateCoord(newX);
        _validateCoord(newY);

        bool isDef = (msg.sender == g.defender);
        Soldier storage s = isDef ? g.defenders[index] : g.attackers[index];
        s.x = FHE.asEuint8(newX);
        s.y = FHE.asEuint8(newY);

        _grantBaseACL(s, msg.sender);

        bool makePublic = isDef ? (newY >= 4) : (newY <= 6);
        _maybeMakePublic(s, makePublic);

        emit Moved(gameId, msg.sender, index, newX, newY);
    }

    function getDefenderPositions(uint256 gameId) external view returns (euint8[3] memory xs, euint8[3] memory ys) {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < 3; i++) { xs[i] = g.defenders[i].x; ys[i] = g.defenders[i].y; }
    }

    function getAttackerPositions(uint256 gameId) external view returns (euint8[3] memory xs, euint8[3] memory ys) {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < 3; i++) { xs[i] = g.attackers[i].x; ys[i] = g.attackers[i].y; }
    }

    function getMyPositions(uint256 gameId) external view onlyPlayer(gameId) returns (euint8[3] memory xs, euint8[3] memory ys) {
        Game storage g = games[gameId];
        bool isDef = (msg.sender == g.defender);
        for (uint8 i = 0; i < 3; i++) { xs[i] = isDef ? g.defenders[i].x : g.attackers[i].x; ys[i] = isDef ? g.defenders[i].y : g.attackers[i].y; }
    }

    function getDefenderPublicity(uint256 gameId) external view returns (bool[3] memory xPublic, bool[3] memory yPublic) {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < 3; i++) {
            xPublic[i] = FHE.isPubliclyDecryptable(g.defenders[i].x);
            yPublic[i] = FHE.isPubliclyDecryptable(g.defenders[i].y);
        }
    }

    function getAttackerPublicity(uint256 gameId) external view returns (bool[3] memory xPublic, bool[3] memory yPublic) {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < 3; i++) {
            xPublic[i] = FHE.isPubliclyDecryptable(g.attackers[i].x);
            yPublic[i] = FHE.isPubliclyDecryptable(g.attackers[i].y);
        }
    }
}
