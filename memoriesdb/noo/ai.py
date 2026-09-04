import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Iterator, List, Optional

import httpx
import ollama


@dataclass
class AIMessage:
    role: str = "assistant"
    content: str = ""
    thinking: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class AIChunk:
    message: AIMessage
    done: bool = False


_ollama_connection = None
_debug_stream = os.getenv("LLM_DEBUG_STREAM", "").lower() in {"1", "true", "yes", "on"}


def backend() -> str:
    return os.getenv("LLM_PROTOCOL", "ollama").strip().lower() or "ollama"


def model_base_url() -> str:
    proto = backend()
    if proto == "ollama":
        return os.getenv("OLLAMA_HOST") or os.getenv("OLLAMA_URL") or "http://localhost:11434"
    return os.getenv("OPENAI_BASE_URL", "http://localhost:8000/v1")


def model_api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "")


def ollama_connection():
    global _ollama_connection
    if not _ollama_connection:
        _ollama_connection = ollama.Client(host=model_base_url())
    return _ollama_connection


def chat(messages: List[Dict[str, Any]], model: str, stream: bool = True,
         think: bool = True, tools: Optional[Iterable[Dict[str, Any]]] = None,
         max_retries: int = 3) -> Iterable[AIChunk]:
    proto = backend()
    if proto == "ollama":
        return ollama_chat(messages, model, stream=stream, think=think, tools=tools,
                           max_retries=max_retries)
    if proto in {"openai", "openai_compatible"}:
        return openai_chat(messages, model, stream=stream, max_retries=max_retries)
    raise ValueError(f"Unsupported LLM_PROTOCOL: {proto!r}")


def ollama_chat(messages: List[Dict[str, Any]], model: str, stream: bool = True,
                think: bool = True, tools: Optional[Iterable[Dict[str, Any]]] = None,
                max_retries: int = 3, retries: int = 0) -> Iterable[AIChunk]:
    kw: Dict[str, Any] = dict(messages=messages, model=model, stream=stream, think=think)
    if tools:
        kw["tools"] = list(tools)
    while retries < max_retries:
        try:
            response = ollama_connection().chat(**kw)
            return wrap_ollama_response(response)
        except Exception:
            retries += 1
    return []


def wrap_ollama_response(response: Any) -> Iterable[AIChunk]:
    if type(response).__name__ == "generator":
        return (_normalize_ollama_chunk(chunk) for chunk in response)
    return [_normalize_ollama_chunk(response)]


def _normalize_ollama_chunk(chunk: Any) -> AIChunk:
    message = getattr(chunk, "message", None) or {}
    if hasattr(message, "get"):
        role = getattr(message, "role", None) or message.get("role", "assistant")
        content = getattr(message, "content", None) or message.get("content", "") or ""
        thinking = getattr(message, "thinking", None) or message.get("thinking", "") or ""
        tool_calls = getattr(message, "tool_calls", None) or message.get("tool_calls", []) or []
    else:
        role = getattr(message, "role", "assistant")
        content = getattr(message, "content", "") or ""
        thinking = getattr(message, "thinking", "") or ""
        tool_calls = getattr(message, "tool_calls", None) or []
    done = getattr(chunk, "done", None)
    if done is None and hasattr(chunk, "get"):
        done = chunk.get("done")
    normalized = AIChunk(
        message=AIMessage(
            role=role,
            content=content,
            thinking=thinking,
            tool_calls=tool_calls,
        ),
        done=bool(done),
    )
    if _debug_stream:
        print("AI CHUNK", dict(role=normalized.message.role,
                               content=normalized.message.content,
                               done=normalized.done))
    return normalized


def openai_chat(messages: List[Dict[str, Any]], model: str, stream: bool = True,
                max_retries: int = 3, retries: int = 0) -> Iterable[AIChunk]:
    url = model_base_url().rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    api_key = model_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }
    while retries < max_retries:
        try:
            if stream:
                return _openai_stream(url, headers, payload)
            with httpx.Client(timeout=None) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
            return [_normalize_openai_completion(data, done=True)]
        except Exception:
            retries += 1
    return []


def _openai_stream(url: str, headers: Dict[str, str],
                   payload: Dict[str, Any]) -> Iterator[AIChunk]:
    with httpx.Client(timeout=None) as client:
        with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            saw_done = False
            for line in resp.iter_lines():
                if not line:
                    continue
                if isinstance(line, bytes):
                    line = line.decode("utf-8", errors="replace")
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    saw_done = True
                    yield AIChunk(message=AIMessage(), done=True)
                    break
                payload = json.loads(data)
                chunk = _normalize_openai_stream_chunk(payload)
                if chunk is None:
                    continue
                if chunk.done:
                    saw_done = True
                yield chunk
            if not saw_done:
                yield AIChunk(message=AIMessage(), done=True)


def _normalize_openai_completion(payload: Dict[str, Any], done: bool) -> AIChunk:
    choice = (payload.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    normalized = AIChunk(
        message=AIMessage(
            role=message.get("role", "assistant"),
            content=message.get("content") or "",
        ),
        done=done,
    )
    if _debug_stream:
        print("AI CHUNK", dict(role=normalized.message.role,
                               content=normalized.message.content,
                               done=normalized.done))
    return normalized


def _normalize_openai_stream_chunk(payload: Dict[str, Any]) -> Optional[AIChunk]:
    choice = (payload.get("choices") or [{}])[0]
    delta = choice.get("delta") or {}
    finish_reason = choice.get("finish_reason")
    role = delta.get("role", "assistant")
    content = delta.get("content") or ""
    if not content and not finish_reason:
        return None
    normalized = AIChunk(
        message=AIMessage(role=role, content=content),
        done=bool(finish_reason),
    )
    if _debug_stream:
        print("AI CHUNK", dict(role=normalized.message.role,
                               content=normalized.message.content,
                               done=normalized.done))
    return normalized
