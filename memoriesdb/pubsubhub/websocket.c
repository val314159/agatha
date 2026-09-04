#include "websocket.h"

#include <arpa/inet.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#if defined(__APPLE__) || defined(_WIN32)
#define NEED_CUSTOM_HTOBE64 1
#endif

#ifndef NEED_CUSTOM_HTOBE64
#include <endian.h>
#endif

#ifndef htobe64
static uint64_t htobe64(uint64_t host64) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
    return ((uint64_t)htonl(host64 & 0xFFFFFFFFULL) << 32) | htonl(host64 >> 32);
#else
    return host64;
#endif
}
#endif

/* --- Minimal SHA1 implementation --------------------------------------- */

typedef struct {
    uint32_t state[5];
    uint64_t count;
    unsigned char buffer[64];
} sha1_ctx;

static void sha1_transform(uint32_t state[5], const unsigned char buffer[64]) {
    uint32_t a, b, c, d, e, t, W[80];
    for (int i = 0; i < 16; ++i) {
        W[i] = (buffer[i * 4] << 24) |
               (buffer[i * 4 + 1] << 16) |
               (buffer[i * 4 + 2] << 8) |
               (buffer[i * 4 + 3]);
    }
    for (int i = 16; i < 80; ++i) {
        uint32_t v = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
        W[i] = (v << 1) | (v >> 31);
    }
    a = state[0];
    b = state[1];
    c = state[2];
    d = state[3];
    e = state[4];

    for (int i = 0; i < 80; ++i) {
        uint32_t f, k;
        if (i < 20) {
            f = (b & c) | ((~b) & d);
            k = 0x5A827999;
        } else if (i < 40) {
            f = b ^ c ^ d;
            k = 0x6ED9EBA1;
        } else if (i < 60) {
            f = (b & c) | (b & d) | (c & d);
            k = 0x8F1BBCDC;
        } else {
            f = b ^ c ^ d;
            k = 0xCA62C1D6;
        }
        t = ((a << 5) | (a >> 27)) + f + e + k + W[i];
        e = d;
        d = c;
        c = (b << 30) | (b >> 2);
        b = a;
        a = t;
    }

    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
}

static void sha1_init(sha1_ctx *ctx) {
    ctx->state[0] = 0x67452301;
    ctx->state[1] = 0xEFCDAB89;
    ctx->state[2] = 0x98BADCFE;
    ctx->state[3] = 0x10325476;
    ctx->state[4] = 0xC3D2E1F0;
    ctx->count = 0;
}

static void sha1_update(sha1_ctx *ctx, const unsigned char *data, size_t len) {
    size_t i = 0;
    size_t index = (ctx->count >> 3) & 0x3F;
    ctx->count += ((uint64_t)len) << 3;
    size_t part_len = 64 - index;

    if (len >= part_len) {
        memcpy(&ctx->buffer[index], &data[0], part_len);
        sha1_transform(ctx->state, ctx->buffer);
        for (i = part_len; i + 63 < len; i += 64) {
            sha1_transform(ctx->state, &data[i]);
        }
        index = 0;
    }

    memcpy(&ctx->buffer[index], &data[i], len - i);
}

static void sha1_final(sha1_ctx *ctx, unsigned char digest[20]) {
    static unsigned char padding[64] = {0x80};
    unsigned char bits[8];
    for (int i = 0; i < 8; ++i) {
        bits[7 - i] = (ctx->count >> (i * 8)) & 0xFF;
    }

    size_t index = (ctx->count >> 3) & 0x3F;
    size_t pad_len = (index < 56) ? (56 - index) : (120 - index);
    sha1_update(ctx, padding, pad_len);
    sha1_update(ctx, bits, 8);

    for (int i = 0; i < 5; ++i) {
        digest[i * 4]     = (ctx->state[i] >> 24) & 0xFF;
        digest[i * 4 + 1] = (ctx->state[i] >> 16) & 0xFF;
        digest[i * 4 + 2] = (ctx->state[i] >> 8) & 0xFF;
        digest[i * 4 + 3] = ctx->state[i] & 0xFF;
    }
}

/* --- Base64 ------------------------------------------------------------- */

static const char b64_table[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int base64_encode(const unsigned char *src, size_t len, char *dst, size_t dst_len) {
    size_t out_len = ((len + 2) / 3) * 4;
    if (dst_len < out_len + 1) {
        return -1;
    }
    size_t j = 0;
    for (size_t i = 0; i < len; i += 3) {
        uint32_t octet_a = src[i];
        uint32_t octet_b = (i + 1 < len) ? src[i + 1] : 0;
        uint32_t octet_c = (i + 2 < len) ? src[i + 2] : 0;

        uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;
        dst[j++] = b64_table[(triple >> 18) & 0x3F];
        dst[j++] = b64_table[(triple >> 12) & 0x3F];
        dst[j++] = (i + 1 < len) ? b64_table[(triple >> 6) & 0x3F] : '=';
        dst[j++] = (i + 2 < len) ? b64_table[triple & 0x3F] : '=';
    }
    dst[j] = '\0';
    return 0;
}

int websocket_calculate_accept(const char *client_key, char *dest, size_t dest_len) {
    static const char *magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    unsigned char digest[20];
    sha1_ctx ctx;
    sha1_init(&ctx);
    sha1_update(&ctx, (const unsigned char *)client_key, strlen(client_key));
    sha1_update(&ctx, (const unsigned char *)magic, strlen(magic));
    sha1_final(&ctx, digest);
    return base64_encode(digest, sizeof(digest), dest, dest_len);
}

/* --- Frame helpers ------------------------------------------------------ */

ssize_t websocket_send_all(int fd, const void *buf, size_t len) {
    const unsigned char *p = buf;
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(fd, p + sent, len - sent, 0);
        if (n < 0) {
            if (errno == EINTR)
                continue;
            return -1;
        }
        if (n == 0) {
            break;
        }
        sent += (size_t)n;
    }
    return (ssize_t)sent;
}

static int websocket_send_frame(int fd, uint8_t opcode, const unsigned char *data, size_t len) {
    unsigned char header[10];
    size_t header_len = 0;
    header[0] = 0x80 | (opcode & 0x0F);
    if (len <= 125) {
        header[1] = (unsigned char)len;
        header_len = 2;
    } else if (len <= 0xFFFF) {
        header[1] = 126;
        uint16_t l = htons((uint16_t)len);
        memcpy(&header[2], &l, 2);
        header_len = 4;
    } else {
        header[1] = 127;
        uint64_t l = htobe64((uint64_t)len);
        memcpy(&header[2], &l, 8);
        header_len = 10;
    }
    if (websocket_send_all(fd, header, header_len) < 0) {
        return -1;
    }
    if (len == 0) {
        return 0;
    }
    if (websocket_send_all(fd, data, len) < 0) {
        return -1;
    }
    return 0;
}

int websocket_send_text(int fd, const char *data, size_t len) {
    return websocket_send_frame(fd, 0x1, (const unsigned char *)data, len);
}

int websocket_send_binary(int fd, const unsigned char *data, size_t len) {
    return websocket_send_frame(fd, 0x2, data, len);
}

int websocket_send_pong(int fd, const unsigned char *data, size_t len) {
    if (len > 125) {
        len = 125;
    }
    return websocket_send_frame(fd, 0xA, data, len);
}

int websocket_send_close(int fd, uint16_t code) {
    unsigned char payload[2];
    payload[0] = (code >> 8) & 0xFF;
    payload[1] = code & 0xFF;
    return websocket_send_frame(fd, 0x8, payload, 2);
}
