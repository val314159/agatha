#!/bin/bash

CUDA_VERSION=`nvidia-smi | grep "CUDA Version" | perl -npe 's/^.*CUDA Version: (\d+)\.(\d+).*$/\1\2/'`

echo CUDA_VERSION=$CUDA_VERSION

apt-get update
apt-get install -y mecab libmecab-dev

uv venv
. .venv/bin/activate
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu${CUDA_VERSION}
uv pip install -r requirements.txt
uv pip install -e .
uv run -m unidic download
uv run -m melo.init_downloads
uv run python -c "import nltk;nltk.download('averaged_perceptron_tagger_eng')"
