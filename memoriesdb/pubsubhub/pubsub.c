#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

#include "websocket.h"

#define LISTEN_BACKLOG 128
#define MAX_CLIENTS 1024
#define MAX_CHANNELS 512
#define MAX_CHANNEL_LEN 128
#define MAX_PAYLOAD_LEN (1 << 20) /* 1 MiB */

typedef struct client {
    int fd;
    bool handshake_done;
    char session_id[33];
    char uuid[37];
    char conversation[37];
    char current_channel[MAX_CHANNEL_LEN];
    size_t pending_len;
    unsigned char pending_payload[MAX_PAYLOAD_LEN];
    bool pending_is_binary;
    struct client *next;
} client_t;

typedef struct subscriber {
    client_t *client;
    struct subscriber *next;
} subscriber_t;

typedef struct channel_entry {
    char name[MAX_CHANNEL_LEN];
    subscriber_t *subs;
    struct channel_entry *next;
} channel_entry_t;

static client_t *clients = NULL;
static channel_entry_t *channels = NULL;
static int listen_fd = -1;
static bool running = true;

static void fatal(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
    fputc('\n', stderr);
    exit(EXIT_FAILURE);
}

static uint32_t xorshift_state = 0x12345678;
static uint32_t xorshift32(void) {
    uint32_t x = xorshift_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    xorshift_state = x;
    return x;
}

static void random_hex(char *dest, size_t len) {
    static const char hex[] = "0123456789abcdef";
    for (size_t i = 0; i < len; ++i) {
        dest[i] = hex[xorshift32() & 0x0F];
    }
    dest[len] = '\0';
}

static void gen_session_id(char *dest) {
    random_hex(dest, 32);
}

static void gen_uuid(char *dest) {
    static const int sections[] = {8, 4, 4, 4, 12};
    int pos = 0;
    for (int i = 0; i < 5; ++i) {
        if (i) dest[pos++] = '-';
        for (int j = 0; j < sections[i]; ++j) {
            dest[pos++] = "0123456789abcdef"[xorshift32() & 0x0F];
        }
    }
    dest[pos] = '\0';
}

static client_t *add_client(int fd) {
    client_t *c = calloc(1, sizeof(client_t));
    if (!c) fatal("calloc client");
    c->fd = fd;
    c->next = clients;
    clients = c;
    return c;
}

static void remove_subscriber_from_channel(channel_entry_t *entry, client_t *client) {
    subscriber_t **prev = &entry->subs;
    while (*prev) {
        if ((*prev)->client == client) {
            subscriber_t *tmp = *prev;
            *prev = tmp->next;
            free(tmp);
            break;
        }
        prev = &(*prev)->next;
    }
}

static void remove_client(client_t *client) {
    if (!clients || !client) return;
    client_t **prev = &clients;
    while (*prev) {
        if (*prev == client) {
            *prev = client->next;
            break;
        }
        prev = &(*prev)->next;
    }
    channel_entry_t *entry = channels;
    while (entry) {
        remove_subscriber_from_channel(entry, client);
        entry = entry->next;
    }
    close(client->fd);
    free(client);
}

static channel_entry_t *get_or_create_channel(const char *name) {
    channel_entry_t *entry = channels;
    while (entry) {
        if (strcmp(entry->name, name) == 0) {
            return entry;
        }
        entry = entry->next;
    }
    entry = calloc(1, sizeof(channel_entry_t));
    if (!entry) fatal("calloc channel");
    size_t name_len = strnlen(name, sizeof(entry->name) - 1);
    memcpy(entry->name, name, name_len);
    entry->name[name_len] = '\0';
    entry->next = channels;
    channels = entry;
    return entry;
}

static void subscribe_client(client_t *client, const char *name) {
    channel_entry_t *entry = get_or_create_channel(name);
    subscriber_t *sub = calloc(1, sizeof(subscriber_t));
    if (!sub) fatal("calloc subscriber");
    sub->client = client;
    sub->next = entry->subs;
    entry->subs = sub;
}

static void broadcast(const char *channel, client_t *sender, const unsigned char *payload, size_t len, bool is_binary) {
    channel_entry_t *entry = channels;
    while (entry) {
        if (strcmp(entry->name, channel) == 0) {
            break;
        }
        entry = entry->next;
    }
    if (!entry) return;
    subscriber_t *sub = entry->subs;
    while (sub) {
        client_t *c = sub->client;
        if (c != sender) {
            if (is_binary) {
                websocket_send_binary(c->fd, payload, len);
            } else {
                websocket_send_text(c->fd, (const char *)payload, len);
            }
        }
        sub = sub->next;
    }
}

static int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return -1;
    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) < 0) return -1;
    return 0;
}

static int send_http_response(int fd, const char *status_line, const char *headers, const char *body) {
    char buffer[1024];
    int len = snprintf(buffer, sizeof(buffer), "%s\r\n%s\r\n%s",
                       status_line, headers ? headers : "", body ? body : "");
    if (len < 0 || len >= (int)sizeof(buffer)) {
        return -1;
    }
    return (int)websocket_send_all(fd, buffer, (size_t)len);
}

static void send_initialize(client_t *client) {
    char init[512];
    int len = snprintf(init, sizeof(init),
                       "{\"method\":\"initialize\",\"params\":{\"uuid\":\"%s\",\"conversation\":\"%s\",\"session_id\":\"%s\"}}",
                       client->uuid, client->conversation, client->session_id);
    websocket_send_text(client->fd, init, (size_t)len);
}

static void handle_http(client_t *client) {
    char buffer[4096];
    ssize_t n = recv(client->fd, buffer, sizeof(buffer) - 1, 0);
    if (n <= 0) {
        remove_client(client);
        return;
    }
    buffer[n] = '\0';
    const char *ws_key = strstr(buffer, "Sec-WebSocket-Key:");
    const char *host_header = strstr(buffer, "Host:");
    const char *get_ws = strstr(buffer, "GET /ws");
    if (!ws_key || !get_ws) {
        send_http_response(client->fd, "HTTP/1.1 400 Bad Request", "Content-Length: 0\r\n", "");
        remove_client(client);
        return;
    }
    ws_key += strlen("Sec-WebSocket-Key:");
    while (*ws_key == ' ' || *ws_key == '\t') ws_key++;
    const char *end = strstr(ws_key, "\r\n");
    if (!end) {
        remove_client(client);
        return;
    }
    char key[128];
    size_t key_len = (size_t)(end - ws_key);
    if (key_len >= sizeof(key)) key_len = sizeof(key) - 1;
    memcpy(key, ws_key, key_len);
    key[key_len] = '\0';

    if (host_header) {
        const char *query = strstr(get_ws, "?c=");
        if (query) {
            query += 3;
            char channel[MAX_CHANNEL_LEN];
            size_t idx = 0;
            while (*query && *query != ' ' && *query != '&') {
                if (idx >= sizeof(channel) - 1) {
                    websocket_send_close(client->fd, 1009);
                    remove_client(client);
                    return;
                }
                if (*query == '%') {
                    if (*(query + 1) && *(query + 2)) {
                        char hex[3] = { query[1], query[2], '\0' };
                        channel[idx++] = (char)strtol(hex, NULL, 16);
                        query += 3;
                        continue;
                    }
                }
                if (*query == '+') {
                    channel[idx++] = ' ';
                } else {
                    channel[idx++] = *query;
                }
                query++;
            }
            channel[idx] = '\0';
            if (idx > 0) {
                subscribe_client(client, channel);
            }
        }
    }

    char accept_value[128];
    websocket_calculate_accept(key, accept_value, sizeof(accept_value));
    char response[256];
    snprintf(response, sizeof(response),
             "HTTP/1.1 101 Switching Protocols\r\n"
             "Upgrade: websocket\r\n"
             "Connection: Upgrade\r\n"
             "Sec-WebSocket-Accept: %s\r\n"
             "\r\n",
             accept_value);
    websocket_send_all(client->fd, response, strlen(response));
    client->handshake_done = true;
    send_initialize(client);
}

static bool read_exact(int fd, unsigned char *buffer, size_t len) {
    size_t read_total = 0;
    while (read_total < len) {
        ssize_t n = recv(fd, buffer + read_total, len - read_total, 0);
        if (n <= 0) {
            return false;
        }
        read_total += (size_t)n;
    }
    return true;
}

static bool handle_frame(client_t *client) {
    unsigned char header[2];
    if (!read_exact(client->fd, header, 2)) {
        return false;
    }
    uint8_t fin = header[0] & 0x80;
    uint8_t opcode = header[0] & 0x0F;
    uint8_t masked = header[1] & 0x80;
    uint64_t payload_len = header[1] & 0x7F;

    if (payload_len == 126) {
        unsigned char ext[2];
        if (!read_exact(client->fd, ext, 2)) return false;
        payload_len = (ext[0] << 8) | ext[1];
    } else if (payload_len == 127) {
        unsigned char ext[8];
        if (!read_exact(client->fd, ext, 8)) return false;
        payload_len = 0;
        for (int i = 0; i < 8; ++i) {
            payload_len = (payload_len << 8) | ext[i];
        }
    }

    unsigned char mask[4];
    if (masked) {
        if (!read_exact(client->fd, mask, 4)) return false;
    }

    if (payload_len > MAX_PAYLOAD_LEN) {
        websocket_send_close(client->fd, 1009);
        return false;
    }

    if (!read_exact(client->fd, client->pending_payload, payload_len)) {
        return false;
    }
    if (masked) {
        for (uint64_t i = 0; i < payload_len; ++i) {
            client->pending_payload[i] ^= mask[i % 4];
        }
    }

    switch (opcode) {
        case 0x1: /* text frame */
        case 0x2: /* binary frame */
            if (!fin) return false;
            client->pending_len = (size_t)payload_len;
            client->pending_is_binary = (opcode == 0x2);
            break;
        case 0x8: /* close */
            return false;
        case 0x9: /* ping */
            websocket_send_pong(client->fd, client->pending_payload, (size_t)payload_len);
            return true;
        case 0xA: /* pong */
            return true;
        default:
            return false;
    }
    return true;
}

static void process_dual_packet(client_t *client) {
    if (client->current_channel[0] == '\0') {
        if (client->pending_is_binary) {
            websocket_send_close(client->fd, 1003);
            remove_client(client);
            return;
        }
        size_t len = client->pending_len;
        if (len >= sizeof(client->current_channel)) len = sizeof(client->current_channel) - 1;
        memcpy(client->current_channel, client->pending_payload, len);
        client->current_channel[len] = '\0';
    } else {
        broadcast(client->current_channel, client, client->pending_payload, client->pending_len, client->pending_is_binary);
        client->current_channel[0] = '\0';
    }
    client->pending_len = 0;
    client->pending_is_binary = false;
}

static void handle_client_socket(client_t *client) {
    if (!client->handshake_done) {
        handle_http(client);
        return;
    }
    if (!handle_frame(client)) {
        remove_client(client);
        return;
    }
    process_dual_packet(client);
}

static void accept_new_client(void) {
    struct sockaddr_in addr;
    socklen_t addrlen = sizeof(addr);
    int fd = accept(listen_fd, (struct sockaddr *)&addr, &addrlen);
    if (fd < 0) {
        return;
    }
    set_nonblocking(fd);
    client_t *client = add_client(fd);
    gen_session_id(client->session_id);
    gen_uuid(client->uuid);
    gen_uuid(client->conversation);
}

static void cleanup(void) {
    client_t *c = clients;
    while (c) {
        client_t *next = c->next;
        close(c->fd);
        free(c);
        c = next;
    }
    clients = NULL;
    channel_entry_t *ch = channels;
    while (ch) {
        subscriber_t *sub = ch->subs;
        while (sub) {
            subscriber_t *next = sub->next;
            free(sub);
            sub = next;
        }
        channel_entry_t *next_ch = ch->next;
        free(ch);
        ch = next_ch;
    }
    channels = NULL;
    if (listen_fd >= 0) {
        close(listen_fd);
        listen_fd = -1;
    }
}

static void signal_handler(int signum) {
    (void)signum;
    running = false;
}

int main(int argc, char **argv) {
    int port = 5002;
    if (argc > 1) {
        port = atoi(argv[1]);
    }
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd < 0) fatal("socket");
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons((uint16_t)port),
        .sin_addr.s_addr = htonl(INADDR_ANY)
    };
    if (bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) fatal("bind");
    if (listen(listen_fd, LISTEN_BACKLOG) < 0) fatal("listen");
    set_nonblocking(listen_fd);

    while (running) {
        fd_set readfds;
        FD_ZERO(&readfds);
        FD_SET(listen_fd, &readfds);
        int max_fd = listen_fd;
        for (client_t *c = clients; c; c = c->next) {
            FD_SET(c->fd, &readfds);
            if (c->fd > max_fd) max_fd = c->fd;
        }
        int ready = select(max_fd + 1, &readfds, NULL, NULL, NULL);
        if (ready < 0) {
            if (errno == EINTR) continue;
            break;
        }
        if (FD_ISSET(listen_fd, &readfds)) {
            accept_new_client();
        }
        client_t *c = clients;
        while (c) {
            client_t *next = c->next;
            if (FD_ISSET(c->fd, &readfds)) {
                handle_client_socket(c);
            }
            c = next;
        }
    }

    cleanup();
    return 0;
}
