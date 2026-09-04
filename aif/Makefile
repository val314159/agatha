.PHONY=all start honcho chat stop clean realclean

all:: install start

start:: install honcho

honcho::
	. .venv/bin/activate ; honcho start

install: .venv
	make -C modelfiles
	uv run --env-file .env -m aif.clients.save_default2
#	uv run --env-file .env -m aif.clients.save_default

#	PROMPT_PATH=prompts/agatha.1.1.txt uv run -m aif.clients.save_default

chat:: .venv
	CH=sup uv run -m aif.clients.chat

.venv: requirements.txt
	uv venv
	uv pip install pip
	uv pip install -r $<
	uv pip install -e .

###

# Stop all running servers
stop::
	-[ -f .microservice.pid ] && kill -9 `cat .microservice.pid` 2>/dev/null && rm .microservice.pid || true
	-pkill -f "node"    2>/dev/null || true
	-pkill -f "parcel"  2>/dev/null || true
	-pkill -f "bottle"  2>/dev/null || true
	-pkill -f "python"  2>/dev/null || true
	-pkill -f "python3" 2>/dev/null || true
	@echo "All servers stopped."

clean::
	rm -fr .microservice.log
	find . -name \*~ -o -name .\*~ \
		-o -name \#\*\# -o -name .\#\* | xargs rm -fr

realclean:: stop clean
	rm -f microservice/audio/*.mp3
	rm -f audio/*.mp3
	find   .   -name .venv -o -name node_modules \
		-o -name \*.db -o -name bottle.py \
		-o -name __pycache__ -o -name .vite \
		-o -name .parcel-cache -o -name bun.lock \
		-o -name dist -o -name .cache | xargs rm -fr
	find . | grep uploads/.\*jpg | xargs rm -fr
	tree -I .git -a
