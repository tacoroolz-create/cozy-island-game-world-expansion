// Cozy Island Game - CSV Tile Map Translator
// Standalone helper: turns a simple CSV text grid into a p5.js World object.
// Load this script in index.html AFTER game.js (so World, CONFIG, etc. exist).
//
// Usage:
//   const world = CSV_TILEMAP.buildMapFromCSV(csvText, 'my_underground');
//   maps['my_underground'] = world;
//
// Or load from a file with p5's loadStrings():
//   CSV_TILEMAP.loadCSVFromFile('assets/maps/underground.csv', (world) => {
//       maps['underground'] = world;
//   });

const CSV_TILEMAP = (function () {
    'use strict';

    // Default character → tile definition for underground maps.
    // Each entry can contain: type, variant, solid, target, and any custom props.
    const DEFAULT_LEGEND = {
        '#': { type: 'cave_wall',    solid: true,  variant: 0, desc: 'Surrounding rock wall' },
        '.': { type: 'cave_floor',  solid: false, variant: 0, desc: 'Stone floor' },
        'f': { type: 'foundation',  solid: false, variant: 0, desc: 'Building foundation pad' },
        '^': {
            type: 'portal',
            solid: false,
            variant: 0,
            desc: 'Stairs / portal back to surface',
            target: {
                map: 'island',
                x: 50,
                y: 50,
                facing: 'down',
                label: 'You climb back to the surface.'
            }
        },
        'c': { type: 'crystal',     solid: false, variant: 0, desc: 'Glowing crystal decoration' },
        'p': { type: 'pillar',      solid: true,  variant: 0, desc: 'Stone pillar' },
        'w': { type: 'water',       solid: true,  variant: 0, desc: 'Underground water' },
        '~': { type: 'lava',        solid: true,  variant: 0, desc: 'Lava pool' },
        'r': { type: 'tree_root',   solid: false, variant: 0, desc: 'Tree root' },
        'd': { type: 'door',        solid: false, variant: 0, desc: 'Door marker' }
    };

    // Split CSV text into a 2D grid of characters.
    function parseCSV(csvText) {
        if (typeof csvText !== 'string') {
            throw new Error('CSV tilemap must be a string. Got: ' + typeof csvText);
        }
        const lines = csvText
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const grid = lines.map(line => line.split(',').map(cell => cell.trim()));
        const width = grid.length ? grid[0].length : 0;
        return { grid, width, height: grid.length };
    }

    // Validate a CSV against a legend. Returns { valid, width, height, errors }.
    function validateCSV(csvText, legend, options) {
        const opts = options || {};
        const defaultChar = opts.defaultChar || '.';
        const result = { valid: true, width: 0, height: 0, errors: [] };

        try {
            const parsed = parseCSV(csvText);
            result.width = parsed.width;
            result.height = parsed.height;
            result.grid = parsed.grid;
            const grid = result.grid;

            if (result.height === 0) result.errors.push('CSV appears empty (no non-empty lines).');
            if (result.width === 0) result.errors.push('First row has no columns.');
            if (!legend[defaultChar]) {
                result.errors.push(`Default char "${defaultChar}" is not defined in the legend.`);
            }

            for (let y = 0; y < grid.length; y++) {
                const row = grid[y];
                if (row.length !== result.width) {
                    result.errors.push(
                        `Row ${y + 1} has ${row.length} columns, expected ${result.width}.`
                    );
                }
                for (let x = 0; x < row.length; x++) {
                    const ch = row[x] || defaultChar;
                    if (!legend[ch]) {
                        result.errors.push(
                            `Unknown tile char "${ch}" at row ${y + 1}, col ${x + 1}.`
                        );
                    }
                }
            }
        } catch (e) {
            result.errors.push('Parse error: ' + e.message);
        }

        result.valid = result.errors.length === 0;
        return result;
    }

    // Count how many times each character appears.
    function getTileCounts(csvText) {
        const { grid } = parseCSV(csvText);
        const counts = {};
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const ch = grid[y][x];
                counts[ch] = (counts[ch] || 0) + 1;
            }
        }
        return counts;
    }

    // Turn a tile definition into a tile object matching the engine's format.
    function makeTile(def) {
        const tile = {
            type: def.type,
            variant: def.variant !== undefined ? def.variant : 0
        };
        if (def.solid !== undefined) tile.solid = def.solid;
        if (def.target) tile.target = JSON.parse(JSON.stringify(def.target));

        // Copy any extra custom properties (not the reserved ones already handled).
        const reserved = new Set(['type', 'variant', 'solid', 'target', 'desc']);
        for (const key of Object.keys(def)) {
            if (!reserved.has(key)) {
                tile[key] = def[key];
            }
        }
        return tile;
    }

    // Build a full World from CSV text.
    //
    // Options:
    //   kind            - stored on world.kind (default 'underground')
    //   worldWidth      - total world width (default CONFIG.WORLD_WIDTH or 100)
    //   worldHeight     - total world height (default CONFIG.WORLD_HEIGHT or 100)
    //   offsetX / offsetY - where to place the CSV inside the world (default 0, 0)
    //   center          - if true, center the CSV inside the world (overrides offsetX/Y)
    //   fillChar        - char used to fill the rest of the world (default '#')
    //   defaultChar     - char used for empty CSV cells (default '.')
    function buildMapFromCSV(csvText, mapId, legend, options) {
        const usedLegend = legend || DEFAULT_LEGEND;
        const opts = options || {};
        const defaultChar = opts.defaultChar || '.';

        const validation = validateCSV(csvText, usedLegend, opts);
        if (!validation.valid) {
            console.error('CSV tilemap validation failed:', validation.errors);
            throw new Error('Invalid CSV tilemap:\n' + validation.errors.join('\n'));
        }

        const worldW = opts.worldWidth || (typeof CONFIG !== 'undefined' ? CONFIG.WORLD_WIDTH : 100);
        const worldH = opts.worldHeight || (typeof CONFIG !== 'undefined' ? CONFIG.WORLD_HEIGHT : 100);
        const fillChar = opts.fillChar || '#';
        const fillDef = usedLegend[fillChar] || usedLegend['#'];
        if (!fillDef) {
            throw new Error(`Fill char "${fillChar}" is not defined in the legend.`);
        }

        const { grid, width, height } = validation;

        let offsetX = opts.offsetX || 0;
        let offsetY = opts.offsetY || 0;
        if (opts.center) {
            offsetX = Math.floor((worldW - width) / 2);
            offsetY = Math.floor((worldH - height) / 2);
        }

        if (width + offsetX > worldW || height + offsetY > worldH) {
            throw new Error(
                `CSV map (${width}x${height}) + offset (${offsetX},${offsetY}) ` +
                `does not fit inside world (${worldW}x${worldH}).`
            );
        }

        // Create a blank world, then fill it to the requested size.
        const world = new World('blank', mapId || 'csv_map');
        world.kind = opts.kind || 'underground';
        world.csvWidth = width;
        world.csvHeight = height;
        world.csvOffsetX = offsetX;
        world.csvOffsetY = offsetY;

        for (let x = 0; x < worldW; x++) {
            world.tiles[x] = [];
            for (let y = 0; y < worldH; y++) {
                world.tiles[x][y] = makeTile(fillDef);
            }
        }

        // Stamp the CSV map into the world.
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const ch = grid[y][x] || defaultChar;
                const def = usedLegend[ch] || usedLegend[defaultChar];
                if (!def) continue;
                world.tiles[x + offsetX][y + offsetY] = makeTile(def);
            }
        }

        return world;
    }

    // Island legend — one biome island per CSV, stamped centered into the
    // 100x100 grid with solid void filling everything outside the CSV. Char
    // choices avoid both the DEFAULT_LEGEND chars and each other; every entry
    // is documented with a desc. Tile types all exist in the engine (game.js
    // TILE_SOLID + draw cases); 'S' pads are plain grass plus a shackPad marker
    // so NPC follower shacks can land on authored spots instead of random ones.
    const ISLAND_LEGEND = {
        'V': { type: 'void',      solid: true,  variant: 0, desc: 'Void / sky — solid, prompts the fall when stepped into' },
        'g': { type: 'grass',     solid: false, variant: 0, desc: 'Grass' },
        's': { type: 'beach',    solid: false, variant: 0, desc: 'Sand (paths, shores, plazas) — reuses the drawn beach tile' },
        'e': { type: 'sea',      solid: true,  variant: 0, desc: 'Sea (solid; decorative open water)' },
        'w': { type: 'water',    solid: true,  variant: 0, desc: 'Pond / creek water' },
        'd': { type: 'dock',     solid: false, variant: 0, desc: 'Dock planks (bridges, crosswalks)' },
        't': { type: 'tree',     solid: true,  variant: 0, desc: 'Oak tree trunk (canopy added above)' },
        'f': { type: 'fir_tree', solid: true,  variant: 0, desc: 'Fir tree trunk (canopy added above)' },
        'r': { type: 'rock',     solid: true,  variant: 0, desc: 'Rock' },
        'R': { type: 'shiny_rock', solid: true, variant: 0, desc: 'Shiny / glowing rock' },
        'u': { type: 'tulip',    solid: false, variant: 0, desc: 'Tulip (wildflower)' },
        'b': { type: 'rosebush', solid: true,  variant: 0, desc: 'Rosebush' },
        'p': { type: 'bird_poop', solid: false, variant: 0, desc: 'Bird poop' },
        'S': { type: 'grass',    solid: false, variant: 0, desc: 'Shack pad — NPC follower shacks land here', shackPad: true },
        'F': { type: 'foundation', solid: false, variant: 0, desc: 'Building / stall foundation pad' },
        // Batch 2 (aesthetic excellence pass). Lamps follow the tree two-tall
        // pattern (solid post, passable lantern top added above); facades are
        // decorative shells anchored on the south half of an F pad; doors mark
        // the walkable entry on the pad's edge.
        'l': { type: 'lamp_post', solid: true,  variant: 0, desc: 'Lamp post (stone base, warm lantern top — solid trunk, passable lantern tile above)' },
        'C': { type: 'facade_cottage', solid: true, variant: 0, desc: 'Cottage facade shell (anchor tile; sprite overhangs the tile above, stands on an F pad)' },
        'K': { type: 'facade_shop', solid: true, variant: 0, desc: 'Shop facade shell (anchor tile on an F pad)' },
        'H': { type: 'facade_tall_house', solid: true, variant: 0, desc: 'Tall house facade shell (anchor tile on an F pad)' },
        'D': { type: 'door',     solid: false, variant: 0, desc: 'Door marker — walkable flagstone entry on a facade pad' },
        'j': { type: 'wood_fence', solid: true, variant: 0, desc: 'Wood fence' },
        'h': { type: 'hedge',    solid: true,  variant: 0, desc: 'Hedge (dense leafy wall)' },
        'M': { type: 'cliff_face', solid: true, variant: 0, desc: 'Cliff face (solid stratified rock wall)' },
        'c': { type: 'scree',    solid: true,  variant: 0, desc: 'Scree (solid loose-rubble slope)' },
        'n': { type: 'signpost', solid: true,  variant: 0, desc: 'Wooden signpost (solid)' }
    };

    // Build a floating biome island from CSV text: the grid is centered on the
    // 100x100 engine grid and every tile outside it becomes solid void (the
    // fall ring). 'S' chars are collected into world.shackPads (world coords).
    function buildIslandFromCSV(csvText, biomeId, options) {
        const opts = options || {};
        opts.center = true;
        opts.fillChar = 'V';
        opts.defaultChar = 'g';
        opts.kind = 'island';
        const world = buildMapFromCSV(csvText, 'island', ISLAND_LEGEND, opts);
        world.csvBiome = biomeId || null;
        world.shackPads = [];
        const { grid, width, height } = parseCSV(csvText);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y][x] === 'S') {
                    world.shackPads.push({ x: x + world.csvOffsetX, y: y + world.csvOffsetY });
                    // Give the tree canopy pass a plain grass tile to work with.
                    world.tiles[x + world.csvOffsetX][y + world.csvOffsetY].shackPad = true;
                }
            }
        }
        // Trees authored in CSV are trunks only — add the walkable canopy tile
        // above each one (same shape World.placeTree produces), but never over
        // another landmark: only plain grass becomes canopy.
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const ch = grid[y][x];
                if (ch !== 't' && ch !== 'f' && ch !== 'l') continue;
                const topY = y - 1 + world.csvOffsetY, tx = x + world.csvOffsetX;
                if (topY < 0) continue;
                const top = world.tiles[tx] && world.tiles[tx][topY];
                if (top && top.type === 'grass' && !top.shackPad) {
                    if (ch === 'l') {
                        // Lamp posts get a passable lantern tile above their
                        // solid post (same two-tall pattern as trees).
                        world.tiles[tx][topY] = { type: 'lamp_post', variant: 0, isTreeTop: true, solid: false };
                    } else {
                        world.tiles[tx][topY] = { type: ISLAND_LEGEND[ch].type, variant: 0, isTreeTop: true, solid: false };
                    }
                }
            }
        }
        return world;
    }

    // Friendly alias.
    function translateCSVToWorld(csvText, mapId, legend, options) {
        return buildMapFromCSV(csvText, mapId, legend, options);
    }

    // Load a CSV file at runtime using p5.js loadStrings().
    // Provide a callback that receives the finished World object.
    function loadCSVFromFile(filePath, callback, mapId, legend, options) {
        if (typeof loadStrings !== 'function') {
            throw new Error(
                'CSV_TILEMAP.loadCSVFromFile needs p5.js loadStrings(). ' +
                'Make sure p5.js is loaded before calling this.'
            );
        }
        if (typeof callback !== 'function') {
            throw new Error('loadCSVFromFile requires a callback function.');
        }
        loadStrings(filePath, function (lines) {
            const text = Array.isArray(lines) ? lines.join('\n') : '';
            const world = buildMapFromCSV(text, mapId, legend, options);
            callback(world);
        }, function (err) {
            console.error('Failed to load CSV tilemap:', err);
            throw new Error('Failed to load CSV tilemap: ' + filePath);
        });
    }

    // Example 20x12 handcrafted underground layout.
    const EXAMPLE_MAP = [
        '#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#',
        '#,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,#',
        '#,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,#',
        '#,.,.,.,f,f,f,f,.,.,.,f,f,f,f,.,.,.,.,#',
        '#,.,.,.,f,.,.,f,.,.,.,f,.,.,f,.,.,.,.,#',
        '#,.,.,.,f,.,.,f,.,.,.,f,.,.,f,.,.,.,.,#',
        '#,.,.,.,f,f,d,f,.,.,.,f,f,d,f,.,.,.,.,#',
        '#,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,#',
        '#,.,.,c,.,p,.,.,.,c,.,p,.,.,.,c,.,.,.,#',
        '#,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,^,.,#',
        '#,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,.,#',
        '#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#,#'
    ].join('\n');

    return {
        DEFAULT_LEGEND,
        EXAMPLE_MAP,
        parseCSV,
        validateCSV,
        getTileCounts,
        makeTile,
        buildMapFromCSV,
        DEFAULT_LEGEND,
        ISLAND_LEGEND,
        buildIslandFromCSV,
        translateCSVToWorld,
        loadCSVFromFile
    };
})();

// Expose to the browser (p5.js global mode).
if (typeof window !== 'undefined') {
    window.CSV_TILEMAP = CSV_TILEMAP;
}

// Expose to Node.js for quick testing / verification.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CSV_TILEMAP;
}
