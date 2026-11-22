"""Fix unreachable keepsakes: town fountain gate + deep-woods shrine corridor."""
import re

def load(p):
    return [l.rstrip('\n') for l in open(p)]

def save(p, lines):
    open(p, 'w').write('\n'.join(lines) + '\n')

def rows_of(lines):
    return [l.split(',') for l in lines]

# --- town: open a gate in the fountain ring so the plaza coin is reachable
t = load('assets/maps/town.csv')
R = rows_of(t)
# locate z
zy, zx = next((y, x) for y, r in enumerate(R) for x, c in enumerate(r) if c == 'z')
print('town z at', zx, zy)
# find the w-ring bounding box
ws = [(x, y) for y, r in enumerate(R) for x, c in enumerate(r) if c == 'w']
xs = [p[0] for p in ws]; ys = [p[1] for p in ws]
print('ring bbox cols', min(xs), max(xs), 'rows', min(ys), max(ys))
bottom = max(ys)
# gate: middle-bottom w -> s (must be walkable outside = connect to main)
gx = (min(xs) + max(xs)) // 2
assert R[bottom][gx] == 'w', R[bottom][gx]
R[bottom][gx] = 's'
save('assets/maps/town.csv', [','.join(r) for r in R])
print('town gate opened at', gx, bottom)

# --- deep_woods: carve corridor from shrine gap (46,31) out of the fir pocket
d = load('assets/maps/deep_woods.csv')
R = rows_of(d)
vy, vx = next((y, x) for y, r in enumerate(R) for x, c in enumerate(r) if c == 'v')
print('shrine v at', vx, vy)
# walk south from the gap at (vx, 31): turn f into g until the tile below is g already
y = 31
while True:
    y += 1
    if y >= len(R):
        print('hit edge'); break
    c = R[y][vx]
    if c == 'g':
        print('reached grass at', vx, y); break
    print('carving', vx, y, c, '-> g')
    R[y][vx] = 'g'
save('assets/maps/deep_woods.csv', [','.join(r) for r in R])
