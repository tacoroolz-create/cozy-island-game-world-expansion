"""Carve a corridor from the deep-woods shrine gap until it joins the MAIN walkable component."""
def load(p):
    return [l.rstrip('\n') for l in open(p)]

lines = load('assets/maps/deep_woods.csv')
R = [l.split(',') for l in lines]
WALK = {'g', 's', 'd', 'F', 'u', 'p', 'D'}

def components(grid):
    comp = {}
    best, bestn = 0, 0
    cid = 0
    H, W = len(grid), max(len(r) for r in grid)
    for y in range(H):
        for x in range(len(grid[y])):
            if (x, y) in comp or grid[y][x] not in WALK:
                continue
            cid += 1
            stack = [(x, y)]
            comp[(x, y)] = cid
            n = 0
            while stack:
                cx, cy = stack.pop(); n += 1
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= ny < len(grid) and 0 <= nx < len(grid[ny]) and (nx, ny) not in comp and grid[ny][nx] in WALK:
                        comp[(nx, ny)] = cid
                        stack.append((nx, ny))
            if n > bestn:
                bestn, best = n, cid
    return comp, best, bestn

comp, best, bestn = components(R)
print('main component size', bestn)
# current component of the shrine interior/gap
sx, sy = 46, 28
cid_v = comp.get((sx, sy))
print('shrine component', cid_v)
# carve south from the gap at (46,31) until the carved tile's neighbors include main
y = 31
changed = False
while True:
    y += 1
    if y >= len(R):
        print('hit bottom edge without joining'); break
    c = R[y][46]
    if comp.get((46, y)) == best:
        print('joined main at', 46, y); break
    if c in ('f', 't'):
        print('carve', 46, y, c)
        R[y][46] = 'g'
        changed = True
    elif c == 'g':
        print('pass through sealed grass at', 46, y)
    else:
        print('stop: unexpected tile', c, 'at', 46, y)
        break
# after carving, verify the shrine interior now touches main
comp, best, bestn = components(R)
ok_join = any(comp.get((46 + dx, 28 + dy)) == best
              for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))
              for _ in [0] if 0 <= 28+dy < len(R) and 0 <= 46+dx < len(R[0]))
print('shrine now touches main:', ok_join)
open('assets/maps/deep_woods.csv', 'w').write('\n'.join(','.join(r) for r in R) + '\n')
print('done, changed:', changed)
