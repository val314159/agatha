#ifndef PUBSUBHUB_WEBSOCKET_H
#define PUBSUBHUB_WEBSOCKET_H

#include <stddef.h>
#include <stdint.h>
#include <sys/types.h>

int websocket_calculate_accept(const char *client_key, char *dest, size_t dest_len);
int websocket_send_text(int fd, const char *data, size_t len);
int websocket_send_binary(int fd, const unsigned char *data, size_t len);
int websocket_send_pong(int fd, const unsigned char *data, size_t len);
int websocket_send_close(int fd, uint16_t code);
ssize_t websocket_send_all(int fd, const void *buf, size_t len);

#endif /* PUBSUBHUB_WEBSOCKET_H */
