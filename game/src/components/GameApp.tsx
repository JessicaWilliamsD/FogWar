import React, { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { formatAddress } from '../utils/format';
import { Board } from './Board';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk/bundle';
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
  const [newX, setNewX] = useState(5);
  const [newY, setNewY] = useState(5);

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

  async function createGame(asDefender: boolean) {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    const tx = await contract.createGame(asDefender);
    await tx.wait();
    await refreshGames();
    const next: bigint = await contract.nextGameId();
    setGameId(next);
  }

  async function joinAs(r: 'defender' | 'attacker') {
    if (!gameId) return;
    const method = r === 'defender' ? 'joinAsDefender' : 'joinAsAttacker';
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    const tx = await contract[method](gameId);
    await tx.wait();
  }

  async function move() {
    if (!address) return;
    if (moveIndex < 0 || moveIndex > 2) return;
    if (newX < 1 || newX > 9 || newY < 1 || newY > 9) return;

    // Use ethers for write
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI as any, signer);
    if (!gameId) return;
    const tx = await contract.moveMySoldier(gameId, moveIndex, newX, newY);
    await tx.wait();
  }

  async function decryptAll() {
    if (!address) return;
    const instance = await createInstance(SepoliaConfig);

    // opponent public decrypt
    const opp = role === 'defender' ? attackers : defenders; // opponent's handles
    const handles: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (opp.xs[i]) handles.push(opp.xs[i] as string);
      if (opp.ys[i]) handles.push(opp.ys[i] as string);
    }
    const pub = await instance.publicDecrypt(handles);
    const oppPos: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const hx = opp.xs[i] as string;
      const hy = opp.ys[i] as string;
      const x = pub[hx];
      const y = pub[hy];
      if (typeof x === 'bigint' && typeof y === 'bigint') {
        oppPos.push({ x: Number(x), y: Number(y) });
      }
    }
    setVisibleOpponent(oppPos);

    // my user decrypt (re-encrypt to user keypair)
    const mine = role === 'defender' ? defenders : attackers;
    const pairs = [] as { handle: string; contractAddress: string }[];
    const contractAddress = CONTRACT_ADDRESS;
    for (let i = 0; i < 3; i++) {
      if (mine.xs[i]) pairs.push({ handle: mine.xs[i] as string, contractAddress });
      if (mine.ys[i]) pairs.push({ handle: mine.ys[i] as string, contractAddress });
    }
    const keypair = instance.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [contractAddress];

    // Prepare EIP712 and sign with wallet
    // For read-only provider to viem client, we still need a wallet signer for typed data
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signature = await (signer as any).signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message,
    );

    const result = await instance.userDecrypt(
      pairs,
      keypair.privateKey,
      keypair.publicKey,
      (signature as string).replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );
    const minePos: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const hx = mine.xs[i] as string;
      const hy = mine.ys[i] as string;
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
          <Board defenderSoldiers={defenderSoldiers} attackerSoldiers={attackerSoldiers} opponentVisiblePositions={visibleOpponent} />
        </div>
        <div style={{ flex: 1 }}>
          <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Status</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label>Game: </label>
              <select value={gameId ? Number(gameId) : ''} onChange={(e) => setGameId(BigInt(e.target.value))}>
                <option value="" disabled>Select a game</option>
                {games.map((id) => (<option key={id.toString()} value={id.toString()}>{id.toString()}</option>))}
              </select>
              <button onClick={refreshGames}>Refresh</button>
            </div>
            <p>Started: {started ? 'Yes' : 'No'}</p>
            <p>Defender: {defenderAddr ? formatAddress(defenderAddr as string) : '—'}</p>
            <p>Attacker: {attackerAddr ? formatAddress(attackerAddr as string) : '—'}</p>
            <p>Your role: {role}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => createGame(true)} style={{ padding: '6px 10px' }}>Create Game (Defender)</button>
              <button onClick={() => createGame(false)} style={{ padding: '6px 10px' }}>Create Game (Attacker)</button>
              {!started && (
                <>
                  <button onClick={() => joinAs('defender')} style={{ padding: '6px 10px' }} disabled={!gameId}>Join as Defender</button>
                  <button onClick={() => joinAs('attacker')} style={{ padding: '6px 10px' }} disabled={!gameId}>Join as Attacker</button>
                </>
              )}
            </div>
          </section>

          <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Move Soldier</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label>Index (0-2): <input type="number" value={moveIndex} min={0} max={2} onChange={(e) => setMoveIndex(Number(e.target.value))} style={{ width: 60 }} /></label>
              <label>X (1-9): <input type="number" value={newX} min={1} max={9} onChange={(e) => setNewX(Number(e.target.value))} style={{ width: 60 }} /></label>
              <label>Y (1-9): <input type="number" value={newY} min={1} max={9} onChange={(e) => setNewY(Number(e.target.value))} style={{ width: 60 }} /></label>
              <button onClick={move} disabled={!address || !started} style={{ padding: '6px 10px' }}>Move</button>
            </div>
          </section>

          <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Decrypt</h3>
            <p>Decrypts opponent public positions and your own via user-decrypt.</p>
            <button onClick={decryptAll} disabled={!address} style={{ padding: '6px 10px' }}>Decrypt</button>
          </section>
        </div>
      </div>
    </div>
  );
}
