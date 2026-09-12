/** Original450134666 shingle output, measured before the row-cache change.
 * Includes different seeds/scales, shifted/negative origins and the tiny-image
 * fallback. Every albedo/normal/roughness/height byte must remain identical. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateShingle } from './shingle';

const ORIGINAL = [
  {
    "options": {
      "size": 1024,
      "seed": 1
    },
    "hashes": {
      "albedo": "e0d5134ac3d0eb459794ead35a59424892fc16bfb3789af552cd511e8a967fab",
      "normal": "451109381ebe2595dbbf426e6c5765071497cc183a57429b6cd5bff55f75f5be",
      "roughness": "246733adc8c068890363df69ca74e4ce430e7b59b78d8adf6f43d85cd766e317",
      "heightMm": "1a7a3c83b971d1510c456a817fad54c99d1dd80fd6549fa63a67e1d1b09f7bc9"
    }
  },
  {
    "options": {
      "size": 512,
      "seed": 9
    },
    "hashes": {
      "albedo": "89b2aebf62270306226b4b3678a0b688549a1c43718d4fd3ccf72cd3219cbd67",
      "normal": "7b1e15fb4951e9a6264440c71f9c6da4998aafe7f90da490d1a27de3056b3b56",
      "roughness": "f3047f29ad142f9f1ea2d40dadfee51c3f7868b721d1678e3b72749ee56ac0a1",
      "heightMm": "4c2ad162ac19534c2c34a5975bb87bb640ad9abf2a4eaed3f7bf8c2ca2028543"
    }
  },
  {
    "options": {
      "size": 128,
      "seed": 0
    },
    "hashes": {
      "albedo": "8985f6c5e89c9b82390fb56af3926665c50c311e36499c054c10cb54f4513076",
      "normal": "9999f123ea278856eaee10afe826f1c5fe5ebba57faabc0942f556551b72a271",
      "roughness": "c8c8cf6b05d4650b28da1cb889150846972ed58a65c668578fcf2f9f662157be",
      "heightMm": "c45414af815c6f03b1737c833de7740db4e03c87a0099018d23f122d48d151b3"
    }
  },
  {
    "options": {
      "size": 256,
      "seed": 17,
      "metresPerTile": 6
    },
    "hashes": {
      "albedo": "b3466c641a30fca0b6bbc47f1e1c730260aa5eea87323e4d25a6117918e91c4f",
      "normal": "12c628ae4f8be29eb935d4f90b83d8b802b9577f73d79266613d40074fc79112",
      "roughness": "29872fa7df36d8cb3c4e7b86fc50aaa3acaa8d3b83e1bef3c9750ae6439fb5b3",
      "heightMm": "f025d306e18d07b44f041baf6d21a70f920813538c77ac516cb432a6223376dd"
    }
  },
  {
    "options": {
      "size": 128,
      "seed": -7,
      "metresPerTile": 9
    },
    "hashes": {
      "albedo": "545a06615b965c70da6685fcc3966ef476021a86a7c7ccae38bbc6f97ea41033",
      "normal": "b01c2e7f3990e9d18c9afbd0af60d8ce345df9152347aa239e79aafd5bbf2804",
      "roughness": "da57cae7138e2e62a6f084955e4c296704dc895e231c7daf1b6df135a0288aae",
      "heightMm": "dbadc4299bfb99c6ed7d398fe4babbe03833a027958c3c37e17afa15b72381b2"
    }
  },
  {
    "options": {
      "size": 128,
      "seed": 17,
      "originXPx": 128,
      "originYPx": 128
    },
    "hashes": {
      "albedo": "114e59fe8b9f37ced17e63a4c59e9060aa8e6cb55795db3c76c6b32d58b7d371",
      "normal": "400aa40f5b6a1c0845276ccbf0b52ecd76c22163aefca6eef49a1817f27c7963",
      "roughness": "7494ab3e150f370dd6a119bb1d3c61346380c7257418b5e7c85fd2316d6d36ce",
      "heightMm": "601438e5080de338890bb6f8d17b37a1efdbd7cde44b825f99660f2b3c10b0da"
    }
  },
  {
    "options": {
      "size": 128,
      "seed": 17,
      "originXPx": -31,
      "originYPx": -53
    },
    "hashes": {
      "albedo": "7b61df0bbed46814ec03be116f48b16ee450d369dd327bf665bfc9a80efbbbfe",
      "normal": "370f397830045dd7d6a9373e5c0f82ee901b70289cda4672e644304038cf1231",
      "roughness": "302cbff6760147b78fa2d3ad15241acef3f88e76c82aee29990c147783439af0",
      "heightMm": "8ebeb81de5548cff2677ed4b74223480063f52c43ce11f7902a4aa1d6b0795fe"
    }
  },
  {
    "options": {
      "size": 128,
      "seed": 17,
      "originXPx": 17,
      "originYPx": 29
    },
    "hashes": {
      "albedo": "60a2eaa1763ded627ca23e69fc315eb07cc7d71cada16d3416f268853056b612",
      "normal": "c35c5d198abf5fdfa10c0adcbdf10b04a2cc501c65530d0ee4645c7c0dce3113",
      "roughness": "ecae38f8b555bfa650e3cd414e205e07f092806d059952c54ed66e2ce1d3588c",
      "heightMm": "42e4559a87c6a0c357d48a5f7a1ceee812ee6632d18a14c5b10a5dcb115a9e50"
    }
  },
  {
    "options": {
      "size": 2,
      "seed": 1
    },
    "hashes": {
      "albedo": "effa9bbac12477f07b6c6a7c9e16a3a3128de75bb7ade62bf9306472ab84ff19",
      "normal": "d24ef7993b6b2b8365793ad54ef0e0eba80d428c340de27f664fc993f50e90f3",
      "roughness": "6425454dacbee5301ed8b541814c41d01a3471cead21fe40d9b41e54e2eb848a",
      "heightMm": "6827fdfa8a0c245b94fee663bc6653c5f12eb6412804f3a5c8fb70c6a25b5d52"
    }
  }
] as const;

describe('shingle cache preserves original texture bytes', () => {
  it.each(ORIGINAL)('preserves $options', ({ options, hashes }) => {
    const generated = generateShingle(options);
    for (const field of ['albedo', 'normal', 'roughness', 'heightMm'] as const) {
      const data = generated[field];
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      expect(createHash('sha256').update(bytes).digest('hex'), field).toBe(hashes[field]);
    }
  });
});
