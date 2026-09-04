CC      := cc
CFLAGS  := -Wall -Wextra -pedantic -std=c11 -O2
LDFLAGS :=

TARGET := pubsubhub
OBJS   := pubsub.o websocket.o

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS) $(LDFLAGS)

pubsub.o: pubsub.c websocket.h
	$(CC) $(CFLAGS) -c $< -o $@

websocket.o: websocket.c websocket.h
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(TARGET) $(OBJS)
