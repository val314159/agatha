#!/bin/sh

MODEL=warshanks/Dolphin-Mistral-24B-Venice-Edition-AWQ

GPU_MEM=0.65
#GPU_MEM=0.75
#GPU_MEM=0.8
#GPU_MEM=0.9

#CTXT=24576
CTXT=32767
#CTXT=4096

vllm serve $MODEL --host 0.0.0.0 --port 8000 \
     --served-model-name test \
     --gpu-memory-utilization ${GPU_MEM} \
     --enable-prefix-caching \
     --max-model-len ${CTXT} \

#     --cpu-offload-gb 8 \

#     --enforce-eager \
#     --cpu-offload-gb 8 \
#     --max-model-len 16384
#     --gpu-memory-utilization 0.6\
