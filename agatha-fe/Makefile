.PHONY: build dev preview smoke

AVATAR_VIEWER_URL ?= http://localhost:6161/

build:
	npm run build

dev:
	npm run dev -- --host 0.0.0.0 --port 6161

preview:
	npm run preview

smoke:
	AVATAR_VIEWER_URL="$(AVATAR_VIEWER_URL)" npm run smoke
