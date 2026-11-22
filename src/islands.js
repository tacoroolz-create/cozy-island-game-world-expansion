// ===== FLOATING ISLANDS: THE INFINITE DESCENT =====
// See WorldRedesign/08_FLOATING_ISLANDS.md. The world is a one-way chain of
// islands floating in a void. Walk into the void at any edge, confirm, and you
// fall to the next island down. You can never go back up.
//
// ponytail: there is no island *stack*. Only one island is ever live — the
// existing `maps.island` slot, regenerated in place on each fall. Since the
// descent is one-way by design, keeping dead islands in memory (and in the
// save) would buy nothing, and every `currentMapId === 'island'` check across
// the codebase keeps working untouched. Add a stack only if backtracking
// ever becomes a thing (the whole point is that it doesn't).
//
// Depth 0 is the original island — beach, dock, sea, pond, tunnel — unchanged.
// Depth 1+ are the biome islands generated below.

// Each island is still drawn on the engine's 100x100 tile grid; the island's
// *land* is a centered square and everything outside it is void. So land size
// is set by the void margin, not by a per-island grid size.
// ponytail: per-island grid dimensions (09_ISLAND_SIZING) would mean making
// CONFIG.WORLD_WIDTH per-world, which every file reads directly. Margins give
// the same varying land areas for free. Revisit if 80x80 town ever feels cramped.
const ISLAND_GRID = CONFIG.WORLD_WIDTH;   // 100 — the engine grid every island is drawn on

const ISLAND_BIOMES = [
    {
        id: 'meadow', name: 'The Meadow', land: 50,
        blurb: 'Flowers all the way to the edge. Nothing here wants anything from you.',
        sky: [150, 195, 230],
        decor: [['tulip', 16], ['rosebush', 8], ['tree', 4], ['bird_poop', 4]],
    },
    {
        id: 'woods', name: 'The Woods', land: 56,
        blurb: 'Dappled light. Something moves and it is only ever a bird.',
        sky: [128, 178, 205],
        decor: [['tree', 44], ['fir_tree', 16], ['rock', 8], ['shiny_rock', 3]],
    },
    {
        id: 'town', name: 'The Town', land: 80,
        blurb: 'Room enough for everyone who jumped after you.',
        sky: [205, 185, 150],
        decor: [['tree', 12], ['rosebush', 4], ['bird_poop', 6]],
    },
    {
        id: 'city', name: 'The City', land: 60,
        blurb: 'Cozy-urban. The clock tower has not been built yet.',
        sky: [175, 160, 185],
        decor: [['rock', 14], ['tree', 6], ['shiny_rock', 4]],
    },
    {
        id: 'deep_woods', name: 'The Deep Woods', land: 60,
        blurb: 'Spooky, but the cozy kind. The trees lean in to listen.',
        sky: [95, 105, 135],
        decor: [['fir_tree', 46], ['tree', 14], ['rock', 8], ['shiny_rock', 2]],
    },
    {
        id: 'mountain', name: 'The Mountain', land: 56,
        blurb: 'Look up. Everything you left is up there, small and gold.',
        sky: [120, 150, 190],
        decor: [['rock', 56], ['shiny_rock', 8], ['fir_tree', 14]],
    },
];

// Depth 0 = the original island. Depth 1..6 = the fixed biomes above.
// Depth 7+ reuses a biome at random until procedural generation exists.
// ponytail: a random re-pick is the whole "infinite below" for now — it keeps
// the descent endless without pretending we have Phase 5 content.
function islandBiomeFor(depth) {
    if (depth <= 0) return null;
    return ISLAND_BIOMES[(depth - 1) % ISLAND_BIOMES.length];
}

function islandDepth() { return (world && world.depth) || 0; }
function onBiomeIsland() { return !!(world && world.biome && currentMapId === 'island'); }

// Tiles outside the land square are void. Land is centered on the grid.
function islandVoidMargin(landSize) { return Math.floor((ISLAND_GRID - landSize) / 2); }

function isVoidTile(x, y) {
    if (!world || !world.tiles[x] || !world.tiles[x][y]) return false;
    return world.tiles[x][y].type === 'void';
}

// ===== GENERATION =====

// Authored maps: each biome (except depth-0 beach) may have a hand-authored
// CSV loaded in game.js preload into ISLAND_CSV_MAPS. When present it replaces
// the procedural scatter entirely — no random decor is placed on top (the CSV
// is the whole layout). Falls back to generateBiomeIsland on any problem.
function buildAuthoredBiomeIsland(biome, csvText) {
    if (Array.isArray(csvText)) csvText = csvText.join('\n');
    if (!csvText || typeof csvText !== 'string' || typeof CSV_TILEMAP === 'undefined') return null;
    try {
        const w = CSV_TILEMAP.buildIslandFromCSV(csvText, biome.id);
        w.biome = biome.id;
        w.authored = true;
        return w;
    } catch (e) {
        console.warn('authored island for ' + biome.id + ' failed to build; falling back to procedural:', e && e.message);
        return null;
    }
}

// Fill `w.tiles` with a floating island for `biome`. Mirrors World.generateWorld()
// but with a void ring instead of an ocean, and a per-biome decoration mix.
function generateBiomeIsland(w, biome) {
    const m = islandVoidMargin(biome.land);
    const lo = m, hi = ISLAND_GRID - m - 1;
    w.tiles = [];
    for (let x = 0; x < ISLAND_GRID; x++) {
        w.tiles[x] = [];
        for (let y = 0; y < ISLAND_GRID; y++) {
            const onLand = x >= lo && x <= hi && y >= lo && y <= hi;
            w.tiles[x][y] = onLand
                ? { type: 'grass', variant: Math.floor(Math.random() * 3) }
                : { type: 'void', variant: 0, solid: true };
        }
    }
    // Nibble the corners so the island reads as a landmass, not a box.
    const bite = Math.max(3, Math.floor(biome.land * 0.18));
    for (const [cx, cy] of [[lo, lo], [hi, lo], [lo, hi], [hi, hi]]) {
        const sx = cx === lo ? 1 : -1, sy = cy === lo ? 1 : -1;
        for (let i = 0; i < bite; i++) {
            const run = bite - i - Math.floor(Math.random() * 2);
            for (let j = 0; j < run; j++) {
                const x = cx + sx * i, y = cy + sy * j;
                if (x < 0 || x >= ISLAND_GRID || y < 0 || y >= ISLAND_GRID) continue;
                w.tiles[x][y] = { type: 'void', variant: 0, solid: true };
            }
        }
    }

    // Scatter decorations, keeping a clear band inside the edge so nothing
    // renders half-over the void, and leaving the middle open for buildings.
    const EDGE_CLEAR = 3;
    for (const [type, count] of biome.decor) {
        let placed = 0;
        for (let tries = 0; placed < count && tries < count * 40; tries++) {
            const x = lo + EDGE_CLEAR + Math.floor(Math.random() * (biome.land - EDGE_CLEAR * 2));
            const y = lo + EDGE_CLEAR + Math.floor(Math.random() * (biome.land - EDGE_CLEAR * 2));
            if (!w.tiles[x] || !w.tiles[x][y] || w.tiles[x][y].type !== 'grass') continue;
            if (type === 'tree' || type === 'fir_tree') {
                const before = w.tiles[x][y].type;
                w.placeTree(x, y, type);
                if (w.tiles[x][y].type === before) continue;
            } else {
                w.tiles[x][y] = { type, variant: Math.floor(Math.random() * 2) };
            }
            placed++;
        }
    }
}

// ===== Batch 2: deterministic decorative-grass scatter =====
// Convert a seeded portion of plain 'grass' tiles to 'grass_variant' tiles
// (grass_cool / grass_stars / grass_yeesh). Seeded per biome+depth so the
// same fall always produces the same island — saves/loads stay stable because
// the (already-scattered) tiles themselves are what get serialized.
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function scatterGrassVariants(w, biomeId, depth) {
    const rand = mulberry32(hashSeed((biomeId || 'island') + ':' + depth));
    for (let x = 0; x < w.tiles.length; x++) {
        for (let y = 0; y < (w.tiles[x] ? w.tiles[x].length : 0); y++) {
            const t = w.tiles[x][y];
            if (!t || t.type !== 'grass' || t.solid || t.shackPad) continue;
            if (rand() < 0.14) {
                w.tiles[x][y] = { type: 'grass_variant', variant: Math.floor(rand() * 3) };
            }
        }
    }
}

// ===== THE FALL =====

let fallPrompt = null;   // { dir } — waiting on the player's yes/no
let fallAnim = null;     // { phase: 'out'|'in', startTime, dir }
const FALL_FADE_MS = 900;
const FALL_DROP_MS = 1400;

// True while the fall prompt or animation owns the input.
function fallBlocksInput() { return !!(fallPrompt || fallAnim); }

// Called from Player.move() with the tile the player is trying to step into.
// Returns true if the step opened the fall prompt (and so must be blocked).
function promptFallAt(p, nx, ny) {
    if (fallBlocksInput() || currentMapId !== 'island' || !world.tiles[nx]) return false;
    const target = world.tiles[nx][ny];
    const here = world.tiles[p.x] && world.tiles[p.x][p.y];
    if (!target) return false;
    const dir = nx > p.x ? 'right' : nx < p.x ? 'left' : ny > p.y ? 'down' : 'up';
    if (target.type === 'void') { fallPrompt = { dir }; return true; }
    // Island 0 is the original island: it has a real ocean, not a void ring, so
    // its one way down is the end of the pier — "the last link to above."
    // The pier's walkable deck (rows DOCK_DECK_Y0..Y1) is separated from the
    // sea by its own solid face rows (deck-1 and deck+1), so a sea-step test
    // alone can never fire — also accept stepping into a solid dock FACE.
    if (islandDepth() === 0) {
        if (target.type === 'sea' && here && here.type === 'dock') {
            fallPrompt = { dir };
            return true;
        }
        if (target.type === 'dock' && here && here.type === 'dock'
                && !isSolidTile(p.x, p.y) && isSolidTile(nx, ny) && ny > p.y) {
            // Walking off the deck's south edge into the pier's bottom face —
            // the way down. (The top face is NOT an exit: there is no island
            // above island 0.)
            fallPrompt = { dir: 'down' };
            return true;
        }
    }
    return false;
}

function handleFallPromptKey(kc, k) {
    if (!fallPrompt) return false;
    const yes = kc === 89 || kc === ENTER || kc === RETURN;      // Y / Enter
    const no = kc === 78 || kc === ESCAPE || kc === 8;           // N / Esc / Backspace
    if (yes) {
        const dir = fallPrompt.dir;
        fallPrompt = null;
        fallAnim = { phase: 'out', startTime: millis(), dir };
    } else if (no) {
        fallPrompt = null;
    }
    return true;
}

function updateIslandFall() {
    if (!fallAnim) return;
    const t = millis() - fallAnim.startTime;
    if (fallAnim.phase === 'out') {
        if (t >= FALL_FADE_MS) {
            fallToNextIsland(fallAnim.dir);
            fallAnim = { phase: 'in', startTime: millis(), dir: fallAnim.dir };
            player.fallOffsetY = -CONFIG.CANVAS_HEIGHT;
        }
        return;
    }
    // 'in': feather-slow drop onto the new island while the white burns off.
    const p = Math.min(1, t / FALL_DROP_MS);
    const ease = 1 - Math.pow(1 - p, 3);
    player.fallOffsetY = -CONFIG.CANVAS_HEIGHT * (1 - ease);
    if (p >= 1) {
        player.fallOffsetY = 0;
        fallAnim = null;
        const b = world.biome && ISLAND_BIOMES.find(x => x.id === world.biome);
        if (b) notify(b.name + ' — ' + b.blurb);
    }
}

// Replace the live island with the next one down. Inventory, friendships,
// quests and the almanac come along; terrain, buildings and crops do not.
function fallToNextIsland(dir) {
    const depth = islandDepth() + 1;
    const biome = islandBiomeFor(depth);
    const followers = npcs.filter(n => n.isPresent);

    // Prefer the hand-authored CSV for this biome; procedural is the fallback.
    const csvText = (typeof ISLAND_CSV_MAPS !== 'undefined' && ISLAND_CSV_MAPS)
        ? ISLAND_CSV_MAPS[biome.id] : null;
    const authored = buildAuthoredBiomeIsland(biome, csvText);
    const next = authored || new World('blank', 'island');
    next.kind = 'island';
    next.depth = depth;
    next.biome = biome.id;
    next.day = world.day;
    next.season = world.season;
    next.timeMinutes = world.timeMinutes;
    if (!authored) generateBiomeIsland(next, biome);
    // Seeded decorative-grass scatter (batch 2): runs after depth is set so
    // biome+depth fully determine the pattern; runs on authored and
    // procedural islands alike. Tiles serialize as-is, so saves are stable.
    scatterGrassVariants(next, biome.id, depth);

    maps.island = next;
    world = next;
    currentMapId = 'island';
    insideBuilding = null;
    loadMapEntities(next);   // fresh empties for every per-map entity global

    // Arrive on the far side from the edge you stepped off.
    const arrival = islandArrivalPoint(biome, dir);
    player.x = arrival.x;
    player.y = arrival.y;

    // The player's shack and every follower's shack are rebuilt here.
    buildings = [];
    const shack = new Building('shack', clampToLand(biome, player.x + 3), clampToLand(biome, player.y - 3), 'player');
    clearBuildingFootprint(shack);
    buildings.push(shack);

    npcs = followers;
    // Authored maps mark where follower shacks should land ('S' pads in the
    // CSV). Pad shacks go exactly there; only when a biome's pads are used up
    // (or the map has none) do NPCs fall back to the clear-land search — whose
    // footprint check keeps them off authored solids, so no shack ever sits on
    // a landmark.
    const pads = (authored && next.shackPads) ? next.shackPads.slice() : [];
    const shackDims = (typeof BUILDING_TIERS !== 'undefined' && BUILDING_TIERS.shack)
        ? BUILDING_TIERS.shack : { w: 8, h: 8 };
    const padInUse = (px, py) => buildings.some(b =>
        px >= b.gridX - 2 && px <= b.gridX + b.tileSize.w + 2 &&
        py >= b.gridY - 2 && py <= b.gridY + b.tileSize.h + 4);
    // A pad is only usable if the whole footprint (+ the clear ring
    // clearBuildingFootprint touches) is already walkable open ground — a pad
    // overlapping water, rocks, trees or foundations is skipped rather than
    // having its surroundings bulldozed into grass.
    // Note: 'beach'/'path' are deliberately NOT blocked here even though
    // clearBuildingFootprint's CLEAR_SKIP preserves them — an authored plaza
    // pad on open sand is valid, so the two skip-sets are intentionally
    // asymmetric. Keep them in sync only when semantics actually change.
    const padBlockedTypes = new Set(['void', 'water', 'sea', 'rock', 'shiny_rock', 'tree', 'fir_tree', 'foundation', 'dock']);
    const padClear = (px, py) => {
        for (let dx = -1; dx <= shackDims.w; dx++) {
            for (let dy = -1; dy <= shackDims.h + 2; dy++) {
                const t = next.tiles[px + dx] && next.tiles[px + dx][py + dy];
                if (!t || t.solid === true || padBlockedTypes.has(t.type)) return false;
            }
        }
        return true;
    };
    for (const npc of npcs) {
        npc.hasHome = false;
        npc.hutX = null;
        npc.hutY = null;
        let placed = false;
        while (pads.length) {
            const pad = pads.shift();
            if (padInUse(pad.x, pad.y) || !padClear(pad.x, pad.y)) continue;
            const sx = clampToLand(biome, pad.x);
            const sy = clampToLand(biome, pad.y);
            const b = new Building('shack', sx, sy, npc.id);
            npc.hasHome = true;
            npc.hutX = sx;
            npc.hutY = sy;
            npc.gridX = sx;
            npc.gridY = sy;
            clearBuildingFootprint(b);
            buildings.push(b);
            notify(npc.name + ' built a shack!');
            placed = true;
            break;
        }
        if (placed) continue;
        npc.gridX = clampToLand(biome, player.x + Math.floor(Math.random() * 16 - 8));
        npc.gridY = clampToLand(biome, player.y + Math.floor(Math.random() * 16 - 8));
        buildNpcShack(npc);
    }

    // The underground city is a pocket dimension, not a rung on the chain — its
    // tunnel mouth reopens on every island once the player has found it.
    if (typeof TUNNEL_REVEAL_DAY !== 'undefined' && world.day >= TUNNEL_REVEAL_DAY) {
        next.placeTunnel(clampToLand(biome, arrival.x - 6), clampToLand(biome, arrival.y + 4),
                         'underground', UNDERGROUND_TUNNEL_LANDING.x, UNDERGROUND_TUNNEL_LANDING.y, 'down');
    }

    if (typeof invalidateFertileCache === 'function') invalidateFertileCache();
    if (typeof onAnimalNewDay === 'function') onAnimalNewDay();
    if (typeof spawnHog === 'function') spawnHog();
    updateCamera();
    if (followers.length) notify('Your neighbors looked at each other. Then they jumped.');
}

function clampToLand(biome, v) {
    const m = islandVoidMargin(biome.land);
    return Math.max(m + 4, Math.min(ISLAND_GRID - m - 5, v));
}

// Fall off the north edge, arrive in the south of the island below, etc.
function islandArrivalPoint(biome, dir) {
    const m = islandVoidMargin(biome.land);
    const lo = m + 5, hi = ISLAND_GRID - m - 6, mid = Math.floor(ISLAND_GRID / 2);
    if (dir === 'up') return { x: mid, y: hi };
    if (dir === 'down') return { x: mid, y: lo };
    if (dir === 'left') return { x: hi, y: mid };
    return { x: lo, y: mid };
}

// ===== SKY =====
// Void tiles have no draw case, so they render as nothing — this backdrop is
// what shows through them. It also deepens with depth, per the design doc.
// ponytail: a flat tinted wash plus the existing drifting clouds. Distant
// islands-above and the depth-specific sky art (08's sprite list) go here when
// the art exists.
function drawIslandVoidBackdrop() {
    if (!onBiomeIsland()) return;
    const b = ISLAND_BIOMES.find(x => x.id === world.biome);
    if (!b) return;
    // Every 6 islands past the fixed set, the void gets one shade stranger.
    const deep = Math.min(1, Math.max(0, (islandDepth() - ISLAND_BIOMES.length) / 24));
    noStroke();
    fill(
        lerp(b.sky[0], 40, deep),
        lerp(b.sky[1], 20, deep),
        lerp(b.sky[2], 70, deep)
    );
    rect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    if (typeof drawSkyClouds === 'function' && deep < 0.5) drawSkyClouds(0);
    // Batch 3 ambience: past the authored six, a star-dragon swims in the void
    // sky. A handful of fixed bright pixels arranged like a serpentine dragon
    // (head, curling body, tail) — pure const data, no art file, and drawn
    // with a slow twinkle so it reads as living sky. Screen-space pattern,
    // deterministic — the generation paths never touch Math.random.
    if (islandDepth() >= 8) drawDragonConstellation();
}

// Screen-space star pixels (canvas coords on the 320x192 viewport): the head
// at upper-left, the body undulating right, the tail tapering off. ponytail:
// hand-plotted constellation — reshape freely when dedicated art lands.
const DRAGON_CONSTELLATION = [
    [52, 38], [60, 34], [66, 39],          // head + snout
    [74, 46], [84, 52], [94, 50],          // neck dive
    [104, 44], [114, 40],                  // crest of the wave
    [124, 48], [134, 58], [144, 62],       // long belly
    [154, 60], [164, 54], [174, 50],       // second crest
    [186, 56], [196, 66], [206, 74],       // tail sweep down
    [214, 80], [222, 86]                   // tail tip
];
const DRAGON_STAR_BRIGHT = [255, 250, 235];
function drawDragonConstellation() {
    noStroke();
    for (let i = 0; i < DRAGON_CONSTELLATION.length; i++) {
        const [sx, sy] = DRAGON_CONSTELLATION[i];
        // Slow per-star twinkle, phase from index — deterministic, no random.
        const tw = 0.55 + 0.45 * Math.sin(millis() / 900 + i * 0.9);
        fill(DRAGON_STAR_BRIGHT[0], DRAGON_STAR_BRIGHT[1], DRAGON_STAR_BRIGHT[2], 255 * tw);
        const s = i === 0 ? 3 : 2;   // the head star is brightest
        rect(sx, sy, s, s);
    }
    // Faint connective thread so the serpentine shape reads at a glance.
    fill(255, 250, 235, 28);
    for (let i = 0; i < DRAGON_CONSTELLATION.length - 1; i++) {
        const [ax, ay] = DRAGON_CONSTELLATION[i];
        const [bx, by] = DRAGON_CONSTELLATION[i + 1];
        const steps = Math.max(2, Math.floor(Math.hypot(bx - ax, by - ay) / 3));
        for (let s = 0; s < steps; s++) {
            const px = ax + (bx - ax) * s / steps;
            const py = ay + (by - ay) * s / steps;
            rect(px, py, 1, 1);
        }
    }
}

// ===== PROMPT + FADE OVERLAY =====

function drawIslandFallUI() {
    if (fallAnim) {
        const t = millis() - fallAnim.startTime;
        const a = fallAnim.phase === 'out'
            ? Math.min(1, t / FALL_FADE_MS) * 255
            : (1 - Math.min(1, t / FALL_DROP_MS)) * 255;
        noStroke();
        fill(255, 255, 255, a);
        rect(0, 0, width, height);
        return;
    }
    if (!fallPrompt) return;
    const w = 180, h = 44;
    const x = (CONFIG.CANVAS_WIDTH - w) / 2, y = CONFIG.CANVAS_HEIGHT - h - 26;
    noStroke();
    fill(0, 0, 0, 190);
    rect(x, y, w, h);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(10);
    text('Step off the edge?', x + w / 2, y + 14);
    textSize(8);
    fill(210);
    text('Y — fall     N — stay', x + w / 2, y + 31);
}
