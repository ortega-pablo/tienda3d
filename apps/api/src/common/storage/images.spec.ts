import sharp from 'sharp';
import { detectImageKind, toWebImage } from './images';

describe('fotos', () => {
  const foto = (format: 'jpeg' | 'png' | 'webp', width = 40, height = 20) =>
    sharp({ create: { width, height, channels: 3, background: '#c33' } })
      .toFormat(format)
      .toBuffer();

  it('reconoce JPG, PNG y WebP por sus primeros bytes', async () => {
    expect(detectImageKind(await foto('jpeg'))).toBe('jpeg');
    expect(detectImageKind(await foto('png'))).toBe('png');
    expect(detectImageKind(await foto('webp'))).toBe('webp');
    expect(detectImageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageKind(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
  });

  it('convierte a WebP, achica a 2000 px y saca el EXIF', async () => {
    const original = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#3c3' },
    })
      .withExif({ IFD0: { Copyright: 'Plastik', Artist: 'Taller' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const result = await toWebImage(original, 'grande.jpg');

    expect([result.width, result.height]).toEqual([2000, 1000]);
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('no agranda una foto chica', async () => {
    const result = await toWebImage(await foto('png', 300, 200), 'chica.png');
    expect([result.width, result.height]).toEqual([300, 200]);
  });

  it('rechaza lo que no es una foto aunque se llame .jpg, y una foto rota', async () => {
    await expect(toWebImage(Buffer.from('hola, soy texto'), 'foto.jpg')).rejects.toThrow(
      /"foto.jpg" no es una foto/,
    );
    const rota = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
    await expect(toWebImage(rota, 'rota.jpg')).rejects.toThrow(/dañada/);
  });
});
