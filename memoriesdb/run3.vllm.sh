#!/bin/sh
MODEL=warshanks/Dolphin-Mistral-24B-Venice-Edition-AWQ
vllm serve $MODEL --host 0.0.0.0 --port 8000 \
     --served-model-name test \
     --gpu-memory-utilization 0.85 \
     --max-model-len 16384
#     --cpu-offload-gb 16 \
#     --enable-prefix-caching \
#     --max-model-len 24576
