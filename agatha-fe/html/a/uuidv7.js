export function uuidv7() {
    const timestamp = BigInt(Date.now()) & 0xffffffffffffn; // 48 bits
    const randA = randomBits(12);
    const randB = randomBits(62);

    const high = (timestamp << 16n) | (0x7n << 12n) | randA;
    const low = (0x2n << 62n) | randB; // RFC 4122 variant 10xx

    return [
        hex((high >> 32n) & 0xffffffffn, 8),
        hex((high >> 16n) & 0xffffn, 4),
        hex(high & 0xffffn, 4),
        hex((low >> 48n) & 0xffffn, 4),
        hex(low & 0xffffffffffffn, 12),
    ].join('-');
}

function randomBits(bits) {
    const bytes = Math.ceil(bits / 8);
    const arr = crypto.getRandomValues(new Uint8Array(bytes));
    let value = 0n;
    for (const b of arr) value = (value << 8n) | BigInt(b);
    const mask = (1n << BigInt(bits)) - 1n;
    return value & mask;
}

function hex(num, length) {
    return num.toString(16).padStart(length, '0');
}
