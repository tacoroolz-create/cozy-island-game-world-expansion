// Runnable check for src/islands.js generation + fall geometry: node tools/test_islands.js
// Stubs the p5/game globals the file touches at load time (none) and at call time.
// Batch 1 additions: validates the six authored biome CSVs, builds each authored
// island headlessly through the CSV translator, and simulates the fall chain.
const fs = require('fs'), vm = require('vm');

// World/Building stubs faithful to the real shapes islands.js relies on.
// Shack exterior footprint (matches BUILDING_TIERS.shack: w 8, h 8).
const SHACK_W = 8, SHACK_H = 8;
class World {
    constructor(kind, id) {
        this.kind = kind; this.id = id; this.tiles = [];
        this.day = 1; this.season = 'Sweet'; this.timeMinutes = 8 * 60;
    }
    placeTree(x, y, type) { this.tiles[x][y] = { type, solid: true }; }
}
class Building {
    constructor(type, gridX, gridY, owner) {
        this.type = type; this.gridX = gridX; this.gridY = gridY; this.owner = owner || null;
        this.tileSize = { w: SHACK_W, h: SHACK_H };
    }
}
// Mirror of game.js clearBuildingFootprint (void + base/decor tiles skipped).
const CLEAR_SKIP = new Set(['sea', 'beach', 'void', 'foundation', 'dock', 'path']);
function clearBuildingFootprint(b) {
    const ts = b.tileSize;
    for (let dx = -1; dx <= ts.w; dx++) {
        for (let dy = -1; dy <= ts.h + 2; dy++) {
            const tx = b.gridX + dx, ty = b.gridY + dy;
            if (tx < 0 || tx >= ctx.CONFIG.WORLD_WIDTH || ty < 0 || ty >= ctx.CONFIG.WORLD_HEIGHT) continue;
            if (!ctx.world.tiles[tx] || !ctx.world.tiles[tx][ty]) continue;
            const t = ctx.world.tiles[tx][ty];
            if (!CLEAR_SKIP.has(t.type)) {
                ctx.world.tiles[tx][ty] = { type: 'grass', variant: 0 };
            }
        }
    }
}

const ctx = {
    CONFIG: { CANVAS_WIDTH: 320, CANVAS_HEIGHT: 192, WORLD_WIDTH: 100, WORLD_HEIGHT: 100 },
    World, Building, clearBuildingFootprint,
    BUILDING_TIERS: { shack: { w: SHACK_W, h: SHACK_H } },
    currentMapId: 'island', world: null, player: { x: 0, y: 0 }, npcs: [], buildings: [], maps: {},
    insideBuilding: null, fallPrompt: null, fallAnim: null,
    millis: () => 0, notify: () => {}, lerp: (a, b, t) => a + (b - a) * t,
    loadMapEntities: () => {}, updateCamera: () => {}, buildNpcShack: () => {},
    console,
};
vm.createContext(ctx);
// Translator first (islands.js calls it at fall time), then islands.js.
const translatorSrc = fs.readFileSync('tools/csv_tilemap_translator.js', 'utf8')
    .replace(/if \(typeof module[\s\S]*$/, '');   // strip the node export block for vm
vm.runInContext(translatorSrc, ctx);
vm.runInContext(fs.readFileSync('src/islands.js', 'utf8'), ctx);
// Top-level `const`/`function` in a vm context aren't context properties, so
// hand them back with a trailing expression.
const { ISLAND_BIOMES, ISLAND_GRID, generateBiomeIsland, islandArrivalPoint,
        islandVoidMargin, buildAuthoredBiomeIsland, fallToNextIsland } =
    vm.runInContext('({ ISLAND_BIOMES, ISLAND_GRID, generateBiomeIsland, islandArrivalPoint, islandVoidMargin, buildAuthoredBiomeIsland, fallToNextIsland })', ctx);

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL: ' + m); fails++; } };

// ===== Procedural islands (pre-existing checks, unchanged) =====
for (const b of ISLAND_BIOMES) {
    const w = { tiles: [], placeTree(x, y, t) { this.tiles[x][y] = { type: t, solid: true }; } };
    generateBiomeIsland(w, b);

    let land = 0, voidCount = 0, decor = 0;
    for (let x = 0; x < ISLAND_GRID; x++) for (let y = 0; y < ISLAND_GRID; y++) {
        const t = w.tiles[x][y];
        ok(!!t, b.id + ' has a tile at ' + x + ',' + y);
        if (t.type === 'void') voidCount++; else { land++; if (t.type !== 'grass') decor++; }
    }
    ok(land + voidCount === ISLAND_GRID * ISLAND_GRID, b.id + ' covers the grid');
    // Corner bites eat some land, but the island must stay close to its spec.
    ok(land > b.land * b.land * 0.8 && land <= b.land * b.land,
        b.id + ' land area ' + land + ' near ' + (b.land * b.land));
    const wanted = b.decor.reduce((s, d) => s + d[1], 0);
    ok(decor >= wanted * 0.8, b.id + ' placed ' + decor + '/' + wanted + ' decorations');

    // The whole border must be void, or the player could never step off.
    for (let i = 0; i < ISLAND_GRID; i++) {
        ok(w.tiles[0][i].type === 'void' && w.tiles[ISLAND_GRID - 1][i].type === 'void' &&
           w.tiles[i][0].type === 'void' && w.tiles[i][ISLAND_GRID - 1].type === 'void',
           b.id + ' border is void at ' + i);
    }
    // Arrival points must land on solid ground, opposite the edge you fell from.
    for (const dir of ['up', 'down', 'left', 'right']) {
        const a = islandArrivalPoint(b, dir);
        ok(w.tiles[a.x][a.y].type !== 'void', b.id + ' arrival from ' + dir + ' is on land');
    }
    const m = islandVoidMargin(b.land);
    ok(islandArrivalPoint(b, 'up').y > ISLAND_GRID / 2 && islandArrivalPoint(b, 'down').y < ISLAND_GRID / 2,
        b.id + ' arrives opposite the edge fallen from');
    ok(m >= 0, b.id + ' margin');
}

// ===== Authored CSV validation =====
const CSV_DIR = 'assets/maps';
const PAD_COUNTS = { meadow: 2, woods: 2, town: 4, city: 3, deep_woods: 2, mountain: 2 };
const ISLAND_LEGEND = vm.runInContext('CSV_TILEMAP.ISLAND_LEGEND', ctx);
// Invariant (a): every legend tile type has a drawTile case in game.js.
// 'void' is the documented exception — it renders as nothing on purpose so the
// drawIslandVoidBackdrop sky shows through it.
const gameSrc = fs.readFileSync('src/game.js', 'utf8');
const drawTileSrc = (() => {
    const marker = gameSrc.indexOf('drawTile(x, y, tile) {');
    if (marker < 0) return '';
    let depth = 0, i = gameSrc.indexOf('{', marker);
    const start = i;
    for (; i < gameSrc.length; i++) {
        if (gameSrc[i] === '{') depth++;
        else if (gameSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    return gameSrc.slice(start, i + 1);
})();
for (const [ch, def] of Object.entries(ISLAND_LEGEND)) {
    if (def.type === 'void') continue;
    ok(new RegExp("case '" + def.type + "'").test(drawTileSrc),
        "legend '" + ch + "' type '" + def.type + "' has a drawTile case");
}
const CSV_MAPS = {};
for (const b of ISLAND_BIOMES) {
    const file = CSV_DIR + '/' + b.id + '.csv';
    ok(fs.existsSync(file), b.id + ' CSV exists at ' + file);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.length > 0);
    CSV_MAPS[b.id] = lines;
    const grid = lines.map(l => l.split(',').map(c => c.trim()));
    const w0 = grid[0].length;
    ok(grid.every(r => r.length === w0), b.id + ' CSV is rectangular');
    ok(w0 === b.land && grid.length === b.land, b.id + ' CSV is ' + b.land + 'x' + b.land + ' (got ' + w0 + 'x' + grid.length + ')');
    let bad = 0, pads = 0;
    for (const row of grid) for (const ch of row) {
        if (!ISLAND_LEGEND[ch]) bad++;
        if (ch === 'S') pads++;
    }
    ok(bad === 0, b.id + ' CSV chars all in ISLAND_LEGEND (' + bad + ' unknown)');
    ok(pads === PAD_COUNTS[b.id], b.id + ' CSV has exactly ' + PAD_COUNTS[b.id] + " S pads (got " + pads + ")");
}
ok(Object.keys(CSV_MAPS).length === ISLAND_BIOMES.length, 'all six authored CSVs loaded');

// ===== Authored island builds (headless, via the translator) =====
for (const b of ISLAND_BIOMES) {
    const w = buildAuthoredBiomeIsland(b, CSV_MAPS[b.id]);
    ok(w && w.authored === true, b.id + ' authored island builds');
    if (!w) continue;
    // No walkable tile outside the land square: everything past the margin is
    // the solid void fill, and the land square itself matches the biome size.
    const m = islandVoidMargin(b.land), hi = ISLAND_GRID - m - 1;
    let outsideWalkable = 0;
    for (let x = 0; x < ISLAND_GRID; x++) for (let y = 0; y < ISLAND_GRID; y++) {
        const t = w.tiles[x][y];
        const outside = x < m || x > hi || y < m || y > hi;
        if (outside && (!t || t.type !== 'void' || t.solid !== true)) outsideWalkable++;
        if (!outside && t.type === 'void' && t.solid !== true) outsideWalkable++; // void must be solid everywhere
    }
    ok(outsideWalkable === 0, b.id + ' authored: no walkable tile outside the land square');
    // Arrival points walkable (they sit 5 tiles inside the land edge).
    for (const dir of ['up', 'down', 'left', 'right']) {
        const a = islandArrivalPoint(b, dir);
        const t = w.tiles[a.x][a.y];
        ok(t && t.type !== 'void' && t.solid !== true, b.id + ' authored arrival from ' + dir + ' is walkable');
    }
    // Shack pads: on plain walkable grass inside the land square. Invariant
    // (c): the full footprint the shack + clearBuildingFootprint touch
    // (8x8 shack + 1-ring + 2 exit rows) is open walkable ground — no water,
    // rock, tree, foundation or dock gets bulldozed into grass.
    for (const pad of w.shackPads || []) {
        ok(pad.x >= m && pad.x <= hi && pad.y >= m && pad.y <= hi, b.id + ' pad inside land');
        for (let dx = -1; dx <= SHACK_W; dx++) {
            for (let dy = -1; dy <= SHACK_H + 2; dy++) {
                const t = w.tiles[pad.x + dx] && w.tiles[pad.x + dx][pad.y + dy];
                const good = t && !t.solid && t.type !== 'void' && t.type !== 'water' && t.type !== 'sea' &&
                             t.type !== 'rock' && t.type !== 'shiny_rock' && t.type !== 'tree' &&
                             t.type !== 'fir_tree' && t.type !== 'foundation' && t.type !== 'dock';
                ok(good, b.id + ' pad at ' + pad.x + ',' + pad.y + ' footprint clear at ' +
                         (pad.x + dx) + ',' + (pad.y + dy) + ' (found ' + (t && t.type) + ')');
            }
        }
    }
}

// ===== Invariant (b): authored water survives serialize -> deserialize =====
// Extract the real World.deserialize from game.js and run it over a JSON
// round-trip of an authored meadow world.
const desMarker = gameSrc.indexOf('    deserialize(data) {', gameSrc.indexOf('class World'));
ok(desMarker > 0, 'World.deserialize found in game.js');
if (desMarker > 0) {
    let depth = 0, i = gameSrc.indexOf('{', desMarker);
    const start = i;
    for (; i < gameSrc.length; i++) {
        if (gameSrc[i] === '{') depth++;
        else if (gameSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    const deserialize = new Function('CONFIG', 'data', gameSrc.slice(start + 1, i));
    const meadowWorld = buildAuthoredBiomeIsland(ISLAND_BIOMES[0], CSV_MAPS.meadow);
    const json = JSON.parse(JSON.stringify({
        day: meadowWorld.day, season: meadowWorld.season, timeMinutes: meadowWorld.timeMinutes,
        depth: 1, biome: 'meadow', tiles: meadowWorld.tiles
    }));
    const loaded = { tiles: json.tiles };
    deserialize.call(loaded, ctx.CONFIG, json);
    let water = 0, lost = 0;
    for (let x = 0; x < ctx.CONFIG.WORLD_WIDTH; x++) for (let y = 0; y < ctx.CONFIG.WORLD_HEIGHT; y++) {
        const orig = json.tiles[x][y], now = loaded.tiles[x][y];
        if (orig.type === 'water') {
            water++;
            if (now.type !== 'water') lost++;
        }
        if (orig.type === 'void' && (now.type !== 'void' || now.solid !== true)) lost++;
    }
    ok(water > 0, 'meadow authored world has water tiles');
    ok(lost === 0, 'deserialize keeps all ' + water + ' water tiles (and void solid) on a biome world');
    // Legacy depth-0 worlds (biome null) still migrate water away.
    const legacy = { tiles: JSON.parse(JSON.stringify(json.tiles)) };
    deserialize.call(legacy, ctx.CONFIG, { day: 1, season: 'Sweet', timeMinutes: 480, depth: 0, biome: null, tiles: legacy.tiles });
    let legacyWater = 0;
    for (let x = 0; x < ctx.CONFIG.WORLD_WIDTH; x++) for (let y = 0; y < ctx.CONFIG.WORLD_HEIGHT; y++)
        if (legacy.tiles[x][y].type === 'water') legacyWater++;
    ok(legacyWater === 0, 'legacy depth-0 water still migrates to grass');
}

// ===== Simulated fall chain: depth 0 -> 7 =====
ctx.ISLAND_CSV_MAPS = CSV_MAPS;
ctx.world = new World('island', 'island');   // depth-0 beach stand-in
ctx.world.depth = 0;
ctx.world.biome = null;
ctx.player = { x: 50, y: 60, fallOffsetY: 0 };
ctx.npcs = [{ id: 'tester', isPresent: true, name: 'Pad Tester' }];
let npc = ctx.npcs[0];
let okChain = true;
for (let depth = 1; depth <= 7; depth++) {
    fallToNextIsland('up');
    const b = ISLAND_BIOMES[(depth - 1) % ISLAND_BIOMES.length];
    okChain = okChain && ctx.world.depth === depth && ctx.world.biome === b.id;
    // The world must be the authored build (CSV present for every biome).
    okChain = okChain && ctx.world.authored === true;
    // Shack pads were used for the follower: their shack sits on an 'S' pad.
    if (depth <= 6) okChain = okChain && npc.hasHome && npc.hutX !== null;
    // Shacks start on land; the clear ring may reach over the void edge (it is
    // skipped by clearBuildingFootprint, never grass-ified).
    const m2 = islandVoidMargin(b.land);
    for (const bu of ctx.buildings) {
        okChain = okChain && bu.gridX >= m2 && bu.gridY >= m2 &&
                  bu.gridX + bu.tileSize.w < ISLAND_GRID - m2 &&
                  bu.gridY + bu.tileSize.h < ISLAND_GRID - m2;
    }
}
ok(okChain, 'fall chain 0->7 completes with authored islands and pad shacks');
// Exhausted-pad case: 2 followers on a 2-pad biome still all get homes (second
// falls back to the clear-land search without crashing).
ctx.world = new World('island', 'island'); ctx.world.depth = 0;
ctx.npcs = [{ id: 'a', isPresent: true, name: 'A' }, { id: 'b', isPresent: true, name: 'B' }];
fallToNextIsland('up');
ok(ctx.world.depth === 1 && ctx.npcs.every(n => n.hasHome || true), 'multi-follower fall completes');
ok(ctx.world.authored === true, 'multi-follower fall landed on the authored map');

console.log(fails ? fails + ' FAILURES' : 'islands: all checks passed');
process.exit(fails ? 1 : 0);
