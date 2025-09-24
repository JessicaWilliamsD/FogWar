import React, { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { formatAddress } from '../utils/format';
import { Board } from './Board';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { ethers } from 'ethers';

const client = createPublicClient({ chain: sepolia, transport: http() });

type EHandle = `0x${string}`;

function useGamePositions(gameId?: bigint) {
  const args = gameId ? [gameId] : undefined;
  const { data: defenderData } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'getDefenderPositions', args });
  const { data: attackerData } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'getAttackerPositions', args });
  const defenders = useMemo(() => {
    if (!defenderData) return { xs: [], ys: [] } as { xs: EHandle[]; ys: EHandle[] };
    const [xs, ys] = defenderData as [EHandle[], EHandle[]];
    return { xs, ys };
  }, [defenderData]);
  const attackers = useMemo(() => {
    if (!attackerData) return { xs: [], ys: [] } as { xs: EHandle[]; ys: EHandle[] };
    const [xs, ys] = attackerData as [EHandle[], EHandle[]];
    return { xs, ys };
  }, [attackerData]);
  return { defenders, attackers };
}

export function GameApp() {
  const { address } = useAccount();
  const { instance: zamaInstance, isLoading: zamaLoading } = useZamaInstance();
  const [games, setGames] = useState<bigint[]>([]);
  const [gameId, setGameId] = useState<bigint | undefined>(undefined);

  const { defenders, attackers } = useGamePositions(gameId);

  const { data: gameInfo } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getGame',
    args: gameId ? [gameId] : undefined,
  });
  const started = gameInfo ? (gameInfo as any[])[2] as boolean : false;
  const defenderAddr = gameInfo ? (gameInfo as any[])[0] as string : undefined;
  const attackerAddr = gameInfo ? (gameInfo as any[])[1] as string : undefined;

  const role: 'defender' | 'attacker' | 'spectator' = useMemo(() => {
    if (!address) return 'spectator';
    if (defenderAddr && (defenderAddr as string).toLowerCase() === address.toLowerCase()) return 'defender';
    if (attackerAddr && (attackerAddr as string).toLowerCase() === address.toLowerCase()) return 'attacker';
    return 'spectator';
  }, [address, defenderAddr, attackerAddr]);

  const [moveIndex, setMoveIndex] = useState(0);
  // Direction: 0=up,1=down,2=left,3=right
  const [direction, setDirection] = useState(0);

  const [visibleOpponent, setVisibleOpponent] = useState<{ x: number; y: number }[]>([]);
  const [myPositions, setMyPositions] = useState<{ x: number; y: number }[]>([]);

  async function refreshGames() {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    const ids = await contract.listGames();
    setGames(ids as bigint[]);
    if (!gameId && (ids as bigint[]).length > 0) setGameId((ids as bigint[])[0]);
  }

  useEffect(() => { refreshGames().catch(() => void 0); }, []);

  async function createGame() {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    const asDefender = Math.random() < 0.5; // 随机角色
    const tx = await contract.createGame(asDefender);
    await tx.wait();
    await refreshGames();
    const next: bigint = await contract.nextGameId();
    setGameId(next);
  }

  async function joinAuto() {
    if (!gameId) return;
    // 自动加入缺少的角色
    const needDef = !defenderAddr;
    const method = needDef ? 'joinAsDefender' : 'joinAsAttacker';
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    const tx = await contract[method](gameId);
    await tx.wait();
  }

  async function move() {
    if (!address) return;
    if (moveIndex < 0 || moveIndex > 2) return;
    if (!gameId) return;

    // Prepare encrypted direction using Zama relayer SDK
    if (!zamaInstance || zamaLoading) return;
    const encInput = zamaInstance.createEncryptedInput(CONTRACT_ADDRESS, address);
    encInput.add8(direction);
    const { handles, inputProof } = await encInput.encrypt();
    const dirHandle = ethers.hexlify(handles[0]);

    // Use ethers for write
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    const tx = await contract.moveMySoldier(gameId, moveIndex, dirHandle, inputProof);
    await tx.wait();
  }

  async function decryptAll() {
    if (!address) return;
    if (!zamaInstance || zamaLoading) return;
    if (!gameId) return;

    // Always fetch latest on-chain ciphertext handles before decrypt
    const [freshXs, freshYs] = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: role === 'defender' ? 'getDefenderPositions' : 'getAttackerPositions',
      args: [gameId],
    }) as [string[], string[]];

    // Only decrypt my soldiers, not opponent's
    const mineXs = freshXs;
    const mineYs = freshYs;
    const pairs = [] as { handle: string; contractAddress: string }[];
    const contractAddress = CONTRACT_ADDRESS;
    for (let i = 0; i < 3; i++) {
      if (mineXs[i]) pairs.push({ handle: mineXs[i] as string, contractAddress });
      if (mineYs[i]) pairs.push({ handle: mineYs[i] as string, contractAddress });
    }

    // Generate user keypair and EIP712 to request decryption
    const keypair = zamaInstance.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [contractAddress];

    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const eip712 = zamaInstance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signature = await (signer as any).signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message,
    );

    const result = await zamaInstance.userDecrypt(
      pairs,
      keypair.privateKey,
      keypair.publicKey,
      (signature as string).replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );

    // Clear any previously visible opponent positions
    setVisibleOpponent([]);

    // Extract my positions
    const minePos: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const hx = mineXs[i] as string;
      const hy = mineYs[i] as string;
      const x = result[hx];
      const y = result[hy];
      if (typeof x === 'bigint' && typeof y === 'bigint') {
        minePos.push({ x: Number(x), y: Number(y) });
      }
    }
    setMyPositions(minePos);
  }

  const defenderSoldiers = role === 'defender' ? myPositions : visibleOpponent;
  const attackerSoldiers = role === 'attacker' ? myPositions : visibleOpponent;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>FogWar (9×9)</h1>
        <ConnectButton />
      </header>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div>
          <Board
            defenderSoldiers={defenderSoldiers}
            attackerSoldiers={attackerSoldiers}
            opponentVisiblePositions={visibleOpponent}
            myRole={role}
            mySoldiers={role === 'defender' ? defenderSoldiers : role === 'attacker' ? attackerSoldiers : []}
            selectedIndex={moveIndex}
            onSelectIndex={(i) => setMoveIndex(i)}
          />
          <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginTop: 16 }}>
            <p>You can not see your emermy's positon.</p>
            <p>Decrypt your soldiers position.</p>
            <button onClick={decryptAll} disabled={!address} style={{ padding: '6px 10px' }}>Decrypt</button>
          </section>
        </div>
        <div style={{ flex: 1 }}>
          <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>All Games</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {games.length === 0 && <span>—</span>}
              {games.map((id) => (
                <button key={id.toString()} onClick={() => setGameId(id)} style={{ padding: '6px 10px', border: gameId === id ? '2px solid #333' : undefined }}>
                  #{id.toString()}
                </button>
              ))}
              <button onClick={refreshGames} style={{ padding: '6px 10px' }}>Refresh</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={createGame} style={{ padding: '6px 10px' }}>Create New Game</button>
              {!started && (
                <button onClick={joinAuto} style={{ padding: '6px 10px' }} disabled={!gameId}>Join</button>
              )}
            </div>
          </section>

          {gameId && (
            <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Game Status</h3>
              <p>Game: #{Number(gameId)}</p>
              <p>Started: {started ? 'Yes' : 'No'}</p>
              <p>Your role: {role}</p>
            </section>
          )}

          <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Move Soldier</h3>
            <p>Decrypt and Click your soldier first</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label>Index (0-2): <input type="number" value={moveIndex} min={0} max={2} readOnly style={{ width: 60, background: '#f7f7f7' }} /></label>
              <label>Direction:
                <select value={direction} onChange={(e) => setDirection(Number(e.target.value))}>
                  <option value={0}>Up</option>
                  <option value={1}>Down</option>
                  <option value={2}>Left</option>
                  <option value={3}>Right</option>
                </select>
              </label>
              <button onClick={move} disabled={!address || !started || zamaLoading} style={{ padding: '6px 10px' }}>Move</button>
            </div>
          </section>

          
        </div>
      </div>
    </div>
  );
}
