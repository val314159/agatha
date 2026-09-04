.PHONY: all clean realclean

all: .venv
	uv run melo/testit.py

serve: .venv
	uv run melo/ws.py

 .venv:
	bash install.sh

clean:
	find -name \*~ -o -name .\*~ | xargs rm -fr

realclean:
	rm -fr .venv uv.lock meloyelotts.egg-info *.wav
	find -name \*~ -o -name __pycache__ | xargs rm -fr
	tree -I .git -a .

ollama:
	apt-get install -y lshw 
	curl -fsSL https://ollama.com/install.sh | sh
