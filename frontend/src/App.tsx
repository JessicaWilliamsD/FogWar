import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import GameBoard from './components/GameBoard'
import GameLobby from './components/GameLobby'
import './App.css'

export interface Game {
  gameId: number
  defender: string
  attacker: string
  currentPlayer: string
  state: number // 0: WaitingForPlayers, 1: InProgress, 2: Finished
}

function App() {
  const { isConnected } = useAccount()
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const [view, setView] = useState<'lobby' | 'game'>('lobby')

  const handleGameStarted = (game: Game) => {
    setCurrentGame(game)
    setView('game')
  }

  const handleBackToLobby = () => {
    setCurrentGame(null)
    setView('lobby')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>FogWar ⚔️</h1>
        <p>Blockchain strategy game with fog of war mechanics</p>
        <div className="connect-wallet">
          <ConnectButton />
        </div>
      </header>

      <main className="app-main">
        {!isConnected ? (
          <div className="welcome">
            <h2>Welcome to FogWar</h2>
            <p>Connect your wallet to start playing!</p>
            <div className="game-info">
              <h3>How to Play:</h3>
              <ul>
                <li>🏰 <strong>Defender</strong>: Your soldiers in rows 1-3 are encrypted (hidden)</li>
                <li>⚔️ <strong>Attacker</strong>: Your soldiers in rows 7-9 are encrypted (hidden)</li>
                <li>🌫️ <strong>Fog of War</strong>: Soldiers become visible when leaving home territory</li>
                <li>🎯 <strong>Movement</strong>: Move one square at a time (including diagonally)</li>
                <li>🔄 <strong>Turns</strong>: Players alternate moves</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="game-container">
            {view === 'lobby' ? (
              <GameLobby onGameStarted={handleGameStarted} />
            ) : (
              currentGame && (
                <GameBoard 
                  game={currentGame} 
                  onBackToLobby={handleBackToLobby} 
                />
              )
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
