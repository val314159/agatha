
D=--rm -it --privileged --network=host

all:
	docker build   .  -t le
	docker run $D --name le le

autossh:
	autossh -M 0 -f -N \
		-o ServerAliveInterval=30 \
		-o ServerAliveCountMax=3 \
		-R 4443:localhost:443 root@aa.ccl.io
