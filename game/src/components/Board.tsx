// React import not required with automatic JSX runtime

type Cell = {
  x: number;
  y: number;
  defender?: boolean;
  attacker?: boolean;
  opponentVisible?: boolean;
};

export function Board({
  defenderSoldiers,
  attackerSoldiers,
  opponentVisiblePositions,
  myRole,
  mySoldiers,
  selectedIndex,
  onSelectIndex,
}: {
  defenderSoldiers: { x: number; y: number }[];
  attackerSoldiers: { x: number; y: number }[];
  opponentVisiblePositions: { x: number; y: number }[]; // decrypted opponent positions
  myRole: 'defender' | 'attacker' | 'spectator';
  mySoldiers: { x: number; y: number }[];
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
}) {
  const cells: Cell[] = [];
  for (let y = 9; y >= 1; y--) {
    for (let x = 1; x <= 9; x++) {
      const cell: Cell = { x, y };
      if (defenderSoldiers.some((s) => s.x === x && s.y === y)) cell.defender = true;
      if (attackerSoldiers.some((s) => s.x === x && s.y === y)) cell.attacker = true;
      if (opponentVisiblePositions.some((s) => s.x === x && s.y === y)) cell.opponentVisible = true;
      cells.push(cell);
    }
  }

  const getBg = (c: Cell) => {
    // Zones coloring
    if (c.y <= 3) return '#e6f7ff'; // defender zone
    if (c.y >= 7) return '#ffe6e6'; // attacker zone
    return '#f5f5f5'; // neutral
  };

  const isMineAt = (x: number, y: number) => mySoldiers.findIndex((s) => s.x === x && s.y === y);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 40px)', gap: '4px' }}>
      {cells.map((c) => {
        const isBoth = c.defender && c.attacker; // unlikely, but style priority
        const border = isBoth ? '2px solid purple' : c.defender ? '2px solid #0070f3' : c.attacker ? '2px solid #e00' : '1px solid #555';
        const mineIdx = isMineAt(c.x, c.y);
        const isMine = mineIdx !== -1 && myRole !== 'spectator';
        const isSelected = isMine && selectedIndex === mineIdx;
        return (
          <div
            key={`${c.x}-${c.y}`}
            style={{
              width: 40,
              height: 40,
              background: getBg(c),
              border: isSelected ? '2px solid #f39c12' : border,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: '#333',
              position: 'relative',
              cursor: isMine && onSelectIndex ? 'pointer' : 'default',
            }}
            title={`(${c.x},${c.y})`}
            onClick={() => {
              if (isMine && onSelectIndex) onSelectIndex(mineIdx);
            }}
          >
            <span>{c.x},{c.y}</span>
            {isMine && (
              <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 16 }} role="img" aria-label="mine">🪖</span>
            )}
            {c.opponentVisible && (
              <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 10, color: '#111' }}>O</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
