from PIL import Image
base = r'C:\Users\david\AppData\Local\Temp'
for a, b in [('probe-shot-a500.png', 'probe-shot-b900.png'), ('probe-shot-b900.png', 'probe-shot-c1400.png'), ('probe-shot-a500.png', 'probe-shot-c1400.png')]:
    im1 = Image.open(base + '\\' + a).convert('RGB')
    im2 = Image.open(base + '\\' + b).convert('RGB')
    w, h = im1.size
    c1 = im1.crop((w // 2 - 160, h // 2 - 120, w // 2 + 160, h // 2 + 120))
    c2 = im2.crop((w // 2 - 160, h // 2 - 120, w // 2 + 160, h // 2 + 120))
    p1 = list(c1.getdata())
    p2 = list(c2.getdata())
    d = sum(abs(p1[i][j] - p2[i][j]) for i in range(len(p1)) for j in range(3)) / (c1.size[0] * c1.size[1] * 3)
    pf1 = list(im1.getdata())
    pf2 = list(im2.getdata())
    df = sum(abs(pf1[i][j] - pf2[i][j]) for i in range(len(pf1)) for j in range(3)) / (w * h * 3)
    print(f'{a} vs {b}: center={d:.2f} full={df:.2f}')
