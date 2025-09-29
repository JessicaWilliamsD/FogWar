# FogWar: Blockchain-Based Fog of War Game

![FogWar Banner](https://img.shields.io/badge/FogWar-Blockchain%20Game-blue?style=for-the-badge)
![Zama FHE](https://img.shields.io/badge/Powered%20by-Zama%20FHE-green?style=for-the-badge)
![Ethereum Sepolia](https://img.shields.io/badge/Network-Ethereum%20Sepolia-purple?style=for-the-badge)

## 🎮 Overview

FogWar is an innovative blockchain-based strategy game that implements the classic "fog of war" mechanic using cutting-edge **Fully Homomorphic Encryption (FHE)** technology. Players command soldiers on a 9×9 battlefield where unit positions remain encrypted and hidden until they move into specific zones, creating genuine strategic uncertainty and tactical depth.

## 🌟 Key Features

### 🔐 **True Privacy Through FHE**
- **Encrypted Unit Positions**: All soldier coordinates are encrypted using Zama's FHE technology
- **Selective Revelation**: Unit positions become visible only when moving into specific zones
- **No Trusted Third Party**: Privacy is guaranteed by cryptographic protocols, not central authorities

### ⚔️ **Strategic Gameplay**
- **9×9 Battlefield**: Classic grid-based tactical gameplay
- **Three-Zone System**:
  - **Defender Zone (Y: 1-3)**: Safe haven for defending forces
  - **Neutral Zone (Y: 4-6)**: Contested territory where positions are revealed
  - **Attacker Zone (Y: 7-9)**: Staging area for offensive operations
- **3 Soldiers Per Player**: Balanced force composition requiring tactical coordination

### 🎯 **Zone-Based Visibility System**
- **Home Territory Privacy**: Units remain hidden while in their own zone
- **Engagement Revelation**: Positions revealed when entering neutral or enemy zones
- **Dynamic Strategy**: Players must balance stealth, positioning, and tactical advantage

### 🌐 **Web3 Integration**
- **Wallet Connection**: Seamless integration with MetaMask and other Web3 wallets
- **On-Chain State**: All game state stored securely on Ethereum Sepolia testnet
- **Real-Time Updates**: Live game state synchronization through blockchain events

## 🚀 Technical Architecture

### 🔧 **Smart Contract Stack**
- **Solidity 0.8.24**: Latest Solidity features for optimal performance
- **Zama FHEVM**: Advanced FHE operations for encrypted computation
- **Hardhat Framework**: Professional development and testing environment
- **Sepolia Testnet**: Ethereum testnet deployment for testing and development

### 🎨 **Frontend Technology**
- **React 19**: Modern React with latest features and optimizations
- **TypeScript**: Type-safe development for robust applications
- **Vite**: Lightning-fast build tool and development server
- **Rainbow Kit**: Premium wallet connection experience
- **Wagmi + Viem**: Modern Ethereum libraries for seamless blockchain interaction

### 🔐 **Encryption Infrastructure**
- **Zama Relayer SDK**: Client-side encryption and decryption operations
- **FHE Operations**: Addition, subtraction, comparison, and conditional logic on encrypted data
- **Access Control Lists (ACL)**: Fine-grained permission management for encrypted data
- **Key Management**: Secure key generation and management through Zama's infrastructure

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js** >= 20.0.0
- **npm** >= 7.0.0
- **MetaMask** or compatible Web3 wallet
- **Sepolia ETH** for transaction fees

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/FogWar.git
cd FogWar
```

### 2. Install Dependencies
```bash
# Install smart contract dependencies
npm install

# Install frontend dependencies
cd game && npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
PRIVATE_KEY=your_private_key_here
INFURA_API_KEY=your_infura_api_key_here
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_api_key
```

### 4. Compile Smart Contracts
```bash
npm run compile
```

### 5. Deploy to Sepolia (Optional)
```bash
npm run deploy:sepolia
```

### 6. Start the Frontend
```bash
npm run frontend:dev
```

## 🎮 How to Play

### Game Setup
1. **Connect Wallet**: Use the "Connect Wallet" button to link your MetaMask wallet
2. **Create Game**: Click "Create New Game" to start a new match
3. **Join Game**: Other players can join existing games as defender or attacker
4. **Automatic Role Assignment**: The system randomly assigns roles for balance

### Gameplay Mechanics

#### **Unit Movement**
- Select a soldier (index 0-2) by clicking on the board
- Choose movement direction: Up, Down, Left, Right
- Submit encrypted movement commands to the blockchain
- Movements are processed in real-time

#### **Position Decryption**
- Click "Decrypt" to reveal your own unit positions
- Enemy positions remain hidden unless they move into visible zones
- Decryption uses your private key - only you can see your units

#### **Zone Strategy**
- **Defender Strategy**: Control defensive positions, advance carefully into neutral zone
- **Attacker Strategy**: Coordinate assault through neutral zone into enemy territory
- **Zone Control**: Units in neutral/enemy zones become visible to opponents

### Victory Conditions
*Currently focused on movement mechanics - victory conditions to be implemented in future updates*

## 🏗️ Technical Implementation

### Smart Contract Architecture

#### **FogWar.sol Main Contract**
```solidity
contract FogWar is SepoliaConfig {
    struct Soldier {
        euint8 x;  // Encrypted X coordinate
        euint8 y;  // Encrypted Y coordinate
    }

    struct Game {
        address defender;
        address attacker;
        bool started;
        Soldier[3] defenders;
        Soldier[3] attackers;
    }
}
```

#### **Key Functions**
- `createGame()`: Initialize new game instance
- `moveMySoldier()`: Submit encrypted movement commands
- `getMyPositions()`: Retrieve encrypted positions for decryption
- `getDefenderPositions()` / `getAttackerPositions()`: Access opponent positions (when visible)

### Encryption Flow

#### **Client-Side Encryption**
```typescript
// Create encrypted input for movement
const encInput = zamaInstance.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
encInput.add8(direction); // 0=up, 1=down, 2=left, 3=right
const { handles, inputProof } = await encInput.encrypt();
```

#### **Position Decryption**
```typescript
// Generate keypair for decryption
const keypair = zamaInstance.generateKeypair();

// Create EIP712 signature for access authorization
const eip712 = zamaInstance.createEIP712(
  keypair.publicKey,
  contractAddresses,
  startTimeStamp,
  durationDays
);

// Decrypt user-specific data
const result = await zamaInstance.userDecrypt(
  handlePairs,
  keypair.privateKey,
  keypair.publicKey,
  signature,
  contractAddresses,
  userAddress,
  startTimeStamp,
  durationDays
);
```

### Access Control Implementation

#### **Permission Management**
- **Base Permissions**: Contract and owner always have access to encrypted data
- **Conditional Sharing**: Opponent access granted when units move into visible zones
- **Dynamic ACL Updates**: Permissions updated automatically based on game state

```solidity
function _grantBaseACL(Soldier storage s, address owner) internal {
    FHE.allowThis(s.x);     // Contract access
    FHE.allow(s.x, owner);  // Owner access
    FHE.allowThis(s.y);
    FHE.allow(s.y, owner);
}

function _maybeAllowOpponent(Soldier storage s, bool allowOpp, address opponent) internal {
    if (allowOpp) {
        FHE.allow(s.x, opponent);  // Opponent visibility
        FHE.allow(s.y, opponent);
    }
}
```

## 🔬 Problem Solved

### **Traditional Fog of War Limitations**
- **Server-Side State**: Traditional games rely on trusted servers to hide information
- **Potential Cheating**: Server administrators or hackers could access hidden information
- **Centralized Control**: Single point of failure and control

### **FogWar's Innovation**
- **Cryptographic Privacy**: Information hiding guaranteed by mathematics, not trust
- **Decentralized Verification**: All players can verify game state integrity
- **Impossible Cheating**: Even the smart contract cannot see hidden information until cryptographically revealed
- **Transparent Rules**: Game logic is open source and verifiable on-chain

## 🎯 Advantages

### **For Players**
- **Guaranteed Privacy**: Your strategies remain truly secret until revealed by game rules
- **No Cheating Possible**: Cryptographic guarantees prevent all forms of information leakage
- **Verifiable Fairness**: All game mechanics are transparent and auditable
- **True Ownership**: Game assets and history permanently stored on blockchain

### **For Developers**
- **Innovative Primitive**: First implementation of FHE-based fog of war mechanics
- **Composable Design**: Smart contracts can be extended and integrated with other protocols
- **Open Source**: Complete codebase available for learning and modification
- **Production Ready**: Built with enterprise-grade tools and security practices

### **For the Ecosystem**
- **FHE Adoption**: Practical demonstration of FHE technology in gaming
- **New Game Genre**: Enables entirely new class of cryptographically-private games
- **Educational Value**: Reference implementation for FHE development
- **Community Building**: Open source foundation for collaborative development

## 🛣️ Roadmap & Future Plans

### **Phase 1: Core Mechanics** ✅
- [x] Basic 9×9 battlefield implementation
- [x] Encrypted unit positioning system
- [x] Zone-based visibility mechanics
- [x] Movement system with encrypted directions
- [x] Web3 wallet integration
- [x] Real-time game state synchronization

### **Phase 2: Enhanced Gameplay** 🚧
- [ ] **Victory Conditions**: Implement capture-the-flag or elimination mechanics
- [ ] **Combat System**: Unit vs unit engagement mechanics
- [ ] **Terrain Features**: Obstacles, elevated positions, cover mechanics
- [ ] **Special Abilities**: Unique unit types with special movement or vision
- [ ] **Turn-Based System**: Structured turn management with time limits

### **Phase 3: Advanced Features** 📋
- [ ] **Spectator Mode**: Encrypted spectator experience with limited information
- [ ] **Replay System**: Cryptographic proof-based game replays
- [ ] **Tournament Mode**: Bracket-style competitions with automated matchmaking
- [ ] **Mobile App**: Native iOS/Android applications
- [ ] **AI Opponents**: On-chain AI powered by FHE computations

### **Phase 4: Ecosystem Expansion** 🌟
- [ ] **Multi-Chain Deployment**: Expand to other FHE-enabled networks
- [ ] **NFT Integration**: Unique soldiers, equipment, and cosmetic items
- [ ] **DAO Governance**: Community-driven development and rule modifications
- [ ] **Economic Layer**: Betting, tournaments, and prize pools
- [ ] **SDK Release**: Tools for developers to build FHE-based games

### **Phase 5: Long-term Vision** 🚀
- [ ] **3D Battlefield**: Immersive 3D gameplay while maintaining privacy
- [ ] **MMORPG Elements**: Persistent world with thousands of players
- [ ] **Cross-Game Compatibility**: Interoperability with other FHE games
- [ ] **Educational Platform**: University courses and research collaboration
- [ ] **Enterprise Solutions**: Private strategy simulation for businesses

## 🤝 Contributing

We welcome contributions from the community! Whether you're interested in:

### **Development Contributions**
- **Smart Contract Development**: Enhance game mechanics and FHE implementations
- **Frontend Development**: Improve user interface and user experience
- **Testing**: Write comprehensive test suites and identify edge cases
- **Documentation**: Expand guides, tutorials, and API documentation

### **Community Contributions**
- **Game Design**: Propose new mechanics and features
- **Art Assets**: Create visual assets and improve game aesthetics
- **Content Creation**: Write blog posts, create videos, and educational content
- **Translation**: Localize the game for international audiences

### **Getting Started**
1. **Fork the repository** and create a feature branch
2. **Follow coding standards** and write comprehensive tests
3. **Submit pull requests** with detailed descriptions
4. **Join our community** Discord for discussion and coordination

## 📄 License

This project is licensed under the **BSD-3-Clause-Clear License**. This license allows:

- ✅ **Commercial Use**: Build commercial products and services
- ✅ **Modification**: Adapt and extend the codebase
- ✅ **Distribution**: Share modified versions
- ✅ **Private Use**: Use in private and internal projects

With requirements for:
- 📝 **License Notice**: Include license and copyright notice
- 🔗 **Source Attribution**: Credit original authors
- 🚫 **No Patent Rights**: License does not grant patent rights

See the [LICENSE](LICENSE) file for complete details.

## 🔗 Resources & Links

### **Documentation**
- [Zama FHE Documentation](https://docs.zama.ai/)
- [FHEVM Solidity Library](https://docs.zama.ai/fhevm/solidity-guides)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Rainbow Kit Guide](https://www.rainbowkit.com/docs)

### **Community**
- [Discord Server](https://discord.com/invite/fhe-org) - Join our community
- [Community Forum](https://community.zama.ai/c/fhevm/15) - Technical discussions
- [GitHub Issues](https://github.com/your-username/FogWar/issues) - Bug reports and feature requests

### **Educational**
- [FHE Learning Resources](https://docs.zama.ai/fhevm/getting-started) - Learn about FHE
- [Solidity Documentation](https://docs.soliditylang.org/) - Smart contract development
- [Web3 Development Guide](https://ethereum.org/en/developers/) - Ethereum development basics

## 🙏 Acknowledgments

- **Zama Team**: For pioneering FHE technology and providing excellent developer tools
- **Ethereum Foundation**: For creating the foundational blockchain infrastructure
- **Hardhat Team**: For professional-grade smart contract development tools
- **Rainbow Kit**: For beautiful and functional wallet connection components
- **Open Source Community**: For countless libraries and tools that make this project possible

---

**Built with ❤️ using Zama FHE Technology**

*FogWar represents the future of cryptographically-private gaming, where strategy and secrecy are guaranteed by mathematics, not trust.*