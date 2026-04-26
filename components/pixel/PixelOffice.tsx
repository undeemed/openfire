"use client";

/**
 * PixelOffice — minimal pixel-art office that animates in real time
 * based on the entity list passed in.
 *
 * Sprites and the 7-frame layout convention (walk × 3 + type × 2 +
 * read × 2 per direction; rows = down/up/right with left flipped from
 * right) are derived from the MIT-licensed pixel-agents project — see
 * public/assets/pixel/NOTICE.md.
 *
 * The canvas is intentionally self-contained: no global state, no
 * external loop. It owns:
 *   - sprite-sheet preloading (six character sheets + one floor tile)
 *   - per-character state (position, target tile, direction, anim)
 *   - the rAF render loop
 *
 * Movement: linear-tile lerp toward the target tile. No A*; the office
 * has no walls, so picking the closer axis first is enough to look
 * deliberate. Pathfinding can be added later if the layout grows.
 */
import { useEffect, useRef, useState } from "react";

export type EntityStatus =
  | "active"
  | "pending"
  | "fired"
  | "spared";

export interface OfficeEntity {
  id: string;
  name: string;
  /** Drives how the character is staged in the office. */
  kind: "employee" | "worker";
  status: EntityStatus | "in_progress" | "waiting_input" | "done" | "failed";
  /** 0..5 — picks one of the six character sheets. */
  paletteIdx: number;
  /** Optional: how busy the worker currently is. Triggers "type" anim. */
  busy?: boolean;
}

// ── Layout constants ─────────────────────────────────────────────
const TILE = 16;
const ZOOM = 3;
const COLS = 30;
const ROWS = 18;
const CANVAS_W = COLS * TILE * ZOOM;
const CANVAS_H = ROWS * TILE * ZOOM;

// Character sprite-sheet conventions (matches pixel-agents).
const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_FRAMES_PER_ROW = 7;
const CHAR_SHEET_COUNT = 6;

// Animation timing.
const WALK_SPEED_TILES_PER_SEC = 2.4;
const WALK_FRAME_DURATION = 0.18;
const TYPE_FRAME_DURATION = 0.32;

type Dir = "down" | "up" | "right" | "left";
type AnimState = "idle" | "walk" | "type";

interface Character {
  id: string;
  name: string;
  paletteIdx: number;
  /** Floating-point tile coords (smooth motion). */
  x: number;
  y: number;
  targetCol: number;
  targetRow: number;
  dir: Dir;
  anim: AnimState;
  frame: number;
  frameTimer: number;
  /** Tint over the sprite when fired (gray-out). */
  tint?: "fired" | "court" | null;
}

// ── Stations: where each entity belongs based on status ──────────

interface Tile {
  col: number;
  row: number;
}

const EXIT_DOOR: Tile = { col: COLS - 2, row: ROWS - 2 };
const COURT_TILES: Tile[] = [
  { col: 14, row: 8 },
  { col: 15, row: 8 },
  { col: 16, row: 8 },
];

function employeeDesk(idx: number): Tile {
  // Two rows of desks along the top.
  const perRow = 6;
  const col = 3 + (idx % perRow) * 4;
  const row = 2 + Math.floor(idx / perRow) * 3;
  return { col, row };
}

function workerStation(idx: number): Tile {
  // Bottom rows for AI workers.
  const perRow = 6;
  const col = 3 + (idx % perRow) * 4;
  const row = ROWS - 5 + Math.floor(idx / perRow) * 2;
  return { col, row };
}

function targetFor(entity: OfficeEntity, idx: number): Tile {
  if (entity.kind === "employee") {
    if (entity.status === "fired") return EXIT_DOOR;
    if (entity.status === "pending")
      return COURT_TILES[idx % COURT_TILES.length];
    return employeeDesk(idx); // active + spared sit at desks
  }
  // worker
  if (entity.status === "fired") return EXIT_DOOR;
  return workerStation(idx);
}

function tintFor(entity: OfficeEntity): Character["tint"] {
  if (entity.status === "fired") return "fired";
  if (entity.status === "pending") return "court";
  return null;
}

function animFor(entity: OfficeEntity, isMoving: boolean): AnimState {
  if (isMoving) return "walk";
  if (entity.kind === "worker" && entity.busy) return "type";
  if (entity.kind === "employee" && entity.status === "active") return "type";
  return "idle";
}

// ── Asset loader ─────────────────────────────────────────────────

interface Assets {
  charSheets: HTMLImageElement[];
  floor: HTMLImageElement;
}

async function loadAssets(): Promise<Assets> {
  const load = (src: string): Promise<HTMLImageElement> =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  const sheets = await Promise.all(
    Array.from({ length: CHAR_SHEET_COUNT }, (_, i) =>
      load(`/assets/pixel/characters/char_${i}.png`)
    )
  );
  const floor = await load("/assets/pixel/floors/floor_0.png");
  return { charSheets: sheets, floor };
}

// ── Component ────────────────────────────────────────────────────

export function PixelOffice({ entities }: { entities: OfficeEntity[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const charsRef = useRef<Map<string, Character>>(new Map());
  const assetsRef = useRef<Assets | null>(null);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preload assets once.
  useEffect(() => {
    let cancelled = false;
    loadAssets()
      .then((a) => {
        if (cancelled) return;
        assetsRef.current = a;
        setReady(true);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync the entity list into the character map: spawn/update/remove.
  useEffect(() => {
    const chars = charsRef.current;
    const seen = new Set<string>();

    // Index by kind to compute desk/station slots deterministically.
    const empIdx = new Map<string, number>();
    const wrkIdx = new Map<string, number>();
    let e = 0;
    let w = 0;
    for (const ent of entities) {
      if (ent.kind === "employee") empIdx.set(ent.id, e++);
      else wrkIdx.set(ent.id, w++);
    }

    for (const ent of entities) {
      seen.add(ent.id);
      const idx =
        ent.kind === "employee"
          ? (empIdx.get(ent.id) ?? 0)
          : (wrkIdx.get(ent.id) ?? 0);
      const target = targetFor(ent, idx);
      const existing = chars.get(ent.id);
      if (!existing) {
        // Spawn at exit door so they "walk in" to their station.
        chars.set(ent.id, {
          id: ent.id,
          name: ent.name,
          paletteIdx: ent.paletteIdx % CHAR_SHEET_COUNT,
          x: EXIT_DOOR.col,
          y: EXIT_DOOR.row,
          targetCol: target.col,
          targetRow: target.row,
          dir: "down",
          anim: "walk",
          frame: 0,
          frameTimer: 0,
          tint: tintFor(ent),
        });
      } else {
        existing.targetCol = target.col;
        existing.targetRow = target.row;
        existing.tint = tintFor(ent);
        existing.paletteIdx = ent.paletteIdx % CHAR_SHEET_COUNT;
      }
    }

    // Remove characters whose entity is gone.
    for (const id of [...chars.keys()]) {
      if (!seen.has(id)) chars.delete(id);
    }
  }, [entities]);

  // Game loop.
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const tick = (now: number) => {
      const last = lastTimeRef.current || now;
      const dt = Math.min(0.05, (now - last) / 1000);
      lastTimeRef.current = now;
      step(dt);
      draw(ctx);
      rafRef.current = requestAnimationFrame(tick);
    };

    const step = (dt: number) => {
      for (const ch of charsRef.current.values()) {
        const dx = ch.targetCol - ch.x;
        const dy = ch.targetRow - ch.y;
        const dist = Math.hypot(dx, dy);
        const isMoving = dist > 0.05;

        if (isMoving) {
          // Snap-to-grid by stepping toward whichever axis is larger
          // first, so motion looks deliberate without a real path.
          const move = WALK_SPEED_TILES_PER_SEC * dt;
          if (Math.abs(dx) > Math.abs(dy)) {
            ch.x += Math.sign(dx) * Math.min(Math.abs(dx), move);
            ch.dir = dx > 0 ? "right" : "left";
          } else {
            ch.y += Math.sign(dy) * Math.min(Math.abs(dy), move);
            ch.dir = dy > 0 ? "down" : "up";
          }
          ch.anim = "walk";
          ch.frameTimer += dt;
          if (ch.frameTimer >= WALK_FRAME_DURATION) {
            ch.frameTimer -= WALK_FRAME_DURATION;
            ch.frame = (ch.frame + 1) % 4;
          }
        } else {
          // At target. Pick anim based on entity intent encoded in tint.
          ch.x = ch.targetCol;
          ch.y = ch.targetRow;
          // Default: idle. Type if the entity wants the busy animation.
          // We don't have entity here — animFor was applied at sync; we
          // approximate by reading tint plus a default rule.
          const wantType =
            ch.tint === null && (ch.id.startsWith("w") || ch.id.startsWith("worker"));
          ch.anim = wantType ? "type" : "idle";
          ch.frameTimer += dt;
          if (ch.anim === "type") {
            if (ch.frameTimer >= TYPE_FRAME_DURATION) {
              ch.frameTimer -= TYPE_FRAME_DURATION;
              ch.frame = (ch.frame + 1) % 2;
            }
          } else {
            ch.frame = 1;
          }
        }
      }
    };

    const draw = (c: CanvasRenderingContext2D) => {
      // Floor.
      const floor = assetsRef.current!.floor;
      for (let r = 0; r < ROWS; r++) {
        for (let col = 0; col < COLS; col++) {
          c.drawImage(
            floor,
            0,
            0,
            TILE,
            TILE,
            col * TILE * ZOOM,
            r * TILE * ZOOM,
            TILE * ZOOM,
            TILE * ZOOM
          );
        }
      }

      // Court rug.
      c.fillStyle = "rgba(255,90,30,0.18)";
      for (const t of COURT_TILES) {
        c.fillRect(
          t.col * TILE * ZOOM,
          t.row * TILE * ZOOM,
          TILE * ZOOM,
          TILE * ZOOM
        );
      }
      // Exit door.
      c.fillStyle = "rgba(140,30,20,0.55)";
      c.fillRect(
        EXIT_DOOR.col * TILE * ZOOM,
        EXIT_DOOR.row * TILE * ZOOM,
        TILE * ZOOM,
        TILE * ZOOM
      );

      // Characters — Z-sort by Y for proper occlusion.
      const ordered = [...charsRef.current.values()].sort(
        (a, b) => a.y - b.y
      );
      const sheets = assetsRef.current!.charSheets;

      for (const ch of ordered) {
        const sheet = sheets[ch.paletteIdx];
        const dirRow =
          ch.dir === "down" ? 0 : ch.dir === "up" ? 1 : 2; // right/left both use row 2

        // Frame index in 0..6: walk uses 0/1/2/1, type uses 3/4, idle 1.
        let frameCol: number;
        if (ch.anim === "walk") {
          // 0,1,2,1 cycle from frame counter 0..3
          frameCol = ch.frame === 0 ? 0 : ch.frame === 2 ? 2 : 1;
        } else if (ch.anim === "type") {
          frameCol = 3 + (ch.frame % 2);
        } else {
          frameCol = 1;
        }

        const sx = frameCol * CHAR_FRAME_W;
        const sy = dirRow * CHAR_FRAME_H;

        // World draw position; characters straddle a 16×32 box so we
        // anchor by feet at the center of the tile.
        const worldX = ch.x * TILE * ZOOM + (TILE * ZOOM) / 2;
        const worldY = (ch.y + 1) * TILE * ZOOM;

        const drawW = CHAR_FRAME_W * ZOOM;
        const drawH = CHAR_FRAME_H * ZOOM;
        const dx = worldX - drawW / 2;
        const dy = worldY - drawH;

        c.save();
        if (ch.dir === "left") {
          // Mirror horizontally around the character's center.
          c.translate(dx + drawW, dy);
          c.scale(-1, 1);
          c.drawImage(sheet, sx, sy, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, drawW, drawH);
        } else {
          c.drawImage(sheet, sx, sy, CHAR_FRAME_W, CHAR_FRAME_H, dx, dy, drawW, drawH);
        }
        // Tint pass.
        if (ch.tint === "fired") {
          c.globalCompositeOperation = "source-atop";
          c.fillStyle = "rgba(40,40,40,0.55)";
          if (ch.dir === "left") c.fillRect(0, 0, drawW, drawH);
          else c.fillRect(dx, dy, drawW, drawH);
        } else if (ch.tint === "court") {
          c.globalCompositeOperation = "source-atop";
          c.fillStyle = "rgba(255,90,30,0.35)";
          if (ch.dir === "left") c.fillRect(0, 0, drawW, drawH);
          else c.fillRect(dx, dy, drawW, drawH);
        }
        c.restore();

        // Name label.
        c.fillStyle = "rgba(0,0,0,0.55)";
        c.fillRect(dx + 2, dy - 14, drawW - 4, 12);
        c.fillStyle = "#f4f4f7";
        c.font = "10px monospace";
        c.textBaseline = "top";
        c.textAlign = "center";
        c.fillText(ch.name, worldX, dy - 12);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [ready]);

  if (error) {
    return (
      <div className="border border-[var(--accent)]/60 bg-[var(--accent-dim)]/20 p-4 text-[10px] font-mono text-[var(--accent)]">
        Pixel office failed to load assets: {error}
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] bg-[#1a1414] p-3 inline-block">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          imageRendering: "pixelated",
          display: "block",
        }}
        aria-label="Pixel office: live OpenFire agent state"
      />
      {!ready ? (
        <div className="text-[10px] font-mono text-[var(--text-dim)] mt-2 tracking-[0.2em] uppercase">
          Loading sprites…
        </div>
      ) : null}
    </div>
  );
}
