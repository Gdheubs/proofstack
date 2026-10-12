// Test authenticator only: no imports, compatible with the isolated test notebook.
/* global module */
// Production identity and MFA are always verified by Supabase.
var testTotp = function (secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = secret
    .toUpperCase()
    .replace(/=+$/, "")
    .split("")
    .map((c) => {
      const n = alphabet.indexOf(c);
      if (n < 0) throw new Error("Invalid authenticator secret");
      return n.toString(2).padStart(5, "0");
    })
    .join("");
  const key = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    key.push(parseInt(bits.slice(i, i + 8), 2));
  function sha1(input) {
    const bytes = input.slice(),
      length = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(
      0,
      0,
      0,
      0,
      (length >>> 24) & 255,
      (length >>> 16) & 255,
      (length >>> 8) & 255,
      length & 255,
    );
    const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const rot = (n, s) => ((n << s) | (n >>> (32 - s))) >>> 0;
    for (let i = 0; i < bytes.length; i += 64) {
      const w = [];
      for (let j = 0; j < 16; j++)
        w[j] =
          ((bytes[i + j * 4] << 24) |
            (bytes[i + j * 4 + 1] << 16) |
            (bytes[i + j * 4 + 2] << 8) |
            bytes[i + j * 4 + 3]) >>>
          0;
      for (let j = 16; j < 80; j++)
        w[j] = rot(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      let [a, b, c, d, e] = h;
      for (let j = 0; j < 80; j++) {
        const f =
          j < 20
            ? (b & c) | (~b & d)
            : j < 40
              ? b ^ c ^ d
              : j < 60
                ? (b & c) | (b & d) | (c & d)
                : b ^ c ^ d;
        const k =
          j < 20
            ? 0x5a827999
            : j < 40
              ? 0x6ed9eba1
              : j < 60
                ? 0x8f1bbcdc
                : 0xca62c1d6;
        const t = (rot(a, 5) + f + e + k + w[j]) >>> 0;
        e = d;
        d = c;
        c = rot(b, 30);
        b = a;
        a = t;
      }
      [a, b, c, d, e].forEach((v, j) => (h[j] = (h[j] + v) >>> 0));
    }
    return h.flatMap((n) => [
      (n >>> 24) & 255,
      (n >>> 16) & 255,
      (n >>> 8) & 255,
      n & 255,
    ]);
  }
  let padded = key.length > 64 ? sha1(key) : key.slice();
  while (padded.length < 64) padded.push(0);
  const count = Math.floor(now / 30000);
  const message = [
    0,
    0,
    0,
    0,
    (count >>> 24) & 255,
    (count >>> 16) & 255,
    (count >>> 8) & 255,
    count & 255,
  ];
  const mac = sha1(
    padded
      .map((b) => b ^ 0x5c)
      .concat(sha1(padded.map((b) => b ^ 0x36).concat(message))),
  );
  const offset = mac[19] & 15;
  const number =
    (((mac[offset] & 127) << 24) |
      (mac[offset + 1] << 16) |
      (mac[offset + 2] << 8) |
      mac[offset + 3]) >>>
    0;
  return String(number % 1000000).padStart(6, "0");
};
if (typeof module !== "undefined") module.exports = { testTotp };
