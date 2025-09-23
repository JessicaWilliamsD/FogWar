import React from 'react';

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
}: {
  defenderSoldiers: { x: number; y: number }[];
  attackerSoldiers: { x: number; y: number }[];
  opponentVisiblePositions: { x: number; y: number }[]; // decrypted opponent positions
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 40px)', gap: '4px' }}>
      {cells.map((c) => {
        const isBoth = c.defender && c.attacker; // unlikely, but style priority
        const border = isBoth ? '2px solid purple' : c.defender ? '2px solid #0070f3' : c.attacker ? '2px solid #e00' : '1px solid #555';
        return (
          <div
            key={`${c.x}-${c.y}`}
            style={{
              width: 40,
              height: 40,
              background: getBg(c),
              border,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: '#333',
              position: 'relative',
            }}
            title={`(${c.x},${c.y})`}
          >
            <span>{c.x},{c.y}</span>
            {c.opponentVisible && (
              <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 10, color: '#111' }}>O</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

