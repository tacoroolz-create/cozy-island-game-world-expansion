// ===== WORLD EXPANSION BATCH 3: EXPANSION FEATURES =====
// Features layered on the floating-island biome world:
//   1. Enterable facade buildings (facade_cottage / facade_shop /
//      facade_tall_house from batch 2 get cozy interiors),
//   2. Biome keepsakes (one unique memento per biome, obtainable once),
//   3. Interaction tiles: dock ship, farewell bench, overlook bench, plaque,
//      sea-stairs hatch by the island-0 shack.
// The dragon constellation ambience lives in islands.js (it draws during the
// void-sky pass). ponytail: everything here reuses existing engine paths —
// Building interiors, notify(), inventory — no new systems.

// Keepsake flavor: writer-final copy, verbatim. Ids match ITEMS entries below.
const KEEPSAKES = {
    meadow_petal:  { name: 'Meadow Petal',  biome: 'meadow',     pickup: 'It never wilts. Down here, nothing has to.' },
    fir_sprig:     { name: 'Fir Sprig',     biome: 'woods',      pickup: 'Smells like the deep of the woods. Quiet in a smell.' },
    plaza_coin:    { name: 'Plaza Coin',    biome: 'town',       pickup: 'Someone pressed this into the fountain long before you fell.' },
    city_tile:     { name: 'City Tile',     biome: 'city',       pickup: 'A chip of sidewalk. Still warm, like it remembers footsteps.' },
    shrine_stone:  { name: 'Shrine Stone',  biome: 'deep_woods', pickup: 'It hums, very softly, in the key of falling.' },
    summit_pebble: { name: 'Summit Pebble', biome: 'mountain',   pickup: 'The highest thing on the lowest island.' }
};
// ids the player has taken (true per id). Persisted with the save so a
// keepsake can't be farmed again on a later pass through the same biome.
let keepsakesFound = {};

// Little swatch palette for the inventory's color-fallback icon.
const KEEPSAKE_COLORS = {
    meadow_petal: '#F7A8C4',
    fir_sprig: '#5A7D4F',
    plaza_coin: '#D9B24C',
    city_tile: '#9E9E9E',
    shrine_stone: '#7E6BA8',
    summit_pebble: '#8D9CA8'
};

// Register the keepsake items in the shared ITEMS table (game.js). No sprite
// files yet — the inventory falls back to the item color swatch. maxStack 1:
// each is a one-of-a-kind memento.
if (typeof ITEMS === 'object' && ITEMS) {
    for (const ksId in KEEPSAKES) {
        ITEMS[ksId] = {
            name: KEEPSAKES[ksId].name,
            category: 'material',   // not giftable; it's *yours*
            maxStack: 1,
            color: KEEPSAKE_COLORS[ksId],
            desc: KEEPSAKES[ksId].pickup,
            keepsake: true
        };
    }
}
// ===== ENTERABLE FACADE BUILDINGS =====
// Batch 2 put decorative shells (facade_cottage/shop/tall_house) on foundation
// pads with walkable 'door' flagstones in the CSVs. This wires them into the
// existing interior-mapping path: a temp Building with a 1x1 footprint whose
// interior is furnished per type. ponytail: one shared cozy fit-out per facade
// type (not per-instance interiors) — shells are scenery, the room inside is
// a vignette.
const FACADE_TYPES = ['facade_cottage', 'facade_shop', 'facade_tall_house'];

// Fit-outs. Positions are interior-local: walls are rows 0-1
// (INTERIOR_WALL_HEIGHT), floor starts at row 2. Wall deco hangs via tile.deco;
// floor items use the { type:'home', item } tile the player-built furniture
// system draws (drawHomeItem). All coordinates fixed — deterministic fit-out.
const FACADE_FITOUTS = {
    facade_cottage: {
        // The cottage keeps its default bed (initInterior places one for non-ug_
        // homes at (0,2)) and adds a hearth corner + wall painting.
        floor: [
            [4, 2, 'fireplace'],    // hearth against the back wall, right side
            [2, 3, 'armchair'],     // a chair by the hearth
            [1, 3, 'potted_plant']  // a plant in the far corner (kept clear of the door spawn tile)
        ],
        rug: [3, 3, 'round_rug'],
        deco: [4, 1, 'painting']    // painting above the hearth
    },
    facade_shop: {
        // A tiny village shop: shelves and a counter-ish cabinet. No bed —
        // initInterior's bed rule is skipped for facades via FACADE_TYPES.
        floor: [
            [1, 2, 'bookshelf'],    // stock shelves against the back wall
            [2, 2, 'bookshelf'],
            [1, 4, 'cabinet'],      // the counter, near the front
            [4, 4, 'stool']         // a stool for waiting customers
        ],
        rug: null,
        deco: [3, 1, 'wall_shelf']  // trinket shelf behind the counter
    },
    facade_tall_house: {
        // The tall house is a narrow home: bed by default, then a lamp + table.
        floor: [
            [3, 2, 'floor_lamp'],   // lamp in the far corner
            [2, 4, 'coffee_table'], // low table mid-room
            [1, 4, 'dresser']       // dresser along the side wall
        ],
        rug: [2, 3, 'round_rug'],
        deco: [2, 1, 'tapestry']    // tapestry over the bed wall
    }
};

// Furnish a facade building's interior. Called from Building.initInterior().
function furnishFacadeInterior(b) {
    const fit = FACADE_FITOUTS[b.type];
    if (!fit) return;
    // Init placed grass everywhere except the default bed; furniture goes on
    // fixed slots. Clear the default bed slot for non-cottage facades so shops
    // don't sleep.
    if (b.type !== 'facade_cottage' && b.interiorTiles[0] && b.interiorTiles[0][INTERIOR_WALL_HEIGHT] &&
        b.interiorTiles[0][INTERIOR_WALL_HEIGHT].type === 'bed') {
        b.interiorTiles[0][INTERIOR_WALL_HEIGHT] = { type: 'grass', variant: 0 };
    }
    for (const [fx, fy, itemId] of fit.floor) {
        if (fx < b.interiorW && fy < b.interiorH) {
            b.interiorTiles[fx][fy] = { type: 'home', item: itemId };
        }
    }
    if (fit.rug) {
        const [rx, ry, rugId] = fit.rug;
        if (rx < b.interiorW && ry < b.interiorH) {
            b.interiorTiles[rx][ry] = { type: 'home', item: rugId };
        }
    }
    const [dx, dy, decoId] = fit.deco;
    if (dx < b.interiorW && dy < INTERIOR_WALL_HEIGHT && b.interiorTiles[dx][dy].type === 'wall') {
        b.interiorTiles[dx][dy].deco = decoId;
    }
}

// Build a temp facade Building and map the player inside — same steps as
// tryEnterBuilding() for real buildings (see game.js).
function enterFacadeBuilding(type, anchorX, anchorY) {
    if (!BUILDING_TIERS[type]) return;
    const b = new Building(type, anchorX, anchorY);
    // Save player position (standing outside, facing the shell)
    savedPlayerX = player.x;
    savedPlayerY = player.y;
    savedPlayerFacing = player.facing;
    // Set player to interior door position (stand above the door, inside)
    const intDoor = b.getInteriorDoorPos();
    player.x = intDoor.x;
    player.y = intDoor.y - 1;
    player.facing = 'up';
    insideBuilding = b;
    gameState = STATE.INSIDE;
    audioManager.playSFX('door');
    notify('Entered ' + buildingDisplayName(b));
}

// Enter-chain hook: the player is facing a facade shell (standing on its door
// flagstone) — press E to go inside.
function tryEnterFacade() {
    if (gameState !== STATE.PLAYING || insideBuilding) return false;
    if (typeof currentMapId !== 'undefined' && currentMapId !== 'island') return false;
    const facing = player.getFacingTile();
    if (!facing || !facing.tile) return false;
    if (FACADE_TYPES.indexOf(facing.tile.type) === -1) return false;
    enterFacadeBuilding(facing.tile.type, facing.x, facing.y);
    return true;
}

// Movement hook: stepping onto a facade's door flagstone walks you in — same
// feel as stepping onto a portal tile (checkPortalUnderfoot).
function checkFacadeDoorUnderfoot() {
    if (gameState !== STATE.PLAYING || insideBuilding) return;
    if (typeof currentMapId !== 'undefined' && currentMapId !== 'island') return;
    const col = world.tiles[player.x];
    if (!col) return;
    const t = col[player.y];
    if (!t || t.type !== 'door') return;
    // The facade anchor sits directly above its door flagstone (batch 2 CSVs).
    const a = col[player.y - 1];
    if (!a || FACADE_TYPES.indexOf(a.type) === -1) return;
    enterFacadeBuilding(a.type, player.x, player.y - 1);
}

// ===== ISLAND INTERACT TILES =====
// Writer-final copy, verbatim.
const SHIP_TEXT = "The ship rocks gently, going nowhere. It's waiting for the dream to be ready.";
const SEA_STAIRS_TEXT = 'Stairs curl down into dark water. You can hear the sea breathing. Not yet.';

// Enter-chain hook: interact with the special expansion tiles by facing them
// (ship, benches, plaque, keepsake landmarks, sea-stairs hatch). Returns true
// if the facing tile was one of ours and something happened.
function tryInteractIslandTile() {
    if (gameState !== STATE.PLAYING || insideBuilding) return false;
    if (typeof currentMapId !== 'undefined' && currentMapId !== 'island') return false;
    const facing = player.getFacingTile();
    if (!facing || !facing.tile) return false;
    const t = facing.tile;
    if (t.type === 'ship') {
        announce(SHIP_TEXT);
        return true;
    }
    if (t.type === 'bench' || t.type === 'plaque') {
        announce(t.interactText || '...');
        return true;
    }
    if (t.type === 'beach_stairs') {
        announce(t.interactText || SEA_STAIRS_TEXT);
        return true;
    }
    if (t.type === 'keepsake') {
        const ks = KEEPSAKES[t.keepsakeId];
        if (!ks) return false;
        if (keepsakesFound[t.keepsakeId]) {
            announce("You've already kept the " + ks.name + '.');
            return true;
        }
        inventory.addItem(t.keepsakeId, 1);
        announce(ks.pickup);
        keepsakesFound[t.keepsakeId] = true;
        // The landmark fades back to plain grass once it's given you its gift.
        world.tiles[facing.x][facing.y] = { type: 'grass', variant: 0 };
        audioManager.playSFX('chime');
        return true;
    }
    return false;
}

// ===== ISLAND-0 EXPANSION STUBS =====
// The ship: moored alongside the arrivals dock (world gen only — island 0 is
// the only generated map; biome islands are CSV). A 3x2 decorative block in
// the sea hugging the pier's south face, solid, shipOrigin marks the NW tile
// that draws the 48x32 sprite.
// ISLAND_DOCK_ORIGIN comes from game.js; compute the south-face row lazily so
// load order (and headless test stubs) don't depend on it.
let SHIP_TEXT_POS = null;
function shipBlockOrigin() {
    if (!SHIP_TEXT_POS) {
        const dockY = (typeof ISLAND_DOCK_ORIGIN !== 'undefined') ? ISLAND_DOCK_ORIGIN.y : 48;
        SHIP_TEXT_POS = { x0: 1, y0: dockY + 4 };   // pier is 4 tiles tall: y0 = south face row
    }
    return SHIP_TEXT_POS;
}
function placeDockShip(world) {
    if (!world) return;
    const pos = shipBlockOrigin();
    for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 3; dx++) {
            const x = pos.x0 + dx, y = pos.y0 + dy;
            if (!world.tiles[x] || !world.tiles[x][y]) continue;
            const cur = world.tiles[x][y];
            // Only claim sea and the pier's solid south-face row — never the deck.
            if (cur.type !== 'sea' && cur.type !== 'dock') continue;
            if (cur.type === 'dock' && !cur.solid) continue;
            world.tiles[x][y] = { type: 'ship', solid: true, shipOrigin: (dx === 0 && dy === 0) };
        }
    }
}

// The sea-stairs hatch: a little cellar door beside the island-0 shack that
// "curls down into dark water" (writer-final copy lives in SEA_STAIRS_TEXT).
// Scans a handful of tiles east/south of the shack footprint and takes the
// first clear grass one — fixed scan order, deterministic.
function placeBeachShackStairs(world, shack) {
    if (!world || !shack) return;
    const candidates = [
        [60, 54], [61, 54], [62, 54],
        [60, 53], [61, 53], [62, 53],
        [59, 55], [60, 55], [61, 55]
    ];
    for (const [x, y] of candidates) {
        const col = world.tiles[x];
        if (!col || !col[y]) continue;
        const t = col[y];
        if (t.type === 'grass') {
            world.tiles[x][y] = { type: 'beach_stairs', solid: true, interactText: SEA_STAIRS_TEXT };
            return;
        }
    }
}

// Save/load for keepsake state (called from serializeGame/deserializeGame).
function keepsakesSerialize() { return keepsakesFound; }
function keepsakesDeserialize(data) { keepsakesFound = data || {}; }
