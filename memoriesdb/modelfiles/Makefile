.PHONY: all load list

all: load list

load:
	ollama pull all-minilm # embedding model
	ollama create default -f default.Modelfile	
	ollama create  vision -f  vision.Modelfile
	ollama create   other -f   other.Modelfile
	ollama create    test -f    test.Modelfile

load-test:
	ollama create    test -f    test.Modelfile

list:
	ollama list
