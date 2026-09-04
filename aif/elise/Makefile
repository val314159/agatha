.PHONY: all clean realclean chat

all:: .venv chat

.venv: pyproject.toml
	uv sync

realclean:: clean
	find . -name \*~ -o -name .\*~ \
		-o -name __pycache__ \
	| xargs rm -fr
	rm -fr .venv uv.lock
	tree -I .git -as .

clean::
	find . -name \#\*\# -o -name .\#\* \
	| xargs rm -fr

chat::
	uv run harness.py
