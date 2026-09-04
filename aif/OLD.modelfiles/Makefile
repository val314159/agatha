.PHONY: all load list

all: agatha3 agatha2 agatha
#	ollama create    test -f    test.Modelfile
#	ollama create    test -f    test.Modelfile

agatha:
	ollama create $@ -f $@.Modelfile

agatha2:
	ollama create $@ -f $@.Modelfile

agatha3:
	ollama create $@ -f $@.Modelfile

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
